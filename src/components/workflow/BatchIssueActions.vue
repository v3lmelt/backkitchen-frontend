<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Issue, IssueStatus, User } from '@/types'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import { insertMentionAtCursor, issueMentionToken, userMentionToken } from '@/utils/mentions'
import { issueStatusActionLabel, issueStatusQuickActionClass } from '@/utils/issueStatus'

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
  return issueStatusActionLabel(t, status, { resolvedKey: 'issueDetail.markFixed' })
}

function actionClass(status: IssueStatus): string {
  return issueStatusQuickActionClass(status)
}

function updateNote(value: string) {
  emit('update:note', value)
}

async function insertTextAtMention(insertion: string, mention: { start: number; end: number }) {
  const result = insertMentionAtCursor(props.note, mention, insertion)
  updateNote(result.text)
  noteCursorPos.value = result.cursorPos
  await nextTick()
  noteRef.value?.focus()
  noteRef.value?.setSelectionRange(result.cursorPos, result.cursorPos)
}

function handleIssueMentionSelect(issue: Issue, mention: { start: number; end: number }) {
  void insertTextAtMention(issueMentionToken(issue), mention)
}

function handleUserMentionSelect(user: User, mention: { start: number; end: number }) {
  void insertTextAtMention(userMentionToken(user), mention)
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
