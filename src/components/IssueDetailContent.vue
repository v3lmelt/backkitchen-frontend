<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import { issueApi, commentApi, r2Api, uploadToR2, resolveAssetUrl } from '@/api'
import { useToast } from '@/composables/useToast'
import { useAppStore } from '@/stores/app'
import type { Comment, Issue, IssueStatus, MentionCandidates, StageAssignment, Track, User } from '@/types'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import CommentInput from '@/components/common/CommentInput.vue'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatDuration, formatLocaleDate } from '@/utils/time'
import { insertMentionAtCursor, issueMentionToken, userMentionToken } from '@/utils/mentions'
import { resolveAttachmentReferenceIndex, type MarkerIndexReference, type TimeReference, type TimestampTarget } from '@/utils/timestamps'
import { ArrowDownUp, Music, Pencil, Trash2 } from 'lucide-vue-next'
import { canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'
import { isTrackComposer } from '@/utils/trackComposers'
import {
  availableIssueStatusActions,
  isInternalIssueStatus,
  issueStatusActionHint,
  issueStatusActionLabel,
  issueStatusPanelActionClass,
} from '@/utils/issueStatus'

/**
 * Shared issue-detail body used by both the drawer (IssueDetailPanel,
 * `variant="panel"`) and the full-page route (IssueDetailView,
 * `variant="page"`). Context-specific chrome (drawer header/close, page
 * header/waveform/sidebar) stays in the wrappers; this component owns the
 * description, status actions, comment thread and comment input.
 */
const props = withDefaults(defineProps<{
  issue: Issue
  variant?: 'panel' | 'page'
  track?: Track | null
  assignments?: StageAssignment[]
  issues?: Issue[] | null
  mentionCandidates?: MentionCandidates | null
}>(), {
  variant: 'panel',
  track: null,
  assignments: () => [],
  issues: null,
  mentionCandidates: null,
})

const emit = defineEmits<{
  updated: [issue: Issue]
  /** A timestamp reference targeting the track audio was activated. */
  'track-reference': [time: number]
  'open-issue': [issueId: number]
  'marker-activate': [reference: MarkerIndexReference]
  'show-comment-history': [commentId: number]
}>()

const { t, locale } = useI18n()
const appStore = useAppStore()
const { success: toastSuccess, error: toastError } = useToast()

const isPanel = computed(() => props.variant === 'panel')

const pendingStatus = ref<IssueStatus | null>(null)
const commentInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const statusNoteInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const pendingDeleteComment = ref<Comment | null>(null)
const issueAudioRefs = new Map<number, HTMLAudioElement>()
const commentAudioRefs = new Map<string, HTMLAudioElement>()

const canSubmitIssueStatus = computed(() =>
  canUserSubmitIssueStatus(appStore.currentUser?.id, props.track, props.issue),
)

const canChangeIssueStatus = computed(() =>
  canUserChangeIssueStatus(appStore.currentUser?.id, props.track, props.issue, props.assignments),
)

const statusActions = computed<IssueStatus[]>(() =>
  availableIssueStatusActions(props.issue.status, {
    canSubmit: canSubmitIssueStatus.value,
    canChange: canChangeIssueStatus.value,
    submitExclusive: true,
  }),
)

function statusActionLabel(status: IssueStatus): string {
  return issueStatusActionLabel(t, status, isPanel.value
    ? { currentStatus: props.issue.status }
    : { currentStatus: props.issue.status, resolvedKey: 'issueDetail.markFixed' })
}

function statusActionHint(status: IssueStatus): string {
  return issueStatusActionHint(t, status, props.issue.status)
}

function statusTransitionLabel(oldStatus: string | null | undefined, newStatus: string | null | undefined): string | null {
  if (!oldStatus || !newStatus) return null
  const oldLabel = t(`status.${oldStatus}`, oldStatus)
  const newLabel = t(`status.${newStatus}`, newStatus)
  return `${oldLabel} → ${newLabel}`
}

const shouldHideInternalComments = computed(() =>
  Boolean(props.track && isTrackComposer(props.track, appStore.currentUser?.id)),
)

const commentSortOrder = ref<'desc' | 'asc'>('desc')

const visibleComments = computed(() => {
  const filtered = (props.issue.comments ?? []).filter(
    comment => !(shouldHideInternalComments.value && comment.visibility === 'internal'),
  )
  if (commentSortOrder.value === 'desc') {
    return [...filtered].reverse()
  }
  return filtered
})

function statusActionClass(status: IssueStatus): string {
  return issueStatusPanelActionClass(status, pendingStatus.value === status)
}
const statusNote = ref('')
const statusNoteCursorPos = ref(0)
const statusNoteRef = ref<HTMLTextAreaElement | null>(null)

const publicMentionUsers = computed(() => props.mentionCandidates?.issue_public ?? [])
const internalMentionUsers = computed(() => props.mentionCandidates?.issue_internal ?? [])

function mentionUsersForVisibility(visibility: string | null | undefined): User[] {
  return visibility === 'internal' ? internalMentionUsers.value : publicMentionUsers.value
}

const activeIssueMentionUsers = computed(() => (
  isInternalIssueStatus(props.issue.status) ? internalMentionUsers.value : publicMentionUsers.value
))

const statusNoteMentionUsers = computed(() => (
  isInternalIssueStatus(props.issue.status) || isInternalIssueStatus(pendingStatus.value)
    ? internalMentionUsers.value
    : publicMentionUsers.value
))

async function handleStatusNoteMentionSelect(insertion: string, mention: { start: number; end: number }) {
  const result = insertMentionAtCursor(statusNote.value, mention, insertion)
  statusNote.value = result.text
  statusNoteCursorPos.value = result.cursorPos
  await nextTick()
  statusNoteRef.value?.focus()
  statusNoteRef.value?.setSelectionRange(result.cursorPos, result.cursorPos)
}

async function handleStatusNoteIssueMentionSelect(issue: Issue, mention: { start: number; end: number }) {
  await handleStatusNoteMentionSelect(issueMentionToken(issue), mention)
}

async function handleStatusNoteUserMentionSelect(user: User, mention: { start: number; end: number }) {
  await handleStatusNoteMentionSelect(userMentionToken(user), mention)
}

function formatDate(d: string) {
  return formatLocaleDate(d, locale.value)
}

function setCommentAudioRef(commentId: number, index: number, element: unknown) {
  const key = `${commentId}:${index}`
  if (!(element instanceof HTMLAudioElement)) {
    commentAudioRefs.delete(key)
    return
  }

  commentAudioRefs.set(key, element)
}

function setIssueAudioRef(index: number, element: unknown) {
  if (!(element instanceof HTMLAudioElement)) {
    issueAudioRefs.delete(index)
    return
  }

  issueAudioRefs.set(index, element)
}

async function playAudioAt(audio: HTMLAudioElement | undefined, seconds: number) {
  if (!audio) return
  audio.currentTime = seconds
  await audio.play().catch(() => undefined)
}

async function handleIssueDescriptionReference(reference: TimeReference, target: TimestampTarget) {
  if (target === 'attachment') {
    const attachmentIndex = resolveAttachmentReferenceIndex(reference, 'attachment', props.issue.audios?.length ?? 0)
    if (attachmentIndex == null) return
    await playAudioAt(issueAudioRefs.get(attachmentIndex), reference.startSeconds)
    return
  }

  emit('track-reference', reference.startSeconds)
}

async function handleCommentReference(comment: Comment, reference: TimeReference, target: TimestampTarget) {
  if (target === 'attachment') {
    const attachmentIndex = resolveAttachmentReferenceIndex(reference, 'attachment', comment.audios?.length ?? 0)
    if (attachmentIndex == null) return
    await playAudioAt(commentAudioRefs.get(`${comment.id}:${attachmentIndex}`), reference.startSeconds)
    return
  }

  emit('track-reference', reference.startSeconds)
}

function handleIssueReference(issue: Issue) {
  if (issue.id === props.issue.id) return
  emit('open-issue', issue.id)
}

function handleMarkerReference(reference: MarkerIndexReference) {
  emit('marker-activate', reference)
}

function selectStatus(status: IssueStatus) {
  if (isPanel.value) {
    pendingStatus.value = pendingStatus.value === status ? null : status
    statusNote.value = ''
    return
  }
  pendingStatus.value = status
  statusNoteInputRef.value?.reset()
}

/** Panel variant: plain-text note with optimistic status update. */
async function confirmStatusChange() {
  if (!pendingStatus.value) return
  const previousStatus = props.issue.status
  const targetStatus = pendingStatus.value
  const note = statusNote.value

  // Optimistic update
  emit('updated', { ...props.issue, status: targetStatus })
  pendingStatus.value = null
  statusNote.value = ''

  try {
    const updated = await issueApi.update(props.issue.id, {
      status: targetStatus,
      status_note: note || undefined,
    })
    emit('updated', updated)
    toastSuccess(t('issueDetail.statusUpdated'))
  } catch (err: any) {
    // Revert on failure
    emit('updated', { ...props.issue, status: previousStatus })
    toastError(err?.message || t('issueDetail.statusUpdateFailed'))
  }
}

/** Page variant: CommentInput-based note with attachments + upload progress. */
const submittingStatusNote = ref(false)
const statusNoteUploadProgress = ref(0)

async function handleStatusNoteSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  if (!pendingStatus.value) return
  submittingStatusNote.value = true
  statusNoteUploadProgress.value = 0
  try {
    const updated = await issueApi.update(props.issue.id, {
      status: pendingStatus.value,
      status_note: payload.content || undefined,
      images: payload.images.length ? payload.images : undefined,
      audios: payload.audios.length ? payload.audios : undefined,
    }, (p) => { statusNoteUploadProgress.value = p })
    emit('updated', updated)
    pendingStatus.value = null
    statusNoteInputRef.value?.reset()
    toastSuccess(t('issueDetail.statusUpdated'))
  } catch (err: any) {
    toastError(err?.message || t('issueDetail.statusUpdateFailed'))
  } finally {
    submittingStatusNote.value = false
  }
}

function cancelStatusChange() {
  pendingStatus.value = null
  statusNoteInputRef.value?.reset()
}

const submittingComment = ref(false)
const commentUploadProgress = ref(0)

async function handleCommentSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  if (!appStore.currentUser) return
  if (submittingComment.value) return
  submittingComment.value = true
  commentUploadProgress.value = 0
  try {
    let comment: Comment

    if (appStore.r2Enabled && payload.audios.length > 0) {
      const presignedResp = await r2Api.requestCommentAudioUpload(
        props.issue.id,
        payload.audios.map(f => ({
          filename: f.name,
          content_type: f.type || 'application/octet-stream',
          file_size: f.size,
        })),
      )
      const totalSize = payload.audios.reduce((s, f) => s + f.size, 0)
      let uploadedBytes = 0
      for (let i = 0; i < presignedResp.uploads.length; i++) {
        const file = payload.audios[i]
        const prevBytes = uploadedBytes
        await uploadToR2(presignedResp.uploads[i].upload_url, file, file.type || 'application/octet-stream', (p) => {
          const currentBytes = prevBytes + (file.size * p / 100)
          commentUploadProgress.value = Math.round((currentBytes / totalSize) * 100)
        })
        uploadedBytes += file.size
      }
      comment = await issueApi.addComment(props.issue.id, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audioObjectKeys: presignedResp.uploads.map(u => u.object_key),
        audioOriginalFilenames: payload.audios.map(f => f.name),
      })
    } else {
      comment = await issueApi.addComment(props.issue.id, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audios: payload.audios.length ? payload.audios : undefined,
      }, (p) => { commentUploadProgress.value = p })
    }

    if (!props.issue.comments) props.issue.comments = []
    props.issue.comments.push(comment)
    commentInputRef.value?.reset()
  } catch (err: any) {
    toastError(err?.message || t('common.requestFailed'))
  } finally {
    submittingComment.value = false
  }
}

// Comment edit/delete
const editingCommentId = ref<number | null>(null)
const editingCommentContent = ref('')

function startEditComment(comment: Comment) {
  editingCommentId.value = comment.id
  editingCommentContent.value = comment.content
}

async function saveEditComment(comment: Comment) {
  const content = editingCommentContent.value.trim()
  if (!content || !props.issue.comments) return
  try {
    const updated = await commentApi.update(comment.id, content)
    const idx = props.issue.comments.findIndex(c => c.id === comment.id)
    if (idx !== -1) props.issue.comments[idx] = updated
    editingCommentId.value = null
    toastSuccess(t('issueDetail.commentUpdated'))
  } catch (err: any) {
    toastError(err?.message || t('common.requestFailed'))
  }
}

function requestDeleteComment(comment: Comment) {
  pendingDeleteComment.value = comment
}

async function confirmDeleteComment() {
  const comment = pendingDeleteComment.value
  if (!comment || !props.issue.comments) return
  try {
    await commentApi.delete(comment.id)
    props.issue.comments = props.issue.comments.filter(c => c.id !== comment.id)
    toastSuccess(t('issueDetail.commentDeleted'))
  } catch (err: any) {
    toastError(err?.message || t('common.requestFailed'))
  } finally {
    pendingDeleteComment.value = null
  }
}

/** Clear pending state when the displayed issue changes. */
function reset() {
  pendingStatus.value = null
  statusNote.value = ''
  statusNoteCursorPos.value = 0
  editingCommentId.value = null
  commentInputRef.value?.reset()
  statusNoteInputRef.value?.reset()
}

watch(() => props.issue.id, reset)

defineExpose({ reset })
</script>

<template>
  <!-- Description -->
  <template v-if="isPanel">
    <TimestampText
      v-if="issue.description"
      :text="issue.description"
      :issues="issues"
      :mention-users="activeIssueMentionUsers"
      class="text-sm text-foreground"
      :default-target="issue.audios?.length ? 'attachment' : 'track'"
      @activate="handleIssueDescriptionReference"
      @issueActivate="handleIssueReference"
    />

    <slot name="preview" />

    <div v-if="issue.audios?.length" class="space-y-2">
      <p class="text-xs font-mono font-semibold text-muted-foreground">{{ t('issue.audioAttachments') }}</p>
      <div class="flex flex-col gap-2">
        <div
          v-for="(audio, index) in issue.audios"
          :key="audio.id"
          class="bg-background border border-border rounded-2xl px-3 py-2 space-y-1.5"
        >
          <div class="flex items-center gap-2">
            <Music class="w-3.5 h-3.5 text-primary flex-shrink-0" :stroke-width="2" />
            <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
            <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
          </div>
          <audio
            :ref="(element) => setIssueAudioRef(index, element)"
            :src="resolveAssetUrl(audio.audio_url)"
            controls
            class="w-full h-8"
            style="accent-color: rgb(var(--color-primary));"
          />
        </div>
      </div>
    </div>
  </template>
  <div v-else class="card">
    <TimestampText
      :text="issue.description"
      :issues="issues"
      :mention-users="activeIssueMentionUsers"
      class="text-sm text-foreground"
      @activate="handleIssueDescriptionReference"
      @markerActivate="handleMarkerReference"
      @issueActivate="handleIssueReference"
    />
    <div v-if="issue.audios?.length" class="mt-4 space-y-2">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('issue.audioAttachments') }}</h3>
      <div class="flex flex-col gap-2">
        <div
          v-for="(audio, index) in issue.audios"
          :key="audio.id"
          class="bg-background border border-border rounded-2xl px-4 py-3 space-y-2"
        >
          <div class="flex items-center gap-2">
            <Music class="w-4 h-4 text-primary flex-shrink-0" :stroke-width="2" />
            <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
            <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
          </div>
          <audio
            :ref="(element) => setIssueAudioRef(index, element)"
            :src="resolveAssetUrl(audio.audio_url)"
            controls
            class="w-full h-8"
            style="accent-color: rgb(var(--color-primary));"
          />
        </div>
      </div>
    </div>
    <div class="text-xs text-muted-foreground mt-3">
      {{ t('issueDetail.created', { date: formatDate(issue.created_at) }) }}
    </div>
  </div>

  <!-- Status actions -->
  <div v-if="statusActions.length" class="space-y-3">
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="status in statusActions"
        :key="`status-${status}`"
        @click="selectStatus(status)"
        class="rounded-full font-medium transition-colors"
        :class="[statusActionClass(status), isPanel ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm']"
      >{{ statusActionLabel(status) }}</button>
    </div>
    <div v-if="pendingStatus" class="space-y-2">
      <template v-if="isPanel">
        <p v-if="statusActionHint(pendingStatus)" class="text-xs text-muted-foreground">
          {{ statusActionHint(pendingStatus) }}
        </p>
        <div class="relative">
          <textarea
            ref="statusNoteRef"
            v-model="statusNote"
            :placeholder="t('issue.statusNotePlaceholder')"
            class="textarea-field w-full text-sm"
            rows="2"
            @input="(e) => statusNoteCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
            @click="(e) => statusNoteCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
            @keyup="(e) => statusNoteCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
          />
          <TimestampSyntaxPopover
            :text="statusNote"
            :cursor-pos="statusNoteCursorPos"
            default-target="track"
            :issues="issues"
            :mention-users="statusNoteMentionUsers"
            @select="handleStatusNoteIssueMentionSelect"
            @select-user="handleStatusNoteUserMentionSelect"
          />
        </div>
        <div class="flex gap-2">
          <button @click="confirmStatusChange" class="btn-primary text-xs">{{ statusActionLabel(pendingStatus) }}</button>
          <button @click="pendingStatus = null" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
        </div>
      </template>
      <template v-else>
        <CommentInput
          ref="statusNoteInputRef"
          :placeholder="t('issue.statusNotePlaceholder')"
          :submit-label="t('common.confirm')"
          :submitting="submittingStatusNote"
          :upload-progress="statusNoteUploadProgress"
          enable-audio
          enable-timestamp-popover
          timestamp-default-target="track"
          :issues="issues"
          :mention-users="statusNoteMentionUsers"
          @submit="handleStatusNoteSubmit"
        />
        <button @click="cancelStatusChange" class="btn-secondary text-sm">
          {{ t('common.cancel') }}
        </button>
      </template>
    </div>
  </div>

  <!-- Comments -->
  <div :class="isPanel ? 'space-y-3' : 'space-y-4'">
    <div class="flex items-center justify-between">
      <component
        :is="isPanel ? 'p' : 'h3'"
        :class="isPanel ? 'text-xs font-mono font-semibold text-muted-foreground' : 'text-sm font-sans font-semibold text-foreground'"
      >
        {{ t('issueDetail.commentsHeading', { count: visibleComments.length }) }}
      </component>
      <button
        v-if="visibleComments.length > 1"
        @click="commentSortOrder = commentSortOrder === 'desc' ? 'asc' : 'desc'"
        class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowDownUp :class="isPanel ? 'w-3 h-3' : 'w-3.5 h-3.5'" />
        {{ commentSortOrder === 'desc' ? t('issueDetail.sortNewestFirst') : t('issueDetail.sortOldestFirst') }}
      </button>
    </div>

    <template v-for="comment in visibleComments" :key="comment.id">
      <div
        v-if="comment.is_status_note"
        class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2"
      >
        <div class="flex items-center gap-2" :class="isPanel ? 'mb-1' : 'mb-2 flex-wrap'">
          <span class="text-xs font-semibold text-warning">{{ t('issue.revisionNote') }}</span>
          <template v-if="isPanel">
            <span
              v-if="statusTransitionLabel(comment.old_status, comment.new_status)"
              class="text-[11px] font-mono text-muted-foreground"
            >{{ statusTransitionLabel(comment.old_status, comment.new_status) }}</span>
          </template>
          <template v-else-if="comment.old_status && comment.new_status">
            <span class="text-warning/40 text-xs">·</span>
            <StatusBadge :status="comment.old_status" type="issue" />
            <span class="text-xs text-muted-foreground">→</span>
            <StatusBadge :status="comment.new_status" type="issue" />
          </template>
          <span
            v-if="comment.visibility === 'internal'"
            class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-mono text-info"
          >{{ t('issueDetail.internalCommentBadge') }}</span>
        </div>
        <TimestampText
          :text="comment.content"
          :issues="issues"
          :mention-users="mentionUsersForVisibility(comment.visibility)"
          class="text-sm text-foreground"
          :default-target="comment.audios?.length ? 'attachment' : 'track'"
          @activate="(reference, target) => handleCommentReference(comment, reference, target)"
          @markerActivate="handleMarkerReference"
          @issueActivate="handleIssueReference"
        />
        <div v-if="comment.images && comment.images.length" class="flex flex-wrap gap-2 mt-2">
          <a
            v-for="img in comment.images"
            :key="img.id"
            :href="resolveAssetUrl(img.image_url)"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              :src="resolveAssetUrl(img.image_url)"
              class="object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
              :class="isPanel ? 'h-16 w-16' : 'h-20 w-20'"
              :alt="isPanel ? t('issueDetail.attachmentImageAlt') : 'attachment'"
            />
          </a>
        </div>
        <div v-if="comment.audios && comment.audios.length" class="flex flex-col gap-2 mt-2">
          <div
            v-for="(audio, index) in comment.audios"
            :key="audio.id"
            class="bg-background/50 border border-border rounded-2xl"
            :class="isPanel ? 'px-3 py-2 space-y-1.5' : 'px-4 py-3 space-y-2'"
          >
            <div class="flex items-center gap-2">
              <Music class="text-primary flex-shrink-0" :class="isPanel ? 'w-3.5 h-3.5' : 'w-4 h-4'" :stroke-width="2" />
              <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
              <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
            </div>
            <audio
              :ref="(element) => setCommentAudioRef(comment.id, index, element)"
              :src="resolveAssetUrl(audio.audio_url)"
              controls
              class="w-full h-8"
              style="accent-color: rgb(var(--color-primary));"
            />
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          {{ comment.author?.display_name || t('issueDetail.unknown') }} · {{ formatDate(comment.created_at) }}
        </p>
      </div>
      <div v-else class="card">
        <div class="flex items-center gap-2 mb-2">
          <div
            v-if="comment.author"
            class="rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            :class="isPanel ? 'w-5 h-5' : 'w-6 h-6'"
            :style="{ backgroundColor: comment.author.avatar_color }"
          >{{ comment.author.display_name.charAt(0) }}</div>
          <span class="font-medium text-foreground" :class="isPanel ? 'text-xs' : 'text-sm'">
            {{ comment.author?.display_name || t('issueDetail.unknown') }}
          </span>
          <span class="text-xs text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
          <span
            v-if="comment.visibility === 'internal'"
            class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-mono text-info"
          >{{ t('issueDetail.internalCommentBadge') }}</span>
          <button
            v-if="!isPanel && comment.edited_at"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="emit('show-comment-history', comment.id)"
          >
            ({{ t('editHistory.edited') }})
          </button>
          <template v-if="comment.author_id === appStore.currentUser?.id && !comment.is_status_note">
            <button @click="startEditComment(comment)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
              <Pencil :class="isPanel ? 'w-3 h-3' : 'w-3.5 h-3.5'" :stroke-width="2" />
            </button>
            <button @click="requestDeleteComment(comment)" class="text-muted-foreground hover:text-error transition-colors">
              <Trash2 :class="isPanel ? 'w-3 h-3' : 'w-3.5 h-3.5'" :stroke-width="2" />
            </button>
          </template>
        </div>
        <template v-if="editingCommentId === comment.id">
          <textarea
            v-model="editingCommentContent"
            class="textarea-field w-full text-sm"
            rows="3"
            @keydown.ctrl.enter="saveEditComment(comment)"
            @keydown.meta.enter="saveEditComment(comment)"
          />
          <div class="flex gap-2 mt-1">
            <button @click="saveEditComment(comment)" class="btn-primary text-xs">{{ t('common.save') }}</button>
            <button @click="editingCommentId = null" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
          </div>
        </template>
        <TimestampText
          v-else
          :text="comment.content"
          :issues="issues"
          :mention-users="mentionUsersForVisibility(comment.visibility)"
          class="text-sm text-foreground"
          :default-target="comment.audios?.length ? 'attachment' : 'track'"
          @activate="(reference, target) => handleCommentReference(comment, reference, target)"
          @markerActivate="handleMarkerReference"
          @issueActivate="handleIssueReference"
        />
        <div v-if="comment.images?.length" class="flex flex-wrap gap-2" :class="isPanel ? 'mt-2' : 'mt-3'">
          <a
            v-for="img in comment.images" :key="img.id"
            :href="resolveAssetUrl(img.image_url)" target="_blank" rel="noopener noreferrer"
          >
            <img
              :src="resolveAssetUrl(img.image_url)"
              class="object-cover rounded border border-border hover:opacity-80 transition-opacity cursor-pointer"
              :class="isPanel ? 'h-16 w-16' : 'h-20 w-20'"
              :alt="isPanel ? t('issueDetail.attachmentImageAlt') : 'attachment'"
            />
          </a>
        </div>
        <div v-if="comment.audios?.length" class="flex flex-col gap-2" :class="isPanel ? 'mt-2' : 'mt-3'">
          <div
            v-for="(audio, index) in comment.audios" :key="audio.id"
            class="bg-background border border-border rounded-2xl"
            :class="isPanel ? 'px-3 py-2 space-y-1.5' : 'px-4 py-3 space-y-2'"
          >
            <div class="flex items-center gap-2">
              <Music class="text-primary flex-shrink-0" :class="isPanel ? 'w-3.5 h-3.5' : 'w-4 h-4'" :stroke-width="2" />
              <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
              <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
            </div>
            <audio
              :ref="(element) => setCommentAudioRef(comment.id, index, element)"
              :src="resolveAssetUrl(audio.audio_url)"
              controls
              class="w-full h-8"
              style="accent-color: rgb(var(--color-primary));"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- New comment (page variant lives inside the comments section) -->
    <CommentInput
      v-if="!isPanel"
      ref="commentInputRef"
      :placeholder="t('issueDetail.addCommentPlaceholder')"
      :submit-label="t('issueDetail.addComment')"
      :submitting="submittingComment"
      :upload-progress="commentUploadProgress"
      enable-audio
      enable-timestamp-popover
      timestamp-default-target="attachment"
      :issues="issues"
      :mention-users="activeIssueMentionUsers"
      @submit="handleCommentSubmit"
    />
  </div>

  <!-- New comment (panel variant is a separate bordered section) -->
  <div v-if="isPanel" class="border-t border-border pt-4">
    <p
      v-if="issue.status === 'pending_discussion' || issue.status === 'internal_resolved'"
      class="rounded-none border border-info/30 bg-info-bg px-3 py-2 text-xs text-info mb-3"
    >{{ t('issueDetail.internalCommentHint') }}</p>
    <CommentInput
      ref="commentInputRef"
      :placeholder="t('issueDetail.addCommentPlaceholder')"
      :submit-label="t('issueDetail.addComment')"
      :submitting="submittingComment"
      :upload-progress="commentUploadProgress"
      enable-audio
      enable-timestamp-popover
      timestamp-default-target="attachment"
      :issues="issues"
      :mention-users="activeIssueMentionUsers"
      @submit="handleCommentSubmit"
    />
  </div>

  <ConfirmModal
    v-if="pendingDeleteComment"
    :title="t('issueDetail.deleteCommentTitle')"
    :message="t('issueDetail.deleteCommentConfirm')"
    :confirm-text="t('common.delete')"
    destructive
    @confirm="confirmDeleteComment"
    @cancel="pendingDeleteComment = null"
  />
</template>
