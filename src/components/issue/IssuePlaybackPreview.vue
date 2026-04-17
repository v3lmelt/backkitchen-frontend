<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-vue-next'
import type { Issue } from '@/types'
import { formatTimestampShort } from '@/utils/time'

const props = defineProps<{
  issue: Issue
  duration: number
  currentTime: number
  isPlaying: boolean
  isActive: boolean
}>()

const emit = defineEmits<{
  preview: [time: number]
  toggle: []
  seek: [time: number]
}>()

const { t } = useI18n()
const timelineRef = ref<HTMLElement | null>(null)
const isScrubbing = ref(false)
let activePointerId: number | null = null

interface PreviewMarker {
  key: string
  label: string
  start: number
  end: number | null
  left: string
  width: string
  isRange: boolean
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function clampTime(value: number): number {
  return Math.min(props.duration, Math.max(0, value))
}

function markerWidth(start: number, end: number | null): string {
  if (props.duration <= 0) return '0%'
  if (end == null) return '0.6rem'
  const width = ((Math.max(end, start) - start) / props.duration) * 100
  return `${Math.max(clampPercent(width), 0.9)}%`
}

function markerLeft(start: number): string {
  if (props.duration <= 0) return '0%'
  return `${clampPercent((start / props.duration) * 100)}%`
}

function emitSeek(time: number) {
  if (props.duration <= 0) return
  emit('seek', clampTime(time))
}

function seekRelative(delta: number) {
  emitSeek(props.currentTime + delta)
}

function seekFromClientX(clientX: number) {
  const timeline = timelineRef.value
  if (!timeline || props.duration <= 0) return

  const { left, width } = timeline.getBoundingClientRect()
  if (width <= 0) return

  const ratio = clampPercent(((clientX - left) / width) * 100) / 100
  emitSeek(props.duration * ratio)
}

function removeScrubListeners() {
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerEnd)
  window.removeEventListener('pointercancel', handleWindowPointerEnd)
}

function stopScrub(pointerId?: number) {
  if (pointerId != null && pointerId !== activePointerId) return
  isScrubbing.value = false
  activePointerId = null
  removeScrubListeners()
}

function handleWindowPointerMove(event: PointerEvent) {
  if (!isScrubbing.value || event.pointerId !== activePointerId) return
  seekFromClientX(event.clientX)
}

function handleWindowPointerEnd(event: PointerEvent) {
  stopScrub(event.pointerId)
}

function beginScrub(event: PointerEvent) {
  if (props.duration <= 0) return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  activePointerId = event.pointerId
  isScrubbing.value = true
  seekFromClientX(event.clientX)

  removeScrubListeners()
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerEnd)
  window.addEventListener('pointercancel', handleWindowPointerEnd)
}

const previewMarkers = computed<PreviewMarker[]>(() =>
  props.issue.markers
    .slice()
    .sort((left, right) => left.time_start - right.time_start)
    .map((marker, index) => ({
      key: `${marker.id}-${index}`,
      label: marker.time_end == null
        ? formatTimestampShort(marker.time_start)
        : `${formatTimestampShort(marker.time_start)} - ${formatTimestampShort(marker.time_end)}`,
      start: marker.time_start,
      end: marker.time_end,
      left: markerLeft(marker.time_start),
      width: markerWidth(marker.time_start, marker.time_end),
      isRange: marker.time_end != null,
    })),
)

const playheadLeft = computed(() => {
  if (props.duration <= 0) return '0%'
  return `${clampPercent((props.currentTime / props.duration) * 100)}%`
})

const primaryActionLabel = computed(() =>
  props.isActive && props.isPlaying
    ? t('issueDetail.previewPause')
    : t('issueDetail.previewPlay'),
)

onBeforeUnmount(() => {
  stopScrub()
})
</script>

<template>
  <div class="issue-playback-preview rounded-none border border-border bg-background/70 p-3 space-y-3">
    <div class="space-y-1">
      <p class="text-xs font-mono font-semibold text-foreground">{{ t('issueDetail.previewHeading') }}</p>
      <p class="text-xs text-muted-foreground">{{ t('issueDetail.previewHint') }}</p>
    </div>

    <div class="space-y-2">
      <div
        ref="timelineRef"
        class="issue-preview-timeline relative h-16 cursor-pointer select-none overflow-hidden rounded-none border border-border bg-card/70 touch-manipulation"
        @pointerdown.prevent="beginScrub"
      >
        <div class="pointer-events-none absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border/80"></div>
        <div
          v-for="marker in previewMarkers"
          :key="marker.key"
          class="issue-preview-marker pointer-events-none absolute top-3 bottom-3 transition-colors"
          :class="marker.isRange
            ? 'rounded-none border border-primary/45 bg-primary/15 hover:border-primary hover:bg-primary/20'
            : 'w-2 -translate-x-1/2 rounded-full border border-primary/60 bg-primary/80 hover:bg-primary'"
          :style="marker.isRange ? { left: marker.left, width: marker.width } : { left: marker.left }"
          :title="marker.label"
        />
        <div
          class="issue-preview-playhead pointer-events-none absolute top-2 bottom-2 w-px bg-success transition-all"
          :style="{ left: playheadLeft }"
        />
        <div
          class="issue-preview-playhead-handle pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-success bg-background transition-all"
          :style="{ left: playheadLeft }"
        />
      </div>

      <div class="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>{{ formatTimestampShort(currentTime) }}</span>
        <span>{{ formatTimestampShort(duration) }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="issue-preview-back inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          :aria-label="t('issueDetail.previewBackFive')"
          :title="t('issueDetail.previewBackFive')"
          @click="seekRelative(-5)"
        >
          <SkipBack class="h-3.5 w-3.5" :stroke-width="2" />
          <span>-5s</span>
        </button>

        <button
          type="button"
          class="issue-preview-toggle btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-1.5"
          @click="emit('toggle')"
        >
          <Pause v-if="isActive && isPlaying" class="w-3.5 h-3.5" :stroke-width="2" />
          <Play v-else class="w-3.5 h-3.5" :stroke-width="2" />
          <span>{{ primaryActionLabel }}</span>
        </button>

        <button
          type="button"
          class="issue-preview-forward inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          :aria-label="t('issueDetail.previewForwardFive')"
          :title="t('issueDetail.previewForwardFive')"
          @click="seekRelative(5)"
        >
          <SkipForward class="h-3.5 w-3.5" :stroke-width="2" />
          <span>+5s</span>
        </button>
      </div>

      <span class="text-[11px] font-mono text-muted-foreground">
        {{ formatTimestampShort(currentTime) }} / {{ formatTimestampShort(duration) }}
      </span>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="marker in previewMarkers"
        :key="`${marker.key}-chip`"
        type="button"
        class="issue-preview-marker-chip rounded-full border border-border px-2.5 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        @click="emit('preview', marker.start)"
      >
        {{ marker.label }}
      </button>
    </div>
  </div>
</template>
