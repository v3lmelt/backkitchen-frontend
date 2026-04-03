<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackStatus } from '@/types'

const props = defineProps<{ status: TrackStatus }>()

const { t } = useI18n()

const groupedStatus = computed(() => {
  const map: Record<TrackStatus, string> = {
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
  return map[props.status]
})

const steps = ['submitted', 'peer', 'gate', 'mastering', 'final', 'completed'] as const

const stepLabels = computed(() => ({
  submitted: t('workflow.steps.submitted'),
  peer: t('workflow.steps.peer'),
  gate: t('workflow.steps.gate'),
  mastering: t('workflow.steps.mastering'),
  final: t('workflow.steps.final'),
  completed: t('workflow.steps.completed'),
}))

const currentIndex = computed(() => steps.indexOf(groupedStatus.value as (typeof steps)[number]))
</script>

<template>
  <div v-if="status === 'rejected'" class="text-sm text-error font-medium">
    {{ t('workflow.rejected') }}
  </div>
  <div v-else class="flex items-center gap-1">
    <template v-for="(step, i) in steps" :key="step">
      <div class="flex items-center gap-1">
        <div
          :class="[
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
            i <= currentIndex ? 'bg-primary text-black' : 'bg-border text-muted-foreground'
          ]"
        >
          <svg v-if="i < currentIndex" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <span
          :class="[
            'text-xs hidden sm:inline',
            i === currentIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
          ]"
        >
          {{ stepLabels[step] }}
        </span>
      </div>
      <div
        v-if="i < steps.length - 1"
        :class="['flex-1 h-px min-w-4', i < currentIndex ? 'bg-primary' : 'bg-border']"
      />
    </template>
  </div>
</template>
