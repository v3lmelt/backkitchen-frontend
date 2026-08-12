<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, r2Api, uploadToR2, masterDeliveryAudioUrl, trackAudioUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import { useTrackDetail } from '@/composables/useTrackDetail'
import type {
  Track, MasterDelivery,
  Issue, TrackSourceVersion, WorkflowTransitionOption,
} from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { extractAudioDuration } from '@/utils/audio'
import { externalComposerDisplayText, isComposerActor, trackArtistDisplay as trackArtistDisplayFor } from '@/utils/trackComposers'
import { actionTypeForTransition, stepIsMasteringRelated, translateWorkflowDecision } from '@/utils/workflow'
import { historicalDeliveryDownloadSuffix } from '@/utils/sourceVersions'
import { useWaveformHotkeys } from '@/composables/useWaveformHotkeys'
import { useIssueDrawer } from '@/composables/useIssueDrawer'
import { useIssueMutations } from '@/composables/useIssueMutations'
import { useBatchIssueActions } from '@/composables/useBatchIssueActions'
import { activeAssignmentsForStep, canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import IssueDetailPanel from '@/components/IssueDetailPanel.vue'
import WorkflowActionBar from '@/components/workflow/WorkflowActionBar.vue'
import type { WorkflowAction } from '@/components/workflow/WorkflowActionBar.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import DiscussionPanel from '@/components/common/DiscussionPanel.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useDiscussions } from '@/composables/useDiscussions'
import { useDiscussionRealtime } from '@/composables/useDiscussionRealtime'
import { useDualWaveformPreview } from '@/composables/useDualWaveformPreview'
import { useToast } from '@/composables/useToast'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { useWorkflowTransition } from '@/composables/useWorkflowTransition'
import { useVersionCompare } from '@/composables/useVersionCompare'
import { ChevronLeft, ChevronDown, Upload, Check, Copy, ExternalLink } from 'lucide-vue-next'
import { MAX_AUDIO_SIZE } from '@/utils/uploadLimits'
import { FALLBACK_ISSUE_PHASES } from '@/utils/issueStatus'
import {
  canUserApproveFinal,
  canViewerSeeMastering,
  resolveStepAssigneeUserId,
  reviewAllowsInternalIssueVisibility as stepAllowsInternalIssueVisibility,
  viewerCanManageTrackAlbum as viewerCanManageTrackAlbumOf,
  viewerIsStepAssignee,
} from '@/utils/trackPermissions'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const { success: toastSuccess, error: toastError } = useToast()

const trackId = computed(() => Number(route.params.id))
const {
  track,
  masterDeliveries,
  workflowConfig,
  issues,
  mentionCandidates,
  sourceVersions,
  reviewAssignments,
  loading,
  loadError,
  load: loadData,
} = useTrackDetail(trackId, {
  onDetailApplied: () => {
    syncIssueDrawerFromRoute()
  },
})
const actionError = ref('')

const {
  acting,
  transitions,
  revisionTypeModalOpen,
  selectedRevisionType,
  executeTransition,
  confirmRevisionType,
} = useWorkflowTransition({
  trackId,
  track,
  workflowConfig,
  error: actionError,
  reload: loadData,
  navigateToTrackDetail: () => pushToTrackDetail(),
})

const {
  showSourceCompare,
  selectedCompareSourceVersionId,
  olderPlayableSourceVersions,
  sourceCompareOptions,
  isSourceCompareActive,
  displayedSourceVersionNumber,
  toggleSourceCompare,
  filterIssuesForDisplayedSourceVersion,
  showMasterCompare,
  selectedCompareMasterDeliveryId,
  masterAudioUrl,
  sortedMasterDeliveries,
  olderPlayableMasterDeliveries,
  masterCompareOptions,
  selectedCompareMasterAudioUrl,
  masterDeliveryOptionLabel,
  toggleMasterCompare,
  compareWithMasterDelivery,
} = useVersionCompare({ trackId, track, sourceVersions, masterDeliveries })

// Mastering notes editing
const editingMasteringNotes = ref(false)
const masteringNotesForm = ref('')
const savingMasteringNotes = ref(false)
const masteringNotesExpanded = ref(false)
const masteringDiscussion = useDiscussions(trackId, 'mastering', { paginated: true })
const { subscribe: subscribeDiscussionRealtime, dispatch: dispatchDiscussionEvent } = useDiscussionRealtime()
subscribeDiscussionRealtime((event, discussionId) => {
  void masteringDiscussion.applyRealtimeEvent(event, discussionId)
})

// Tabs
type MasteringTabKey = 'discussion' | 'listen' | 'issues' | 'delivery'

const activeTab = ref<MasteringTabKey>('discussion')
const masteringTabs = computed(() => [
  ...(canSeeMasteringDiscussion.value
    ? [{ key: 'discussion' as const, label: t('masteringPage.tabs.discussion') }]
    : []),
  { key: 'listen' as const, label: t('masteringPage.tabs.listen') },
  { key: 'issues' as const, label: t('masteringPage.tabs.issues') },
  { key: 'delivery' as const, label: t('masteringPage.tabs.delivery') },
])

// Collapsible version history
const versionHistoryExpanded = ref(false)

// Issues / waveform annotation
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const hoveredIssueId = ref<number | null>(null)
const selectedIssue = ref<Issue | null>(null)
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const masterWaveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const {
  onSourceWaveformReady,
  onSourceWaveformTimeUpdate,
  onSourceWaveformPlaybackStateChange,
  onMasterWaveformReady,
  onMasterWaveformTimeUpdate,
  onMasterWaveformPlaybackStateChange,
  selectedIssuePreview,
  handleIssuePreviewPlayAt,
  handleIssuePreviewAction,
} = useDualWaveformPreview({
  selectedIssue,
  sourceWaveformRef: waveformRef,
  masterWaveformRef,
})
const selectedStageIssueIds = ref<number[]>([])
const stageBatchNote = ref('')
const isIssueFormOpen = ref(false)
const waveformMode = computed<'seek' | 'annotate'>(() =>
  activeTab.value === 'issues' && isIssueFormOpen.value ? 'annotate' : 'seek',
)
// The source waveform (and its toolbar/compare controls) is shared between
// the Listen and Issues tabs so switching between them doesn't re-decode the
// audio. These flags let the template stay readable.
const isListenTab = computed(() => activeTab.value === 'listen')
const isSharedSourceWaveformTab = computed(
  () => activeTab.value === 'listen' || activeTab.value === 'issues',
)
const sharedSourceWaveformHeading = computed(() =>
  activeTab.value === 'issues' ? t('mastering.waveformHint') : t('mastering.listenOnlyHint'),
)

// Delivery upload
const uploadFile = ref<File | null>(null)
const deliveryMessage = ref('')
const localDeliveryPreviewUrl = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')

// Computed
const isSubmitter = computed(() => isComposerActor(track.value, appStore.currentUser?.id))
const isMasteringEngineer = computed(() => track.value?.mastering_engineer_id === appStore.currentUser?.id)
const isProxySubmission = computed(() => Boolean(track.value?.is_proxy_submission && track.value.external_submitter_name))
const viewerCanManageTrackAlbum = computed(() =>
  viewerCanManageTrackAlbumOf(track.value, appStore.currentUser),
)
const composerApprovalLabel = computed(() =>
  isProxySubmission.value ? t('trackDetail.externalSubmitterProxy') : t('trackDetail.composers')
)
const trackArtistDisplay = computed(() => trackArtistDisplayFor(track.value))
const canSeeMasteringDiscussion = computed(() =>
  canViewerSeeMastering(track.value, appStore.currentUser?.id, viewerCanManageTrackAlbum.value),
)

watch(canSeeMasteringDiscussion, (canSee) => {
  if (!track.value) return
  if (!canSee && activeTab.value === 'discussion') {
    activeTab.value = 'listen'
  }
})

const currentStep = computed(() => track.value?.workflow_step ?? null)
const isDeliveryAssignee = computed(() => {
  const step = currentStep.value
  if (!track.value || !step || step.type !== 'delivery') return false
  return viewerIsStepAssignee(track.value, step, appStore.currentUser?.id, viewerCanManageTrackAlbum.value)
})
const canApproveFinal = computed(() =>
  canUserApproveFinal(track.value, appStore.currentUser?.id, viewerCanManageTrackAlbum.value),
)

function canCurrentUserContinueInMasteringWorkspace(nextTrack: Track): boolean {
  const step = nextTrack.workflow_step
  const userId = appStore.currentUser?.id
  if (!step || !userId) return false

  const isMasteringStep = stepIsMasteringRelated(step)
  if (isMasteringStep && step.type === 'delivery') {
    return resolveStepAssigneeUserId(nextTrack, step) === userId
  }

  const isFinalReview = step.ui_variant === 'final_review' || step.id === 'final_review'
  if (!isFinalReview || step.type !== 'approval') return false

  const delivery = nextTrack.current_master_delivery
  if (!delivery?.confirmed_at) return false
  if (viewerCanManageTrackAlbumOf(nextTrack, appStore.currentUser)) return !delivery.producer_approved_at
  if (isComposerActor(nextTrack, userId)) return !delivery.submitter_approved_at
  return false
}

function shouldStayOnMasteringWorkspace(previousStatus: string, nextTrack: Track): boolean {
  if (nextTrack.status === previousStatus) return true
  if (nextTrack.status === 'completed' || nextTrack.status === 'rejected') return false
  return canCurrentUserContinueInMasteringWorkspace(nextTrack)
}

function pushToTrackDetail() {
  router.push(`/tracks/${trackId.value}`)
}

// Source audio
const audioUrl = computed(() =>
  track.value?.file_path ? trackAudioUrl(trackId.value, track.value.version ?? 0) : '',
)
const currentExternalSourceVersion = computed<TrackSourceVersion | null>(() => {
  const current = track.value?.current_source_version
  if (!current || current.source_kind !== 'external_link') return null
  const fullVersion = sourceVersions.value.find(version => version.id === current.id)
  const revisionNotes = (fullVersion?.revision_notes ?? current.revision_notes ?? '').trim()
  if (!revisionNotes) return null
  return {
    ...current,
    ...fullVersion,
    revision_notes: revisionNotes,
  }
})
const currentExternalSourceNotes = computed(() => currentExternalSourceVersion.value?.revision_notes?.trim() ?? '')
const currentExternalSourceUrl = computed(() => extractFirstUrl(currentExternalSourceNotes.value))

function extractFirstUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return ''
  let url = match[0]
  while (url.length > 0 && '.,;:!?)'.includes(url[url.length - 1])) {
    url = url.slice(0, -1)
  }
  return url
}

function openExternalSourceUrl() {
  if (!currentExternalSourceUrl.value) return
  window.open(currentExternalSourceUrl.value, '_blank', 'noopener,noreferrer')
}

async function copyExternalSourceNotes() {
  if (!currentExternalSourceNotes.value) return
  try {
    await navigator.clipboard.writeText(currentExternalSourceNotes.value)
    toastSuccess(t('masteringPage.stemHandoffCopied'))
  } catch {
    toastError(t('common.error'))
  }
}

// Issues
const fallbackStepIssues = computed(() => issues.value.filter(i => (FALLBACK_ISSUE_PHASES as readonly string[]).includes(i.phase)))
const fallbackWaveformIssues = computed(() => filterIssuesForDisplayedSourceVersion(fallbackStepIssues.value))
const masteringWaveformIssues = computed(() =>
  issues.value.filter(i => i.phase === 'mastering'),
)
const waveformIssues = computed(() => filterIssuesForDisplayedSourceVersion(masteringWaveformIssues.value))
const finalReviewIssues = computed(() => {
  const deliveryId = track.value?.current_master_delivery?.id ?? null
  if (!deliveryId) return []
  return issues.value.filter(i => i.phase === 'final_review' && i.master_delivery_id === deliveryId)
})

// Review assignments
const currentStepAssignments = computed(() => activeAssignmentsForStep(reviewAssignments.value, currentStep.value?.id))
const reviewAllowsInternalIssueVisibility = computed(() =>
  stepAllowsInternalIssueVisibility(currentStep.value, currentStepAssignments.value.length),
)

// Workflow transitions
function transitionLabel(transition: WorkflowTransitionOption) {
  return translateWorkflowDecision(transition.decision, workflowConfig.value, t, undefined, transition.label)
}

const deliveryActions = computed<WorkflowAction[]>(() => {
  const actions = transitions.value.map((tr) => ({
    label: transitionLabel(tr),
    type: actionTypeForTransition(tr),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  }))
  if (canConfirmDelivery.value) {
    actions.unshift({
      label: t('masteringPage.confirmDelivery'),
      type: 'advance' as const,
      disabled: acting.value,
      handler: handleConfirmDelivery,
    })
  }
  return actions
})

// Batch issue actions
const stageBatchIssueList = computed(() => fallbackWaveformIssues.value)

function canCurrentUserChangeIssueStatus(issue: Issue): boolean {
  return canUserChangeIssueStatus(appStore.currentUser?.id, track.value, issue, reviewAssignments.value)
}

function canCurrentUserSubmitIssueStatus(issue: Issue): boolean {
  return canUserSubmitIssueStatus(appStore.currentUser?.id, track.value, issue)
}

const {
  batchUpdatingIssues,
  intersectBatchActions,
  applyBatchIssueStatusChange: applyBatchStatusChange,
} = useBatchIssueActions({
  trackId,
  issues,
  selectedIssue,
  canSubmitStatus: canCurrentUserSubmitIssueStatus,
  canChangeStatus: canCurrentUserChangeIssueStatus,
})

const selectedStageIssues = computed(() =>
  stageBatchIssueList.value.filter(issue => selectedStageIssueIds.value.includes(issue.id)),
)
const stageBatchActions = computed(() => intersectBatchActions(selectedStageIssues.value))

const canUploadDelivery = computed(() => currentStep.value?.type === 'delivery' && isDeliveryAssignee.value)
const canSubmitDelivery = computed(() => Boolean(uploadFile.value))

const { downloading, downloadProgress, downloadTrackAudio, downloadAudioAsset } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)
const handleMasterDownload = () => downloadTrackAudio(masterAudioUrl, track, '_master')

// WebSocket
const wsReloading = ref(false)
const wsHadConnection = ref(false)
const { connected: wsConnected, reconnectAttempts: wsReconnectAttempts, retry: wsRetry } = useTrackWebSocket(trackId, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadData()
  wsReloading.value = false
}, {
  onDiscussionEvent: dispatchDiscussionEvent,
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

onMounted(loadData)
onMounted(() => { masteringDiscussion.load() })
onMounted(() => {
  window.addEventListener('keydown', handleWaveformHotkeys)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWaveformHotkeys)
  resetDeliveryPreview()
})

onBeforeRouteLeave(() => {
  if (!uploading.value && !uploadFile.value && !deliveryMessage.value.trim()) return true
  return window.confirm(t('workflowStep.leaveUploadConfirm'))
})

function goBack() {
  const returnTo = route.query.returnTo
  if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
    router.push(returnTo)
  } else {
    router.push(`/tracks/${trackId.value}`)
  }
}

// Mastering notes
function startEditMasteringNotes() {
  masteringNotesForm.value = track.value?.mastering_notes ?? ''
  editingMasteringNotes.value = true
}

async function saveMasteringNotes() {
  if (!track.value) return
  savingMasteringNotes.value = true
  try {
    const updated = await trackApi.updateMasteringNotes(track.value.id, masteringNotesForm.value.trim() || null)
    track.value = { ...track.value, mastering_notes: updated.mastering_notes }
    editingMasteringNotes.value = false
    toastSuccess(t('trackDetail.notesSaved'))
  } catch {
    toastError(t('common.error'))
  } finally {
    savingMasteringNotes.value = false
  }
}

// Delivery upload
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > MAX_AUDIO_SIZE) {
    toastError(t('workflowStep.fileTooLarge'))
    input.value = ''
    return
  }
  uploadFile.value = file
  resetDeliveryPreview()
  localDeliveryPreviewUrl.value = URL.createObjectURL(file)
}

function resetDeliveryPreview() {
  if (localDeliveryPreviewUrl.value) {
    URL.revokeObjectURL(localDeliveryPreviewUrl.value)
    localDeliveryPreviewUrl.value = ''
  }
}

async function handleUploadDelivery() {
  if (!track.value || !canSubmitDelivery.value) return
  const file = uploadFile.value
  if (!file) return
  const previousStatus = track.value.status
  const message = deliveryMessage.value.trim()
  uploading.value = true
  uploadProgress.value = 0
  uploadError.value = ''
  try {
    let updatedTrack: Track
    if (file && appStore.r2Enabled) {
      const [presigned, duration] = await Promise.all([
        r2Api.requestMasterDeliveryUpload(trackId.value, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (p) => {
        uploadProgress.value = p
      })
      updatedTrack = await r2Api.confirmMasterDeliveryUpload(trackId.value, {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
        delivery_message: message || null,
      })
    } else {
      updatedTrack = await trackApi.uploadMasterDelivery(trackId.value, {
        file,
        deliveryMessage: message || null,
      }, (p) => {
        uploadProgress.value = p
      })
    }
    uploadFile.value = null
    deliveryMessage.value = ''
    resetDeliveryPreview()
    toastSuccess(t('workflowStep.deliveryUploaded'))
    if (!shouldStayOnMasteringWorkspace(previousStatus, updatedTrack)) {
      pushToTrackDetail()
      return
    }
    track.value = updatedTrack
    await loadData()
  } catch (err: any) {
    uploadError.value = err.message || t('workflowStep.uploadFailed')
  } finally {
    uploading.value = false
  }
}

// Approve final
async function handleApproveFinal() {
  if (!track.value) return
  const previousStatus = track.value.status
  try {
    const updated = await trackApi.approveFinalReview(track.value.id)
    if (!shouldStayOnMasteringWorkspace(previousStatus, updated)) {
      toastSuccess(t('masteringPage.approved'))
      pushToTrackDetail()
      return
    }
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.approved'))
  } catch {
    toastError(t('common.error'))
  }
}

// Confirm delivery
async function handleConfirmDelivery() {
  if (!track.value?.current_master_delivery || !track.value) return
  const previousStatus = track.value.status
  try {
    const updated = await trackApi.confirmDelivery(track.value.id, track.value.current_master_delivery.id)
    if (!shouldStayOnMasteringWorkspace(previousStatus, updated)) {
      toastSuccess(t('masteringPage.deliveryConfirmed'))
      pushToTrackDetail()
      return
    }
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.deliveryConfirmed'))
  } catch {
    toastError(t('common.error'))
  }
}

const canConfirmDelivery = computed(() => {
  if (currentStep.value?.type !== 'delivery' || !currentStep.value.require_confirmation) return false
  if (!track.value?.current_master_delivery) return false
  if (track.value.current_master_delivery.confirmed_at) return false
  return isDeliveryAssignee.value
})

// Issue handlers
const {
  syncIssueDrawerFromRoute,
  onIssueSelect,
  closeIssueDrawer,
} = useIssueDrawer({ issues, selectedIssue })

const { onIssueUpdated, onQuickIssueStatusChange } = useIssueMutations({ issues, selectedIssue })

function openLinkedIssue(issueId: number) {
  const localIssue = issues.value.find(issue => issue.id === issueId)
  if (localIssue) {
    onIssueSelect(localIssue)
    return
  }

  void router.push(`/issues/${issueId}`)
}

function onIssueCreated(issue: Issue) {
  issues.value.push(issue)
}

function handleIssueHover(issue: Issue) {
  hoveredIssueId.value = issue.id
}

function handleIssueLeave() {
  hoveredIssueId.value = null
}

function onRequestWaveformMode(next: 'seek' | 'annotate') {
  if (next === 'annotate' && isSourceCompareActive.value) return
  isIssueFormOpen.value = next === 'annotate'
}

// Batch issue actions
function applyBatchIssueStatusChange(status: Issue['status']) {
  return applyBatchStatusChange(selectedStageIssues.value, selectedStageIssueIds, stageBatchNote, status)
}

// Waveform hotkeys
const { handleWaveformHotkeys } = useWaveformHotkeys({ issueFormRef, waveformRef })

watch(isSourceCompareActive, (active) => {
  if (!active) return
  isIssueFormOpen.value = false
  hoveredIssueId.value = null
})

watch(() => route.query.issue, () => {
  syncIssueDrawerFromRoute()
})

watch([stageBatchIssueList], ([issuesList]) => {
  const validIds = new Set(issuesList.map(issue => issue.id))
  selectedStageIssueIds.value = selectedStageIssueIds.value.filter(id => validIds.has(id))
  if (selectedStageIssueIds.value.length === 0) stageBatchNote.value = ''
})

function handleMasterVersionDownload(delivery: MasterDelivery) {
  if (!delivery.file_path) return
  const url = masterDeliveryAudioUrl(trackId.value, delivery.id, delivery.delivery_number, delivery.workflow_cycle)
  const historySuffix = historicalDeliveryDownloadSuffix(delivery, track.value?.workflow_cycle)
  downloadAudioAsset(url, `${track.value?.title ?? 'track'}_master_v${delivery.delivery_number}${historySuffix}`, delivery.file_path)
}

watch(activeTab, (newTab) => {
  // Source compare drives the shared waveform that survives Listen ⇄ Issues.
  // Keep it alive across those two tabs so we don't drop the decoded compare
  // buffer; reset only when leaving the shared-waveform tabs entirely.
  if (newTab !== 'listen' && newTab !== 'issues') {
    showSourceCompare.value = false
    selectedCompareSourceVersionId.value = null
  }
  showMasterCompare.value = false
  selectedCompareMasterDeliveryId.value = null
  isIssueFormOpen.value = false
})
</script>

<template>
  <BaseModal
    v-if="revisionTypeModalOpen"
    @close="revisionTypeModalOpen = false"
    max-width="max-w-lg"
  >
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-mono font-bold text-foreground">
          {{ t('workflowStep.selectRevisionType') }}
        </h3>
        <p class="text-sm text-muted-foreground mt-2">
          {{ t('workflowStep.selectRevisionTypeDesc') }}
        </p>
      </div>

      <div class="space-y-3">
        <label
          class="flex items-start gap-3 p-4 border rounded-none cursor-pointer transition-colors"
          :class="selectedRevisionType === 'source_audio'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/30'"
        >
          <input
            type="radio"
            value="source_audio"
            v-model="selectedRevisionType"
            class="mt-1"
          />
          <span class="flex-1">
            <span class="block text-sm font-mono font-semibold text-foreground">
              {{ t('workflowStep.revisionTypeSourceAudio') }}
            </span>
            <span class="block text-xs text-muted-foreground mt-1">
              {{ t('workflowStep.revisionTypeSourceAudioDesc') }}
            </span>
          </span>
        </label>

        <label
          class="flex items-start gap-3 p-4 border rounded-none cursor-pointer transition-colors"
          :class="selectedRevisionType === 'stem_files'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/30'"
        >
          <input
            type="radio"
            value="stem_files"
            v-model="selectedRevisionType"
            class="mt-1"
          />
          <span class="flex-1">
            <span class="block text-sm font-mono font-semibold text-foreground">
              {{ t('workflowStep.revisionTypeStemFiles') }}
            </span>
            <span class="block text-xs text-muted-foreground mt-1">
              {{ t('workflowStep.revisionTypeStemFilesDesc') }}
            </span>
          </span>
        </label>
      </div>

      <div class="flex gap-2">
        <button @click="confirmRevisionType" class="btn-primary flex-1">
          {{ t('common.confirm') }}
        </button>
        <button @click="revisionTypeModalOpen = false" class="btn-secondary flex-1">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </BaseModal>

  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>
  <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
    <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
    <button @click="loadData" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
  </div>
  <div v-else-if="track" class="max-w-4xl mx-auto min-h-full flex flex-col">
  <div class="space-y-6">
    <!-- WebSocket disconnect banner -->
    <div
      v-if="wsHadConnection && !wsConnected"
      class="flex items-center justify-between gap-3 px-4 py-2.5 bg-warning-bg border border-warning/30 text-warning text-sm font-mono"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0"></span>
        <span class="truncate">{{ wsReconnectAttempts > 0 ? t('trackDetail.liveReconnecting', { n: wsReconnectAttempts }) : t('trackDetail.liveDisconnected') }}</span>
      </div>
      <button @click="wsRetry" class="text-xs font-mono text-warning underline underline-offset-2 hover:no-underline flex-shrink-0">
        {{ t('trackDetail.liveRetryNow') }}
      </button>
    </div>

    <!-- ① Header (compact) -->
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" :label="track.workflow_step?.label ?? null" />
          <span v-if="wsConnected" class="inline-flex items-center gap-1.5 text-xs text-success font-mono">
            <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
            {{ t('trackDetail.live') }}
          </span>
        </div>
        <h1 class="text-xl sm:text-2xl font-mono font-bold text-foreground">{{ t('masteringPage.heading') }}</h1>
        <p class="text-sm text-muted-foreground">{{ track.title }} · {{ trackArtistDisplay }}</p>
        <p v-if="isProxySubmission" class="mt-1 text-xs text-muted-foreground">
          {{ t('trackDetail.externalComposers') }}: {{ externalComposerDisplayText(track) }} · {{ t('trackDetail.composerProxyActor') }}: {{ track.proxy_uploader?.display_name ?? track.submitter?.display_name ?? '--' }}
        </p>
      </div>
      <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start flex items-center gap-1.5">
        <ChevronLeft class="w-4 h-4" :stroke-width="2" />
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <!-- ② Mastering Notes (collapsible, default collapsed) -->
    <div class="card">
      <button
        class="w-full flex items-center justify-between"
        @click="masteringNotesExpanded = !masteringNotesExpanded"
      >
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.masteringNotes') }}</h3>
        <ChevronDown
          class="w-4 h-4 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': masteringNotesExpanded }"
          :stroke-width="2"
        />
      </button>
      <div v-if="masteringNotesExpanded" class="mt-3 space-y-3">
        <template v-if="editingMasteringNotes">
          <textarea v-model="masteringNotesForm" class="textarea-field w-full" rows="3" :placeholder="t('trackDetail.masteringNotesPlaceholder')"></textarea>
          <div class="flex gap-2">
            <button @click="saveMasteringNotes" :disabled="savingMasteringNotes" class="btn-primary text-xs px-3 py-1.5">{{ t('common.save') }}</button>
            <button @click="editingMasteringNotes = false" class="btn-secondary text-xs px-3 py-1.5">{{ t('common.cancel') }}</button>
          </div>
        </template>
        <template v-else>
          <p v-if="track.mastering_notes" class="text-sm text-muted-foreground whitespace-pre-wrap">{{ track.mastering_notes }}</p>
          <button v-if="isSubmitter" @click="startEditMasteringNotes" class="text-xs text-primary hover:text-primary-hover font-mono">
            {{ t('common.edit') }}
          </button>
        </template>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="actionError" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ actionError }}
    </div>

    <!-- Tab bar -->
    <div class="flex gap-0 border-b border-border overflow-x-auto scrollbar-hide">
      <button
        v-for="tab in masteringTabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0"
        :class="activeTab === tab.key
          ? 'text-foreground border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ═══ Tab: Listen ═══ -->
    <template v-if="activeTab === 'discussion'">
      <div id="mastering-discussion" class="space-y-4">
        <div v-if="track.mastering_notes" class="card border border-primary/20 bg-primary/5 space-y-2">
          <div class="text-xs font-mono text-primary">{{ t('masteringCommunication.masteringNotes') }}</div>
          <p class="text-sm text-foreground whitespace-pre-wrap">{{ track.mastering_notes }}</p>
        </div>

        <div v-if="canSeeMasteringDiscussion && currentExternalSourceVersion" class="card space-y-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.stemHandoffTitle') }}</h3>
                <span class="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-mono text-info">
                  {{ t('workflowStep.externalSourceVersionLabel') }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ t('masteringPage.stemHandoffMeta', {
                  version: currentExternalSourceVersion.version_number,
                  date: fmtDate(currentExternalSourceVersion.created_at),
                }) }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="currentExternalSourceUrl"
                type="button"
                class="btn-secondary inline-flex items-center gap-2 text-xs px-3 py-1.5"
                @click="openExternalSourceUrl"
              >
                <ExternalLink class="h-3.5 w-3.5" :stroke-width="2" />
                {{ t('masteringPage.openStemHandoff') }}
              </button>
              <button
                type="button"
                class="btn-secondary inline-flex items-center gap-2 text-xs px-3 py-1.5"
                @click="copyExternalSourceNotes"
              >
                <Copy class="h-3.5 w-3.5" :stroke-width="2" />
                {{ t('masteringPage.copyStemHandoff') }}
              </button>
            </div>
          </div>
          <div class="border border-border bg-background p-3 rounded-none">
            <p class="text-sm text-foreground whitespace-pre-wrap break-words">{{ currentExternalSourceNotes }}</p>
          </div>
        </div>

        <DiscussionPanel
          v-if="canSeeMasteringDiscussion"
          :discussions="masteringDiscussion.discussions.value"
          :issues="issues"
          :mention-users="mentionCandidates.mastering"
          :heading="t('masteringPage.discussionsHeading', { count: masteringDiscussion.discussions.value.length })"
          :empty-text="t('masteringPage.noDiscussions')"
          :placeholder="t('masteringPage.discussionPlaceholder')"
          :submit-label="t('masteringPage.postDiscussion')"
          :posting="masteringDiscussion.posting.value"
          :posting-progress="masteringDiscussion.postingProgress.value"
          :editing-id="masteringDiscussion.editingId.value"
          :editing-content="masteringDiscussion.editingContent.value"
          :history-items="masteringDiscussion.historyItems.value"
          :show-history-for-id="masteringDiscussion.showHistoryForId.value"
          :loading="masteringDiscussion.loading.value"
          :load-error="masteringDiscussion.loadError.value"
          :enable-audio="true"
          :has-more="masteringDiscussion.hasMore.value"
          :loading-older="masteringDiscussion.loadingOlder.value"
          @submit="masteringDiscussion.submit"
          @start-edit="masteringDiscussion.startEdit"
          @save-edit="masteringDiscussion.saveEdit"
          @cancel-edit="masteringDiscussion.cancelEdit"
          @remove="masteringDiscussion.remove"
          @show-history="masteringDiscussion.showHistory"
          @close-history="masteringDiscussion.closeHistory"
          @open-image="masteringDiscussion.openImage"
          @open-issue="openLinkedIssue"
          @retry="masteringDiscussion.load"
          @load-older="masteringDiscussion.loadOlder"
          @update:editing-content="masteringDiscussion.editingContent.value = $event"
        />
      </div>
    </template>

    <!-- Hoisted above the Listen/Issues tabs so switching between them doesn't re-decode the audio -->
    <div v-if="audioUrl && isSharedSourceWaveformTab" class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">
          {{ sharedSourceWaveformHeading }}
        </h3>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="isListenTab && olderPlayableSourceVersions.length > 0"
            @click="toggleSourceCompare"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
      <div v-if="isListenTab && showSourceCompare && olderPlayableSourceVersions.length > 0" class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect
            v-model="selectedCompareSourceVersionId"
            :options="sourceCompareOptions"
            :placeholder="`-- ${t('compare.selectVersion')} --`"
            size="sm"
          />
          <button
            v-if="selectedCompareSourceVersionId"
            @click="selectedCompareSourceVersionId = null"
            class="text-xs text-muted-foreground hover:text-foreground"
          >
            {{ t('compare.clear') }}
          </button>
        </div>
        <p v-if="isSourceCompareActive" class="text-xs text-warning">
          {{ t('workflowStep.sourceCompareReadonlyHint') }}
        </p>
      </div>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="waveformIssues"
        :track-id="trackId"
        :compare-version-id="selectedCompareSourceVersionId"
        :selectable="isMasteringEngineer"
        :mode="waveformMode"
        :selected-range="issueFormRef?.selectedRange ?? null"
        :draft-markers="issueFormRef?.markers ?? []"
        :draft-range-anchor="issueFormRef?.rangeAnchor ?? null"
        :hovered-issue-id="hoveredIssueId"
        @click="(time: number) => issueFormRef?.handleClick(time)"
        @regionClick="onIssueSelect"
        @rangeSelect="(start: number, end: number, isUpdate: boolean) => isUpdate ? issueFormRef?.handleRangeUpdate?.(start, end) : issueFormRef?.handleRangeSelect(start, end)"
        @issueHover="handleIssueHover"
        @issueLeave="handleIssueLeave"
        @requestModeChange="onRequestWaveformMode"
        @ready="onSourceWaveformReady"
        @timeupdate="onSourceWaveformTimeUpdate"
        @playbackStateChange="onSourceWaveformPlaybackStateChange"
      />
    </div>

    <template v-if="activeTab === 'listen'">
      <!-- Master delivery audio -->
      <div v-if="masterAudioUrl" class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold text-foreground">
            {{ t('masteringPage.currentDelivery') }}
            <span v-if="track.current_master_delivery" class="text-xs text-muted-foreground ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
          </h3>
          <div class="flex items-center gap-2">
            <button v-if="olderPlayableMasterDeliveries.length > 0" @click="toggleMasterCompare" class="btn-secondary text-xs px-3 py-1">
              {{ t('compare.title') }}
            </button>
            <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
              {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
            </button>
          </div>
        </div>
        <div v-if="showMasterCompare && olderPlayableMasterDeliveries.length > 0" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect v-model="selectedCompareMasterDeliveryId" :options="masterCompareOptions" :placeholder="`-- ${t('compare.selectVersion')} --`" size="sm" />
          <button v-if="selectedCompareMasterDeliveryId" @click="selectedCompareMasterDeliveryId = null" class="text-xs text-muted-foreground hover:text-foreground">
            {{ t('compare.clear') }}
          </button>
        </div>
        <div v-if="track.current_master_delivery?.delivery_message" class="border border-border bg-background rounded-none p-3">
          <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
          <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ track.current_master_delivery.delivery_message }}</p>
        </div>
        <WaveformPlayer
          ref="masterWaveformRef"
          :audio-url="masterAudioUrl"
          :issues="finalReviewIssues"
          :track-id="trackId"
          playback-scope="master"
          :compare-audio-url="selectedCompareMasterAudioUrl"
          @ready="onMasterWaveformReady"
          @timeupdate="onMasterWaveformTimeUpdate"
          @playbackStateChange="onMasterWaveformPlaybackStateChange"
        />
        <div v-if="finalReviewIssues.length > 0" class="mt-3">
          <h4 class="text-sm font-mono font-semibold text-foreground mb-2">{{ t('mastering.finalReviewIssuesHeading', { count: finalReviewIssues.length }) }}</h4>
          <IssueMarkerList
            :issues="finalReviewIssues"
            :hovered-issue-id="hoveredIssueId"
            :track="track"
            :assignments="reviewAssignments"
            :show-activity="true"
            @select="onIssueSelect"
            @hover="handleIssueHover"
            @leave="handleIssueLeave"
          />
        </div>
      </div>
      <div v-else-if="track.current_master_delivery" class="card space-y-3">
        <div class="space-y-1">
          <h3 class="text-sm font-mono font-semibold text-foreground">
            {{ t('masteringPage.currentDelivery') }}
            <span class="text-xs text-muted-foreground ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
          </h3>
          <p class="text-sm text-muted-foreground">{{ t('workflowStep.textDeliveryNoAudio') }}</p>
        </div>
        <div v-if="track.current_master_delivery.delivery_message" class="border border-border bg-background rounded-none p-3">
          <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
          <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ track.current_master_delivery.delivery_message }}</p>
        </div>
      </div>
    </template>

    <template v-if="activeTab === 'issues'">
      <!-- Issue create + list (mastering engineer) -->
      <div v-if="isMasteringEngineer" class="space-y-4">
        <IssueCreatePanel
          ref="issueFormRef"
          :track-id="trackId"
          phase="mastering"
          :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
          :issues="issues"
          :mention-users="mentionCandidates.issue_public"
          :public-mention-users="mentionCandidates.issue_public"
          :internal-mention-users="mentionCandidates.issue_internal"
          v-model:form-open="isIssueFormOpen"
          @created="onIssueCreated"
          @formOpenChange="(open: boolean) => (isIssueFormOpen = open)"
        >
          <template #heading>
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: fallbackWaveformIssues.length }) }}</h3>
          </template>
        </IssueCreatePanel>

        <BatchIssueActions
          :selected-count="selectedStageIssueIds.length"
          :statuses="stageBatchActions"
          :note="stageBatchNote"
          :loading="batchUpdatingIssues"
          :issues="issues"
          :mention-users="mentionCandidates.issue_internal"
          @update:note="stageBatchNote = $event"
          @clear="selectedStageIssueIds = []; stageBatchNote = ''"
          @apply="applyBatchIssueStatusChange($event)"
        />

        <IssueMarkerList
          :issues="fallbackWaveformIssues"
          :selectable="true"
          :selected-ids="selectedStageIssueIds"
          :current-source-version-number="displayedSourceVersionNumber"
          :hovered-issue-id="hoveredIssueId"
          :track="track"
          :assignments="reviewAssignments"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="onIssueSelect"
          @update:selectedIds="selectedStageIssueIds = $event"
          @hover="handleIssueHover"
          @leave="handleIssueLeave"
          @status-change="onQuickIssueStatusChange"
        />
      </div>

      <!-- Non-mastering-engineer: read-only issue list -->
      <div v-if="!isMasteringEngineer" class="space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: fallbackWaveformIssues.length }) }}</h3>
        <IssueMarkerList
          :issues="fallbackWaveformIssues"
          :current-source-version-number="displayedSourceVersionNumber"
          :hovered-issue-id="hoveredIssueId"
          :track="track"
          :assignments="reviewAssignments"
          :show-activity="true"
          @select="onIssueSelect"
          @hover="handleIssueHover"
          @leave="handleIssueLeave"
        />
      </div>
    </template>

    <!-- ═══ Tab: Delivery ═══ -->
    <template v-if="activeTab === 'delivery'">
      <!-- Upload delivery (mastering engineer only) -->
      <div v-if="canUploadDelivery" class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.uploadDelivery') }}</h3>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryFileLabel') }}</label>
          <input type="file" accept="audio/*" @change="onFileChange" class="input-field w-full" />
        </div>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryMessageLabel') }}</label>
          <textarea
            v-model="deliveryMessage"
            class="textarea-field min-h-[120px]"
            :placeholder="t('workflowStep.deliveryMessagePlaceholder')"
            :disabled="uploading"
          ></textarea>
          <p class="text-xs text-muted-foreground">{{ t('workflowStep.deliveryMessageHint') }}</p>
        </div>
        <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
          </div>
          <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" :compact="true" :height="96" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button @click="handleUploadDelivery" :disabled="uploading || !canSubmitDelivery" class="btn-primary text-sm h-10 inline-flex items-center justify-center">
            <Upload class="w-4 h-4 mr-2" />
            {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
          </button>
          <button v-if="uploadFile" @click="uploadFile = null; resetDeliveryPreview()" :disabled="uploading" class="btn-secondary text-sm">
            {{ t('workflowStep.clearSelectedDelivery') }}
          </button>
        </div>
        <div v-if="uploading" class="space-y-1">
          <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
        </div>
        <div v-if="uploadError" class="text-sm text-error">{{ uploadError }}</div>
      </div>

      <!-- Approval status + actions -->
      <div v-if="track.current_master_delivery" class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.approvalStatus') }}</h3>
        <div v-if="track.current_master_delivery.delivery_message" class="border border-border bg-background rounded-none p-3">
          <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
          <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ track.current_master_delivery.delivery_message }}</p>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('trackDetail.producer') }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.producer_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ composerApprovalLabel }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.submitter_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex gap-2 pt-1">
          <button v-if="canApproveFinal" @click="handleApproveFinal" class="btn-primary text-sm flex items-center gap-1.5">
            <Check class="w-4 h-4" :stroke-width="2" />
            {{ t('masteringPage.approveDelivery') }}
          </button>
        </div>
      </div>

      <!-- Version history (collapsible) -->
      <div v-if="sortedMasterDeliveries.length > 0" class="card">
        <button
          class="w-full flex items-center justify-between"
          @click="versionHistoryExpanded = !versionHistoryExpanded"
        >
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.masterVersionHistory') }}</h3>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{{ sortedMasterDeliveries.length }}</span>
            <ChevronDown
              class="w-4 h-4 text-muted-foreground transition-transform"
              :class="{ 'rotate-180': versionHistoryExpanded }"
              :stroke-width="2"
            />
          </div>
        </button>
        <div v-if="versionHistoryExpanded" class="mt-3 space-y-2">
          <div
            v-for="delivery in sortedMasterDeliveries"
            :key="delivery.id"
            class="flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="space-y-2 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-mono font-semibold text-foreground">{{ masterDeliveryOptionLabel(delivery) }}</span>
                <span v-if="delivery.id === track.current_master_delivery?.id" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                  {{ t('compare.currentVersion') }}
                </span>
                <span class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                  {{ delivery.file_path ? t('workflowStep.fileDeliveryLabel') : t('workflowStep.textDeliveryLabel') }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
              </p>
              <div v-if="delivery.delivery_message" class="border border-border bg-card rounded-none p-3">
                <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
                <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ delivery.delivery_message }}</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button v-if="delivery.id !== track.current_master_delivery?.id && delivery.file_path" @click="compareWithMasterDelivery(delivery.id)" class="btn-secondary text-xs px-3 py-1">
                {{ t('compare.title') }}
              </button>
              <button v-if="delivery.file_path" @click="handleMasterVersionDownload(delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
                {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <WorkflowActionBar v-if="deliveryActions.length" :actions="deliveryActions" />
  </div>

  <IssueDetailPanel
    :issue="selectedIssue"
    :track="track"
    :assignments="reviewAssignments"
    :issues="issues"
    :mention-candidates="mentionCandidates"
    :preview="selectedIssuePreview"
    @close="closeIssueDrawer"
    @updated="onIssueUpdated"
    @open-issue="openLinkedIssue"
    @preview-play-at="handleIssuePreviewPlayAt"
    @preview-action="handleIssuePreviewAction"
  />

  <MasteringChatSidebar
    v-if="canSeeMasteringDiscussion && track"
    :track-id="trackId"
    :track-completed="track.status === 'completed'"
    :issues="issues"
    :mention-users="mentionCandidates.mastering"
    @open-issue="openLinkedIssue"
  />
</template>
