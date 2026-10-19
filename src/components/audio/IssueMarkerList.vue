<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Globe, MessageSquare } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { Issue, IssueStatus, StageAssignment, Track } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatLocaleDate, formatTimestampShort } from '@/utils/time'
import { anonTokenFor } from '@/utils/hash'
import { availableBatchActionsForIssue, canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'
import { issueBelongsToCurrentVersion, issueOriginLabel } from '@/utils/issueAudio'
import {
  availableIssueStatusActions,
  issueStatusActionLabel,
  issueStatusQuickActionClass,
  isIssueResolvedLike,
  isIssueUnresolved,
} from '@/utils/issueStatus'

const props = withDefaults(defineProps<{
  issues: Issue[]
  selectable?: boolean
  selectedIds?: number[]
  groupByStatus?: boolean
  focusedIssueId?: number | null
  hoveredIssueId?: number | null
  track?: Track | null
  assignments?: StageAssignment[]
  showActivity?: boolean
  enableQuickActions?: boolean
}>(), {
  selectable: false,
  selectedIds: () => [],
  groupByStatus: false,
  focusedIssueId: null,
  hoveredIssueId: null,
  track: null,
  assignments: () => [],
  showActivity: false,
  enableQuickActions: false,
})

const emit = defineEmits<{
  select: [issue: Issue]
  'update:selectedIds': [ids: number[]]
  hover: [issue: Issue]
  leave: []
  'status-change': [payload: { issue: Issue; status: IssueStatus }]
}>()

const { t, locale } = useI18n()
const appStore = useAppStore()
const listRef = ref<HTMLElement | null>(null)
const closedExpanded = ref(false)
const severityRank: Record<Issue['severity'], number> = { critical: 0, major: 1, minor: 2, suggestion: 3 }
const groups = computed(() => {
  if (!props.groupByStatus) return [{ closed: false, issues: props.issues }]
  const unresolved = props.issues.filter(issue => isIssueUnresolved(issue.status))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]
      || a.created_at.localeCompare(b.created_at) || a.id - b.id)
  return [
    { closed: false, issues: unresolved },
    { closed: true, issues: props.issues.filter(issue => isIssueResolvedLike(issue.status)) },
  ]
})
const visibleSelectableIds = computed(() => new Set(groups.value
  .filter(group => !group.closed || closedExpanded.value)
  .flatMap(group => group.issues)
  .filter(issue => props.selectable && availableBatchActionsForIssue(
    issue, canSubmitIssueStatus(issue), canChangeIssueStatus(issue),
  ).length > 0)
  .map(issue => issue.id)))

watch([visibleSelectableIds, () => props.selectedIds], () => {
  const ids = props.selectedIds.filter(id => visibleSelectableIds.value.has(id))
  if (ids.length !== props.selectedIds.length) emit('update:selectedIds', ids)
}, { immediate: true })

watch(() => props.focusedIssueId, async (id) => {
  if (id == null) return
  if (props.issues.some(issue => issue.id === id && isIssueResolvedLike(issue.status))) closedExpanded.value = true
  await nextTick()
  const row = listRef.value?.querySelector<HTMLElement>(`[data-issue-id="${id}"]`)
  row?.focus({ preventScroll: true })
  row?.scrollIntoView?.({ block: 'nearest' })
})

function formatTime(seconds: number): string {
  return formatTimestampShort(seconds)
}

function toggleSelect(issueId: number) {
  if (!visibleSelectableIds.value.has(issueId)) return
  const current = props.selectedIds ?? []
  const idx = current.indexOf(issueId)
  if (idx === -1) {
    emit('update:selectedIds', [...current, issueId])
  } else {
    emit('update:selectedIds', current.filter(id => id !== issueId))
  }
}

function authorLabel(issue: Issue): string {
  if (issue.phase === 'peer') return `#${anonTokenFor(issue.author, issue.author_id)}`
  return issue.author?.display_name ?? `#${issue.author_id}`
}


function isGeneralIssue(issue: Issue): boolean {
  return issue.markers.length === 0
}

function markerSummary(issue: Issue): string {
  if (issue.markers.length === 0) return ''
  return issue.markers.map(m => {
    if (m.marker_type === 'point') return formatTime(m.time_start)
    return `${formatTime(m.time_start)} - ${formatTime(m.time_end!)}`
  }).join(', ')
}

function formatUpdatedAt(value: string): string {
  return formatLocaleDate(value, locale.value)
}

function canSubmitIssueStatus(issue: Issue): boolean {
  return canUserSubmitIssueStatus(appStore.currentUser?.id, props.track, issue)
}

function canChangeIssueStatus(issue: Issue): boolean {
  return canUserChangeIssueStatus(appStore.currentUser?.id, props.track, issue, props.assignments)
}

function availableQuickActions(issue: Issue): IssueStatus[] {
  if (!props.enableQuickActions || !props.track) return []
  return availableIssueStatusActions(issue.status, {
    canSubmit: canSubmitIssueStatus(issue),
    canChange: canChangeIssueStatus(issue),
  })
}

function quickActionLabel(status: IssueStatus): string {
  return issueStatusActionLabel(t, status, { resolvedKey: 'issueDetail.markFixed' })
}

function quickActionClass(status: IssueStatus): string {
  return issueStatusQuickActionClass(status)
}

function triggerQuickAction(issue: Issue, status: IssueStatus, event: Event) {
  event.stopPropagation()
  emit('status-change', { issue, status })
}
</script>

<template>
  <div ref="listRef" class="space-y-2">
    <template v-for="group in groups" :key="String(group.closed)">
      <button
        v-if="groupByStatus && group.closed && group.issues.length"
        type="button"
        class="flex w-full items-center justify-between border border-border bg-background px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground"
        :aria-expanded="closedExpanded"
        @click="closedExpanded = !closedExpanded"
      >
        {{ t('issueHistory.closed', { count: group.issues.length }) }}
        <ChevronDown class="h-4 w-4 transition-transform" :class="{ 'rotate-180': closedExpanded }" :stroke-width="2" />
      </button>
      <p v-else-if="groupByStatus && !group.closed" class="text-xs font-mono font-semibold text-foreground">
        {{ t('issueHistory.unresolved', { count: group.issues.length }) }}
      </p>
      <template v-if="!group.closed || closedExpanded">
    <div
      v-for="issue in group.issues"
      :key="issue.id"
      :data-issue-id="issue.id"
      :tabindex="focusedIssueId === issue.id ? -1 : undefined"
      @keydown.enter.self="emit('select', issue)"
      @click="emit('select', issue)"
      @mouseenter="emit('hover', issue)"
      @mouseleave="emit('leave')"
      class="card cursor-pointer transition-colors"
      :class="[
        'hover:border-primary/50',
        track && !issueBelongsToCurrentVersion(issue, track) ? 'opacity-60' : '',
        group.closed ? 'text-muted-foreground' : '',
        hoveredIssueId === issue.id || focusedIssueId === issue.id ? '!border-primary/70 bg-warning-bg/40' : '',
      ]"
    >
      <div class="flex items-start gap-2">
        <input
          v-if="visibleSelectableIds.has(issue.id)"
          type="checkbox"
          :checked="selectedIds?.includes(issue.id)"
          @click.stop="toggleSelect(issue.id)"
          class="checkbox mt-1"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="text-xs font-mono text-muted-foreground flex-shrink-0">#{{ issue.local_number }}</span>
            <span class="inline-flex border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-foreground flex-shrink-0">
              {{ issueOriginLabel(issue, t, track) }}
            </span>
            <StatusBadge :status="issue.phase" type="phase" />
            <StatusBadge :status="issue.severity" type="severity" />
            <StatusBadge :status="issue.status" type="issue" />
          </div>
          <h4 class="truncate text-sm font-medium text-foreground">{{ issue.title }}</h4>
          <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span v-if="isGeneralIssue(issue)" class="inline-flex items-center gap-1"><Globe class="w-3 h-3" :stroke-width="2" />{{ t('issue.generalIssue') }}</span>
            <span v-else>{{ markerSummary(issue) }}</span>
            <span class="text-border">·</span>
            <span :class="issue.phase === 'peer' ? 'font-mono' : ''">{{ authorLabel(issue) }}</span>
          </p>
          <div v-if="showActivity || availableQuickActions(issue).length" class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span v-if="showActivity" class="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              {{ t('issueDetail.commentsHeading', { count: issue.comment_count ?? 0 }) }}
            </span>
            <span v-if="showActivity" class="text-muted-foreground">
              {{ t('issueMarker.updatedAt', { date: formatUpdatedAt(issue.updated_at) }) }}
            </span>
            <button
              v-for="status in availableQuickActions(issue)"
              :key="`${issue.id}-${status}`"
              type="button"
              class="rounded-full border px-2.5 py-1 transition-colors"
              :class="quickActionClass(status)"
              @click="triggerQuickAction(issue, status, $event)"
            >
              {{ quickActionLabel(status) }}
            </button>
          </div>
        </div>
        <span v-if="issue.comment_count" class="text-xs text-muted-foreground flex items-center gap-1">
          <MessageSquare class="w-3 h-3" :stroke-width="2" />
          {{ issue.comment_count }}
        </span>
      </div>
    </div>
      </template>
    </template>
    <div v-if="issues.length === 0" class="text-center text-muted-foreground text-sm py-4">
      {{ t('issueMarker.noIssues') }}
    </div>
  </div>
</template>
