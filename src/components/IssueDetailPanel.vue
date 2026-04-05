<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Comment, Issue, IssueStatus } from '@/types'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatTimestamp, formatDuration } from '@/utils/time'
import { hashId } from '@/utils/hash'
import type { TimeReference, TimestampTarget } from '@/utils/timestamps'

const props = defineProps<{ issue: Issue | null }>()

const emit = defineEmits<{
  close: []
  updated: [issue: Issue]
}>()

const { t, locale } = useI18n()
const appStore = useAppStore()

const fullIssue = ref<Issue | null>(null)
const loading = ref(false)
const newComment = ref('')
const commentCursorPos = ref(0)
const pendingStatus = ref<Exclude<IssueStatus, 'open'> | null>(null)
const statusNote = ref('')
const selectedImages = ref<File[]>([])
const imagePreviewUrls = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,.mp3,.wav,.flac,.aac,.ogg'
const MAX_AUDIOS = 3
const selectedAudios = ref<File[]>([])
const audioInputRef = ref<HTMLInputElement | null>(null)
const commentAudioRefs = new Map<number, HTMLAudioElement[]>()

watch(() => props.issue, async (issue) => {
  pendingStatus.value = null
  statusNote.value = ''
  newComment.value = ''
  commentCursorPos.value = 0
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  selectedImages.value = []
  imagePreviewUrls.value = []
  selectedAudios.value = []
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
  return new Date(d).toLocaleDateString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function authorLabel(issue: Issue): string {
  if (issue.phase === 'peer') return `#${hashId(issue.author_id)}`
  return issue.author?.display_name ?? `#${issue.author_id}`
}

function selectStatus(status: Exclude<IssueStatus, 'open'>) {
  pendingStatus.value = pendingStatus.value === status ? null : status
  statusNote.value = ''
}

async function confirmStatusChange() {
  if (!fullIssue.value || !pendingStatus.value) return
  fullIssue.value = await issueApi.update(fullIssue.value.id, {
    status: pendingStatus.value,
    status_note: statusNote.value || undefined,
  })
  emit('updated', fullIssue.value)
  pendingStatus.value = null
  statusNote.value = ''
}

function onAudioSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (selectedAudios.value.length >= MAX_AUDIOS) break
    selectedAudios.value.push(file)
  }
  input.value = ''
}

function removeAudio(i: number) {
  selectedAudios.value.splice(i, 1)
}

const submittingComment = ref(false)
const commentUploadProgress = ref(0)

async function addComment() {
  if (!newComment.value.trim() && !selectedImages.value.length && !selectedAudios.value.length) return
  if (!fullIssue.value || !appStore.currentUser) return
  if (submittingComment.value) return
  submittingComment.value = true
  commentUploadProgress.value = 0
  try {
    const comment = await issueApi.addComment(fullIssue.value.id, {
      content: newComment.value,
      images: selectedImages.value.length ? selectedImages.value : undefined,
      audios: selectedAudios.value.length ? selectedAudios.value : undefined,
    }, (p) => { commentUploadProgress.value = p })
    if (!fullIssue.value.comments) fullIssue.value.comments = []
    fullIssue.value.comments.push(comment)
    newComment.value = ''
    commentCursorPos.value = 0
    imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
    selectedImages.value = []
    imagePreviewUrls.value = []
    selectedAudios.value = []
    commentAudioRefs.clear()
  } finally {
    submittingComment.value = false
  }
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    selectedImages.value.push(file)
    imagePreviewUrls.value.push(URL.createObjectURL(file))
  }
  input.value = ''
}

function removeImage(i: number) {
  URL.revokeObjectURL(imagePreviewUrls.value[i])
  selectedImages.value.splice(i, 1)
  imagePreviewUrls.value.splice(i, 1)
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
              <span>
                {{ formatTime(issue.time_start) }}
                <span v-if="issue.time_end"> – {{ formatTime(issue.time_end) }}</span>
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
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
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

          <!-- Status actions -->
          <div
            v-if="fullIssue.status === 'open' || fullIssue.status === 'will_fix'"
            class="space-y-3"
          >
            <div class="flex gap-2 flex-wrap">
              <button
                @click="selectStatus('resolved')"
                class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                :class="pendingStatus === 'resolved'
                  ? 'bg-primary text-black'
                  : 'bg-card border border-border text-foreground hover:bg-border'"
              >{{ t('issueDetail.markFixed') }}</button>
              <button
                v-if="fullIssue.status === 'open'"
                @click="selectStatus('disagreed')"
                class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                :class="pendingStatus === 'disagreed'
                  ? 'bg-error-bg text-error border border-error/30'
                  : 'bg-card border border-border text-foreground hover:bg-border'"
              >{{ t('issueDetail.disagree') }}</button>
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
              {{ t('issueDetail.commentsHeading', { count: fullIssue.comments?.length ?? 0 }) }}
            </p>

            <template v-for="comment in fullIssue.comments" :key="comment.id">
              <div
                v-if="comment.is_status_note"
                class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2"
              >
                <span class="text-xs font-semibold text-warning block mb-1">{{ t('issue.revisionNote') }}</span>
                <TimestampText
                  :text="comment.content"
                  class="text-sm text-foreground"
                  :default-target="comment.audios?.length ? 'attachment' : 'track'"
                  @activate="(reference, target) => handleCommentReference(comment, reference, target)"
                />
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
                </div>
                <TimestampText
                  :text="comment.content"
                  class="text-sm text-foreground"
                  :default-target="comment.audios?.length ? 'attachment' : 'track'"
                  @activate="(reference, target) => handleCommentReference(comment, reference, target)"
                />
                <div v-if="comment.images?.length" class="flex flex-wrap gap-2 mt-2">
                  <a
                    v-for="img in comment.images" :key="img.id"
                    :href="img.image_url" target="_blank" rel="noopener noreferrer"
                  >
                    <img :src="img.image_url" class="h-16 w-16 object-cover rounded border border-border hover:opacity-80 transition-opacity" alt="attachment" />
                  </a>
                </div>
                <div v-if="comment.audios?.length" class="flex flex-col gap-2 mt-2">
                  <div
                    v-for="(audio, index) in comment.audios" :key="audio.id"
                    class="bg-background border border-border rounded-2xl px-3 py-2 space-y-1.5"
                  >
                    <div class="flex items-center gap-2">
                      <svg class="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                      <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
                    </div>
                    <audio
                      :ref="(element) => setCommentAudioRef(comment.id, index, element)"
                      :src="audio.audio_url"
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
          <div class="space-y-2 border-t border-border pt-4">
            <div class="relative">
              <textarea
                v-model="newComment"
                class="textarea-field w-full text-sm pr-8"
                :placeholder="t('issueDetail.addCommentPlaceholder')"
                rows="3"
                @keydown.meta.enter="addComment"
                @keydown.ctrl.enter="addComment"
                @input="(e) => commentCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
                @click="(e) => commentCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
                @keyup="(e) => commentCursorPos = (e.target as HTMLTextAreaElement).selectionStart"
              />
              <TimestampSyntaxPopover
                :text="newComment"
                :cursor-pos="commentCursorPos"
                default-target="attachment"
              />
            </div>
            <div v-if="imagePreviewUrls.length" class="flex flex-wrap gap-2">
              <div v-for="(url, i) in imagePreviewUrls" :key="i" class="relative">
                <img :src="url" class="h-14 w-14 object-cover rounded border border-border" alt="preview" />
                <button
                  @click="removeImage(i)"
                  class="absolute -top-1 -right-1 w-4 h-4 bg-error text-white rounded-full text-xs flex items-center justify-center leading-none"
                >×</button>
              </div>
            </div>
            <div v-if="selectedAudios.length" class="flex flex-wrap gap-2">
              <div
                v-for="(file, i) in selectedAudios" :key="i"
                class="flex items-center gap-1.5 bg-background border border-border rounded-full px-2.5 py-1"
              >
                <svg class="w-3 h-3 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="text-xs font-mono text-foreground max-w-[100px] truncate">{{ file.name }}</span>
                <button @click="removeAudio(i)" class="text-muted-foreground hover:text-error transition-colors leading-none text-xs">×</button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="onFileSelect" />
              <input ref="audioInputRef" type="file" :accept="AUDIO_ACCEPT" multiple class="hidden" @change="onAudioSelect" />
              <button @click="fileInputRef?.click()" class="btn-secondary text-xs inline-flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ t('issueDetail.image') }}
              </button>
              <button
                @click="selectedAudios.length < MAX_AUDIOS && audioInputRef?.click()"
                :disabled="selectedAudios.length >= MAX_AUDIOS"
                :title="selectedAudios.length >= MAX_AUDIOS ? t('issueDetail.audioMaxReached', { max: MAX_AUDIOS }) : undefined"
                class="btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                {{ t('issueDetail.audio') }}
              </button>
              <button
                @click="addComment"
                :disabled="submittingComment || (!newComment.trim() && !selectedImages.length && !selectedAudios.length)"
                class="btn-primary text-xs"
              >{{ submittingComment ? t('common.loading') : t('issueDetail.addComment') }}</button>
            </div>
            <div v-if="submittingComment && (selectedAudios.length || selectedImages.length)" class="space-y-1">
              <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: commentUploadProgress + '%' }"></div>
              </div>
              <p class="text-xs text-muted-foreground text-right">{{ commentUploadProgress }}%</p>
            </div>
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
