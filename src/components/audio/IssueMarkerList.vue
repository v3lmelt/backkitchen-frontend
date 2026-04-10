<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Globe, MessageSquare } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { Issue, IssueStatus, Track } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatLocaleDate, formatTimestampShort } from '@/utils/time'
import { hashId } from '@/utils/hash'

const props = withDefaults(defineProps<{
  issues: Issue[]
  selectable?: boolean
  selectedIds?: number[]
  currentSourceVersionNumber?: number | null
  hoveredIssueId?: number | null
  track?: Track | null
  showActivity?: boolean
  enableQuickActions?: boolean
}>(), {
  selectable: false,
  selectedIds: () => [],
  currentSourceVersionNumber: null,
  hoveredIssueId: null,
  track: null,
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

function formatTime(seconds: number): string {
  return formatTimestampShort(seconds)
}

function toggleSelect(issueId: number) {
  const current = props.selectedIds ?? []
  const idx = current.indexOf(issueId)
  if (idx === -1) {
    emit('update:selectedIds', [...current, issueId])
  } else {
    emit('update:selectedIds', current.filter(id => id !== issueId))
  }
}

function authorLabel(issue: Issue): string {
  if (issue.phase === 'peer') return `#${hashId(issue.author_id)}`
  return issue.author?.display_name ?? `#${issue.author_id}`
}

function isOutdatedIssue(issue: Issue): boolean {
  if (issue.source_version_number == null || props.currentSourceVersionNumber == null) return false
  return issue.source_version_number !== props.currentSourceVersionNumber
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

function isSubmitter(): boolean {
  return !!props.track && appStore.currentUser?.id === props.track.submitter_id
}

function isReviewer(issue: Issue): boolean {
  if (!props.track) return false
  const uid = appStore.currentUser?.id
  if (!uid) return false
  switch (issue.phase) {
    case 'peer':
    case 'peer_review':
      return uid === props.track.peer_reviewer_id
    case 'producer':
    case 'producer_gate':
    case 'final_review':
      return uid === props.track.producer_id
    case 'mastering':
      return uid === props.track.mastering_engineer_id
    default:
      return false
  }
}

function availableQuickActions(issue: Issue): IssueStatus[] {
  if (!props.enableQuickActions || !props.track) return []
  if (isSubmitter() && issue.status === 'open') return ['resolved', 'disagreed']
  if (isReviewer(issue) && issue.status === 'open') return ['resolved']
  if (isReviewer(issue) && (issue.status === 'resolved' || issue.status === 'disagreed')) return ['open']
  return []
}

function quickActionLabel(status: IssueStatus): string {
  switch (status) {
    case 'resolved':
      return t('issueDetail.markFixed')
    case 'disagreed':
      return t('issueDetail.disagree')
    case 'open':
      return t('issueDetail.reopen')
  }
}

function quickActionClass(status: IssueStatus): string {
  switch (status) {
    case 'resolved':
      return 'bg-success-bg text-success hover:border-success/40'
    case 'disagreed':
      return 'bg-info-bg text-info hover:border-info/40'
    case 'open':
      return 'bg-warning-bg text-warning hover:border-warning/40'
  }
}

function triggerQuickAction(issue: Issue, status: IssueStatus, event: Event) {
  event.stopPropagation()
  emit('status-change', { issue, status })
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(issue, index) in issues"
      :key="issue.id"
      @click="emit('select', issue)"
      @mouseenter="emit('hover', issue)"
      @mouseleave="emit('leave')"
      class="card cursor-pointer transition-colors"
      :class="[
        isOutdatedIssue(issue) ? 'opacity-60 hover:border-border' : 'hover:border-primary/50',
        hoveredIssueId === issue.id ? '!border-primary/70 bg-warning-bg/40' : '',
      ]"
    >
      <div class="flex items-start gap-2">
        <input
          v-if="selectable"
          type="checkbox"
          :checked="selectedIds?.includes(issue.id)"
          @click.stop="toggleSelect(issue.id)"
          class="checkbox mt-1"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-muted-foreground flex-shrink-0">#{{ index + 1 }}</span>
            <span
              v-if="issue.source_version_number != null"
              class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground flex-shrink-0"
            >
              v{{ issue.source_version_number }}
            </span>
            <StatusBadge :status="issue.phase" type="phase" />
            <StatusBadge :status="issue.severity" type="severity" />
            <StatusBadge :status="issue.status" type="issue" />
          </div>
          <h4 class="truncate text-sm font-medium" :class="isOutdatedIssue(issue) ? 'text-muted-foreground' : 'text-foreground'">{{ issue.title }}</h4>
          <p class="mt-0.5 flex items-center gap-1.5 text-xs" :class="isOutdatedIssue(issue) ? 'text-muted-foreground/80' : 'text-muted-foreground'">
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
    <div v-if="issues.length === 0" class="text-center text-muted-foreground text-sm py-4">
      {{ t('issueMarker.noIssues') }}
    </div>
  </div>
</template>
