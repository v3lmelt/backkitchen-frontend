<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Issue, IssueStatus, User } from '@/types'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'

const props = defineProps<{
  selectedCount: number
  statuses: IssueStatus[]
  note: string
  loading?: boolean
  issues?: Issue[] | null
  mentionUsers?: User[] | null
}>()

const emit = defineEmits<{
  'update:note': [value: string]
  apply: [status: IssueStatus]
  clear: []
}>()

const { t } = useI18n()
const noteCursorPos = ref(0)
const noteRef = ref<HTMLTextAreaElement | null>(null)

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

function updateNote(value: string) {
  emit('update:note', value)
}

async function insertTextAtMention(insertion: string, mention: { start: number; end: number }) {
  const next = `${props.note.slice(0, mention.start)}${insertion}${props.note.slice(mention.end)}`
  updateNote(next)
  const nextCursor = mention.start + insertion.length
  noteCursorPos.value = nextCursor
  await nextTick()
  noteRef.value?.focus()
  noteRef.value?.setSelectionRange(nextCursor, nextCursor)
}

function handleIssueMentionSelect(issue: Issue, mention: { start: number; end: number }) {
  void insertTextAtMention(`@issue:${issue.local_number} `, mention)
}

function handleUserMentionSelect(user: User, mention: { start: number; end: number }) {
  void insertTextAtMention(`@user:${user.id} `, mention)
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
    <div class="relative">
      <textarea
        ref="noteRef"
        :value="note"
        rows="3"
        class="textarea-field w-full text-sm"
        :placeholder="t('issue.batchStatusNote')"
        @input="(e) => { noteCursorPos = (e.target as HTMLTextAreaElement).selectionStart; updateNote((e.target as HTMLTextAreaElement).value) }"
        @click="(e) => noteCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
        @keyup="(e) => noteCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
      />
      <TimestampSyntaxPopover
        :text="note"
        :cursor-pos="noteCursorPos"
        default-target="track"
        :issues="issues"
        :mention-users="mentionUsers"
        @select="handleIssueMentionSelect"
        @select-user="handleUserMentionSelect"
      />
    </div>
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
