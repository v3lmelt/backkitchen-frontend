<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Globe, MessageSquare } from 'lucide-vue-next'
import type { Issue } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatTimestampShort } from '@/utils/time'
import { hashId } from '@/utils/hash'

const props = withDefaults(defineProps<{
  issues: Issue[]
  selectable?: boolean
  selectedIds?: number[]
  currentSourceVersionNumber?: number | null
}>(), {
  selectable: false,
  selectedIds: () => [],
  currentSourceVersionNumber: null,
})

const emit = defineEmits<{
  select: [issue: Issue]
  'update:selectedIds': [ids: number[]]
}>()

const { t } = useI18n()

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
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(issue, index) in issues"
      :key="issue.id"
      @click="emit('select', issue)"
      class="card cursor-pointer transition-colors"
      :class="isOutdatedIssue(issue) ? 'opacity-60 hover:border-border' : 'hover:border-primary/50'"
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
