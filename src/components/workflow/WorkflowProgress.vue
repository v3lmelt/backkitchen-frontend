<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronRight } from 'lucide-vue-next'
import type { TrackStatus } from '@/types'

export interface WorkflowProgressAction {
  label: string
  handler: () => void
}

const props = defineProps<{
  status: TrackStatus
  /** Optional actions rendered inline on the connector after the active step */
  actions?: WorkflowProgressAction[]
}>()

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

const hasInlineAction = computed(() => !!(props.actions?.length && currentIndex.value < steps.length - 1))
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
            i <= currentIndex ? 'bg-primary text-black' : 'bg-border text-muted-foreground'
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
        <!-- Active connector with inline action button (desktop only) -->
        <div
          v-if="hasInlineAction && i === currentIndex"
          class="flex-[3] hidden lg:flex items-center gap-0 min-w-4"
        >
          <div class="flex-1 h-px bg-primary"></div>
          <button
            v-for="action in actions"
            :key="action.label"
            @click="action.handler()"
            class="workflow-bridge-btn group flex items-center gap-1.5 rounded-full font-mono font-semibold text-xs px-3.5 h-7 whitespace-nowrap transition-all shrink-0 mx-1
                   bg-primary hover:bg-primary-hover text-black border-2 border-primary-hover
                   shadow-[0_0_14px_rgba(255,132,0,0.25)] hover:shadow-[0_0_22px_rgba(255,132,0,0.45)]"
          >
            {{ action.label }}
            <ChevronRight class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
          </button>
          <div class="flex-1 h-px bg-border"></div>
        </div>
        <!-- Fallback connector on smaller screens, or normal connector -->
        <div
          :class="[
            'flex-1 h-px min-w-4',
            i < currentIndex ? 'bg-primary' : 'bg-border',
            hasInlineAction && i === currentIndex ? 'lg:hidden' : ''
          ]"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.workflow-bridge-btn {
  animation: bridge-glow 3s ease-in-out infinite;
}
@keyframes bridge-glow {
  0%, 100% { box-shadow: 0 0 14px rgba(255, 132, 0, 0.2); }
  50% { box-shadow: 0 0 24px rgba(255, 132, 0, 0.4); }
}
</style>
