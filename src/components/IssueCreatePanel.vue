<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { issueApi } from '@/api'
import type { Issue } from '@/types'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const props = defineProps<{
  trackId: number
  phase: string
  masterDeliveryId?: number | null
}>()

const emit = defineEmits<{
  created: [issue: Issue]
}>()

const { t } = useI18n()

const showForm = ref(false)
const issueMode = ref<'timed' | 'general'>('timed')
const title = ref('')
const description = ref('')
const severity = ref<'critical' | 'major' | 'minor' | 'suggestion'>('major')
const markers = ref<{ marker_type: 'point' | 'range'; time_start: number; time_end: number | null }[]>([])
const descriptionInputFocused = ref(false)

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

function handleClick(time: number) {
  markers.value.push({
    marker_type: 'point',
    time_start: roundToMilliseconds(time),
    time_end: null,
  })
  issueMode.value = 'timed'
  showForm.value = true
}

function handleRangeSelect(start: number, end: number) {
  markers.value.push({
    marker_type: 'range',
    time_start: start,
    time_end: end,
  })
  issueMode.value = 'timed'
  showForm.value = true
}

function removeMarker(index: number) {
  markers.value.splice(index, 1)
}

function resetForm() {
  title.value = ''
  description.value = ''
  severity.value = 'major'
  markers.value = []
  issueMode.value = 'timed'
}

async function submitIssue() {
  const payload: Parameters<typeof issueApi.create>[1] = {
    title: title.value,
    description: description.value,
    severity: severity.value,
    phase: props.phase,
    markers: issueMode.value === 'general' ? [] : markers.value.map(m => ({
      marker_type: m.marker_type,
      time_start: m.time_start,
      time_end: m.time_end,
    })),
  }
  if (props.masterDeliveryId != null) {
    payload.master_delivery_id = props.masterDeliveryId
  }
  const created = await issueApi.create(props.trackId, payload)
  emit('created', created)
  showForm.value = false
  resetForm()
}

function switchMode(mode: 'timed' | 'general') {
  if (mode === issueMode.value) return
  issueMode.value = mode
  if (mode === 'general') {
    markers.value = []
  }
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

const canSubmit = computed(() => {
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

defineExpose({ handleClick, handleRangeSelect, selectedRange, showForm })
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

      <h4 class="text-sm font-sans font-semibold text-foreground">
        {{ formHeading }}
      </h4>

      <!-- Marker list (timed mode) -->
      <div v-if="issueMode === 'timed' && markers.length > 0" class="space-y-1.5">
        <div
          v-for="(marker, index) in markers"
          :key="index"
          class="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5"
        >
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono"
            :class="marker.marker_type === 'point' ? 'bg-info-bg text-info' : 'bg-warning-bg text-warning'"
          >{{ marker.marker_type === 'point' ? t('issueType.point') : t('issueType.range') }}</span>
          <span class="text-xs font-mono text-foreground">
            {{ formatTime(marker.time_start) }}
            <template v-if="marker.time_end !== null"> – {{ formatTime(marker.time_end) }}</template>
          </span>
          <button @click="removeMarker(index)" class="ml-auto text-muted-foreground hover:text-error transition-colors">
            <X class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
        </div>
        <p class="text-[11px] text-muted-foreground">{{ t('issue.clickWaveformToAdd') }}</p>
      </div>
      <div v-else-if="issueMode === 'timed' && markers.length === 0">
        <p class="text-xs text-muted-foreground">{{ t('issue.clickWaveformToAdd') }}</p>
      </div>

      <input v-model="title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
      <div class="relative">
        <textarea
          v-model="description"
          class="textarea-field w-full h-20"
          :placeholder="t('common.descriptionPlaceholder')"
          @focus="descriptionInputFocused = true"
          @blur="descriptionInputFocused = false"
        />
        <TimestampSyntaxPopover
          :visible="descriptionInputFocused"
          :text="description"
          default-target="track"
        />
      </div>
      <CustomSelect v-model="severity" :options="severityOptions" />
      <div class="flex gap-2">
        <button @click="submitIssue" :disabled="!canSubmit" class="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">{{ t('common.submitIssue') }}</button>
        <button @click="showForm = false; resetForm()" class="btn-secondary text-sm">{{ t('common.cancel') }}</button>
      </div>
    </div>
  </div>
</template>
