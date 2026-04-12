<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { IssueStatus } from '@/types'

const props = defineProps<{
  selectedCount: number
  statuses: IssueStatus[]
  note: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:note': [value: string]
  apply: [status: IssueStatus]
  clear: []
}>()

const { t } = useI18n()

function actionLabel(status: IssueStatus): string {
  switch (status) {
    case 'resolved':
      return t('issueDetail.markFixed')
    case 'internal_resolved':
      return t('issueDetail.markInternalResolved')
    case 'disagreed':
      return t('issueDetail.disagree')
    case 'open':
      return t('issueDetail.reopen')
    case 'pending_discussion':
      return t('issueDetail.markPendingDiscussion')
  }
}

function actionClass(status: IssueStatus): string {
  switch (status) {
    case 'resolved':
      return 'bg-success-bg text-success hover:border-success/40'
    case 'internal_resolved':
      return 'bg-info-bg text-info hover:border-info/40'
    case 'disagreed':
      return 'bg-info-bg text-info hover:border-info/40'
    case 'open':
      return 'bg-warning-bg text-warning hover:border-warning/40'
    case 'pending_discussion':
      return 'bg-warning-bg text-warning hover:border-warning/40'
  }
}
</script>

<template>
  <div v-if="selectedCount > 0" class="card space-y-3 border-primary/30 bg-primary/5">
    <div class="flex items-center justify-between gap-3">
      <div class="text-sm font-mono font-semibold text-foreground">
        {{ selectedCount }} {{ t('issue.selected') }}
      </div>
      <button class="text-xs text-muted-foreground transition-colors hover:text-foreground" @click="emit('clear')">
        {{ t('compare.clear') }}
      </button>
    </div>
    <textarea
      :value="note"
      rows="3"
      class="textarea-field w-full text-sm"
      :placeholder="t('issue.batchStatusNote')"
      @input="emit('update:note', ($event.target as HTMLTextAreaElement).value)"
    />
    <div class="flex flex-wrap gap-2">
      <button
        v-for="status in statuses"
        :key="status"
        type="button"
        class="rounded-full border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        :class="actionClass(status)"
        :disabled="loading"
        @click="emit('apply', status)"
      >
        {{ actionLabel(status) }}
      </button>
    </div>
    <p v-if="statuses.length === 0" class="text-xs text-muted-foreground">
      {{ t('issue.noBatchActions') }}
    </p>
  </div>
</template>
