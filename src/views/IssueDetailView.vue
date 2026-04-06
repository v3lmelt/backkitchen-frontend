<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, trackApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Comment, Issue, IssueStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import { formatTimestamp, formatLocaleDate, formatDuration } from '@/utils/time'
import type { TimeReference, TimestampTarget } from '@/utils/timestamps'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const appStore = useAppStore()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const allTrackIssues = ref<Issue[]>([])
const loading = ref(true)
const showUnresolvedOnly = ref(false)
const currentSourceVersionNumber = ref<number | null>(null)

const issueIsOutdated = computed(() => {
  if (!issue.value || issue.value.source_version_number == null || currentSourceVersionNumber.value == null) return false
  return issue.value.source_version_number !== currentSourceVersionNumber.value
})

const canOpenIssueSourceAudio = computed(() =>
  issueIsOutdated.value && issue.value?.source_version_id != null,
)

const displayedAudioVersionNumber = computed(() => {
  if (issueIsOutdated.value) return issue.value?.source_version_number ?? currentSourceVersionNumber.value
  return currentSourceVersionNumber.value ?? issue.value?.source_version_number ?? null
})

const waveformIssues = computed(() => {
  if (!issue.value) return []
  if (issueIsOutdated.value && !canOpenIssueSourceAudio.value) return []
  return [issue.value]
})

let loadCount = 0
let cachedTrackId: number | null = null
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const newComment = ref('')
const commentCursorPos = ref(0)
const commentAudioRefs = new Map<string, HTMLAudioElement>()

const audioUrl = computed(() => {
  if (!issue.value) return ''
  if (canOpenIssueSourceAudio.value) {
    return `${API_ORIGIN}/api/tracks/${issue.value.track_id}/source-versions/${issue.value.source_version_id}/audio`
  }
  return `${API_ORIGIN}/api/tracks/${issue.value.track_id}/audio`
})

function onWaveformReady() {
  seekWaveformToIssue()
}

function seekWaveformToIssue() {
  if (!issue.value || !waveformRef.value) return
  waveformRef.value.seekTo(issue.value.time_start)
  if (issue.value.issue_type === 'range') {
    waveformRef.value.highlightIssue(issue.value)
  }
}

// When switching issues with the same audio, the WaveformPlayer persists (no
// new "ready" event). Detect this and seek to the new issue's timestamp.
let prevAudioUrl = ''
watch(issueId, () => {
  nextTick(() => {
    const url = audioUrl.value
    if (url && url === prevAudioUrl) {
      seekWaveformToIssue()
    }
    prevAudioUrl = url
  })
})
watch(audioUrl, (url) => { prevAudioUrl = url }, { immediate: true })
const selectedImages = ref<File[]>([])
const imagePreviewUrls = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,.mp3,.wav,.flac,.aac,.ogg'
const MAX_AUDIOS = 3
const selectedAudios = ref<File[]>([])
const audioInputRef = ref<HTMLInputElement | null>(null)
const pendingStatus = ref<Exclude<IssueStatus, 'open'> | null>(null)
const statusNote = ref('')

async function loadIssue(id: number) {
  const token = ++loadCount
  loading.value = true
  try {
    const fetched = await issueApi.get(id)
    if (token !== loadCount) return
    issue.value = fetched
    if (fetched.track_id !== cachedTrackId) {
      const all = await issueApi.listForTrack(fetched.track_id)
      const detail = await trackApi.get(fetched.track_id)
      if (token !== loadCount) return
      allTrackIssues.value = all
      currentSourceVersionNumber.value = detail.track.version
      cachedTrackId = fetched.track_id
    }
  } finally {
    if (token === loadCount) loading.value = false
  }
}

onMounted(() => loadIssue(issueId.value))
watch(issueId, (id) => {
  loadIssue(id)
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
})
onBeforeUnmount(() => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
})

const siblingIssues = computed(() => {
  if (!issue.value) return []
  const { phase, workflow_cycle } = issue.value
  return allTrackIssues.value
    .filter(i => i.phase === phase && i.workflow_cycle === workflow_cycle)
    .sort((a, b) => a.time_start - b.time_start)
})

const visibleSiblingIssues = computed(() => {
  if (!showUnresolvedOnly.value) return siblingIssues.value
  return siblingIssues.value.filter(i => i.status === 'open' || i.status === 'will_fix')
})

const currentSiblingIndex = computed(() =>
  siblingIssues.value.findIndex(i => i.id === issueId.value)
)
const prevIssue = computed(() =>
  currentSiblingIndex.value > 0 ? siblingIssues.value[currentSiblingIndex.value - 1] : null
)
const nextIssue = computed(() =>
  currentSiblingIndex.value < siblingIssues.value.length - 1
    ? siblingIssues.value[currentSiblingIndex.value + 1]
    : null
)

const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

function isOutdatedIssue(item: Issue): boolean {
  if (item.source_version_number == null || currentSourceVersionNumber.value == null) return false
  return item.source_version_number !== currentSourceVersionNumber.value
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

function removeSelectedImage(index: number) {
  URL.revokeObjectURL(imagePreviewUrls.value[index])
  selectedImages.value.splice(index, 1)
  imagePreviewUrls.value.splice(index, 1)
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

function removeSelectedAudio(index: number) {
  selectedAudios.value.splice(index, 1)
}

function setCommentAudioRef(commentId: number, index: number, element: unknown) {
  const key = `${commentId}:${index}`
  if (!(element instanceof HTMLAudioElement)) {
    commentAudioRefs.delete(key)
    return
  }

  commentAudioRefs.set(key, element)
}

async function playTrackReference(reference: TimeReference) {
  if (!waveformRef.value) return
  await waveformRef.value.playFrom(reference.startSeconds)
}

async function playCommentAttachmentReference(comment: Comment, reference: TimeReference) {
  const audio = comment.audios?.length ? commentAudioRefs.get(`${comment.id}:0`) : null
  if (!audio) {
    await playTrackReference(reference)
    return
  }

  audio.currentTime = reference.startSeconds
  await audio.play().catch(() => undefined)
}

async function handleCommentReference(comment: Comment, reference: TimeReference, target: TimestampTarget) {
  if (target === 'attachment') {
    await playCommentAttachmentReference(comment, reference)
    return
  }

  await playTrackReference(reference)
}

const submittingComment = ref(false)
const commentUploadProgress = ref(0)

async function addComment() {
  if ((!newComment.value.trim() && !selectedImages.value.length && !selectedAudios.value.length) || !appStore.currentUser || !issue.value) return
  if (submittingComment.value) return
  submittingComment.value = true
  commentUploadProgress.value = 0
  try {
    const comment = await issueApi.addComment(issueId.value, {
      content: newComment.value,
      images: selectedImages.value.length ? selectedImages.value : undefined,
      audios: selectedAudios.value.length ? selectedAudios.value : undefined,
    }, (p) => { commentUploadProgress.value = p })
    if (!issue.value.comments) issue.value.comments = []
    issue.value.comments.push(comment)
    newComment.value = ''
    imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
    selectedImages.value = []
    imagePreviewUrls.value = []
    selectedAudios.value = []
  } finally {
    submittingComment.value = false
  }
}

function selectStatus(status: Exclude<IssueStatus, 'open'>) {
  pendingStatus.value = status
  statusNote.value = ''
}

async function confirmStatusChange() {
  if (!issue.value || !pendingStatus.value) return
  issue.value = await issueApi.update(issueId.value, {
    status: pendingStatus.value,
    status_note: statusNote.value || undefined,
  })
  const idx = allTrackIssues.value.findIndex(i => i.id === issueId.value)
  if (idx !== -1 && issue.value) allTrackIssues.value[idx] = issue.value
  pendingStatus.value = null
  statusNote.value = ''
}

function cancelStatusChange() {
  pendingStatus.value = null
  statusNote.value = ''
}

function goBackToTrack() {
  if (!issue.value) return
  router.push(`/tracks/${issue.value.track_id}`)
}

function openVersionCompare() {
  if (!issue.value?.track_id || !issue.value.source_version_id) return
  router.push({
    path: `/tracks/${issue.value.track_id}`,
    query: { compareVersion: String(issue.value.source_version_id) },
  })
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
    <div v-else-if="issue" class="max-w-7xl mx-auto space-y-6">
    <div
      v-if="issueIsOutdated"
      class="flex flex-col gap-3 border border-warning/30 bg-warning-bg px-4 py-4 text-sm text-warning lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="min-w-0">
        <p class="font-medium text-foreground">
          {{ t('issueDetail.outdatedVersionTitle', { issueVersion: issue.source_version_number, currentVersion: currentSourceVersionNumber }) }}
        </p>
        <p class="mt-1 text-warning">
          {{ t(canOpenIssueSourceAudio ? 'issueDetail.outdatedVersionBody' : 'issueDetail.outdatedVersionUnavailable') }}
        </p>
      </div>
      <button v-if="canOpenIssueSourceAudio" @click="openVersionCompare" class="btn-secondary text-sm whitespace-nowrap">
        {{ t('issueDetail.openVersionCompare') }}
      </button>
    </div>

    <!-- Header -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <button @click="goBackToTrack" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('issueDetail.back') }}
        </button>
        <div v-if="siblingIssues.length > 1" class="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
            :disabled="!prevIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="prevIssue?.title"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="font-mono text-xs">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
          <button
            @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
            :disabled="!nextIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="nextIssue?.title"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
      <h1 class="text-2xl font-sans font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex items-center gap-3 mt-2">
        <span
          v-if="issue.source_version_number != null"
          class="inline-flex items-center rounded-full bg-border px-2 py-1 text-xs font-mono text-foreground"
        >
          v{{ issue.source_version_number }}
        </span>
        <StatusBadge :status="issue.phase" type="phase" />
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span class="text-sm text-muted-foreground">
          {{ formatTimestamp(issue.time_start) }}
          <span v-if="issue.time_end"> - {{ formatTimestamp(issue.time_end) }}</span>
        </span>
        <span class="text-sm text-muted-foreground">
          {{ issue.issue_type === 'range' ? t('issueType.range') : t('issueType.point') }}
        </span>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Transition name="issue-detail-fade" mode="out-in">
        <div :key="issue.id" class="min-w-0 space-y-6">
          <!-- Waveform -->
          <div class="card overflow-hidden !p-0">
            <div class="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-medium text-muted-foreground">{{ t('issueDetail.audioContext') }}</span>
                <span
                  v-if="displayedAudioVersionNumber != null"
                  class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
                >
                  v{{ displayedAudioVersionNumber }}
                </span>
              </div>
              <span class="text-xs text-muted-foreground font-mono">
                {{ formatTimestamp(issue.time_start) }}<span v-if="issue.time_end"> – {{ formatTimestamp(issue.time_end) }}</span>
              </span>
            </div>
            <WaveformPlayer
              ref="waveformRef"
              :audio-url="audioUrl"
              :issues="waveformIssues"
              :height="80"
              @ready="onWaveformReady"
            />
            <div v-if="issueIsOutdated" class="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {{ t(canOpenIssueSourceAudio ? 'issueDetail.outdatedWaveformHint' : 'issueDetail.outdatedWaveformUnavailable') }}
            </div>
          </div>
        <!-- Description -->
        <div class="card">
          <TimestampText
            :text="issue.description"
            class="text-sm text-foreground"
            @activate="(reference) => playTrackReference(reference)"
          />
          <div class="text-xs text-muted-foreground mt-3">
            {{ t('issueDetail.created', { date: fmtDate(issue.created_at) }) }}
          </div>
        </div>

        <!-- Status Actions -->
        <div class="space-y-3">
          <div v-if="issue.status === 'open' || issue.status === 'will_fix'" class="flex gap-2">
            <button
              @click="selectStatus('resolved')"
              class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
              :class="pendingStatus === 'resolved'
                ? 'bg-primary text-black'
                : 'bg-card border border-border text-foreground hover:bg-border'"
            >
              {{ t('issueDetail.markFixed') }}
            </button>
            <button
              v-if="issue.status === 'open'"
              @click="selectStatus('disagreed')"
              class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
              :class="pendingStatus === 'disagreed'
                ? 'bg-error-bg text-error border border-error/30'
                : 'bg-card border border-border text-foreground hover:bg-border'"
            >
              {{ t('issueDetail.disagree') }}
            </button>
          </div>
          <div v-if="pendingStatus" class="space-y-2">
            <textarea
              v-model="statusNote"
              :placeholder="t('issue.statusNotePlaceholder')"
              class="textarea-field w-full"
              rows="3"
            ></textarea>
            <div class="flex gap-2">
              <button @click="confirmStatusChange" class="btn-primary text-sm">
                {{ t('common.confirm') }}
              </button>
              <button @click="cancelStatusChange" class="btn-secondary text-sm">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Comments -->
        <div class="space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">
            {{ t('issueDetail.commentsHeading', { count: issue.comments?.length || 0 }) }}
          </h3>

          <template v-for="comment in issue.comments" :key="comment.id">
            <div v-if="comment.is_status_note" class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2">
              <span class="text-xs font-semibold text-warning block mb-1">{{ t('issue.revisionNote') }}</span>
              <TimestampText
                :text="comment.content"
                class="text-sm text-foreground"
                :default-target="comment.audios?.length ? 'attachment' : 'track'"
                @activate="(reference, target) => handleCommentReference(comment, reference, target)"
              />
              <p class="text-xs text-muted-foreground mt-1">{{ comment.author?.display_name || t('issueDetail.unknown') }} · {{ fmtDate(comment.created_at) }}</p>
            </div>
            <div v-else class="card">
              <div class="flex items-center gap-2 mb-2">
                <div
                  v-if="comment.author"
                  class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  :style="{ backgroundColor: comment.author.avatar_color }"
                >
                  {{ comment.author.display_name.charAt(0) }}
                </div>
                <span class="text-sm font-medium text-foreground">
                  {{ comment.author?.display_name || t('issueDetail.unknown') }}
                </span>
                <span class="text-xs text-muted-foreground">{{ fmtDate(comment.created_at) }}</span>
              </div>
              <TimestampText
                :text="comment.content"
                class="text-sm text-foreground"
                :default-target="comment.audios?.length ? 'attachment' : 'track'"
                @activate="(reference, target) => handleCommentReference(comment, reference, target)"
              />
              <div v-if="comment.images && comment.images.length" class="flex flex-wrap gap-2 mt-3">
                <a
                  v-for="img in comment.images"
                  :key="img.id"
                  :href="img.image_url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    :src="img.image_url"
                    class="h-20 w-20 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                    alt="attachment"
                  />
                </a>
              </div>
              <div v-if="comment.audios && comment.audios.length" class="flex flex-col gap-2 mt-3">
                <div
                  v-for="(audio, index) in comment.audios"
                  :key="audio.id"
                  class="bg-background border border-border rounded-2xl px-4 py-3 space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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

          <!-- New Comment -->
          <div class="space-y-2">
            <div class="relative">
              <textarea
                v-model="newComment"
                class="textarea-field w-full h-20 pr-8"
                :placeholder="t('issueDetail.addCommentPlaceholder')"
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

            <!-- Image previews -->
            <div v-if="imagePreviewUrls.length" class="flex flex-wrap gap-2">
              <div
                v-for="(url, i) in imagePreviewUrls"
                :key="i"
                class="relative"
              >
                <img :src="url" class="h-16 w-16 object-cover rounded border border-border" alt="preview" />
                <button
                  @click="removeSelectedImage(i)"
                  class="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center leading-none"
                  title="Remove"
                >×</button>
              </div>
            </div>

            <!-- Audio previews -->
            <div v-if="selectedAudios.length" class="flex flex-wrap gap-2">
              <div
                v-for="(file, i) in selectedAudios"
                :key="i"
                class="flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1"
              >
                <svg class="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="text-xs font-mono text-foreground max-w-[120px] truncate">{{ file.name }}</span>
                <button @click="removeSelectedAudio(i)" class="text-muted-foreground hover:text-error transition-colors leading-none">×</button>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                @change="onFileSelect"
              />
              <input
                ref="audioInputRef"
                type="file"
                :accept="AUDIO_ACCEPT"
                multiple
                class="hidden"
                @change="onAudioSelect"
              />
              <button
                @click="fileInputRef?.click()"
                class="btn-secondary text-sm inline-flex items-center gap-1"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ t('issueDetail.image') }}
              </button>
              <button
                @click="selectedAudios.length < MAX_AUDIOS && audioInputRef?.click()"
                :disabled="selectedAudios.length >= MAX_AUDIOS"
                :title="selectedAudios.length >= MAX_AUDIOS ? t('issueDetail.audioMaxReached', { max: MAX_AUDIOS }) : undefined"
                class="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                {{ t('issueDetail.audio') }}
              </button>
              <button @click="addComment" :disabled="submittingComment || (!newComment.trim() && !selectedImages.length && !selectedAudios.length)" class="btn-primary text-sm">
                {{ submittingComment ? t('common.loading') : t('issueDetail.addComment') }}
              </button>
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

      <aside class="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-3rem)] lg:flex lg:flex-col">
        <div class="card space-y-4 lg:flex lg:flex-col lg:overflow-hidden">
          <div class="flex items-center justify-between gap-3 shrink-0">
            <h3 class="text-sm font-sans font-semibold text-foreground">
              {{ t('issueDetail.issueList', { count: visibleSiblingIssues.length }) }}
            </h3>
            <span class="text-xs font-mono text-muted-foreground">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
          </div>

          <label class="flex items-center justify-between gap-3 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground cursor-pointer select-none shrink-0">
            <span>{{ t('issueDetail.onlyUnresolved') }}</span>
            <button
              type="button"
              @click.prevent="showUnresolvedOnly = !showUnresolvedOnly"
              class="relative h-6 w-11 overflow-hidden rounded-full transition-colors"
              :class="showUnresolvedOnly ? 'bg-primary' : 'bg-border'"
              :aria-pressed="showUnresolvedOnly"
            >
              <span
                class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform"
                :class="showUnresolvedOnly ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>

          <div class="space-y-2 lg:overflow-y-auto lg:pr-1 lg:min-h-0">
            <button
              v-for="(item, index) in visibleSiblingIssues"
              :key="item.id"
              type="button"
              @click="item.id !== issueId && router.push(`/issues/${item.id}`)"
              class="w-full border border-border p-3 text-left transition-colors"
              :class="[
                item.id === issueId ? 'bg-warning-bg border-primary/40' : 'bg-background hover:bg-card',
                isOutdatedIssue(item) ? 'opacity-60' : '',
              ]"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-mono text-muted-foreground">#{{ index + 1 }}</span>
                    <span
                      v-if="item.source_version_number != null"
                      class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
                    >
                      v{{ item.source_version_number }}
                    </span>
                    <span v-if="item.id === issueId" class="inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-mono text-warning border border-warning/20">
                      {{ t('issueDetail.currentIssue') }}
                    </span>
                  </div>
                  <p class="text-sm font-medium leading-snug" :class="isOutdatedIssue(item) ? 'text-muted-foreground' : 'text-foreground'">{{ item.title }}</p>
                  <div class="flex items-center gap-2 flex-wrap">
                    <StatusBadge :status="item.severity" type="severity" />
                    <StatusBadge :status="item.status" type="issue" />
                  </div>
                </div>
                <span class="text-xs font-mono text-muted-foreground flex-shrink-0">
                  {{ formatTimestamp(item.time_start) }}
                  <template v-if="item.time_end">-{{ formatTimestamp(item.time_end) }}</template>
                </span>
              </div>
            </button>

            <p v-if="visibleSiblingIssues.length === 0" class="rounded-none border border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              {{ t('issueDetail.noVisibleIssues') }}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.issue-detail-fade-enter-active,
.issue-detail-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.issue-detail-fade-enter-from,
.issue-detail-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
