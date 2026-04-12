<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackStatus, IssueStatus, IssueSeverity, IssuePhase, WorkflowVariant } from '@/types'

const props = defineProps<{
  status: TrackStatus | IssueStatus | IssueSeverity | IssuePhase
  type?: 'track' | 'issue' | 'severity' | 'phase'
  /** Track workflow variant — used for variant-aware labelling of shared states (e.g. peer_revision). */
  variant?: WorkflowVariant
  /** Explicit display label for custom workflow steps. */
  label?: string | null
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
    pending_discussion: 'bg-warning-bg text-warning',
    internal_resolved: 'bg-info-bg text-info',
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
  const cls = classMap[statusKey] ?? 'bg-border text-foreground'
  // Producer-direct variant reuses peer_revision/peer_review states, but the
  // label should reflect that the producer (not a peer reviewer) is driving it.
  const variantOverrideKey = props.type === 'track' && props.variant === 'producer_direct'
    ? ({ peer_revision: 'status.producer_direct_revision' } as Record<string, string>)[String(props.status)]
    : undefined
  const label = variantOverrideKey
    ? t(variantOverrideKey)
    : props.label?.trim()
      ? props.label
    : t(`status.${statusKey}`, String(props.status).replace(/_/g, ' '))
  return { label, class: cls }
})
</script>

<template>
  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.class]">
    {{ config.label }}
  </span>
</template>
