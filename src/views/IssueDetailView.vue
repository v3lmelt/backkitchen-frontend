<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, commentApi, r2Api, uploadToR2, trackApi, API_ORIGIN, resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Comment, EditHistory, Issue, IssueStatus, StageAssignment } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import CommentInput from '@/components/common/CommentInput.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { formatTimestamp, formatTimestampShort, formatLocaleDate, formatDuration } from '@/utils/time'
import { resolveAttachmentReferenceIndex, type MarkerIndexReference, type TimeReference, type TimestampTarget } from '@/utils/timestamps'
import { ArrowDownUp, ChevronLeft, ChevronRight, Music, Pencil, Trash2 } from 'lucide-vue-next'
import { canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const appStore = useAppStore()
const { success: toastSuccess } = useToast()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const allTrackIssues = ref<Issue[]>([])
const loading = ref(true)
const showUnresolvedOnly = ref(false)
const currentSourceVersionNumber = ref<number | null>(null)
const cachedTrack = ref<import('@/types').Track | null>(null)
const reviewAssignments = ref<StageAssignment[]>([])

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
const commentInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const statusNoteInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const issueAudioRefs = new Map<number, HTMLAudioElement>()
const commentAudioRefs = new Map<string, HTMLAudioElement>()

const audioUrl = computed(() => {
  if (!issue.value) return ''
  if (canOpenIssueSourceAudio.value) {
    return `${API_ORIGIN}/api/tracks/${issue.value.track_id}/source-versions/${issue.value.source_version_id}/audio`
  }
  return `${API_ORIGIN}/api/tracks/${issue.value.track_id}/audio?v=${issue.value.source_version_number ?? 0}`
})

function onWaveformReady() {
  seekWaveformToIssue()
}

function seekWaveformToIssue() {
  if (!issue.value || !waveformRef.value) return
  const firstMarker = issue.value.markers[0]
  if (firstMarker) {
    waveformRef.value.seekTo(firstMarker.time_start)
  }
  if (issue.value.markers.some(m => m.marker_type === 'range')) {
    waveformRef.value.highlightIssue(issue.value)
  }
}

// When switching issues with the same audio, the WaveformPlayer persists (no
// new "ready" event). Detect this and seek to the new issue's timestamp.
let prevAudioUrl = audioUrl.value
watch(issueId, () => {
  nextTick(() => {
    const url = audioUrl.value
    if (url && url === prevAudioUrl) {
      seekWaveformToIssue()
    }
    prevAudioUrl = url
  })
})
watch(audioUrl, (url) => { prevAudioUrl = url })
const pendingStatus = ref<IssueStatus | null>(null)

const canSubmitIssueStatus = computed(() => {
  return issue.value != null
    && canUserSubmitIssueStatus(appStore.currentUser?.id, cachedTrack.value, issue.value)
})

const canChangeIssueStatus = computed(() => {
  return issue.value != null
    && canUserChangeIssueStatus(appStore.currentUser?.id, cachedTrack.value, issue.value, reviewAssignments.value)
})

const shouldHideInternalComments = computed(() =>
  Boolean(cachedTrack.value && appStore.currentUser?.id === cachedTrack.value.submitter_id),
)

const commentSortOrder = ref<'desc' | 'asc'>('desc')

const visibleComments = computed(() => {
  const filtered = (issue.value?.comments ?? []).filter(
    comment => !(shouldHideInternalComments.value && comment.visibility === 'internal'),
  )
  if (commentSortOrder.value === 'desc') {
    return [...filtered].reverse()
  }
  return filtered
})


const loadError = ref(false)

async function loadIssue(id: number) {
  const token = ++loadCount
  loading.value = true
  loadError.value = false
  try {
    const fetched = await issueApi.get(id)
    if (token !== loadCount) return
    issue.value = fetched
    if (fetched.track_id !== cachedTrackId) {
      const [all, detail, assignments] = await Promise.all([
        issueApi.listForTrack(fetched.track_id),
        trackApi.get(fetched.track_id),
        trackApi.listAssignments(fetched.track_id).catch(() => []),
      ])
      if (token !== loadCount) return
      allTrackIssues.value = all
      currentSourceVersionNumber.value = detail.track.version
      cachedTrack.value = detail.track
      reviewAssignments.value = assignments
      cachedTrackId = fetched.track_id
    }
  } catch {
    if (token === loadCount) loadError.value = true
  } finally {
    if (token === loadCount) loading.value = false
  }
}

onMounted(() => {
  loadIssue(issueId.value)
  window.addEventListener('keydown', handleKeydown)
})
watch(issueId, (id) => {
  loadIssue(id)
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const siblingIssues = computed(() => {
  if (!issue.value) return []
  const { phase, workflow_cycle } = issue.value
  return allTrackIssues.value
    .filter(i => i.phase === phase && i.workflow_cycle === workflow_cycle)
    .sort((a, b) => (a.markers[0]?.time_start ?? Infinity) - (b.markers[0]?.time_start ?? Infinity))
})

const visibleSiblingIssues = computed(() => {
  if (!showUnresolvedOnly.value) return siblingIssues.value
  return siblingIssues.value.filter(i => i.status !== 'resolved' && i.status !== 'internal_resolved' && i.status !== 'disagreed')
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

async function playTrackReference(reference: TimeReference) {
  if (!waveformRef.value) return
  await waveformRef.value.playFrom(reference.startSeconds)
}

async function playIssueAttachmentReference(reference: TimeReference) {
  const attachmentIndex = resolveAttachmentReferenceIndex(reference, 'attachment', issue.value?.audios?.length ?? 0)
  if (attachmentIndex == null) return

  const audio = issueAudioRefs.get(attachmentIndex)
  if (!audio) return

  audio.currentTime = reference.startSeconds
  await audio.play().catch(() => undefined)
}

async function playCommentAttachmentReference(comment: Comment, reference: TimeReference) {
  const attachmentIndex = resolveAttachmentReferenceIndex(reference, 'attachment', comment.audios?.length ?? 0)
  if (attachmentIndex == null) return

  const audio = commentAudioRefs.get(`${comment.id}:${attachmentIndex}`)
  if (!audio) return

  audio.currentTime = reference.startSeconds
  await audio.play().catch(() => undefined)
}

async function handleIssueDescriptionReference(reference: TimeReference, target: TimestampTarget) {
  if (target === 'attachment') {
    await playIssueAttachmentReference(reference)
    return
  }

  await playTrackReference(reference)
}

async function handleCommentReference(comment: Comment, reference: TimeReference, target: TimestampTarget) {
  if (target === 'attachment') {
    await playCommentAttachmentReference(comment, reference)
    return
  }

  await playTrackReference(reference)
}

function openIssueReference(targetIssueId: number) {
  if (targetIssueId === issueId.value) return
  void router.push(`/issues/${targetIssueId}`)
}

function resolveIssueMarkerReference(reference: MarkerIndexReference) {
  const marker = issue.value?.markers[reference.zeroBasedIndex]
  if (!marker) return null
  return marker
}

async function jumpToIssueMarkerReference(reference: MarkerIndexReference) {
  const marker = resolveIssueMarkerReference(reference)
  if (!marker) return
  if (!waveformRef.value) return

  await waveformRef.value.playFrom(marker.time_start)
}

const submittingComment = ref(false)
const commentUploadProgress = ref(0)

async function handleCommentSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  if (!appStore.currentUser || !issue.value) return
  if (submittingComment.value) return
  submittingComment.value = true
  commentUploadProgress.value = 0
  try {
    let comment: Comment

    if (appStore.r2Enabled && payload.audios.length > 0) {
      const presignedResp = await r2Api.requestCommentAudioUpload(
        issueId.value,
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
      comment = await issueApi.addComment(issueId.value, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audioObjectKeys: presignedResp.uploads.map(u => u.object_key),
        audioOriginalFilenames: payload.audios.map(f => f.name),
      })
    } else {
      comment = await issueApi.addComment(issueId.value, {
        content: payload.content,
        images: payload.images.length ? payload.images : undefined,
        audios: payload.audios.length ? payload.audios : undefined,
      }, (p) => { commentUploadProgress.value = p })
    }

    if (!issue.value.comments) issue.value.comments = []
    issue.value.comments.push(comment)
    commentInputRef.value?.reset()
  } finally {
    submittingComment.value = false
  }
}

// Comment edit/delete
const editingCommentId = ref<number | null>(null)
const editingCommentContent = ref('')
const pendingDeleteComment = ref<Comment | null>(null)

function startEditComment(comment: Comment) {
  editingCommentId.value = comment.id
  editingCommentContent.value = comment.content
}

async function saveEditComment(comment: Comment) {
  const content = editingCommentContent.value.trim()
  if (!content || !issue.value?.comments) return
  try {
    const updated = await commentApi.update(comment.id, content)
    const idx = issue.value.comments.findIndex(c => c.id === comment.id)
    if (idx !== -1) issue.value.comments[idx] = updated
    editingCommentId.value = null
    toastSuccess(t('issueDetail.commentUpdated'))
  } catch { /* handled by request wrapper */ }
}

function promptDeleteComment(comment: Comment) {
  pendingDeleteComment.value = comment
}

async function deleteComment() {
  const comment = pendingDeleteComment.value
  if (!comment || !issue.value?.comments) return
  try {
    await commentApi.delete(comment.id)
    issue.value.comments = issue.value.comments.filter(c => c.id !== comment.id)
    toastSuccess(t('issueDetail.commentDeleted'))
  } catch { /* handled by request wrapper */ }
  finally {
    pendingDeleteComment.value = null
  }
}

// Edit history
const historyItems = ref<EditHistory[]>([])
const showHistoryForCommentId = ref<number | null>(null)

async function showCommentHistory(commentId: number) {
  showHistoryForCommentId.value = commentId
  try {
    historyItems.value = await commentApi.history(commentId)
  } catch { historyItems.value = [] }
}

function closeHistory() {
  showHistoryForCommentId.value = null
  historyItems.value = []
}

function selectStatus(status: IssueStatus) {
  pendingStatus.value = status
  statusNoteInputRef.value?.reset()
}

function availableStatusActions(currentStatus: IssueStatus): IssueStatus[] {
  if (canSubmitIssueStatus.value) {
    if (currentStatus === 'open') return ['resolved', 'disagreed']
    return []
  }

  if (!canChangeIssueStatus.value) return []
  if (currentStatus === 'open') return ['resolved', 'pending_discussion']
  if (currentStatus === 'pending_discussion') return ['open', 'internal_resolved']
  if (currentStatus === 'internal_resolved') return ['open']
  if (currentStatus === 'resolved') return ['open']
  if (currentStatus === 'disagreed') return ['open']
  return []
}

const statusActions = computed<IssueStatus[]>(() => {
  if (!issue.value) return []
  return availableStatusActions(issue.value.status)
})

function statusActionLabel(status: IssueStatus): string {
  if (status === 'open' && (issue.value?.status === 'pending_discussion' || issue.value?.status === 'internal_resolved')) {
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

function statusActionClass(status: IssueStatus): string {
  if (pendingStatus.value === status) {
    if (status === 'resolved') return 'bg-primary text-black'
    if (status === 'internal_resolved') return 'bg-info-bg text-info border border-info/30'
    if (status === 'disagreed') return 'bg-error-bg text-error border border-error/30'
    return 'bg-warning-bg text-warning border border-warning/30'
  }
  return 'bg-card border border-border text-foreground hover:bg-border'
}

const submittingStatusNote = ref(false)
const statusNoteUploadProgress = ref(0)

async function handleStatusNoteSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  if (!issue.value || !pendingStatus.value) return
  submittingStatusNote.value = true
  statusNoteUploadProgress.value = 0
  try {
    issue.value = await issueApi.update(issueId.value, {
      status: pendingStatus.value,
      status_note: payload.content || undefined,
      images: payload.images.length ? payload.images : undefined,
      audios: payload.audios.length ? payload.audios : undefined,
    }, (p) => { statusNoteUploadProgress.value = p })
    const idx = allTrackIssues.value.findIndex(i => i.id === issueId.value)
    if (idx !== -1 && issue.value) allTrackIssues.value[idx] = issue.value
    pendingStatus.value = null
    statusNoteInputRef.value?.reset()
  } finally {
    submittingStatusNote.value = false
  }
}

function cancelStatusChange() {
  pendingStatus.value = null
  statusNoteInputRef.value?.reset()
}

function goBackToTrack() {
  if (!issue.value) return
  router.push({
    path: `/tracks/${issue.value.track_id}`,
    query: { returnTo: route.path },
  })
}

function handleKeydown(e: KeyboardEvent) {
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Space') {
    e.preventDefault()
    waveformRef.value?.togglePlay()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    const t = waveformRef.value?.getCurrentTime() ?? 0
    waveformRef.value?.seekTo(Math.max(0, t - 5))
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    const t = waveformRef.value?.getCurrentTime() ?? 0
    waveformRef.value?.seekTo(t + 5)
  } else if (e.key === 'j' || e.key === 'J') {
    if (prevIssue.value) router.push(`/issues/${prevIssue.value.id}`)
  } else if (e.key === 'k' || e.key === 'K') {
    if (nextIssue.value) router.push(`/issues/${nextIssue.value.id}`)
  }
}

function openVersionCompare() {
  if (!issue.value?.track_id || !issue.value.source_version_id) return
  router.push({
    path: `/tracks/${issue.value.track_id}`,
    query: {
      compareVersion: String(issue.value.source_version_id),
      returnTo: route.path,
    },
  })
}
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>
  <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
    <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
    <button @click="loadIssue(issueId)" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
  </div>
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
        <button @click="goBackToTrack" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 max-w-xs truncate">
          <ChevronLeft class="w-4 h-4 shrink-0" :stroke-width="2" />
          <span class="truncate">{{ cachedTrack?.title || t('issueDetail.back') }}</span>
        </button>
        <div v-if="siblingIssues.length > 1" class="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
            :disabled="!prevIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="prevIssue?.title"
          >
            <ChevronLeft class="w-4 h-4" :stroke-width="2" />
          </button>
          <span class="font-mono text-xs">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
          <button
            @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
            :disabled="!nextIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="nextIssue?.title"
          >
            <ChevronRight class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>
      </div>
      <h1 class="text-2xl font-sans font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
        <span
          v-if="issue.source_version_number != null"
          class="inline-flex items-center rounded-full bg-border px-2 py-1 text-xs font-mono text-foreground"
        >
          v{{ issue.source_version_number }}
        </span>
        <StatusBadge :status="issue.phase" type="phase" />
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span v-if="issue.markers.length === 0" class="text-sm text-muted-foreground italic">{{ t('issue.generalIssue') }}</span>
        <template v-else v-for="(m, mi) in issue.markers" :key="mi">
          <span class="inline-flex items-center gap-1 whitespace-nowrap">
            <span class="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60 select-none">{{ m.marker_type === 'range' ? t('issueType.range') : t('issueType.point') }}</span>
            <span class="text-sm font-mono text-muted-foreground">
              {{ formatTimestamp(m.time_start) }}<span v-if="m.time_end"> – {{ formatTimestamp(m.time_end) }}</span>
            </span>
          </span>
        </template>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Transition name="issue-detail-fade" mode="out-in">
        <div :key="issue.id" class="min-w-0 space-y-6">
          <!-- Waveform -->
          <div class="card overflow-hidden !p-0">
            <div class="px-4 pt-3 pb-2 border-b border-border flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-2 mr-auto">
                <span class="text-xs font-mono font-medium text-muted-foreground">{{ t('issueDetail.audioContext') }}</span>
                <span
                  v-if="displayedAudioVersionNumber != null"
                  class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
                >
                  v{{ displayedAudioVersionNumber }}
                </span>
              </div>
              <template v-if="issue.markers.length > 0">
                <span
                  v-for="(m, mi) in issue.markers"
                  :key="mi"
                  class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-mono text-muted-foreground"
                >
                  <span
                    v-if="m.marker_type === 'point'"
                    class="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"
                  />
                  <span
                    v-else
                    class="h-[3px] w-2.5 rounded-full bg-primary flex-shrink-0"
                  />
                  {{ formatTimestampShort(m.time_start) }}<span v-if="m.time_end" class="opacity-50 mx-0.5">–</span><span v-if="m.time_end">{{ formatTimestampShort(m.time_end) }}</span>
                </span>
              </template>
              <span v-else class="text-xs text-muted-foreground italic">{{ t('issue.generalIssue') }}</span>
            </div>
            <WaveformPlayer
              ref="waveformRef"
              :audio-url="audioUrl"
              :issues="waveformIssues"
              :track-id="issue.track_id"
              :height="120"
              @ready="onWaveformReady"
            />
            <div class="border-t border-border px-4 py-2 flex items-center justify-between gap-4">
              <div v-if="issueIsOutdated" class="text-xs text-muted-foreground">
                {{ t(canOpenIssueSourceAudio ? 'issueDetail.outdatedWaveformHint' : 'issueDetail.outdatedWaveformUnavailable') }}
              </div>
              <div v-else class="flex-1" />
              <span class="text-[11px] font-mono text-muted-foreground/50 whitespace-nowrap hidden sm:block select-none">{{ t('issueDetail.keyboardHint') }}</span>
            </div>
          </div>
        <!-- Description -->
        <div class="card">
          <TimestampText
            :text="issue.description"
            :issues="allTrackIssues"
            class="text-sm text-foreground"
            @activate="(reference, target) => handleIssueDescriptionReference(reference, target)"
            @markerActivate="(reference) => jumpToIssueMarkerReference(reference)"
            @issueActivate="(reference) => openIssueReference(reference.issueId)"
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
                  style="accent-color: #FF8400;"
                />
              </div>
            </div>
          </div>
          <div class="text-xs text-muted-foreground mt-3">
            {{ t('issueDetail.created', { date: fmtDate(issue.created_at) }) }}
          </div>
        </div>

        <!-- Status Actions -->
        <div class="space-y-3">
          <div v-if="statusActions.length" class="flex gap-2 flex-wrap">
            <button
              v-for="status in statusActions"
              :key="`status-${status}`"
              @click="selectStatus(status)"
              class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
              :class="statusActionClass(status)"
            >
              {{ statusActionLabel(status) }}
            </button>
          </div>
          <div v-if="pendingStatus" class="space-y-2">
            <CommentInput
              ref="statusNoteInputRef"
              :placeholder="t('issue.statusNotePlaceholder')"
              :submit-label="t('common.confirm')"
              :submitting="submittingStatusNote"
              :upload-progress="statusNoteUploadProgress"
              enable-audio
              enable-timestamp-popover
              timestamp-default-target="track"
              @submit="handleStatusNoteSubmit"
            />
            <button @click="cancelStatusChange" class="btn-secondary text-sm">
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>

        <!-- Comments -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-sans font-semibold text-foreground">
              {{ t('issueDetail.commentsHeading', { count: visibleComments.length }) }}
            </h3>
            <button
              v-if="visibleComments.length > 1"
              @click="commentSortOrder = commentSortOrder === 'desc' ? 'asc' : 'desc'"
              class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowDownUp class="w-3.5 h-3.5" />
              {{ commentSortOrder === 'desc' ? t('issueDetail.sortNewestFirst') : t('issueDetail.sortOldestFirst') }}
            </button>
          </div>

          <p v-if="!visibleComments.length" class="text-sm text-muted-foreground italic">
            {{ t('issueDetail.commentsEmptyHint') }}
          </p>

          <template v-for="comment in visibleComments" :key="comment.id">
            <div v-if="comment.is_status_note" class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2">
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span class="text-xs font-semibold text-warning">{{ t('issue.revisionNote') }}</span>
                <template v-if="comment.old_status && comment.new_status">
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
                  :issues="allTrackIssues"
                  class="text-sm text-foreground"
                  :default-target="comment.audios?.length ? 'attachment' : 'track'"
                  @activate="(reference, target) => handleCommentReference(comment, reference, target)"
                  @markerActivate="(reference) => jumpToIssueMarkerReference(reference)"
                  @issueActivate="(reference) => openIssueReference(reference.issueId)"
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
                    class="h-20 w-20 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                    alt="attachment"
                  />
                </a>
              </div>
              <div v-if="comment.audios && comment.audios.length" class="flex flex-col gap-2 mt-2">
                <div
                  v-for="(audio, index) in comment.audios"
                  :key="audio.id"
                  class="bg-background/50 border border-border rounded-2xl px-4 py-3 space-y-2"
                >
                  <div class="flex items-center gap-2">
                    <Music class="w-4 h-4 text-primary flex-shrink-0" :stroke-width="2" />
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
                <span
                  v-if="comment.visibility === 'internal'"
                  class="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-mono text-info"
                >{{ t('issueDetail.internalCommentBadge') }}</span>
                <button
                  v-if="comment.edited_at"
                  class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="showCommentHistory(comment.id)"
                >
                  ({{ t('editHistory.edited') }})
                </button>
                <template v-if="comment.author_id === appStore.currentUser?.id && !comment.is_status_note">
                  <button @click="startEditComment(comment)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                    <Pencil class="w-3.5 h-3.5" :stroke-width="2" />
                  </button>
                  <button @click="promptDeleteComment(comment)" class="text-muted-foreground hover:text-error transition-colors">
                    <Trash2 class="w-3.5 h-3.5" :stroke-width="2" />
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
                :issues="allTrackIssues"
                class="text-sm text-foreground"
                :default-target="comment.audios?.length ? 'attachment' : 'track'"
                @activate="(reference, target) => handleCommentReference(comment, reference, target)"
                @markerActivate="(reference) => jumpToIssueMarkerReference(reference)"
                @issueActivate="(reference) => openIssueReference(reference.issueId)"
              />
              <div v-if="comment.images && comment.images.length" class="flex flex-wrap gap-2 mt-3">
                <a
                  v-for="img in comment.images"
                  :key="img.id"
                  :href="resolveAssetUrl(img.image_url)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    :src="resolveAssetUrl(img.image_url)"
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
                    <Music class="w-4 h-4 text-primary flex-shrink-0" :stroke-width="2" />
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

          <!-- New Comment -->
          <p
            v-if="issue?.status === 'pending_discussion' || issue?.status === 'internal_resolved'"
            class="rounded-none border border-info/30 bg-info-bg px-3 py-2 text-xs text-info"
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
      </Transition>

      <aside class="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-3rem)] lg:flex lg:flex-col">
        <div class="card space-y-4 lg:flex lg:flex-col lg:overflow-hidden">
          <div class="flex items-center justify-between gap-3 shrink-0">
            <h3 class="text-sm font-sans font-semibold text-foreground">
              {{ t('issueDetail.issueList', { count: visibleSiblingIssues.length }) }}
            </h3>
            <div class="flex items-center gap-1 text-muted-foreground">
              <button
                @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
                :disabled="!prevIssue"
                class="p-0.5 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                :title="prevIssue?.title"
              >
                <ChevronLeft class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
              <span class="text-xs font-mono">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
              <button
                @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
                :disabled="!nextIssue"
                class="p-0.5 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                :title="nextIssue?.title"
              >
                <ChevronRight class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
            </div>
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
                <p class="text-sm font-medium leading-snug break-words" :class="isOutdatedIssue(item) ? 'text-muted-foreground' : 'text-foreground'">{{ item.title }}</p>
                <div class="flex items-center gap-2 flex-wrap">
                  <StatusBadge :status="item.severity" type="severity" />
                  <StatusBadge :status="item.status" type="issue" />
                </div>
                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-mono text-muted-foreground">
                  <template v-if="item.markers.length === 0">
                    <span class="italic">{{ t('issue.generalIssue') }}</span>
                  </template>
                  <template v-else v-for="(m, mi) in item.markers" :key="mi">
                    <span v-if="mi > 0" class="opacity-50">·</span>
                    <span class="whitespace-nowrap">{{ formatTimestampShort(m.time_start) }}<template v-if="m.time_end">-{{ formatTimestampShort(m.time_end) }}</template></span>
                  </template>
                </div>
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

  <EditHistoryModal
    v-if="showHistoryForCommentId !== null"
    :items="historyItems"
    @close="closeHistory"
  />

  <ConfirmModal
    v-if="pendingDeleteComment"
    :title="t('issueDetail.deleteCommentTitle')"
    :message="t('issueDetail.deleteCommentConfirm')"
    :confirm-text="t('common.delete')"
    :destructive="true"
    @confirm="deleteComment"
    @cancel="pendingDeleteComment = null"
  />
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
