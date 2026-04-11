<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eraser, EyeOff, Eye, Info, Music, RotateCcw, X } from 'lucide-vue-next'
import { issueApi } from '@/api'
import type { Issue } from '@/types'
import { useToast } from '@/composables/useToast'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'
import { extractMarkerIndexReferences, extractTimeReferences } from '@/utils/timestamps'

const props = defineProps<{
  trackId: number
  phase: string
  masterDeliveryId?: number | null
}>()

const emit = defineEmits<{
  created: [issue: Issue]
  formOpenChange: [open: boolean]
}>()

const { t } = useI18n()
const { error: toastError } = useToast()

const showForm = ref(false)
const issueMode = ref<'timed' | 'general'>('timed')
const issueVisibility = ref<'public' | 'internal'>('public')
const title = ref('')
const description = ref('')
const descriptionCursorPos = ref(0)
const severity = ref<'critical' | 'major' | 'minor' | 'suggestion'>('major')
const markers = ref<{ marker_type: 'point' | 'range'; time_start: number; time_end: number | null }[]>([])
const rangeAnchor = ref<number | null>(null)
const markerHint = ref('')
// Index of the range marker tied to the current waveform drag selection.
// Used to update the marker in-place when the user resizes the selection.
const lastDragRangeIdx = ref(-1)

const POINT_NEAR_THRESHOLD_SECONDS = 0.05
const MIN_RANGE_DURATION_SECONDS = 0.05
const RANGE_MATCH_TOLERANCE_SECONDS = 0.05
const ISSUE_DRAFT_STORAGE_PREFIX = 'backkitchen_issue_draft'
const MAX_AUDIO_SIZE = 200 * 1024 * 1024
const MAX_AUDIOS = 3
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,.mp3,.wav,.flac,.aac,.ogg'

const draftStorageKey = computed(() => {
  const delivery = props.masterDeliveryId == null ? 'none' : String(props.masterDeliveryId)
  return `${ISSUE_DRAFT_STORAGE_PREFIX}:${props.trackId}:${props.phase}:${delivery}`
})

let markerHintTimer: ReturnType<typeof setTimeout> | null = null
const selectedAudios = ref<File[]>([])
const audioInputRef = ref<HTMLInputElement | null>(null)
const submittingIssue = ref(false)
const issueUploadProgress = ref(0)

function clearMarkerHintTimer() {
  if (!markerHintTimer) return
  clearTimeout(markerHintTimer)
  markerHintTimer = null
}

function setMarkerHint(message: string) {
  clearMarkerHintTimer()
  markerHint.value = message
  markerHintTimer = setTimeout(() => {
    markerHint.value = ''
    markerHintTimer = null
  }, 2200)
}

const severityOptions = computed(() => [
  { value: 'critical', label: t('severity.critical') },
  { value: 'major', label: t('severity.major') },
  { value: 'minor', label: t('severity.minor') },
  { value: 'suggestion', label: t('severity.suggestion') },
])

// The selected range for the WaveformPlayer to highlight (last range marker being edited)
const selectedRange = computed(() => {
  if (issueMode.value !== 'timed' || !showForm.value) return null
  const lastRange = [...markers.value].reverse().find(m => m.marker_type === 'range' && m.time_end !== null)
  if (lastRange && lastRange.time_end !== null) {
    return { start: lastRange.time_start, end: lastRange.time_end }
  }
  return null
})

const markerSummary = computed(() => markers.value.map((marker, index) => ({
  ...marker,
  index: index + 1,
})))

const descriptionTimeReferences = computed(() => extractTimeReferences(description.value))
const descriptionMarkerReferences = computed(() => extractMarkerIndexReferences(description.value).map((reference) => ({
  ...reference,
  exists: reference.zeroBasedIndex < markers.value.length,
})))

const hasDraftPreview = computed(() => {
  if (!showForm.value) return false
  if (issueMode.value === 'general') return !!title.value.trim() || !!description.value.trim()
  return markers.value.length > 0 || !!title.value.trim() || !!description.value.trim()
})

function markerEqualsPoint(marker: { marker_type: 'point' | 'range'; time_start: number; time_end: number | null }, time: number): boolean {
  return marker.marker_type === 'point' && roundToMilliseconds(marker.time_start) === time
}

function markerMatchesRangeWithTolerance(
  marker: { marker_type: 'point' | 'range'; time_start: number; time_end: number | null },
  start: number,
  end: number,
): boolean {
  if (marker.marker_type !== 'range' || marker.time_end === null) return false
  return Math.abs(roundToMilliseconds(marker.time_start) - start) <= RANGE_MATCH_TOLERANCE_SECONDS
    && Math.abs(roundToMilliseconds(marker.time_end) - end) <= RANGE_MATCH_TOLERANCE_SECONDS
}

function removeMatchingRanges(start: number, end: number): number {
  let removed = 0
  for (let i = markers.value.length - 1; i >= 0; i--) {
    if (!markerMatchesRangeWithTolerance(markers.value[i], start, end)) continue
    markers.value.splice(i, 1)
    removed++
    if (lastDragRangeIdx.value === i) lastDragRangeIdx.value = -1
    else if (lastDragRangeIdx.value > i) lastDragRangeIdx.value--
  }
  return removed
}

function handleClick(time: number) {
  const rounded = roundToMilliseconds(time)
  const samePointIndex = markers.value.findIndex(marker => markerEqualsPoint(marker, rounded))

  if (samePointIndex !== -1) {
    markers.value.splice(samePointIndex, 1)
    issueMode.value = 'timed'
    showForm.value = true
    setMarkerHint(t('issue.markerRemovedAt', { time: formatTime(rounded) }))
    return
  }

  const nearPoint = markers.value.find(marker =>
    marker.marker_type === 'point' && Math.abs(marker.time_start - rounded) <= POINT_NEAR_THRESHOLD_SECONDS,
  )

  markers.value.push({
    marker_type: 'point',
    time_start: rounded,
    time_end: null,
  })
  issueMode.value = 'timed'
  showForm.value = true

  if (nearPoint) {
    setMarkerHint(t('issue.pointNearExisting', { time: formatTime(nearPoint.time_start) }))
  }
}

function handleRangeSelect(start: number, end: number) {
  const normalizedStart = roundToMilliseconds(Math.min(start, end))
  const normalizedEnd = roundToMilliseconds(Math.max(start, end))
  if (normalizedEnd <= normalizedStart) return

  // Ignore accidental micro-drags (< 50ms duration)
  if (normalizedEnd - normalizedStart < MIN_RANGE_DURATION_SECONDS) return

  const removedRangeCount = removeMatchingRanges(normalizedStart, normalizedEnd)
  if (removedRangeCount > 0) {
    rangeAnchor.value = null
    issueMode.value = 'timed'
    showForm.value = true
    setMarkerHint(t('issue.rangeRemoved', { start: formatTime(normalizedStart), end: formatTime(normalizedEnd) }))
    return
  }

  // Each drag creates a new range marker. Dragging the exact same bounds
  // again removes it (toggle, handled above). To adjust a range, remove it
  // and drag a new one.
  markers.value.push({
    marker_type: 'range',
    time_start: normalizedStart,
    time_end: normalizedEnd,
  })
  lastDragRangeIdx.value = markers.value.length - 1
  rangeAnchor.value = null
  issueMode.value = 'timed'
  showForm.value = true
}

function handleRangeUpdate(start: number, end: number) {
  const normalizedStart = roundToMilliseconds(Math.min(start, end))
  const normalizedEnd = roundToMilliseconds(Math.max(start, end))
  if (normalizedEnd <= normalizedStart) return
  if (normalizedEnd - normalizedStart < MIN_RANGE_DURATION_SECONDS) return

  let idx = lastDragRangeIdx.value
  if (idx >= 0 && idx < markers.value.length && markers.value[idx].marker_type === 'range') {
    markers.value[idx].time_start = normalizedStart
    markers.value[idx].time_end = normalizedEnd
    for (let i = markers.value.length - 1; i >= 0; i--) {
      if (i === idx) continue
      if (!markerMatchesRangeWithTolerance(markers.value[i], normalizedStart, normalizedEnd)) continue
      markers.value.splice(i, 1)
      if (i < idx) idx--
      if (lastDragRangeIdx.value === i) lastDragRangeIdx.value = -1
      else if (lastDragRangeIdx.value > i) lastDragRangeIdx.value--
    }
    lastDragRangeIdx.value = idx
  }
}

function removeMarker(index: number) {
  markers.value.splice(index, 1)
  if (lastDragRangeIdx.value === index) lastDragRangeIdx.value = -1
  else if (lastDragRangeIdx.value > index) lastDragRangeIdx.value--
}

function removeLastMarker() {
  if (!markers.value.length) return
  if (lastDragRangeIdx.value === markers.value.length - 1) lastDragRangeIdx.value = -1
  const removed = markers.value.pop()
  if (!removed) return
  showForm.value = true
  issueMode.value = 'timed'
  setMarkerHint(t('issue.lastMarkerRemoved'))
}

function clearMarkers() {
  if (!markers.value.length) return
  markers.value = []
  rangeAnchor.value = null
  lastDragRangeIdx.value = -1
  issueMode.value = 'timed'
  showForm.value = true
  setMarkerHint(t('issue.markersCleared'))
}

function setRangeAnchorAt(time: number) {
  const rounded = roundToMilliseconds(time)
  rangeAnchor.value = rounded
  issueMode.value = 'timed'
  showForm.value = true
  setMarkerHint(t('issue.rangeAnchorSet', { time: formatTime(rounded) }))
}

function commitRangeFromAnchorTo(time: number) {
  const rounded = roundToMilliseconds(time)
  if (rangeAnchor.value == null) {
    setRangeAnchorAt(rounded)
    return
  }

  if (rounded === rangeAnchor.value) {
    rangeAnchor.value = null
    setMarkerHint(t('issue.rangeAnchorCleared'))
    return
  }

  handleRangeSelect(rangeAnchor.value, rounded)
}

function clearRangeAnchor() {
  if (rangeAnchor.value == null) return
  rangeAnchor.value = null
  setMarkerHint(t('issue.rangeAnchorCleared'))
}

function resetForm() {
  title.value = ''
  description.value = ''
  severity.value = 'major'
  issueVisibility.value = 'public'
  markers.value = []
  rangeAnchor.value = null
  lastDragRangeIdx.value = -1
  markerHint.value = ''
  issueMode.value = 'timed'
  selectedAudios.value = []
  issueUploadProgress.value = 0
}

function onAudioSelect(event: Event) {
  if (submittingIssue.value) return
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (selectedAudios.value.length >= MAX_AUDIOS) break
    if (file.size > MAX_AUDIO_SIZE) {
      toastError(t('upload.fileTooLarge', { max: '200 MB' }))
      continue
    }
    selectedAudios.value.push(file)
  }
  input.value = ''
}

function removeAudio(index: number) {
  if (submittingIssue.value) return
  selectedAudios.value.splice(index, 1)
}

function clearDraftStorage() {
  try {
    localStorage.removeItem(draftStorageKey.value)
  } catch {
    // Ignore storage errors.
  }
}

function persistDraft() {
  const hasContent = showForm.value
    || !!title.value.trim()
    || !!description.value.trim()
    || markers.value.length > 0
    || issueMode.value === 'general'

  if (!hasContent) {
    clearDraftStorage()
    return
  }

  try {
    localStorage.setItem(draftStorageKey.value, JSON.stringify({
      showForm: showForm.value,
      issueMode: issueMode.value,
      issueVisibility: issueVisibility.value,
      title: title.value,
      description: description.value,
      severity: severity.value,
      markers: markers.value,
      rangeAnchor: rangeAnchor.value,
    }))
  } catch {
    // Ignore storage errors.
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftStorageKey.value)
    if (!raw) return

    const draft = JSON.parse(raw) as {
      showForm?: boolean
      issueMode?: 'timed' | 'general'
      issueVisibility?: 'public' | 'internal'
      title?: string
      description?: string
      severity?: 'critical' | 'major' | 'minor' | 'suggestion'
      markers?: { marker_type: 'point' | 'range'; time_start: number; time_end: number | null }[]
      rangeAnchor?: number | null
    }

    showForm.value = draft.showForm === true
    issueMode.value = draft.issueMode === 'general' ? 'general' : 'timed'
    issueVisibility.value = draft.issueVisibility === 'internal' ? 'internal' : 'public'
    title.value = typeof draft.title === 'string' ? draft.title : ''
    description.value = typeof draft.description === 'string' ? draft.description : ''
    severity.value = draft.severity ?? 'major'
    markers.value = Array.isArray(draft.markers)
      ? draft.markers
        .filter(marker => marker && (marker.marker_type === 'point' || marker.marker_type === 'range'))
        .map(marker => ({
          marker_type: marker.marker_type,
          time_start: roundToMilliseconds(Number(marker.time_start) || 0),
          time_end: marker.time_end == null ? null : roundToMilliseconds(Number(marker.time_end) || 0),
        }))
      : []
    rangeAnchor.value = typeof draft.rangeAnchor === 'number' ? roundToMilliseconds(draft.rangeAnchor) : null

    if (issueMode.value === 'general') {
      markers.value = []
      rangeAnchor.value = null
    }
  } catch {
    // Ignore malformed draft payload.
  }
}

async function submitIssue() {
  if (submittingIssue.value) return
  const payload: Parameters<typeof issueApi.create>[1] = {
    title: title.value,
    description: description.value,
    severity: severity.value,
    phase: props.phase,
    visibility: issueVisibility.value,
    markers: issueMode.value === 'general' ? [] : markers.value.map(m => ({
      marker_type: m.marker_type,
      time_start: m.time_start,
      time_end: m.time_end,
    })),
    audios: selectedAudios.value.length ? selectedAudios.value : undefined,
  }
  if (props.masterDeliveryId != null) {
    payload.master_delivery_id = props.masterDeliveryId
  }
  submittingIssue.value = true
  issueUploadProgress.value = 0
  try {
    const created = await issueApi.create(props.trackId, payload, (percent) => {
      issueUploadProgress.value = percent
    })
    emit('created', created)
    showForm.value = false
    resetForm()
    clearDraftStorage()
  } catch (error) {
    toastError(error instanceof Error ? error.message : t('common.requestFailed'))
  } finally {
    submittingIssue.value = false
  }
}

function switchMode(mode: 'timed' | 'general') {
  if (mode === issueMode.value) return
  issueMode.value = mode
  if (mode === 'general') {
    markers.value = []
    rangeAnchor.value = null
  }
}

function openForm() {
  showForm.value = true
  if (issueMode.value !== 'general') {
    issueMode.value = 'timed'
  }
}

function closeForm() {
  showForm.value = false
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

const canSubmit = computed(() => {
  if (submittingIssue.value) return false
  if (!title.value.trim() || !description.value.trim()) return false
  if (issueMode.value === 'timed' && markers.value.length === 0) return false
  return true
})

// Heading text
const formHeading = computed(() => {
  if (issueMode.value === 'general') return t('issue.generalIssue')
  if (markers.value.length === 0) return t('issue.clickToAddMarker')
  if (markers.value.length === 1) {
    const m = markers.value[0]
    if (m.marker_type === 'point') return t('common.newIssueAt', { time: formatTime(m.time_start) })
    return `${formatTime(m.time_start)} – ${formatTime(m.time_end!)}`
  }
  return t('issue.markersCount', { count: markers.value.length })
})

watch(
  [showForm, issueMode, issueVisibility, title, description, severity, markers, rangeAnchor],
  () => persistDraft(),
  { deep: true },
)

watch(showForm, (open) => {
  emit('formOpenChange', open)
}, { immediate: true })

watch(draftStorageKey, () => {
  clearMarkerHintTimer()
  resetForm()
  showForm.value = false
  restoreDraft()
})

restoreDraft()

onBeforeUnmount(() => {
  clearMarkerHintTimer()
})

defineExpose({
  handleClick,
  handleRangeSelect,
  handleRangeUpdate,
  selectedRange,
  showForm,
  markers,
  removeLastMarker,
  clearMarkers,
  setRangeAnchorAt,
  commitRangeFromAnchorTo,
  clearRangeAnchor,
  rangeAnchor,
  openForm,
  closeForm,
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <slot name="heading" />
      <button @click="showForm = !showForm" class="btn-primary text-xs">
        {{ t('common.addIssue') }}
      </button>
    </div>

    <div v-if="showForm" class="card space-y-3 border-primary/50">
      <!-- Mode tabs -->
      <div class="flex rounded-full border border-border overflow-hidden">
        <button
          @click="switchMode('timed')"
          class="flex-1 px-3 py-1.5 text-xs font-mono font-medium transition-colors"
          :class="issueMode === 'timed' ? 'bg-primary text-background' : 'text-muted-foreground hover:text-foreground'"
        >{{ t('issue.timedMarkers') }}</button>
        <button
          @click="switchMode('general')"
          class="flex-1 px-3 py-1.5 text-xs font-mono font-medium transition-colors"
          :class="issueMode === 'general' ? 'bg-primary text-background' : 'text-muted-foreground hover:text-foreground'"
        >{{ t('issue.generalIssue') }}</button>
      </div>

      <!-- Marker list (timed mode) -->
      <div v-if="issueMode === 'timed' && markers.length > 0" class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <h4 class="text-xs font-mono font-semibold text-foreground">
              {{ t('issue.markersCount', { count: markers.length }) }}
            </h4>
            <div class="group relative">
              <button
                type="button"
                class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                :aria-label="t('issue.shortcutsTitle')"
              >
                <Info class="h-3 w-3" :stroke-width="2" />
              </button>
              <div class="pointer-events-none invisible absolute left-0 top-6 z-30 w-60 rounded-lg border border-border bg-card p-2 text-[11px] shadow-xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <p class="mb-1.5 font-mono text-muted-foreground">{{ t('issue.shortcutsTitle') }}</p>
                <div class="space-y-1 font-mono text-foreground">
                  <div>{{ t('issue.shortcutPlayPause') }}</div>
                  <div>{{ t('issue.shortcutSetRangeStart') }}</div>
                  <div>{{ t('issue.shortcutSetRangeEnd') }}</div>
                  <div>{{ t('issue.shortcutRemoveLast') }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:text-foreground touch-manipulation"
              @click="removeLastMarker"
            >
              <RotateCcw class="h-3 w-3" :stroke-width="2" />
              <span class="hidden sm:inline">{{ t('issue.undoLastMarker') }}</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:text-error touch-manipulation"
              @click="clearMarkers"
            >
              <Eraser class="h-3 w-3" :stroke-width="2" />
              <span class="hidden sm:inline">{{ t('issue.clearMarkers') }}</span>
            </button>
          </div>
        </div>
        <div class="space-y-1">
          <div
            v-for="(marker, index) in markerSummary"
            :key="index"
            class="flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1"
          >
            <span class="text-[10px] font-mono text-muted-foreground w-5 shrink-0">#{{ marker.index }}</span>
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ background: marker.marker_type === 'point' ? '#B2B2FF' : '#FF8400' }"
              :aria-label="marker.marker_type === 'point' ? t('issueType.point') : t('issueType.range')"
            />
            <span class="text-xs font-mono text-foreground truncate">
              {{ formatTime(marker.time_start) }}<template v-if="marker.time_end !== null"> – {{ formatTime(marker.time_end) }}</template>
            </span>
            <button
              @click="removeMarker(index)"
              class="ml-auto text-muted-foreground hover:text-error transition-colors touch-manipulation p-1 -mr-1"
              :aria-label="t('common.delete')"
            >
              <X class="w-3.5 h-3.5" :stroke-width="2" />
            </button>
          </div>
        </div>
        <p v-if="rangeAnchor !== null" class="text-[11px] text-info">
          {{ t('issue.rangeAnchorActive', { time: formatTime(rangeAnchor) }) }}
        </p>
        <p v-if="markerHint" class="text-[11px] text-warning">{{ markerHint }}</p>
      </div>
      <div v-else-if="issueMode === 'timed' && markers.length === 0" class="rounded-2xl border border-dashed border-border bg-background px-3 py-3">
        <p class="text-xs text-foreground font-mono">{{ t('issue.emptyStateTitle') }}</p>
        <p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">{{ t('issue.emptyStateHint') }}</p>
        <p v-if="rangeAnchor !== null" class="mt-1.5 text-[11px] text-info">
          {{ t('issue.rangeAnchorActive', { time: formatTime(rangeAnchor) }) }}
        </p>
        <p v-if="markerHint" class="mt-1.5 text-[11px] text-warning">{{ markerHint }}</p>
      </div>
      <h4 v-else class="text-sm font-sans font-semibold text-foreground">
        {{ formHeading }}
      </h4>

      <input v-model="title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
      <div class="relative">
        <textarea
          v-model="description"
          class="textarea-field w-full h-20"
          :placeholder="t('common.descriptionPlaceholder')"
          @input="(e) => descriptionCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
          @click="(e) => descriptionCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
          @keyup="(e) => descriptionCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
        />
        <TimestampSyntaxPopover
          :text="description"
          :cursor-pos="descriptionCursorPos"
          default-target="track"
        />
      </div>
      <CustomSelect v-model="severity" :options="severityOptions" />
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-mono text-muted-foreground">{{ t('issue.audioAttachments') }}</span>
          <span class="text-[11px] text-muted-foreground">{{ selectedAudios.length }}/{{ MAX_AUDIOS }}</span>
        </div>
        <input ref="audioInputRef" type="file" :accept="AUDIO_ACCEPT" multiple class="hidden" @change="onAudioSelect" />
        <div v-if="selectedAudios.length" class="flex flex-wrap gap-2">
          <div
            v-for="(file, index) in selectedAudios"
            :key="`${file.name}-${file.size}-${index}`"
            class="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1"
          >
            <Music class="w-3 h-3 text-primary flex-shrink-0" :stroke-width="2" />
            <span class="max-w-[180px] truncate text-xs font-mono text-foreground">{{ file.name }}</span>
            <button
              type="button"
              @click="removeAudio(index)"
              :disabled="submittingIssue"
              class="text-xs leading-none text-muted-foreground transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
            >×</button>
          </div>
        </div>
        <button
          type="button"
          @click="!submittingIssue && selectedAudios.length < MAX_AUDIOS && audioInputRef?.click()"
          :disabled="submittingIssue || selectedAudios.length >= MAX_AUDIOS"
          :title="selectedAudios.length >= MAX_AUDIOS ? t('issue.audioMaxReached', { max: MAX_AUDIOS }) : undefined"
          class="btn-secondary inline-flex items-center gap-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Music class="w-3.5 h-3.5" :stroke-width="2" />
          {{ t('issueDetail.audio') }}
        </button>
      </div>

      <div v-if="hasDraftPreview" class="rounded-2xl border border-border bg-background px-3 py-2.5 space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-mono text-muted-foreground">{{ t('issue.preview') }}</span>
          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono"
            :class="severity === 'critical' ? 'bg-error-bg text-error'
              : severity === 'major' ? 'bg-warning-bg text-warning'
              : severity === 'minor' ? 'bg-info-bg text-info'
              : 'bg-border text-foreground'"
          >{{ t(`severity.${severity}`) }}</span>
          <span v-if="issueMode === 'timed'" class="text-muted-foreground">{{ t('issue.markersCount', { count: markers.length }) }}</span>
          <span v-else class="text-muted-foreground">{{ t('issue.generalIssue') }}</span>
          <span v-if="selectedAudios.length" class="text-muted-foreground">{{ t('issue.audioAttachments') }} {{ selectedAudios.length }}</span>
        </div>

        <div v-if="issueMode === 'timed' && markers.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="marker in markerSummary"
            :key="`preview-${marker.index}`"
            class="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-mono text-foreground"
          >
            #{{ marker.index }}
            <span class="text-muted-foreground">·</span>
            <span>{{ formatTime(marker.time_start) }}<template v-if="marker.time_end !== null"> - {{ formatTime(marker.time_end) }}</template></span>
          </span>
        </div>

        <div v-if="descriptionTimeReferences.length || descriptionMarkerReferences.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="(reference, idx) in descriptionTimeReferences"
            :key="`time-ref-${idx}`"
            class="inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-mono text-warning"
          >
            {{ reference.raw }}
          </span>
          <span
            v-for="(reference, idx) in descriptionMarkerReferences"
            :key="`marker-ref-${idx}`"
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono"
            :class="reference.exists ? 'bg-info-bg text-info' : 'bg-error-bg text-error'"
          >
            {{ reference.raw }}
            <span v-if="!reference.exists" class="ml-1 text-error/70">{{ t('issue.markerReferenceMissing') }}</span>
          </span>
        </div>
      </div>

      <div v-if="submittingIssue && selectedAudios.length" class="space-y-1">
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: issueUploadProgress + '%' }"></div>
        </div>
        <p class="text-xs text-muted-foreground text-right">{{ issueUploadProgress }}%</p>
      </div>

      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-2">
          <button @click="submitIssue" :disabled="!canSubmit" class="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50">{{ submittingIssue ? t('common.loading') : t('common.submitIssue') }}</button>
          <button @click="showForm = false; resetForm()" :disabled="submittingIssue" class="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50">{{ t('common.cancel') }}</button>
        </div>
        <button
          type="button"
          @click="issueVisibility = issueVisibility === 'public' ? 'internal' : 'public'"
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono transition-colors"
          :class="issueVisibility === 'internal'
            ? 'border-info/40 bg-info-bg text-info'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'"
          :title="issueVisibility === 'internal' ? t('issue.visibilityInternalHint') : t('issue.visibilityPublicHint')"
        >
          <EyeOff v-if="issueVisibility === 'internal'" class="w-3 h-3" :stroke-width="2" />
          <Eye v-else class="w-3 h-3" :stroke-width="2" />
          {{ issueVisibility === 'internal' ? t('issue.visibilityInternal') : t('issue.visibilityPublic') }}
        </button>
      </div>
    </div>
  </div>
</template>
