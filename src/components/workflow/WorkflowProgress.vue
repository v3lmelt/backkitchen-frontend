<script setup lang="ts">
import { computed } from 'vue'
import type { TrackStatus } from '@/types'

const props = defineProps<{ status: TrackStatus }>()

const steps = ['submitted', 'in_review', 'revision', 'approved'] as const
const labels = { submitted: 'Submitted', in_review: 'In Review', revision: 'Revision', approved: 'Approved' }

const currentIndex = computed(() => steps.indexOf(props.status))
</script>

<template>
  <div class="flex items-center gap-1">
    <template v-for="(step, i) in steps" :key="step">
      <div class="flex items-center gap-1">
        <div
          :class="[
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
            i <= currentIndex
              ? 'bg-primary text-black'
              : 'bg-border text-muted-foreground'
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
          {{ labels[step] }}
        </span>
      </div>
      <div
        v-if="i < steps.length - 1"
        :class="['flex-1 h-px min-w-4', i < currentIndex ? 'bg-primary' : 'bg-border']"
      />
    </template>
  </div>
</template>
