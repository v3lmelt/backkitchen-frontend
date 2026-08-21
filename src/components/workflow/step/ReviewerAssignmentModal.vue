<script setup lang="ts">
import type { ReviewerCandidate } from '@/types'
import { useI18n } from 'vue-i18n'

defineProps<{
  /** Whether the step already has assignments (switches title to reassign). */
  hasAssignments: boolean
  selectionSummary: string
  loading: boolean
  members: ReviewerCandidate[]
  selectedUserIds: number[]
  saving: boolean
  confirmDisabled: boolean
  /** Canonical disable rule from useReviewerAssignment (limit reached). */
  isMemberDisabled: (userId: number) => boolean
}>()

const emit = defineEmits<{
  close: []
  toggleMember: [userId: number]
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="absolute inset-0 bg-background/80" />
      <div class="relative bg-card border border-border rounded-none p-5 w-full max-w-md space-y-4 shadow-[var(--popover-shadow)]">
        <div class="space-y-1">
          <h4 class="text-sm font-mono font-semibold text-foreground">
            {{ hasAssignments ? t('workflowStep.reassignReviewerTitle') : t('workflowStep.assignReviewerTitle') }}
          </h4>
          <p class="text-xs text-muted-foreground">
            {{ t('workflowStep.reviewerAssignmentManual') }}
          </p>
          <p class="text-xs font-mono text-muted-foreground">
            {{ selectionSummary }}
          </p>
        </div>

        <div v-if="loading" class="border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="members.length === 0" class="border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          {{ t('workflowStep.reviewerAssignmentNoMembers') }}
        </div>
        <div v-else class="space-y-1 max-h-56 overflow-y-auto">
          <label
            v-for="member in members"
            :key="member.user_id"
            class="flex items-center gap-2 border border-border bg-background px-3 py-2 text-sm transition-colors"
            :class="[
              selectedUserIds.includes(member.user_id) ? 'border-primary' : '',
              isMemberDisabled(member.user_id) || saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/60',
            ]"
          >
            <input
              type="checkbox"
              class="checkbox"
              :checked="selectedUserIds.includes(member.user_id)"
              :disabled="isMemberDisabled(member.user_id) || saving"
              @change="emit('toggleMember', member.user_id)"
            />
            <span class="min-w-0 flex-1 truncate text-foreground">{{ member.user.display_name }}</span>
          </label>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            class="flex-1 btn-primary h-9 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            {{ saving ? t('workflowStep.reviewerAssignmentWorking') : t('common.confirm') }}
          </button>
          <button
            type="button"
            class="flex-1 btn-secondary h-9 text-sm"
            :disabled="saving"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
