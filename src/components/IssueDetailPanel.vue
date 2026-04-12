<script setup lang="ts">
import { ref, computed, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import { issueApi, commentApi, r2Api, uploadToR2, resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Comment, Issue, IssueStatus, StageAssignment } from '@/types'
import TimestampText from '@/components/common/TimestampText.vue'
import CommentInput from '@/components/common/CommentInput.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatTimestamp, formatDuration, parseUTC } from '@/utils/time'
import { hashId } from '@/utils/hash'
import type { TimeReference, TimestampTarget } from '@/utils/timestamps'
import { X, Music, Pencil, Trash2 } from 'lucide-vue-next'
import { canUserReviewIssue } from '@/utils/reviewAssignments'

const props = defineProps<{
  issue: Issue | null
  track?: import('@/types').Track | null
  assignments?: StageAssignment[]
}>()

const emit = defineEmits<{
  close: []
  updated: [issue: Issue]
}>()

const { t, locale } = useI18n()
const appStore = useAppStore()

const fullIssue = ref<Issue | null>(null)
const loading = ref(false)
const pendingStatus = ref<IssueStatus | null>(null)
const commentInputRef = ref<InstanceType<typeof CommentInput> | null>(null)

const isSubmitter = computed(() => appStore.currentUser?.id === props.track?.submitter_id)

const isReviewer = computed(() => {
  return fullIssue.value != null
    && canUserReviewIssue(appStore.currentUser?.id, props.track, fullIssue.value, props.assignments ?? [])
})

function availableStatusActions(currentStatus: IssueStatus): IssueStatus[] {
  if (isSubmitter.value) {
    if (currentStatus === 'open') return ['resolved', 'disagreed']
    if (currentStatus === 'disagreed') return ['resolved']
    return []
  }

  if (!isReviewer.value) return []
  if (currentStatus === 'open') return ['resolved', 'pending_discussion']
  if (currentStatus === 'pending_discussion') return ['open', 'internal_resolved']
  if (currentStatus === 'internal_resolved') return ['open']
  if (currentStatus === 'resolved') return ['open']
  if (currentStatus === 'disagreed') return ['open', 'resolved', 'pending_discussion', 'internal_resolved']
  return []
}

const statusActions = computed<IssueStatus[]>(() => {
  if (!fullIssue.value) return []
  return availableStatusActions(fullIssue.value.status)
})

function statusActionLabel(status: IssueStatus): string {
  // When transitioning from pending_discussion to open, use "Publish" instead of "Reopen"
  if (status === 'open' && (fullIssue.value?.status === 'pending_discussion' || fullIssue.value?.status === 'internal_resolved')) {
    return t('issueDetail.publish')
  }
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

function statusTransitionLabel(oldStatus: string | null | undefined, newStatus: string | null | undefined): string | null {
  if (!oldStatus || !newStatus) return null
  const oldLabel = t(`status.${oldStatus}`, oldStatus)
  const newLabel = t(`status.${newStatus}`, newStatus)
  return `${oldLabel} → ${newLabel}`
}

const shouldHideInternalComments = computed(() =>
  Boolean(props.track && appStore.currentUser?.id === props.track.submitter_id),
)

const visibleComments = computed(() =>
  (fullIssue.value?.comments ?? []).filter(
    comment => !(shouldHideInternalComments.value && comment.visibility === 'internal'),
  ),
)

function statusActionClass(status: IssueStatus): string {
  if (pendingStatus.value === status) {
    if (status === 'resolved') return 'bg-primary text-black'
    if (status === 'internal_resolved') return 'bg-info-bg text-info border border-info/30'
    if (status === 'disagreed') return 'bg-error-bg text-error border border-error/30'
    return 'bg-warning-bg text-warning border border-warning/30'
  }
  return 'bg-card border border-border text-foreground hover:bg-border'
}
const statusNote = ref('')
const commentAudioRefs = new Map<number, HTMLAudioElement[]>()

watch(() => props.issue, async (issue) => {
  pendingStatus.value = null
  statusNote.value = ''
  commentInputRef.value?.reset()
  if (!issue) { fullIssue.value = null; return }
  loading.value = true
  try {
    fullIssue.value = await issueApi.get(issue.id)
  } finally {
    loading.value = false
  }
})

function formatTime(s: number) { return formatTimestamp(s) }

function setCommentAudioRef(commentId: number, index: number, element: unknown) {
  const refs = commentAudioRefs.get(commentId) ?? []
  if (element instanceof HTMLAudioElement) {
    refs[index] = element
    commentAudioRefs.set(commentId, refs)
    return
  }

  refs.splice(index, 1)
  if (refs.length) commentAudioRefs.set(commentId, refs)
  else commentAudioRefs.delete(commentId)
}

async function playAttachmentReference(commentId: number, reference: TimeReference) {
  const audio = commentAudioRefs.get(commentId)?.[0]
  if (!audio) return
  audio.currentTime = reference.startSeconds
  await audio.play().catch(() => undefined)
}

async function handleCommentReference(comment: Comment, reference: TimeReference, target: TimestampTarget) {
  if (target !== 'attachment' || !comment.audios?.length) return
  await playAttachmentReference(comment.id, reference)
}

function formatDate(d: string) {
  return parseUTC(d).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function authorLabel(issue: Issue): string {
  if (issue.phase === 'peer') return `#${hashId(issue.author_id)}`
  return issue.author?.display_name ?? `#${issue.author_id}`
}

function selectStatus(status: IssueStatus) {
  pendingStatus.value = pendingStatus.value === status ? null : status
  statusNote.value = ''
}

async function confirmStatusChange() {
  if (!fullIssue.value || !pendingStatus.value) return
  const previousStatus = fullIssue.value.status
  const targetStatus = pendingStatus.value
  const note = statusNote.value

  // Optimistic update
  fullIssue.value = { ...fullIssue.value, status: targetStatus }
  emit('updated', fullIssue.value)
  pendingStatus.value = null
  statusNote.value = ''

  try {
    const updated = await issueApi.update(fullIssue.value.id, {
      status: targetStatus,
      status_note: note || undefined,
    })
    fullIssue.value = updated
    emit('updated', updated)
  } catch {
    // Revert on failure
    if (fullIssue.value) {
      fullIssue.value = { ...fullIssue.value, status: previousStatus }
      emit('updated', fullIssue.value)
    }
  }
}

const submittingComment = ref(false)
const commentUploadProgress = ref(0)

async function handleCommentSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  if (!fullIssue.value || !appStore.currentUser) return
  if (submittingComment.value) return
  submittingComment.value = true
  commentUploadProgress.value = 0
  try {
    let comment: Comment

    if (appStore.r2Enabled && payload.audios.length > 0) {
      const presignedResp = await r2Api.requestCommentAudioUpload(
        fullIssue.value.id,
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
      comment = await issueApi.addComment(fullIssue.value.id, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audioObjectKeys: presignedResp.uploads.map(u => u.object_key),
        audioOriginalFilenames: payload.audios.map(f => f.name),
      })
    } else {
      comment = await issueApi.addComment(fullIssue.value.id, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audios: payload.audios.length ? payload.audios : undefined,
      }, (p) => { commentUploadProgress.value = p })
    }

    if (!fullIssue.value.comments) fullIssue.value.comments = []
    fullIssue.value.comments.push(comment)
    commentInputRef.value?.reset()
    commentAudioRefs.clear()
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
  if (!content || !fullIssue.value?.comments) return
  try {
    const updated = await commentApi.update(comment.id, content)
    const idx = fullIssue.value.comments.findIndex(c => c.id === comment.id)
    if (idx !== -1) fullIssue.value.comments[idx] = updated
    editingCommentId.value = null
  } catch { /* handled by request wrapper */ }
}

async function deleteComment(comment: Comment) {
  if (!fullIssue.value?.comments) return
  try {
    await commentApi.delete(comment.id)
    fullIssue.value.comments = fullIssue.value.comments.filter(c => c.id !== comment.id)
  } catch { /* handled by request wrapper */ }
}

</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="idp-fade">
      <div
        v-if="issue"
        class="fixed inset-0 z-40 bg-black/50"
        @click="emit('close')"
      />
    </Transition>

    <!-- Panel -->
    <Transition name="idp-slide">
      <div
        v-if="issue"
        class="fixed right-0 top-0 h-full w-full sm:w-[460px] z-50 bg-card border-l border-border flex flex-col"
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-border flex items-start gap-3 flex-shrink-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span
                v-if="issue.source_version_number != null"
                class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
              >
                v{{ issue.source_version_number }}
              </span>
              <StatusBadge :status="issue.phase" type="phase" />
              <StatusBadge :status="issue.severity" type="severity" />
              <StatusBadge :status="issue.status" type="issue" />
            </div>
            <h2 class="text-base font-mono font-bold text-foreground leading-snug">
              {{ fullIssue?.title ?? issue.title }}
            </h2>
            <p class="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span v-if="issue.markers.length === 0" class="italic">{{ t('issue.generalIssue') }}</span>
              <span v-else>
                <template v-for="(m, mi) in issue.markers" :key="mi">
                  <span v-if="mi > 0" class="text-border mx-1">·</span>
                  <span>{{ formatTime(m.time_start) }}<span v-if="m.time_end"> – {{ formatTime(m.time_end) }}</span></span>
                </template>
              </span>
              <span class="text-border">·</span>
              <span :class="issue.phase === 'peer' ? 'font-mono' : ''">{{ authorLabel(issue) }}</span>
            </p>
          </div>
          <button
            @click="emit('close')"
            class="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Close"
          >
            <X class="w-5 h-5" :stroke-width="2" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div v-if="loading" class="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="fullIssue" class="flex-1 overflow-y-auto p-5 space-y-5">

          <!-- Description -->
          <TimestampText
            v-if="fullIssue.description"
            :text="fullIssue.description"
            class="text-sm text-foreground"
            :interactive="false"
          />
          <p v-else class="text-sm text-muted-foreground italic">{{ t('issueDetail.noDescription') }}</p>

          <div v-if="fullIssue.audios?.length" class="space-y-2">
            <p class="text-xs font-mono font-semibold text-muted-foreground">{{ t('issue.audioAttachments') }}</p>
            <div class="flex flex-col gap-2">
              <div
                v-for="audio in fullIssue.audios"
                :key="audio.id"
                class="bg-background border border-border rounded-2xl px-3 py-2 space-y-1.5"
              >
                <div class="flex items-center gap-2">
                  <Music class="w-3.5 h-3.5 text-primary flex-shrink-0" :stroke-width="2" />
                  <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                  <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
                </div>
                <audio
                  :src="resolveAssetUrl(audio.audio_url)"
                  controls
                  class="w-full h-8"
                  style="accent-color: #FF8400;"
                />
              </div>
            </div>
          </div>

          <!-- Status actions -->
          <div v-if="statusActions.length" class="space-y-3">
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="status in statusActions"
                :key="`status-${status}`"
                @click="selectStatus(status)"
                class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                :class="statusActionClass(status)"
              >{{ statusActionLabel(status) }}</button>
            </div>
            <div v-if="pendingStatus" class="space-y-2">
              <textarea
                v-model="statusNote"
                :placeholder="t('issue.statusNotePlaceholder')"
                class="textarea-field w-full text-sm"
                rows="2"
              />
              <div class="flex gap-2">
                <button @click="confirmStatusChange" class="btn-primary text-xs">{{ t('common.confirm') }}</button>
                <button @click="pendingStatus = null" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
              </div>
            </div>
          </div>

          <!-- Comments -->
          <div class="space-y-3">
            <p class="text-xs font-mono font-semibold text-muted-foreground">
              {{ t('issueDetail.commentsHeading', { count: visibleComments.length }) }}
            </p>

            <template v-for="comment in visibleComments" :key="comment.id">
              <div
                v-if="comment.is_status_note"
                class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-semibold text-warning">{{ t('issue.revisionNote') }}</span>
                  <span
                    v-if="statusTransitionLabel(comment.old_status, comment.new_status)"
                    class="text-[11px] font-mono text-muted-foreground"
                  >{{ statusTransitionLabel(comment.old_status, comment.new_status) }}</span>
                  <span
                    v-if="comment.visibility === 'internal'"
                    class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-mono text-info"
                  >{{ t('issueDetail.internalCommentBadge') }}</span>
                </div>
                <TimestampText
                  :text="comment.content"
                  class="text-sm text-foreground"
                  :default-target="comment.audios?.length ? 'attachment' : 'track'"
                  @activate="(reference, target) => handleCommentReference(comment, reference, target)"
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
                      class="h-16 w-16 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                      alt="attachment"
                    />
                  </a>
                </div>
                <div v-if="comment.audios && comment.audios.length" class="flex flex-col gap-2 mt-2">
                  <div
                    v-for="audio in comment.audios"
                    :key="audio.id"
                    class="bg-background/50 border border-border rounded-2xl px-3 py-2 space-y-1.5"
                  >
                    <div class="flex items-center gap-2">
                      <Music class="w-3.5 h-3.5 text-primary flex-shrink-0" :stroke-width="2" />
                      <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                      <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
                    </div>
                    <audio
                      :src="resolveAssetUrl(audio.audio_url)"
                      controls
                      class="w-full h-8"
                      style="accent-color: #FF8400;"
                    />
                  </div>
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ comment.author?.display_name ?? t('issueDetail.unknown') }} · {{ formatDate(comment.created_at) }}
                </p>
              </div>
              <div v-else class="card">
                <div class="flex items-center gap-2 mb-2">
                  <div
                    v-if="comment.author"
                    class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    :style="{ backgroundColor: comment.author.avatar_color }"
                  >{{ comment.author.display_name.charAt(0) }}</div>
                  <span class="text-xs font-medium text-foreground">
                    {{ comment.author?.display_name ?? t('issueDetail.unknown') }}
                  </span>
                  <span class="text-xs text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
                  <span
                    v-if="comment.visibility === 'internal'"
                    class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-mono text-info"
                  >{{ t('issueDetail.internalCommentBadge') }}</span>
                  <template v-if="comment.author_id === appStore.currentUser?.id && !comment.is_status_note">
                    <button @click="startEditComment(comment)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                      <Pencil class="w-3 h-3" :stroke-width="2" />
                    </button>
                    <button @click="deleteComment(comment)" class="text-muted-foreground hover:text-error transition-colors">
                      <Trash2 class="w-3 h-3" :stroke-width="2" />
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
                  class="text-sm text-foreground"
                  :default-target="comment.audios?.length ? 'attachment' : 'track'"
                  @activate="(reference, target) => handleCommentReference(comment, reference, target)"
                />
                <div v-if="comment.images?.length" class="flex flex-wrap gap-2 mt-2">
                  <a
                    v-for="img in comment.images" :key="img.id"
                    :href="resolveAssetUrl(img.image_url)" target="_blank" rel="noopener noreferrer"
                  >
                    <img :src="resolveAssetUrl(img.image_url)" class="h-16 w-16 object-cover rounded border border-border hover:opacity-80 transition-opacity" alt="attachment" />
                  </a>
                </div>
                <div v-if="comment.audios?.length" class="flex flex-col gap-2 mt-2">
                  <div
                    v-for="(audio, index) in comment.audios" :key="audio.id"
                    class="bg-background border border-border rounded-2xl px-3 py-2 space-y-1.5"
                  >
                    <div class="flex items-center gap-2">
                      <Music class="w-3.5 h-3.5 text-primary flex-shrink-0" :stroke-width="2" />
                      <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                      <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
                    </div>
                    <audio
                      :ref="(element) => setCommentAudioRef(comment.id, index, element)"
                      :src="resolveAssetUrl(audio.audio_url)"
                      controls
                      class="w-full h-8"
                      style="accent-color: #FF8400;"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Add comment -->
          <div class="border-t border-border pt-4">
            <p
              v-if="fullIssue?.status === 'pending_discussion' || fullIssue?.status === 'internal_resolved'"
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
              @submit="handleCommentSubmit"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.idp-fade-enter-active, .idp-fade-leave-active { transition: opacity 0.2s ease; }
.idp-fade-enter-from, .idp-fade-leave-to { opacity: 0; }

.idp-slide-enter-active, .idp-slide-leave-active { transition: transform 0.25s ease; }
.idp-slide-enter-from, .idp-slide-leave-to { transform: translateX(100%); }
</style>
