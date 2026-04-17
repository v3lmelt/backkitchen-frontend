<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Issue } from '@/types'
import { formatTimestampShort } from '@/utils/time'
import type { IssueReference, MarkerIndexReference, TimeReference, TimestampTarget } from '@/utils/timestamps'
import { resolveTimeReferenceTarget, splitTextWithInlineReferences } from '@/utils/timestamps'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  text: string
  defaultTarget?: TimestampTarget
  interactive?: boolean
  issues?: Issue[] | null
}>(), {
  defaultTarget: 'track',
  interactive: true,
  issues: () => [],
})

const emit = defineEmits<{
  activate: [reference: TimeReference, target: TimestampTarget]
  markerActivate: [reference: MarkerIndexReference]
  issueActivate: [issue: Issue]
}>()

const { t, te } = useI18n()
const attrs = useAttrs()
const segments = computed(() => splitTextWithInlineReferences(props.text))
const issuesByLocalNumber = computed(
  () => new Map((props.issues ?? []).map(issue => [issue.local_number, issue])),
)
const hoveredIssue = ref<Issue | null>(null)
const issuePreviewStyle = ref<Record<string, string>>({})
let hidePreviewTimer: ReturnType<typeof setTimeout> | null = null

function resolveIssue(reference: IssueReference): Issue | null {
  return issuesByLocalNumber.value.get(reference.localNumber) ?? null
}

function activate(reference: TimeReference) {
  if (!props.interactive) return
  emit('activate', reference, resolveTimeReferenceTarget(reference, props.defaultTarget))
}

function activateMarker(reference: MarkerIndexReference) {
  if (!props.interactive) return
  emit('markerActivate', reference)
}

function activateIssue(issue: Issue) {
  if (!props.interactive) return
  emit('issueActivate', issue)
}

function clearHidePreviewTimer() {
  if (hidePreviewTimer == null) return
  clearTimeout(hidePreviewTimer)
  hidePreviewTimer = null
}

function hideIssuePreview() {
  clearHidePreviewTimer()
  hoveredIssue.value = null
}

function scheduleHideIssuePreview() {
  clearHidePreviewTimer()
  hidePreviewTimer = setTimeout(() => {
    hideIssuePreview()
  }, 120)
}

function positionIssuePreview(target: HTMLElement) {
  const width = Math.min(320, Math.max(240, window.innerWidth - 32))
  const gutter = 16
  const rect = target.getBoundingClientRect()
  const left = Math.min(
    window.innerWidth - gutter - width,
    Math.max(gutter, rect.left + (rect.width / 2) - (width / 2)),
  )
  const showAbove = rect.top > (window.innerHeight * 0.45)

  issuePreviewStyle.value = {
    width: `${width}px`,
    left: `${left}px`,
    top: showAbove ? `${Math.max(12, rect.top - 12)}px` : `${Math.min(window.innerHeight - 12, rect.bottom + 12)}px`,
    transform: showAbove ? 'translateY(-100%)' : 'none',
  }
}

function issueDescriptionPreview(issue: Issue | null): string {
  const normalized = issue?.description?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return t('issueDetail.noDescription')
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized
}

function issueMarkerSummary(issue: Issue | null): string | null {
  if (!issue?.markers?.length) return null
  return issue.markers.map((marker) => {
    const start = formatTimestampShort(marker.time_start)
    if (marker.time_end == null) return start
    return `${start} - ${formatTimestampShort(marker.time_end)}`
  }).join(', ')
}

function translateEnum(prefix: 'status' | 'severity', value: string): string {
  const key = `${prefix}.${value}`
  return te(key) ? t(key) : value
}

function showIssuePreview(issue: Issue, event: MouseEvent | FocusEvent) {
  if (!props.interactive) return
  clearHidePreviewTimer()

  hoveredIssue.value = issue
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (target) positionIssuePreview(target)
}

onBeforeUnmount(() => {
  clearHidePreviewTimer()
})
</script>

<template>
  <span v-bind="attrs" class="whitespace-pre-wrap break-words text-inherit">
    <template v-for="(segment, index) in segments" :key="`${segment.type}-${index}`">
      <span v-if="segment.type === 'text'">{{ segment.value }}</span>
      <button
        v-else-if="segment.type === 'time' && interactive"
        type="button"
        class="mx-0.5 inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-warning transition-colors hover:bg-primary hover:text-background focus:outline-none focus:ring-1 focus:ring-primary"
        @click="activate(segment.value)"
      >
        {{ segment.value.raw }}
      </button>
      <span
        v-else-if="segment.type === 'time'"
        class="mx-0.5 inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-warning"
      >
        {{ segment.value.raw }}
      </span>
      <template v-else-if="segment.type === 'issue'">
        <button
          v-if="interactive && resolveIssue(segment.value)"
          type="button"
          class="mx-0.5 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-primary transition-colors hover:bg-primary hover:text-background focus:outline-none focus:ring-1 focus:ring-primary"
          @click="activateIssue(resolveIssue(segment.value)!)"
          @mouseenter="showIssuePreview(resolveIssue(segment.value)!, $event)"
          @mouseleave="scheduleHideIssuePreview"
          @focus="showIssuePreview(resolveIssue(segment.value)!, $event)"
          @blur="scheduleHideIssuePreview"
        >
          {{ segment.value.raw }}
        </button>
        <span
          v-else-if="!resolveIssue(segment.value)"
          class="mx-0.5 inline-flex items-center rounded-full border border-border bg-border/40 px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-muted-foreground line-through"
          :title="t('timestamp.issueUnavailable')"
        >
          {{ segment.value.raw }}
        </span>
        <span
          v-else
          class="mx-0.5 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-primary"
        >
          {{ segment.value.raw }}
        </span>
      </template>
      <button
        v-else-if="interactive"
        type="button"
        class="mx-0.5 inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-info transition-colors hover:bg-primary hover:text-background focus:outline-none focus:ring-1 focus:ring-primary"
        @click="activateMarker(segment.value)"
      >
        {{ segment.value.raw }}
      </button>
      <span
        v-else
        class="mx-0.5 inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 align-baseline font-mono text-[0.95em] font-medium text-info"
      >
        {{ segment.value.raw }}
      </span>
    </template>
  </span>

  <Teleport to="body">
    <div
      v-if="interactive && hoveredIssue"
      class="fixed z-[80] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card/95 px-3 py-2.5 text-left shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur"
      :style="issuePreviewStyle"
      @mouseenter="clearHidePreviewTimer"
      @mouseleave="scheduleHideIssuePreview"
    >
      <p class="text-[11px] font-mono text-primary">{{ t('timestamp.issueReferenceLabel', { id: hoveredIssue.local_number }) }}</p>
      <p class="mt-1 text-sm font-semibold text-foreground break-words">
        {{ hoveredIssue.title || `#${hoveredIssue.local_number}` }}
      </p>
      <p class="mt-1 text-xs text-muted-foreground break-words">
        {{ issueDescriptionPreview(hoveredIssue) }}
      </p>
      <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{{ translateEnum('status', hoveredIssue.status) }}</span>
        <span>{{ translateEnum('severity', hoveredIssue.severity) }}</span>
        <span v-if="issueMarkerSummary(hoveredIssue)">{{ issueMarkerSummary(hoveredIssue) }}</span>
      </p>
    </div>
  </Teleport>
</template>
