<script setup lang="ts">
import type { Issue } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

defineProps<{
  issues: Issue[]
}>()

const emit = defineEmits<{
  select: [issue: Issue]
}>()

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="issue in issues"
      :key="issue.id"
      @click="emit('select', issue)"
      class="card cursor-pointer hover:border-primary/50 transition-colors"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <StatusBadge :status="issue.severity" type="severity" />
            <StatusBadge :status="issue.status" type="issue" />
          </div>
          <h4 class="text-sm font-medium text-foreground truncate">{{ issue.title }}</h4>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{ formatTime(issue.time_start) }}
            <span v-if="issue.time_end"> - {{ formatTime(issue.time_end) }}</span>
          </p>
        </div>
        <span v-if="issue.comment_count" class="text-xs text-muted-foreground flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          {{ issue.comment_count }}
        </span>
      </div>
    </div>
    <div v-if="issues.length === 0" class="text-center text-muted-foreground text-sm py-4">
      No issues found
    </div>
  </div>
</template>
