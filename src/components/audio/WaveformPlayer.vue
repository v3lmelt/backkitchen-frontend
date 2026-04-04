<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import { CircleAlert, CircleCheckBig } from 'lucide-vue-next'
import type { Issue } from '@/types'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const TOKEN_KEY = 'backkitchen_token'

const props = defineProps<{
  audioUrl: string
  issues?: Issue[]
  height?: number
  selectable?: boolean
  selectedRange?: { start: number; end: number } | null
  compareVersionId?: number | null
  trackId?: number
}>()

const emit = defineEmits<{
  ready: [duration: number]
  timeupdate: [time: number]
  click: [time: number]
  regionClick: [issue: Issue]
  rangeSelect: [start: number, end: number]
}>()

const { t } = useI18n()

const container = ref<HTMLDivElement>()
const compareContainerRef = ref<HTMLDivElement>()
const wavesurfer = ref<WaveSurfer | null>(null)
const compareWaveSurfer = ref<WaveSurfer | null>(null)
const regionsPlugin = ref<RegionsPlugin | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isRenderingRegions = ref(false)
const selectionRegionId = ref<string | null>(null)
const highlightRegionId = ref<string | null>(null)
const activeRangeIssueId = ref<number | null>(null)
const lastSelectionAt = ref(0)
const activePointGroupKey = ref<string | null>(null)
const abMode = ref<'A' | 'B'>('A')
const isCompareMode = computed(() => !!props.compareVersionId)
const selectionVisualColor = 'rgba(34, 211, 238, 0.28)'
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  major: '#f97316',
  minor: '#eab308',
  suggestion: '#3b82f6',
}

const SEVERITY_REGION_COLORS: Record<string, string> = {
  critical: 'rgba(239,68,68,0.22)',
  major: 'rgba(249,115,22,0.22)',
  minor: 'rgba(234,179,8,0.22)',
  suggestion: 'rgba(59,130,246,0.22)',
}

type MarkerStatus = 'unresolved' | 'resolved'

interface PointMarkerGroup {
  key: string
  time: number
  percent: number
  left: string
  issues: Issue[]
  status: MarkerStatus
  markerAlign: 'left' | 'center' | 'right'
  popoverAlign: 'left' | 'center' | 'right'
}


function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function getMarkerStatus(issues: Issue[]): MarkerStatus {
  return issues.every(issue => issue.status === 'resolved') ? 'resolved' : 'unresolved'
}

function getMarkerPosition(time: number): string {
  if (duration.value <= 0) return '0%'
  return `${clampPercent((time / duration.value) * 100)}%`
}

function getMarkerPercent(time: number): number {
  if (duration.value <= 0) return 0
  return clampPercent((time / duration.value) * 100)
}

function getPointMarkerAlign(percent: number): 'left' | 'center' | 'right' {
  if (percent <= 3) return 'left'
  if (percent >= 97) return 'right'
  return 'center'
}

function getPointPopoverAlign(percent: number): 'left' | 'center' | 'right' {
  if (percent <= 12) return 'left'
  if (percent >= 88) return 'right'
  return 'center'
}

function markerAnchorClass(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'translate-x-0'
  if (align === 'right') return '-translate-x-full'
  return '-translate-x-1/2'
}

function popoverAnchorClass(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'left-0 translate-x-0'
  if (align === 'right') return 'right-0 translate-x-0'
  return 'left-1/2 -translate-x-1/2'
}

function getRangeWidth(start: number, end: number): string {
  if (duration.value <= 0) return '0%'
  const width = ((Math.max(end, start) - start) / duration.value) * 100
  return `${Math.max(clampPercent(width), 0.35)}%`
}

const pointGroups = computed<PointMarkerGroup[]>(() => {
  if (!props.issues?.length || duration.value <= 0) return []

  const grouped = new Map<string, Issue[]>()
  for (const issue of props.issues) {
    if (issue.issue_type !== 'point') continue
    const key = issue.time_start.toFixed(3)
    const entries = grouped.get(key)
    if (entries) {
      entries.push(issue)
    } else {
      grouped.set(key, [issue])
    }
  }

  return Array.from(grouped.entries())
    .map(([key, issues]) => {
      const time = Number(key)
      const percent = getMarkerPercent(time)
      return {
        key,
        time,
        percent,
        left: `${percent}%`,
        issues: [...issues].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        status: getMarkerStatus(issues),
        markerAlign: getPointMarkerAlign(percent),
        popoverAlign: getPointPopoverAlign(percent),
      }
    })
    .sort((a, b) => a.time - b.time)
})

const rangeIssues = computed(() =>
  (props.issues ?? []).filter(
    (i): i is Issue & { time_end: number } => i.issue_type === 'range' && i.time_end !== null,
  ),
)

const overlayHeight = computed(() => props.height || 128)
const pointLineHeight = computed(() => `${Math.max((props.height || 128) - 28, 80)}px`)

const hasPointIssues = computed(() => (props.issues ?? []).some(i => i.issue_type === 'point'))


function togglePointGroup(groupKey: string) {
  activePointGroupKey.value = activePointGroupKey.value === groupKey ? null : groupKey
}

function selectIssue(issue: Issue) {
  activePointGroupKey.value = null
  emit('regionClick', issue)
}

function iconForStatus(status: MarkerStatus) {
  return status === 'resolved' ? CircleCheckBig : CircleAlert
}

function iconClassForStatus(status: MarkerStatus) {
  return status === 'resolved'
    ? 'text-success bg-success/15 border-success/30'
    : 'text-error bg-error/15 border-error/30'
}

function lineClassForStatus(status: MarkerStatus) {
  return status === 'resolved' ? 'bg-success/90' : 'bg-error/90'
}

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] ?? '#6366f1'
}

function severityRegionColor(severity: string): string {
  return SEVERITY_REGION_COLORS[severity] ?? 'rgba(99,102,241,0.22)'
}

function _removeRegionById(id: string) {
  const region = (regionsPlugin.value as any)?.getRegions?.()?.find(
    (r: { id: string; remove?: () => void }) => r.id === id,
  )
  region?.remove?.()
}

function _addHighlightRegion(issue: Issue & { time_end: number }) {
  if (!regionsPlugin.value) return
  const region = regionsPlugin.value.addRegion({
    start: issue.time_start,
    end: issue.time_end,
    color: severityRegionColor(issue.severity),
    drag: false,
    resize: false,
    id: `__hl_${issue.id}__`,
  })
  highlightRegionId.value = region.id
}

function highlightIssue(issue: Issue | null) {
  const newId = (issue?.issue_type === 'range' && issue.time_end !== null) ? issue.id : null
  activeRangeIssueId.value = activeRangeIssueId.value === newId ? null : newId

  if (highlightRegionId.value) {
    _removeRegionById(highlightRegionId.value)
    highlightRegionId.value = null
  }
  if (activeRangeIssueId.value !== null) {
    const target = props.issues?.find(i => i.id === activeRangeIssueId.value)
    if (target && target.issue_type === 'range' && target.time_end !== null) {
      _addHighlightRegion(target as Issue & { time_end: number })
    }
  }
}

function handleTimelineClick(issue: Issue & { time_end: number }) {
  seekTo(issue.time_start)
  emit('regionClick', issue)  // parent's onIssueSelect will call highlightIssue
}

function getCursorElement(): HTMLElement | null {
  const waveformHost = Array.from(container.value?.children || []).find(
    child => child instanceof HTMLElement && !!child.shadowRoot,
  ) as HTMLElement | undefined

  return waveformHost?.shadowRoot?.querySelector('[part="cursor"]') as HTMLElement | null
}

function syncSelectedRange(region: { id: string; start: number; end: number; remove?: () => void }) {
  const start = roundToMilliseconds(Math.min(region.start, region.end))
  const end = roundToMilliseconds(Math.max(region.start, region.end))

  if (end <= start) {
    region.remove?.()
    return
  }

  if (selectionRegionId.value && selectionRegionId.value !== region.id) {
    const previousRegion = (regionsPlugin.value as any)?.getRegions?.().find(
      (item: { id: string; remove?: () => void }) => item.id === selectionRegionId.value,
    )
    previousRegion?.remove?.()
  }

  selectionRegionId.value = region.id
  lastSelectionAt.value = Date.now()
  emit('rangeSelect', start, end)
}

function renderSelectionRegion() {
  if (!regionsPlugin.value) return
  const selectedRange = props.selectedRange

  if (!selectedRange) {
    if (selectionRegionId.value) {
      _removeRegionById(selectionRegionId.value)
      selectionRegionId.value = null
    }
    const cursor = getCursorElement()
    if (cursor) cursor.style.opacity = '1'
    return
  }

  // Skip re-render if a region already exists — drag/resize events keep it in sync directly.
  // Only proceed when there is no region yet and we need to create one from the prop.
  if (selectionRegionId.value) return

  const start = roundToMilliseconds(Math.min(selectedRange.start, selectedRange.end))
  const end = roundToMilliseconds(Math.max(selectedRange.start, selectedRange.end))

  if (end <= start) {
    const cursor = getCursorElement()
    if (cursor) cursor.style.opacity = '1'
    return
  }

  const region = regionsPlugin.value.addRegion({
    start,
    end,
    drag: true,
    resize: true,
    color: selectionVisualColor,
    content: t('waveform.editingRange'),
    id: '__draft_range__',
  })

  const element = (region as any).element as HTMLElement | undefined
  if (element) {
    element.style.outline = '2px solid rgba(34, 211, 238, 0.95)'
    element.style.outlineOffset = '-2px'
    element.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.28)'
    element.style.borderTop = '2px solid rgba(34, 211, 238, 0.95)'
    element.style.borderBottom = '2px solid rgba(34, 211, 238, 0.95)'
  }

  const content = element?.querySelector('[part="region-content"]') as HTMLElement | null
  if (content) {
    content.style.fontSize = '11px'
    content.style.fontWeight = '700'
    content.style.letterSpacing = '0.04em'
    content.style.textTransform = 'uppercase'
    content.style.color = '#A5F3FC'
    content.style.background = 'rgba(8, 47, 73, 0.92)'
    content.style.border = '1px solid rgba(34, 211, 238, 0.7)'
    content.style.borderRadius = '9999px'
    content.style.padding = '2px 8px'
  }

  const cursor = getCursorElement()
  if (cursor) cursor.style.opacity = '0'

  selectionRegionId.value = region.id
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

onMounted(async () => {
  if (!container.value) return

  const regions = RegionsPlugin.create()
  regionsPlugin.value = regions

  const ws = WaveSurfer.create({
    container: container.value,
    waveColor: '#4A4A5A',
    progressColor: '#22D3EE',
    cursorColor: '#A855F7',
    cursorWidth: 2,
    height: props.height || 128,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    plugins: [regions],
  })

  ws.on('ready', () => {
    duration.value = ws.getDuration()
    emit('ready', duration.value)
    renderIssueRegions()
  })

  let lastTimeUpdateMs = 0
  let lastInteractionMs = 0
  ws.on('timeupdate', (time: number) => {
    // Throttle Vue reactive updates to ~20fps to avoid flooding the reactivity
    // system at 60fps and causing main-thread pressure that can stutter audio.
    const now = Date.now()
    if (now - lastTimeUpdateMs >= 50) {
      currentTime.value = time
      emit('timeupdate', time)
      lastTimeUpdateMs = now
    }
    if (compareWaveSurfer.value && isCompareMode.value && now - lastInteractionMs > 300) {
      const compareDuration = compareWaveSurfer.value.getDuration()
      if (compareDuration > 0) {
        const compareTime = compareWaveSurfer.value.getCurrentTime()
        // Correct drift if positions diverge by more than 0.15s
        if (Math.abs(compareTime - time) > 0.15) {
          compareWaveSurfer.value.seekTo(time / compareDuration)
        }
      }
    }
  })

  ws.on('play', () => { isPlaying.value = true })
  ws.on('pause', () => { isPlaying.value = false })

  ws.on('click', () => {
    if (Date.now() - lastSelectionAt.value < 250) return
    emit('click', ws.getCurrentTime())
  })

  ws.on('interaction', (newTime: number) => {
    if (compareWaveSurfer.value && isCompareMode.value) {
      lastInteractionMs = Date.now()
      const primaryDuration = ws.getDuration()
      if (primaryDuration > 0) {
        compareWaveSurfer.value.seekTo(newTime / primaryDuration)
      }
    }
  })

  regions.on('region-clicked', (region: any, e: Event) => {
    e.stopPropagation()
    const issue = props.issues?.find(i => String(i.id) === region.id)
    if (issue) emit('regionClick', issue)
  })

  regions.on('region-created', (region: any) => {
    if (isRenderingRegions.value) return
    syncSelectedRange(region)
  })

  regions.on('region-updated', (region: any) => {
    if (selectionRegionId.value !== region.id) return
    syncSelectedRange(region)
  })

  if (props.selectable) {
    ;(regions as any).enableDragSelection?.({
      color: selectionVisualColor,
      drag: true,
      resize: true,
      content: t('waveform.editingRange'),
    })
  }

  // Audio endpoints are auth-protected, so load them through fetch with Bearer auth.
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const res = await fetch(props.audioUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) {
      throw new Error(`Failed to load audio: ${res.status}`)
    }
    const blob = await res.blob()
    await ws.loadBlob(blob)
  } catch {
    // Keep the player mounted but avoid a second unauthenticated request loop.
  }

  wavesurfer.value = ws
})

function renderIssueRegions() {
  if (!regionsPlugin.value) return
  isRenderingRegions.value = true
  regionsPlugin.value.clearRegions()
  selectionRegionId.value = null
  highlightRegionId.value = null

  renderSelectionRegion()

  // Restore highlight if one was active
  if (activeRangeIssueId.value !== null) {
    const issue = props.issues?.find(i => i.id === activeRangeIssueId.value)
    if (issue && issue.issue_type === 'range' && issue.time_end !== null) {
      _addHighlightRegion(issue as Issue & { time_end: number })
    } else {
      activeRangeIssueId.value = null
    }
  }

  isRenderingRegions.value = false
}

watch(() => props.issues, (issues) => {
  if (activeRangeIssueId.value === null) return
  const issue = issues?.find(i => i.id === activeRangeIssueId.value)
  if (!issue || issue.issue_type !== 'range' || issue.time_end === null) {
    activeRangeIssueId.value = null
    if (highlightRegionId.value) {
      _removeRegionById(highlightRegionId.value)
      highlightRegionId.value = null
    }
  }
})
watch(() => props.selectedRange, renderSelectionRegion, { deep: true })
watch(duration, () => {
  activePointGroupKey.value = null
})

watch(() => props.compareVersionId, async (newId) => {
  if (compareWaveSurfer.value) {
    compareWaveSurfer.value.destroy()
    compareWaveSurfer.value = null
  }
  if (!newId || !props.trackId) {
    abMode.value = 'A'
    wavesurfer.value?.setVolume(1)
    return
  }

  await nextTick()
  const compareContainer = compareContainerRef.value
  if (!compareContainer) return

  const ws = WaveSurfer.create({
    container: compareContainer,
    waveColor: 'rgba(249,115,22,0.5)',
    progressColor: 'rgba(249,115,22,0.7)',
    height: props.height || 128,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    interact: false,
    cursorWidth: 0,
  })

  const compareUrl = `/api/tracks/${props.trackId}/source-versions/${newId}/audio`
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const res = await fetch(compareUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (res.ok) {
      const blob = await res.blob()
      await ws.loadBlob(blob)
    }
  } catch {}

  compareWaveSurfer.value = ws
  if (abMode.value === 'A') {
    ws.setVolume(0)
  } else {
    wavesurfer.value?.setVolume(0)
    ws.setVolume(1)
  }
  // If main player is already playing, start compare in sync
  if (wavesurfer.value?.isPlaying()) {
    const mainTime = wavesurfer.value.getCurrentTime()
    const compDuration = ws.getDuration()
    if (compDuration > 0) {
      ws.seekTo(mainTime / compDuration)
    }
    ws.play()
  }
})

watch(abMode, (mode) => {
  if (!wavesurfer.value || !compareWaveSurfer.value) return
  if (mode === 'A') {
    wavesurfer.value.setVolume(1)
    compareWaveSurfer.value.setVolume(0)
    wavesurfer.value.setOptions({ waveColor: '#4A4A5A', progressColor: '#22D3EE', cursorWidth: 2 })
    compareWaveSurfer.value.setOptions({ waveColor: 'rgba(249,115,22,0.15)', progressColor: 'rgba(249,115,22,0.2)', cursorWidth: 0 })
  } else {
    wavesurfer.value.setVolume(0)
    compareWaveSurfer.value.setVolume(1)
    wavesurfer.value.setOptions({ waveColor: 'rgba(74,74,90,0.15)', progressColor: 'rgba(34,211,238,0.2)', cursorWidth: 0 })
    compareWaveSurfer.value.setOptions({ waveColor: '#F97316', progressColor: '#FB923C', cursorWidth: 2 })
  }
})

function togglePlay() {
  wavesurfer.value?.playPause()
  if (compareWaveSurfer.value && isCompareMode.value) {
    if (wavesurfer.value?.isPlaying()) {
      compareWaveSurfer.value.play()
    } else {
      compareWaveSurfer.value.pause()
    }
  }
}

function seekTo(time: number) {
  if (wavesurfer.value && duration.value > 0) {
    wavesurfer.value.seekTo(time / duration.value)
  }
  if (compareWaveSurfer.value && isCompareMode.value) {
    const compareDuration = compareWaveSurfer.value.getDuration()
    if (compareDuration > 0) {
      compareWaveSurfer.value.seekTo(time / compareDuration)
    }
  }
}

onBeforeUnmount(() => {
  wavesurfer.value?.destroy()
  compareWaveSurfer.value?.destroy()
})

defineExpose({ seekTo, togglePlay, highlightIssue })
</script>

<template>
  <div class="card space-y-3">
    <div class="relative">
      <div
        v-if="hasPointIssues"
        class="pointer-events-none absolute inset-x-0 top-0 z-10"
        :style="{ height: `${overlayHeight}px` }"
      >
        <div
          v-for="group in pointGroups"
          :key="group.key"
          class="absolute top-0 flex flex-col items-center"
          :class="markerAnchorClass(group.markerAlign)"
          :style="{ left: group.left }"
        >
          <button
            type="button"
            class="pointer-events-auto flex flex-col items-center"
            @click="togglePointGroup(group.key)"
          >
            <component
              :is="iconForStatus(group.status)"
              class="h-4 w-4 rounded-full border p-0.5"
              :class="iconClassForStatus(group.status)"
            />
            <span
              v-if="group.issues.length > 1"
              class="mt-1 inline-flex min-w-5 items-center justify-center rounded-full border border-border bg-card px-1 text-[10px] font-semibold leading-4 text-foreground shadow"
            >
              {{ group.issues.length }}
            </span>
            <span class="mt-1 min-h-[108px] w-px" :class="lineClassForStatus(group.status)" :style="{ height: pointLineHeight }" />
          </button>

          <div
            v-if="activePointGroupKey === group.key"
            class="pointer-events-auto absolute top-6 z-20 w-56 rounded-lg border border-border bg-card/95 p-2 shadow-xl backdrop-blur"
            :class="popoverAnchorClass(group.popoverAlign)"
          >
            <button
              v-for="issue in group.issues"
              :key="issue.id"
              type="button"
              class="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/70"
              @click="selectIssue(issue)"
            >
              <component
                :is="iconForStatus(issue.status === 'resolved' ? 'resolved' : 'unresolved')"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border p-0.5"
                :class="iconClassForStatus(issue.status === 'resolved' ? 'resolved' : 'unresolved')"
              />
              <span class="min-w-0">
                <span class="block truncate text-xs font-medium text-foreground">{{ issue.title }}</span>
                <span class="block text-[11px] text-muted-foreground">{{ formatTime(issue.time_start) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="relative">
        <div
          ref="container"
          class="relative overflow-hidden rounded-none bg-[#0D0D0D] transition-[z-index]"
          :class="abMode === 'A' ? 'z-[2]' : 'z-0'"
          :style="{ height: `${props.height || 128}px` }"
        />
        <div
          v-if="isCompareMode"
          ref="compareContainerRef"
          class="absolute inset-0 pointer-events-none transition-[z-index]"
          :class="abMode === 'B' ? 'z-[2]' : 'z-0'"
        ></div>
        <div v-if="isCompareMode" class="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded-lg p-1 z-10">
          <button
            @click="abMode = 'A'"
            :class="['px-2 py-0.5 rounded text-xs font-bold transition-colors', abMode === 'A' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white']">
            A
          </button>
          <button
            @click="abMode = 'B'"
            :class="['px-2 py-0.5 rounded text-xs font-bold transition-colors', abMode === 'B' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white']">
            B
          </button>
          <span class="text-xs text-gray-400 px-1">{{ abMode === 'A' ? $t('compare.currentVersion') : $t('compare.previousVersion') }}</span>
        </div>
      </div>
    </div>

    <!-- Range issue timeline -->
    <div
      v-if="rangeIssues.length > 0 && duration > 0"
      class="relative mx-0.5 h-2 rounded-full bg-white/5"
    >
      <button
        v-for="issue in rangeIssues"
        :key="issue.id"
        type="button"
        class="group absolute top-0 h-full min-w-[3px] rounded-sm transition-opacity"
        :class="activeRangeIssueId === issue.id ? 'opacity-100 ring-1 ring-white/40 z-10' : 'opacity-60 hover:opacity-100'"
        :style="{
          left: getMarkerPosition(issue.time_start),
          width: getRangeWidth(issue.time_start, issue.time_end),
          backgroundColor: severityColor(issue.severity),
        }"
        @click.stop="handleTimelineClick(issue)"
      >
        <span
          class="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-card/95 px-1.5 py-0.5 text-[11px] text-foreground shadow border border-border opacity-0 group-hover:opacity-100 transition-opacity z-20"
        >{{ issue.title }}</span>
      </button>
    </div>

    <div class="flex items-center gap-4">
      <button @click="togglePlay" class="text-cyan hover:text-cyan-dark transition-colors">
        <svg v-if="!isPlaying" class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <svg v-else class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>
      <span class="text-sm text-muted-foreground font-mono">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </span>
    </div>
  </div>
</template>
