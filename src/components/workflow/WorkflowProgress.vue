<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from 'lucide-vue-next'
import type { TrackStatus, WorkflowConfig, WorkflowVariant } from '@/types'
import { translateStepLabel } from '@/utils/workflow'

const props = defineProps<{
  status: TrackStatus
  /** Album workflow config — if provided, renders dynamic steps */
  workflowConfig?: WorkflowConfig | null
  /** Track workflow variant — producer_direct hides the peer review step. */
  variant?: WorkflowVariant
}>()

const { t } = useI18n()

const isProducerDirect = computed(() => props.variant === 'producer_direct')

// Legacy status → group mapping for albums without custom workflow
const legacyGroupedStatus = computed(() => {
  // In producer_direct mode, peer_revision belongs to the producer gate step
  // (the producer asked for a revision at the gate), not to a peer review step.
  if (isProducerDirect.value && props.status === 'peer_revision') {
    return 'gate'
  }
  const map: Record<string, string> = {
    submitted: 'submitted',
    peer_review: 'peer',
    peer_revision: 'peer',
    producer_mastering_gate: 'gate',
    mastering: 'mastering',
    mastering_revision: 'mastering',
    final_review: 'final',
    completed: 'completed',
    rejected: 'rejected',
  }
  return map[props.status] ?? props.status
})

const legacySteps = computed(() =>
  isProducerDirect.value
    ? (['submitted', 'gate', 'mastering', 'final', 'completed'] as const)
    : (['submitted', 'peer', 'gate', 'mastering', 'final', 'completed'] as const),
)

const legacyStepLabels = computed(() => ({
  submitted: t('workflow.steps.submitted'),
  peer: t('workflow.steps.peer'),
  gate: t('workflow.steps.gate'),
  mastering: t('workflow.steps.mastering'),
  final: t('workflow.steps.final'),
  completed: t('workflow.steps.completed'),
}))

// Dynamic workflow config mode
const dynamicSteps = computed(() => {
  if (!props.workflowConfig) return null
  // Filter out revision steps (they're sub-steps shown as part of their parent)
  const mainSteps = props.workflowConfig.steps
    .filter(s => s.type !== 'revision')
    .sort((a, b) => a.order - b.order)
  return [
    ...mainSteps.map(s => ({ id: s.id, label: translateStepLabel(s, t) })),
    { id: 'completed', label: t('workflow.steps.completed') },
  ]
})

// Map current status to the display step (revision steps map to their parent)
const dynamicCurrentId = computed(() => {
  if (!props.workflowConfig) return props.status
  // If the current status is a revision step, find its parent (return_to)
  const step = props.workflowConfig.steps.find(s => s.id === props.status)
  if (step?.type === 'revision' && step.return_to) {
    return step.return_to
  }
  return props.status
})

const steps = computed(() => {
  if (dynamicSteps.value) return dynamicSteps.value.map(s => s.id)
  return [...legacySteps.value]
})

const stepLabels = computed<Record<string, string>>(() => {
  if (dynamicSteps.value) {
    const labels: Record<string, string> = {}
    for (const s of dynamicSteps.value) labels[s.id] = s.label
    return labels
  }
  return legacyStepLabels.value
})

const currentGroupId = computed(() => {
  if (dynamicSteps.value) return dynamicCurrentId.value
  return legacyGroupedStatus.value
})

const currentIndex = computed(() => steps.value.indexOf(currentGroupId.value))

</script>

<template>
  <div v-if="status === 'rejected'" class="text-sm text-error font-medium">
    {{ t('workflow.rejected') }}
  </div>
  <div v-else class="flex items-center gap-1">
    <template v-for="(step, i) in steps" :key="step">
      <!-- Step node -->
      <div class="flex items-center gap-1 shrink-0">
        <div
          :class="[
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
            i <= currentIndex ? 'bg-button-primary text-button-primary-foreground' : 'bg-border text-muted-foreground'
          ]"
        >
          <Check v-if="i < currentIndex" class="w-3 h-3" :stroke-width="3" />
          <span v-else>{{ i + 1 }}</span>
        </div>
        <span
          :class="[
            'text-xs hidden sm:inline whitespace-nowrap',
            i === currentIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
          ]"
        >
          {{ stepLabels[step] }}
        </span>
      </div>

      <!-- Connector between steps -->
      <template v-if="i < steps.length - 1">
        <div
          :class="[
            'flex-1 h-px min-w-4',
            i < currentIndex ? 'bg-primary' : 'bg-border',
          ]"
        />
      </template>
    </template>
  </div>
</template>

