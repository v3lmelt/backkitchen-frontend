<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pause, Play } from 'lucide-vue-next'
import type { Issue } from '@/types'
import type { PreviewAction } from '@/composables/useIssuePreviewPlayback'
import { formatTimestampShort } from '@/utils/time'

const POINT_MARKER_DURATION = 0.75
const MIN_MARKER_WIDTH_PCT = 1.2
const POINT_HITBOX_WIDTH_PCT = 3

const props = withDefaults(defineProps<{
  issue: Issue
  duration: number
  currentTime: number
  isPreviewPlaying: boolean
  activeMarkerIndex: number | null
  peaks?: number[]
}>(), {
  peaks: () => [],
})

const emit = defineEmits<{
  action: [action: PreviewAction]
}>()

const { t } = useI18n()

const canvasRef = ref<HTMLElement | null>(null)
const isScrubbing = ref(false)
let activePointerId: number | null = null
let scrubIntent: 'seek' | null = null

interface MarkerLayout {
  key: string
  index: number
  label: string
  isRange: boolean
  startRatio: number
  endRatio: number
  leftPct: number
  widthPct: number
  renderLeftPct: number
  renderWidthPct: number
}

const sortedMarkerIndices = computed<number[]>(() => {
  return props.issue.markers
    .map((_, i) => i)
    .sort((a, b) => props.issue.markers[a].time_start - props.issue.markers[b].time_start)
})

const markerLayouts = computed<MarkerLayout[]>(() => {
  const duration = props.duration
  if (duration <= 0) return []
  return sortedMarkerIndices.value.map((index) => {
    const marker = props.issue.markers[index]
    const startRatio = Math.max(0, Math.min(1, marker.time_start / duration))
    const endSeconds = marker.time_end ?? marker.time_start + POINT_MARKER_DURATION
    const endRatio = Math.max(startRatio, Math.min(1, endSeconds / duration))
    const isRange = marker.time_end != null

    const rawWidthPct = (endRatio - startRatio) * 100
    const leftPct = startRatio * 100
    const widthPct = isRange ? Math.max(rawWidthPct, MIN_MARKER_WIDTH_PCT) : rawWidthPct

    // Hitbox: for point markers give a generous target centered on the point.
    const renderLeftPct = isRange
      ? leftPct
      : Math.max(0, Math.min(100 - POINT_HITBOX_WIDTH_PCT, leftPct - POINT_HITBOX_WIDTH_PCT / 2))
    const renderWidthPct = isRange ? widthPct : POINT_HITBOX_WIDTH_PCT

    return {
      key: `marker-${marker.id}-${index}`,
      index,
      label: marker.time_end == null
        ? formatTimestampShort(marker.time_start)
        : `${formatTimestampShort(marker.time_start)} – ${formatTimestampShort(marker.time_end)}`,
      isRange,
      startRatio,
      endRatio,
      leftPct,
      widthPct,
      renderLeftPct,
      renderWidthPct,
    }
  })
})

const displayedMarker = computed(() => {
  const idx = props.activeMarkerIndex
  if (idx != null && props.issue.markers[idx]) return props.issue.markers[idx]
  return props.issue.markers[0] ?? null
})

const displayedLabel = computed(() => {
  const marker = displayedMarker.value
  if (!marker) return ''
  if (marker.time_end == null) return formatTimestampShort(marker.time_start)
  const length = Math.max(0, marker.time_end - marker.time_start)
  return `${formatTimestampShort(marker.time_start)} – ${formatTimestampShort(marker.time_end)} · ${formatSeconds(length)}`
})

const markerCountLabel = computed(() => {
  const count = props.issue.markers.length
  if (count <= 1) return ''
  if (props.activeMarkerIndex != null) {
    // Show ordinal based on sorted position.
    const position = sortedMarkerIndices.value.indexOf(props.activeMarkerIndex) + 1
    return `${position} / ${count}`
  }
  return t('issueDetail.previewMarkerCount', { count })
})

const playheadPct = computed(() => {
  if (props.duration <= 0) return 0
  return Math.max(0, Math.min(100, (props.currentTime / props.duration) * 100))
})

const peaksForRender = computed(() => {
  const peaks = props.peaks
  if (!peaks?.length) return []
  return peaks
})

const svgViewBox = computed(() => {
  const width = Math.max(1, peaksForRender.value.length)
  return `0 0 ${width} 2`
})

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function seekFromClientX(clientX: number) {
  const el = canvasRef.value
  if (!el || props.duration <= 0) return
  const { left, width } = el.getBoundingClientRect()
  if (width <= 0) return
  const ratio = Math.max(0, Math.min(1, (clientX - left) / width))
  emit('action', { type: 'seek', time: props.duration * ratio })
}

function onPointerMove(event: PointerEvent) {
  if (!isScrubbing.value || event.pointerId !== activePointerId) return
  if (scrubIntent !== 'seek') return
  seekFromClientX(event.clientX)
}

function onPointerEnd(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  stopScrub()
}

function stopScrub() {
  isScrubbing.value = false
  activePointerId = null
  scrubIntent = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerEnd)
  window.removeEventListener('pointercancel', onPointerEnd)
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (props.duration <= 0) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  activePointerId = event.pointerId
  scrubIntent = 'seek'
  isScrubbing.value = true
  seekFromClientX(event.clientX)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
}

function handleMarkerClick(marker: MarkerLayout) {
  emit('action', { type: 'playMarker', index: marker.index })
}

function handleTransport() {
  if (props.isPreviewPlaying) {
    emit('action', { type: 'pause' })
  } else {
    emit('action', { type: 'playSequence' })
  }
}

// If the user swaps issues while scrubbing, cancel.
watch(() => props.issue.id, () => stopScrub())

onBeforeUnmount(() => stopScrub())
</script>

<template>
  <div class="issue-playback-preview space-y-3 rounded-none border border-border bg-background/70 p-3">
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs font-mono font-semibold text-foreground">{{ t('issueDetail.previewHeading') }}</p>
      <span
        v-if="markerCountLabel"
        class="text-[11px] font-mono text-muted-foreground"
      >{{ markerCountLabel }}</span>
    </div>

    <div
      ref="canvasRef"
      class="issue-preview-canvas relative h-12 w-full cursor-pointer select-none overflow-hidden rounded-none border border-border bg-card/70 touch-manipulation"
      @pointerdown.prevent="handleCanvasPointerDown"
    >
      <svg
        v-if="peaksForRender.length"
        class="absolute inset-0 h-full w-full text-muted-foreground/60"
        :viewBox="svgViewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g fill="currentColor">
          <rect
            v-for="(peak, i) in peaksForRender"
            :key="`peak-${i}`"
            :x="i + 0.1"
            :y="Math.max(0, 1 - peak)"
            :width="0.8"
            :height="Math.max(0.04, peak * 2)"
          />
        </g>
      </svg>
      <div
        v-else
        class="pointer-events-none absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border"
        aria-hidden="true"
      ></div>

      <!-- Marker overlays (visual only; hitbox below) -->
      <template v-for="marker in markerLayouts" :key="`${marker.key}-bg`">
        <div
          v-if="marker.isRange"
          class="pointer-events-none absolute top-0 bottom-0 transition-colors"
          :class="activeMarkerIndex === marker.index ? 'bg-primary/45' : 'bg-primary/25'"
          :style="{ left: `${marker.leftPct}%`, width: `${marker.widthPct}%` }"
        ></div>
        <div
          v-else
          class="pointer-events-none absolute top-0 bottom-0 w-0.5 -translate-x-1/2 transition-colors"
          :class="activeMarkerIndex === marker.index ? 'bg-primary' : 'bg-primary/80'"
          :style="{ left: `${marker.leftPct}%` }"
        ></div>
      </template>

      <!-- Playhead -->
      <div
        v-if="duration > 0"
        class="pointer-events-none absolute top-0 bottom-0 w-px bg-success"
        :style="{ left: `${playheadPct}%` }"
        aria-hidden="true"
      ></div>
      <div
        v-if="duration > 0"
        class="issue-preview-playhead-handle pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-success bg-background"
        :style="{ left: `${playheadPct}%` }"
        aria-hidden="true"
      ></div>

      <!-- Marker hit buttons (on top of everything) -->
      <button
        v-for="marker in markerLayouts"
        :key="`${marker.key}-hit`"
        type="button"
        class="issue-preview-marker-hit absolute top-0 bottom-0 bg-transparent transition-colors hover:bg-primary/10 focus:outline-none focus-visible:bg-primary/15"
        :class="{ 'ring-1 ring-primary/60': activeMarkerIndex === marker.index }"
        :style="{ left: `${marker.renderLeftPct}%`, width: `${marker.renderWidthPct}%` }"
        :aria-label="t('issueDetail.previewPlayMarker', { label: marker.label })"
        :title="marker.label"
        @pointerdown.stop
        @click.stop="handleMarkerClick(marker)"
      >
        <span
          v-if="markerLayouts.length > 1"
          class="pointer-events-none absolute top-0.5 left-1 text-[10px] font-mono font-semibold text-primary"
        >{{ sortedMarkerIndices.indexOf(marker.index) + 1 }}</span>
      </button>
    </div>

    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="issue-preview-toggle btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
        @click="handleTransport"
      >
        <Pause v-if="isPreviewPlaying" class="h-3.5 w-3.5" :stroke-width="2" />
        <Play v-else class="h-3.5 w-3.5" :stroke-width="2" />
        <span>{{ isPreviewPlaying ? t('issueDetail.previewPause') : t('issueDetail.previewPlay') }}</span>
      </button>
      <span class="text-[11px] font-mono text-muted-foreground">{{ displayedLabel }}</span>
    </div>
  </div>
</template>
