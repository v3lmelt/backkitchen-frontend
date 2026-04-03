<script setup lang="ts">
import { computed } from 'vue'
import type { TrackStatus, IssueStatus, IssueSeverity, IssuePhase } from '@/types'

const props = defineProps<{
  status: TrackStatus | IssueStatus | IssueSeverity | IssuePhase
  type?: 'track' | 'issue' | 'severity' | 'phase'
}>()

const config = computed(() => {
  const map: Record<string, { label: string; class: string }> = {
    submitted: { label: 'Submitted', class: 'bg-info-bg text-info' },
    peer_review: { label: 'Peer Review', class: 'bg-warning-bg text-warning' },
    peer_revision: { label: 'Peer Revision', class: 'bg-error-bg text-error' },
    producer_mastering_gate: { label: 'Producer Gate', class: 'bg-info-bg text-info' },
    mastering: { label: 'Mastering', class: 'bg-warning-bg text-warning' },
    mastering_revision: { label: 'Master Revision', class: 'bg-error-bg text-error' },
    final_review: { label: 'Final Review', class: 'bg-info-bg text-info' },
    completed: { label: 'Completed', class: 'bg-success-bg text-success' },
    rejected: { label: 'Rejected', class: 'bg-error-bg text-error' },
    open: { label: 'Open', class: 'bg-error-bg text-error' },
    will_fix: { label: 'Will Fix', class: 'bg-warning-bg text-warning' },
    disagreed: { label: 'Disagreed', class: 'bg-info-bg text-info' },
    resolved: { label: 'Resolved', class: 'bg-success-bg text-success' },
    critical: { label: 'Critical', class: 'bg-error-bg text-error' },
    major: { label: 'Major', class: 'bg-warning-bg text-warning' },
    minor: { label: 'Minor', class: 'bg-info-bg text-info' },
    suggestion: { label: 'Suggestion', class: 'bg-success-bg text-success' },
    peer: { label: 'Peer', class: 'bg-info-bg text-info' },
    mastering_phase: { label: 'Mastering', class: 'bg-warning-bg text-warning' },
    final_review_phase: { label: 'Final Review', class: 'bg-primary/15 text-primary' },
  }

  const status = props.type === 'phase'
    ? props.status === 'mastering'
      ? 'mastering_phase'
      : props.status === 'final_review'
        ? 'final_review_phase'
        : 'peer'
    : props.status
  return map[status] || { label: String(props.status), class: 'bg-card text-muted-foreground' }
})
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.class]">
    {{ config.label }}
  </span>
</template>
