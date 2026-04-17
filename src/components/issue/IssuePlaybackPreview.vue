<script setup lang="ts">
import { computed } from 'vue'
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

function handleTimelineClick(event: MouseEvent) {
  const timeline = event.currentTarget as HTMLElement | null
  if (!timeline || props.duration <= 0) return

  const { left, width } = timeline.getBoundingClientRect()
  if (width <= 0) return

  const ratio = clampPercent(((event.clientX - left) / width) * 100) / 100
  emitSeek(props.duration * ratio)
}

function onSeekInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return

  const value = Number(target.value)
  if (Number.isFinite(value)) emitSeek(value)
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

const scrubberValue = computed(() => clampTime(props.currentTime))

const primaryActionLabel = computed(() =>
  props.isActive && props.isPlaying
    ? t('issueDetail.previewPause')
    : t('issueDetail.previewPlay'),
)
</script>

<template>
  <div class="issue-playback-preview rounded-none border border-border bg-background/70 p-3 space-y-3">
    <div class="space-y-1">
      <p class="text-xs font-mono font-semibold text-foreground">{{ t('issueDetail.previewHeading') }}</p>
      <p class="text-xs text-muted-foreground">{{ t('issueDetail.previewHint') }}</p>
    </div>

    <div class="space-y-2">
      <div
        class="issue-preview-timeline relative h-16 cursor-pointer overflow-hidden rounded-none border border-border bg-card/70 touch-manipulation"
        @click="handleTimelineClick"
      >
        <div class="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border/80"></div>
        <button
          v-for="marker in previewMarkers"
          :key="marker.key"
          type="button"
          class="issue-preview-marker absolute top-3 bottom-3 transition-colors"
          :class="marker.isRange
            ? 'rounded-none border border-primary/45 bg-primary/15 hover:border-primary hover:bg-primary/20'
            : 'w-2 -translate-x-1/2 rounded-full border border-primary/60 bg-primary/80 hover:bg-primary'"
          :style="marker.isRange ? { left: marker.left, width: marker.width } : { left: marker.left }"
          :title="marker.label"
          @click.stop="emit('preview', marker.start)"
        />
        <div
          class="issue-preview-playhead absolute top-2 bottom-2 w-px bg-success transition-all"
          :style="{ left: playheadLeft }"
        />
      </div>

      <input
        class="issue-preview-slider h-2 w-full cursor-pointer accent-primary"
        type="range"
        min="0"
        :max="duration"
        step="0.1"
        :value="scrubberValue"
        :aria-label="t('issueDetail.previewSeek')"
        @input="onSeekInput"
      />

      <div class="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>{{ formatTimestampShort(scrubberValue) }}</span>
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
        {{ formatTimestampShort(scrubberValue) }} / {{ formatTimestampShort(duration) }}
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
