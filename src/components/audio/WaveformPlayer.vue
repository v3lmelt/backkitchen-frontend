<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Issue } from '@/types'

const props = defineProps<{
  audioUrl: string
  issues?: Issue[]
  height?: number
  selectable?: boolean
  selectedRange?: { start: number; end: number } | null
}>()

const emit = defineEmits<{
  ready: [duration: number]
  timeupdate: [time: number]
  click: [time: number]
  regionClick: [issue: Issue]
  rangeSelect: [start: number, end: number]
}>()

const container = ref<HTMLDivElement>()
const wavesurfer = ref<WaveSurfer | null>(null)
const regionsPlugin = ref<RegionsPlugin | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isRenderingRegions = ref(false)
const selectionRegionId = ref<string | null>(null)
const lastSelectionAt = ref(0)
const selectionVisual = {
  color: 'rgba(34, 211, 238, 0.28)',
  content: 'Editing range',
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function syncSelectedRange(region: { id: string; start: number; end: number; remove?: () => void }) {
  const start = roundToTenth(Math.min(region.start, region.end))
  const end = roundToTenth(Math.max(region.start, region.end))

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
    selectionRegionId.value = null
    return
  }

  const start = roundToTenth(Math.min(selectedRange.start, selectedRange.end))
  const end = roundToTenth(Math.max(selectedRange.start, selectedRange.end))

  if (end <= start) {
    selectionRegionId.value = null
    return
  }

  const region = regionsPlugin.value.addRegion({
    start,
    end,
    drag: true,
    resize: true,
    color: selectionVisual.color,
    content: selectionVisual.content,
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

  selectionRegionId.value = region.id
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

  ws.on('timeupdate', (time: number) => {
    currentTime.value = time
    emit('timeupdate', time)
  })

  ws.on('play', () => { isPlaying.value = true })
  ws.on('pause', () => { isPlaying.value = false })

  ws.on('click', () => {
    if (Date.now() - lastSelectionAt.value < 250) return
    emit('click', ws.getCurrentTime())
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
      color: selectionVisual.color,
      drag: true,
      resize: true,
      content: selectionVisual.content,
    })
  }

  // Fetch as Blob first so IDM extensions don't intercept the request
  try {
    const res = await fetch(props.audioUrl)
    const blob = await res.blob()
    await ws.loadBlob(blob)
  } catch {
    ws.load(props.audioUrl) // fallback
  }

  wavesurfer.value = ws
})

function renderIssueRegions() {
  if (!regionsPlugin.value || !props.issues) return
  isRenderingRegions.value = true
  regionsPlugin.value.clearRegions()
  selectionRegionId.value = null

  const severityColors: Record<string, string> = {
    critical: 'rgba(255, 92, 51, 0.25)',
    major: 'rgba(255, 132, 0, 0.25)',
    minor: 'rgba(178, 178, 255, 0.25)',
    suggestion: 'rgba(182, 255, 206, 0.25)',
  }

  for (const issue of props.issues) {
    const color = severityColors[issue.severity] || 'rgba(168, 85, 247, 0.25)'
    if (issue.issue_type === 'range' && issue.time_end) {
      regionsPlugin.value.addRegion({
        start: issue.time_start,
        end: issue.time_end,
        color,
        drag: false,
        resize: false,
        id: String(issue.id),
      })
    } else {
      regionsPlugin.value.addRegion({
        start: issue.time_start,
        end: issue.time_start + 0.5,
        color,
        drag: false,
        resize: false,
        id: String(issue.id),
      })
    }
  }

  renderSelectionRegion()

  isRenderingRegions.value = false
}

watch(() => props.issues, renderIssueRegions, { deep: true })
watch(() => props.selectedRange, renderIssueRegions, { deep: true })

function togglePlay() {
  wavesurfer.value?.playPause()
}

function seekTo(time: number) {
  if (wavesurfer.value && duration.value > 0) {
    wavesurfer.value.seekTo(time / duration.value)
  }
}

onBeforeUnmount(() => {
  wavesurfer.value?.destroy()
})

defineExpose({ seekTo, togglePlay })
</script>

<template>
  <div class="card space-y-3">
    <div ref="container" class="bg-[#0D0D0D] rounded-none overflow-hidden" />
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
