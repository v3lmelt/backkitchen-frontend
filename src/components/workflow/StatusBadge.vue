<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackStatus, IssueStatus, IssueSeverity, IssuePhase } from '@/types'

const props = defineProps<{
  status: TrackStatus | IssueStatus | IssueSeverity | IssuePhase
  type?: 'track' | 'issue' | 'severity' | 'phase'
}>()

const { t } = useI18n()

const config = computed(() => {
  const phaseKeyMap: Record<string, string> = {
    mastering: 'mastering_phase',
    final_review: 'final_review_phase',
    producer: 'producer_phase',
  }
  const statusKey = props.type === 'phase'
    ? phaseKeyMap[props.status] ?? props.status
    : props.status

  const classMap: Record<string, string> = {
    submitted: 'bg-info-bg text-info',
    peer_review: 'bg-warning-bg text-warning',
    peer_revision: 'bg-error-bg text-error',
    producer_mastering_gate: 'bg-info-bg text-info',
    mastering: 'bg-warning-bg text-warning',
    mastering_revision: 'bg-error-bg text-error',
    final_review: 'bg-info-bg text-info',
    completed: 'bg-success-bg text-success',
    rejected: 'bg-error-bg text-error',
    open: 'bg-error-bg text-error',
    disagreed: 'bg-info-bg text-info',
    resolved: 'bg-success-bg text-success',
    critical: 'bg-error-bg text-error',
    major: 'bg-warning-bg text-warning',
    minor: 'bg-info-bg text-info',
    suggestion: 'bg-success-bg text-success',
    peer: 'bg-info-bg text-info',
    producer_phase: 'bg-primary/15 text-primary',
    mastering_phase: 'bg-warning-bg text-warning',
    final_review_phase: 'bg-primary/15 text-primary',
  }

  // For known statuses, use the class map; for custom step IDs, derive from step type prop
  const cls = classMap[statusKey] ?? 'bg-info-bg text-info'
  // Try i18n key first, fall back to the raw status string (formatted)
  const label = t(`status.${statusKey}`, String(props.status).replace(/_/g, ' '))
  return { label, class: cls }
})
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.class]">
    {{ config.label }}
  </span>
</template>
