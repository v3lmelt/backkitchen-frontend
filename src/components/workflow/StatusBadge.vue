<script setup lang="ts">
import { computed } from 'vue'
import type { TrackStatus, IssueStatus, IssueSeverity } from '@/types'

const props = defineProps<{
  status: TrackStatus | IssueStatus | IssueSeverity
  type?: 'track' | 'issue' | 'severity'
}>()

const config = computed(() => {
  const map: Record<string, { label: string; class: string }> = {
    // Track statuses
    submitted: { label: 'Submitted', class: 'bg-info-bg text-info' },
    in_review: { label: 'In Review', class: 'bg-warning-bg text-warning' },
    revision: { label: 'Revision', class: 'bg-error-bg text-error' },
    approved: { label: 'Approved', class: 'bg-success-bg text-success' },
    // Issue statuses
    open: { label: 'Open', class: 'bg-error-bg text-error' },
    will_fix: { label: 'Will Fix', class: 'bg-warning-bg text-warning' },
    disagreed: { label: 'Disagreed', class: 'bg-info-bg text-info' },
    resolved: { label: 'Resolved', class: 'bg-success-bg text-success' },
    // Severities
    critical: { label: 'Critical', class: 'bg-error-bg text-error' },
    major: { label: 'Major', class: 'bg-warning-bg text-warning' },
    minor: { label: 'Minor', class: 'bg-info-bg text-info' },
    suggestion: { label: 'Suggestion', class: 'bg-success-bg text-success' },
  }
  return map[props.status] || { label: props.status, class: 'bg-card text-muted-foreground' }
})
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.class]">
    {{ config.label }}
  </span>
</template>
