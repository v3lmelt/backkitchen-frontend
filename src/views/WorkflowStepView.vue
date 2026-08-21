<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, r2Api, uploadToR2, masterDeliveryAudioUrl, trackAudioUrl } from '@/api'
import type {
  Issue,
  Track,
  MasterDelivery,
  WorkflowStepDef,
  WorkflowTransitionOption,
} from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import IssueDetailPanel from '@/components/IssueDetailPanel.vue'
import WorkflowActionBar from '@/components/workflow/WorkflowActionBar.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'
import type { WorkflowAction } from '@/components/workflow/WorkflowActionBar.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import BaseModal from '@/components/common/BaseModal.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import IntakeStep from '@/components/workflow/step/IntakeStep.vue'
import PeerReviewStep from '@/components/workflow/step/PeerReviewStep.vue'
import ProducerGateStep from '@/components/workflow/step/ProducerGateStep.vue'
import FinalReviewStep from '@/components/workflow/step/FinalReviewStep.vue'
import ReviewerAssignmentModal from '@/components/workflow/step/ReviewerAssignmentModal.vue'
import { ChevronLeft, Upload, Link, Info } from 'lucide-vue-next'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useDiscussionRealtime } from '@/composables/useDiscussionRealtime'
import { useIssuePreviewPlayback, type PreviewAction } from '@/composables/useIssuePreviewPlayback'
import { useToast } from '@/composables/useToast'
import { useAppStore } from '@/stores/app'
import { useTrackDetail } from '@/composables/useTrackDetail'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { useWorkflowTransition } from '@/composables/useWorkflowTransition'
import { useVersionCompare } from '@/composables/useVersionCompare'
import { usePeerReviewChecklist } from '@/composables/usePeerReviewChecklist'
import { useReviewerAssignment } from '@/composables/useReviewerAssignment'
import {
  actionTypeForTransition,
  isFinalReviewDedicatedTransition,
  stepIsMasteringRelated,
  transitionIsApprove,
  transitionIsRevision,
  translateStepLabel,
  translateWorkflowDecision,
} from '@/utils/workflow'
import { historicalDeliveryDownloadSuffix } from '@/utils/sourceVersions'
import { useWaveformHotkeys } from '@/composables/useWaveformHotkeys'
import { useIssueDrawer } from '@/composables/useIssueDrawer'
import { useIssueMutations } from '@/composables/useIssueMutations'
import { useBatchIssueActions } from '@/composables/useBatchIssueActions'
import { externalComposerDisplayText, isComposerActor, trackArtistDisplay, trackArtistUsesHash } from '@/utils/trackComposers'
import { extractAudioDuration } from '@/utils/audio'
import { activeAssignmentsForStep, canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'
import { FALLBACK_ISSUE_PHASES, isIssueUnresolved } from '@/utils/issueStatus'
import { MAX_AUDIO_SIZE } from '@/utils/uploadLimits'
import {
  canUserApproveFinal,
  canViewerSeeMastering,
  requiredReviewerCount,
  resolveStepAssigneeUserId,
  reviewAllowsInternalIssueVisibility as stepAllowsInternalIssueVisibility,
  viewerCanManageTrackAlbum as viewerCanManageTrackAlbumOf,
  viewerIsStepAssignee,
} from '@/utils/trackPermissions'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { success: toastSuccess, error: toastError } = useToast()

const DIRECT_REVISION_REQUEST_DECISION = 'request_revision_now'
const appStore = useAppStore()
const trackId = computed(() => Number(route.params.id))
const error = ref('')

const { dispatch: dispatchDiscussionEvent } = useDiscussionRealtime()

const wsReloading = ref(false)
const wsHadConnection = ref(false)
const { connected: wsConnected, reconnectAttempts: wsReconnectAttempts, retry: wsRetry } = useTrackWebSocket(trackId, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadPage()
  wsReloading.value = false
}, {
  onDiscussionEvent: dispatchDiscussionEvent,
})
watch(wsConnected, (connected) => {
  if (connected) wsHadConnection.value = true
})

const {
  track,
  issues,
  mentionCandidates,
  sourceVersions,
  masterDeliveries,
  workflowConfig,
  reviewAssignments,
  loading,
  loadError,
  load: loadPage,
} = useTrackDetail(trackId, {
  clearTrackOnError: true,
  errorMessage: (err) => err?.message || t('common.loadFailed'),
  onLoadStart: () => {
    error.value = ''
  },
  onDetailApplied: (detail) => {
    applyChecklistDetail(detail)
    syncIssueDrawerFromRoute()
  },
  onLoaded: async (detail, isCurrent) => {
    const variant = inferClassicVariant(detail.track.workflow_step ?? null)

    // Redirect mastering steps to the dedicated mastering page
    if (variant === 'mastering') {
      router.replace({ path: `/tracks/${detail.track.id}/mastering`, query: route.query })
      return
    }

    if (variant === 'peer_review') {
      if (albumChecklistEnabled.value !== false) {
        await loadPeerChecklist(detail.track.album_id)
        if (!isCurrent()) return
      } else {
        resetChecklistTemplate()
      }
    } else {
      resetChecklistTemplate()
    }
  },
  onTrackIdChange: () => {
    resetChecklistForTrackChange()
    resetReviewerAssignment()
  },
})
const isProxySubmission = computed(() => Boolean(track.value?.is_proxy_submission && track.value.external_submitter_name))
const composerApprovalLabel = computed(() =>
  isProxySubmission.value ? t('finalReview.externalSubmitterProxy') : t('trackDetail.composers')
)
const uploadFile = ref<File | null>(null)
const deliveryMessage = ref('')
const localDeliveryPreviewUrl = ref('')
const revisionNotes = ref('')
const externalStemLinkNotes = ref('')
const revisionUploadMode = ref<'file' | 'link'>('file') // 'file' for upload, 'link' for external link
const uploading = ref(false)
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const uploadProgress = ref(0)
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const waveformDuration = ref(0)
const waveformCurrentTime = ref(0)
const waveformIsPlaying = ref(false)
const waveformPeaks = ref<number[]>([])
const hoveredIssueId = ref<number | null>(null)
const selectedIssue = ref<Issue | null>(null)
const selectedStageIssueIds = ref<number[]>([])
const selectedProducerIssueIds = ref<number[]>([])
const selectedRevisionIssueIds = ref<number[]>([])
const stageBatchNote = ref('')
const producerBatchNote = ref('')
const revisionBatchNote = ref('')
const isIssueFormOpen = ref(false)
const waveformMode = computed<'seek' | 'annotate'>(() => (isIssueFormOpen.value ? 'annotate' : 'seek'))

// The variant step components own the waveform/issue-form markup; they
// register their instances upward through these callbacks so the view-level
// concerns (hotkeys, drawer preview playback) keep working.
function registerWaveform(el: unknown) {
  waveformRef.value = (el ?? null) as InstanceType<typeof WaveformPlayer> | null
}
function registerIssueForm(el: unknown) {
  issueFormRef.value = (el ?? undefined) as InstanceType<typeof IssueCreatePanel> | undefined
}

function onRequestWaveformMode(next: 'seek' | 'annotate') {
  if (next === 'annotate' && isSourceCompareActive.value) return
  isIssueFormOpen.value = next === 'annotate'
}

onMounted(loadPage)
onMounted(() => {
  window.addEventListener('keydown', handleWaveformHotkeys)
  window.addEventListener('beforeunload', handleBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWaveformHotkeys)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  resetDeliveryPreview()
})

function hasPendingUploadSelection(): boolean {
  return Boolean(uploading.value || uploadFile.value || deliveryMessage.value.trim() || externalStemLinkNotes.value.trim())
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasPendingUploadSelection()) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!hasPendingUploadSelection()) return true
  return window.confirm(t('workflowStep.leaveUploadConfirm'))
})

const currentStep = computed<WorkflowStepDef | null>(() => track.value?.workflow_step ?? null)
const currentStepAssignments = computed(() => activeAssignmentsForStep(reviewAssignments.value, currentStep.value?.id))
// Server-computed review progress (present on review steps); the assignment-
// derived computeds below are the fallback for payloads lacking it.
const reviewState = computed(() => track.value?.review_state ?? null)
const completedReviewCount = computed(() =>
  reviewState.value?.completed_review_count
  ?? currentStepAssignments.value.filter(assignment => assignment.status === 'completed').length,
)
const requiredReviewCount = computed(() =>
  reviewState.value?.required_review_count
  ?? requiredReviewerCount(currentStep.value, currentStepAssignments.value.length),
)
const currentUserAssignment = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId) return null
  // Prefer a pending assignment over a completed one when the same user has
  // multiple active records for this step (can happen after a reassignment
  // that re-includes a user who previously completed their review).
  const mine = currentStepAssignments.value.filter(assignment => assignment.user_id === userId)
  return mine.find(assignment => assignment.status === 'pending') ?? mine[0] ?? null
})
const reviewQuorumReached = computed(() =>
  reviewState.value?.quorum_reached ?? completedReviewCount.value >= requiredReviewCount.value,
)
const reviewRequiresGroupFinalization = computed(() =>
  reviewState.value?.requires_group_finalization
  ?? (currentStep.value?.type === 'review' && requiredReviewCount.value > 1),
)
const reviewAllowsInternalIssueVisibility = computed(() =>
  stepAllowsInternalIssueVisibility(currentStep.value, currentStepAssignments.value.length),
)
const reviewWaitingForAssignment = computed(() => currentStep.value?.type === 'review' && currentStepAssignments.value.length === 0)
const currentUserCanFinalizeReview = computed(() =>
  currentUserAssignment.value?.status === 'completed'
  && reviewRequiresGroupFinalization.value
  && reviewQuorumReached.value,
)
const currentUserCanSubmitReview = computed(() => currentUserAssignment.value?.status === 'pending')
const reviewUsesFirstRevisionRequest = computed(() =>
  currentStep.value?.type === 'review'
  && currentStep.value.revision_decision_policy === 'first_revision_request',
)
const currentUserHasRevisionSuggestion = computed(() =>
  currentUserAssignment.value?.status === 'completed'
  && currentUserAssignment.value.decision === 'needs_revision',
)
const viewerCanManageTrackAlbum = computed(() =>
  viewerCanManageTrackAlbumOf(track.value, appStore.currentUser),
)
const canManageReviewAssignments = computed(() =>
  viewerCanManageTrackAlbum.value && currentStep.value?.type === 'review',
)

const {
  modalOpen: reviewerAssignmentModalOpen,
  members: reviewerAssignmentMembers,
  selectedUserIds: reviewerAssignmentSelectedUserIds,
  loadingMembers: reviewerAssignmentLoadingMembers,
  saving: reviewerAssignmentSaving,
  buttonLabel: reviewerAssignmentButtonLabel,
  selectionSummary: reviewerAssignmentSelectionSummary,
  confirmDisabled: reviewerAssignmentConfirmDisabled,
  isMemberDisabled: reviewerAssignmentIsMemberDisabled,
  open: openReviewerAssignment,
  closeModal: closeReviewerAssignmentModal,
  toggleMember: toggleReviewerAssignmentMember,
  submit: submitReviewerAssignment,
  reset: resetReviewerAssignment,
} = useReviewerAssignment({
  track,
  currentStep,
  currentStepAssignments,
  canManage: canManageReviewAssignments,
  error,
  reload: loadPage,
})

function inferClassicVariant(step: WorkflowStepDef | null) {
  if (!step) return 'generic'
  if (step.ui_variant && step.ui_variant !== 'generic') return step.ui_variant
  if (step.id === 'intake') return 'intake'
  if (step.id === 'peer_review') return 'peer_review'
  if (step.id === 'producer_gate') return 'producer_gate'
  if (step.id === 'mastering') return 'mastering'
  if (step.id === 'final_review') return 'final_review'
  return 'generic'
}

const stepVariant = computed(() => inferClassicVariant(currentStep.value))
const activeVariant = computed<'generic' | 'intake' | 'peer_review' | 'producer_gate' | 'mastering' | 'final_review'>(() => {
  if (stepVariant.value === 'intake') return 'intake'
  if (stepVariant.value === 'peer_review') return 'peer_review'
  if (stepVariant.value === 'producer_gate') return 'producer_gate'
  if (stepVariant.value === 'mastering') return 'mastering'
  if (stepVariant.value === 'final_review') return 'final_review'
  return 'generic'
})
const isApprovalStep = computed(() => currentStep.value?.type === 'approval' || currentStep.value?.type === 'gate')

const audioUrl = computed(() =>
  track.value?.file_path ? trackAudioUrl(trackId.value, track.value.version ?? 0) : '',
)

const {
  showSourceCompare,
  selectedCompareSourceVersionId,
  currentSourceVersionId,
  olderPlayableSourceVersions,
  sourceCompareOptions,
  isSourceCompareActive,
  displayedSourceVersionNumber,
  toggleSourceCompare,
  filterIssuesForDisplayedSourceVersion,
  showMasterCompare,
  selectedCompareMasterDeliveryId,
  masterDelivery,
  masterAudioUrl,
  sortedMasterDeliveries,
  olderPlayableMasterDeliveries,
  masterCompareOptions,
  selectedCompareMasterAudioUrl,
  toggleMasterCompare,
  compareWithMasterDelivery,
} = useVersionCompare({ trackId, track, sourceVersions, masterDeliveries })

const {
  checklistItems,
  checklistDraft,
  checklistPrefill,
  albumChecklistEnabled,
  isPeerReviewChecklistEnabled,
  checklistDirty,
  checklistPassedCount,
  checklistSaved,
  checklistSaveButtonLabel,
  checklistPrefillStateLabel,
  checklistByReviewer,
  applyDetail: applyChecklistDetail,
  resetTemplate: resetChecklistTemplate,
  resetForTrackChange: resetChecklistForTrackChange,
  loadPeerChecklist,
  persistChecklist,
  submitChecklist,
} = usePeerReviewChecklist({
  trackId,
  track,
  currentSourceVersionId,
  reviewAssignments,
  error,
  reload: loadPage,
})

const { downloading, downloadProgress, downloadTrackAudio, downloadAudioAsset } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)
const handleMasterDownload = () => downloadTrackAudio(masterAudioUrl, track, '_master')

function resetDeliveryPreview() {
  if (localDeliveryPreviewUrl.value) {
    URL.revokeObjectURL(localDeliveryPreviewUrl.value)
    localDeliveryPreviewUrl.value = ''
  }
}

const currentVersion = computed(() => track.value?.version ?? null)
const allCycleIssues = computed(() => issues.value)
const stepIssues = computed(() =>
  issues.value.filter(i => i.phase === currentStep.value?.id || i.phase === track.value?.status),
)
const fallbackStepIssues = computed(() =>
  issues.value.filter(i => (FALLBACK_ISSUE_PHASES as readonly string[]).includes(i.phase)),
)
const waveformIssues = computed(() => {
  return filterIssuesForDisplayedSourceVersion(stepIssues.value)
})
const fallbackWaveformIssues = computed(() => {
  return filterIssuesForDisplayedSourceVersion(fallbackStepIssues.value)
})
const producerIssues = computed(() =>
  issues.value.filter(i => i.phase === 'producer'),
)
const producerSnapshotIssues = computed(() => producerIssues.value)
const producerWaveformIssues = computed(() => {
  return filterIssuesForDisplayedSourceVersion(producerIssues.value)
})
const producerOpenCount = computed(() => producerSnapshotIssues.value.filter(issue => isIssueUnresolved(issue.status)).length)
const producerResolvedCount = computed(() =>
  producerSnapshotIssues.value.filter(issue => issue.status === 'resolved' || issue.status === 'internal_resolved').length,
)
const producerDisagreedCount = computed(() => producerSnapshotIssues.value.filter(issue => issue.status === 'disagreed').length)
const peerIssues = computed(() =>
  issues.value.filter(i => i.phase === 'peer' || i.phase === 'peer_review'),
)
const peerOpenCount = computed(() => peerIssues.value.filter(issue => isIssueUnresolved(issue.status)).length)
const peerResolvedCount = computed(() =>
  peerIssues.value.filter(issue => issue.status === 'resolved' || issue.status === 'internal_resolved').length,
)
const peerDisagreedCount = computed(() => peerIssues.value.filter(issue => issue.status === 'disagreed').length)
const peerDiscussedCount = computed(() => peerIssues.value.filter(issue => (issue.comment_count ?? 0) > 0).length)
const revisionSnapshotIssues = computed(() => {
  if (currentStep.value?.type !== 'revision') return []

  const returnTo = currentStep.value.return_to ?? ''
  const phaseMap: Record<string, string[]> = {
    peer_review: ['peer', 'peer_review'],
    producer_gate: ['producer', 'producer_gate'],
    mastering: ['mastering'],
    final_review: ['final_review'],
  }

  let relatedIssues = phaseMap[returnTo]?.length
    ? issues.value.filter(issue => phaseMap[returnTo].includes(issue.phase))
    : []

  if (relatedIssues.length === 0 && returnTo) {
    relatedIssues = issues.value.filter(issue => issue.phase === returnTo)
  }

  if (relatedIssues.length === 0) {
    relatedIssues = fallbackStepIssues.value
  }

  return relatedIssues
})
const revisionOpenIssues = computed(() =>
  revisionSnapshotIssues.value.filter(issue => isIssueUnresolved(issue.status)),
)
const revisionResolvedIssues = computed(() =>
  revisionSnapshotIssues.value.filter(issue => issue.status === 'resolved' || issue.status === 'internal_resolved'),
)
const revisionWaveformIssues = computed(() => {
  if (currentVersion.value == null) return revisionOpenIssues.value
  return revisionOpenIssues.value.filter(
    issue => issue.source_version_number == null || issue.source_version_number === currentVersion.value,
  )
})
const openCount = computed(() => allCycleIssues.value.filter(i => isIssueUnresolved(i.status)).length)
const resolvedCount = computed(() =>
  allCycleIssues.value.filter(i => i.status === 'resolved' || i.status === 'internal_resolved').length,
)
const finalReviewIssues = computed(() => {
  const deliveryId = masterDelivery.value?.id ?? null
  if (!deliveryId) return []
  return issues.value.filter(
    issue => issue.phase === 'final_review' && issue.master_delivery_id === deliveryId,
  )
})
const canSubmitDelivery = computed(() => Boolean(uploadFile.value))
const canConfirmDelivery = computed(() => {
  if (currentStep.value?.type !== 'delivery' || !track.value || !masterDelivery.value) return false
  if (!currentStep.value.require_confirmation) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  if (masterDelivery.value.confirmed_at) return false
  return viewerIsStepAssignee(track.value, currentStep.value, userId, viewerCanManageTrackAlbum.value)
})
const canApproveFinal = computed(() =>
  canUserApproveFinal(track.value, appStore.currentUser?.id, viewerCanManageTrackAlbum.value),
)
const canRequestReturn = computed(() => {
  if (!track.value) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  return isComposerActor(track.value, userId) && !viewerCanManageTrackAlbum.value
})
const canSeeMasteringSidebar = computed(() => {
  const isParticipant = canViewerSeeMastering(track.value, appStore.currentUser?.id, viewerCanManageTrackAlbum.value)
  const supportsSidebar = activeVariant.value === 'mastering' || activeVariant.value === 'final_review'
  return isParticipant && supportsSidebar
})

// Resolve the user id the current revision step is assigned to.
// Uses assignee_user_id override if present, otherwise maps the assignee_role
// back to the track/album-level user id.
const revisionAssigneeUserId = computed<number | null>(() => {
  const step = currentStep.value
  if (!step || step.type !== 'revision' || !track.value) return null
  return resolveStepAssigneeUserId(track.value, step)
})

const isRevisionAssignee = computed(() => {
  const userId = appStore.currentUser?.id
  const step = currentStep.value
  if (!track.value || !step || step.type !== 'revision') return false
  return viewerIsStepAssignee(track.value, step, userId, viewerCanManageTrackAlbum.value)
})
const masteringRevisionReturnStep = computed(() => {
  const step = currentStep.value
  if (!step || step.type !== 'revision' || !step.return_to) return null
  return workflowConfig.value?.steps.find(item => item.id === step.return_to) ?? null
})
const isMasteringRevisionStep = computed(() => {
  const returnStep = masteringRevisionReturnStep.value
  if (!returnStep) return false
  return stepIsMasteringRelated(returnStep)
})
const requestedRevisionType = computed(() => track.value?.requested_revision_type ?? null)
const shouldShowRevisionSubmitMethod = computed(() =>
  isMasteringRevisionStep.value && requestedRevisionType.value == null,
)
const shouldShowRevisionFileUpload = computed(() =>
  !isMasteringRevisionStep.value
    || requestedRevisionType.value === 'source_audio'
    || (requestedRevisionType.value == null && revisionUploadMode.value === 'file'),
)
const shouldShowExternalStemLinkForm = computed(() =>
  isMasteringRevisionStep.value
    && (
      requestedRevisionType.value === 'stem_files'
      || (requestedRevisionType.value == null && revisionUploadMode.value === 'link')
    ),
)
const requestedRevisionTitle = computed(() => {
  if (requestedRevisionType.value === 'source_audio') return t('workflowStep.revisionTypeRequestedSourceAudio')
  if (requestedRevisionType.value === 'stem_files') return t('workflowStep.revisionTypeRequestedStemFiles')
  return ''
})
const requestedRevisionHint = computed(() => {
  if (requestedRevisionType.value === 'source_audio') return t('workflowStep.revisionTypeHintSourceAudio')
  if (requestedRevisionType.value === 'stem_files') return t('workflowStep.revisionTypeHintStemFiles')
  return ''
})
const canSubmitExternalStemLink = computed(() =>
  shouldShowExternalStemLinkForm.value && externalStemLinkNotes.value.trim().length > 0,
)

watch(requestedRevisionType, (type) => {
  revisionUploadMode.value = type === 'stem_files' ? 'link' : 'file'
}, { immediate: true })

const revisionAssigneeRoleLabel = computed(() => {
  const role = currentStep.value?.assignee_role
  if (!role) return ''
  return t(`workflowBuilder.roles.${role}`, role)
})

watch(isSourceCompareActive, (active) => {
  if (!active) return
  isIssueFormOpen.value = false
  hoveredIssueId.value = null
})

watch(() => route.query.issue, () => {
  syncIssueDrawerFromRoute()
})

const {
  syncIssueDrawerFromRoute,
  openIssueDrawer,
  onIssueSelect,
  closeIssueDrawer,
} = useIssueDrawer({ issues, selectedIssue })

const { onIssueUpdated, onQuickIssueStatusChange } = useIssueMutations({ issues, selectedIssue })

function openLinkedIssue(issueId: number) {
  const localIssue = issues.value.find(issue => issue.id === issueId)
  if (localIssue) {
    openIssueDrawer(localIssue)
    return
  }

  void router.push(`/issues/${issueId}`)
}

function onWaveformReady(nextDuration: number) {
  waveformDuration.value = nextDuration
  nextTick(() => {
    waveformPeaks.value = waveformRef.value?.exportPeaks?.(400) ?? []
  })
}

function onWaveformTimeUpdate(time: number) {
  waveformCurrentTime.value = time
}

function onWaveformPlaybackStateChange(isPlaying: boolean) {
  waveformIsPlaying.value = isPlaying
}

const issuePreviewPlayback = useIssuePreviewPlayback({
  selectedIssue,
  waveformFor: () => waveformRef.value,
  currentTimeFor: () => waveformCurrentTime.value,
  isPlayingFor: () => waveformIsPlaying.value,
})

const selectedIssuePreview = computed(() => {
  if (!selectedIssue.value || waveformDuration.value <= 0) return null
  return {
    duration: waveformDuration.value,
    currentTime: waveformCurrentTime.value,
    isPreviewPlaying: issuePreviewPlayback.isPreviewPlaying.value,
    activeMarkerIndex: issuePreviewPlayback.activeMarkerIndex.value,
    peaks: waveformPeaks.value,
  }
})

async function handleIssuePreviewPlayAt(time: number) {
  await waveformRef.value?.playFrom?.(time)
}

function handleIssuePreviewAction(_issue: Issue, action: PreviewAction) {
  void issuePreviewPlayback.handleAction(action)
}

function canCurrentUserChangeIssueStatus(issue: Issue): boolean {
  return canUserChangeIssueStatus(appStore.currentUser?.id, track.value, issue, reviewAssignments.value)
}

function canCurrentUserSubmitIssueStatus(issue: Issue): boolean {
  return canUserSubmitIssueStatus(appStore.currentUser?.id, track.value, issue)
}

const {
  batchUpdatingIssues,
  intersectBatchActions,
  applyBatchIssueStatusChange,
} = useBatchIssueActions({
  trackId,
  issues,
  selectedIssue,
  canSubmitStatus: canCurrentUserSubmitIssueStatus,
  canChangeStatus: canCurrentUserChangeIssueStatus,
})

const selectedProducerIssues = computed(() =>
  producerSnapshotIssues.value.filter(issue => selectedProducerIssueIds.value.includes(issue.id)),
)

const selectedRevisionIssues = computed(() =>
  revisionSnapshotIssues.value.filter(issue => selectedRevisionIssueIds.value.includes(issue.id)),
)

const producerBatchActions = computed(() => intersectBatchActions(selectedProducerIssues.value))
const revisionBatchActions = computed(() => intersectBatchActions(selectedRevisionIssues.value))
const stageBatchIssueList = computed(() => {
  if (!currentStep.value) return []
  if (activeVariant.value === 'peer_review' || activeVariant.value === 'mastering') return fallbackWaveformIssues.value
  if (activeVariant.value === 'final_review') return finalReviewIssues.value
  if (activeVariant.value === 'producer_gate' || activeVariant.value === 'intake' || currentStep.value.type === 'revision') return []
  if (currentStep.value.type === 'approval' || currentStep.value.type === 'review') return fallbackWaveformIssues.value
  return []
})
const selectedStageIssues = computed(() =>
  stageBatchIssueList.value.filter(issue => selectedStageIssueIds.value.includes(issue.id)),
)
const stageBatchActions = computed(() => intersectBatchActions(selectedStageIssues.value))

watch([stageBatchIssueList, activeVariant, () => currentStep.value?.id], ([issuesList]) => {
  const validIds = new Set(issuesList.map(issue => issue.id))
  selectedStageIssueIds.value = selectedStageIssueIds.value.filter(id => validIds.has(id))
  if (selectedStageIssueIds.value.length === 0) stageBatchNote.value = ''
})

watch(producerSnapshotIssues, (issuesList) => {
  const validIds = new Set(issuesList.map(issue => issue.id))
  selectedProducerIssueIds.value = selectedProducerIssueIds.value.filter(id => validIds.has(id))
  if (selectedProducerIssueIds.value.length === 0) producerBatchNote.value = ''
})

watch(revisionSnapshotIssues, (issuesList) => {
  const validIds = new Set(issuesList.map(issue => issue.id))
  selectedRevisionIssueIds.value = selectedRevisionIssueIds.value.filter(id => validIds.has(id))
  if (selectedRevisionIssueIds.value.length === 0) revisionBatchNote.value = ''
})

function applyProducerBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedProducerIssues.value, selectedProducerIssueIds, producerBatchNote, status)
}

function applyRevisionBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedRevisionIssues.value, selectedRevisionIssueIds, revisionBatchNote, status)
}

function applyStageBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedStageIssues.value, selectedStageIssueIds, stageBatchNote, status)
}

function onIssueCreated(issue: Issue) {
  issues.value.push(issue)
}

function trackDetailQuery() {
  const returnTo = Array.isArray(route.query.returnTo) ? route.query.returnTo[0] : route.query.returnTo
  return typeof returnTo === 'string' && returnTo.length > 0
    ? { returnTo }
    : { returnTo: route.path }
}

function pushToTrackDetail() {
  router.push({ path: `/tracks/${trackId.value}`, query: trackDetailQuery() })
}

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
  error,
  reload: loadPage,
  navigateToTrackDetail: () => pushToTrackDetail(),
  beforeTransition: async () => {
    if (inferClassicVariant(track.value?.workflow_step ?? null) === 'peer_review' && checklistDirty.value) {
      await persistChecklist(false)
    }
  },
  confirmDecision: (decision) => {
    if (decision !== DIRECT_REVISION_REQUEST_DECISION) return true
    return window.confirm(t('workflowStep.directRevisionConfirm'))
  },
})

async function handleUpload(kind: 'revision' | 'delivery') {
  if (!track.value) return
  const message = deliveryMessage.value.trim()
  if (!uploadFile.value) return
  const previousStatus = track.value.status
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const file = uploadFile.value
    let updatedTrack: Track
    if (file && appStore.r2Enabled) {
      const requestFn = kind === 'revision'
        ? r2Api.requestSourceVersionUpload
        : r2Api.requestMasterDeliveryUpload
      const [presigned, duration] = await Promise.all([
        requestFn(trackId.value, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (p) => {
        uploadProgress.value = p
      })
      if (kind === 'revision') {
        updatedTrack = await r2Api.confirmSourceVersionUpload(trackId.value, {
          upload_id: presigned.upload_id,
          object_key: presigned.object_key,
          duration,
          revision_notes: revisionNotes.value.trim() || null,
          resolved_issue_ids: [...selectedRevisionIssueIds.value],
          resolution_note: revisionBatchNote.value.trim() || null,
        })
      } else {
        updatedTrack = await r2Api.confirmMasterDeliveryUpload(trackId.value, {
          upload_id: presigned.upload_id,
          object_key: presigned.object_key,
          duration,
          delivery_message: message || null,
        })
      }
    } else if (kind === 'revision') {
      if (!file) return
      updatedTrack = await trackApi.uploadSourceVersion(trackId.value, file, {
        revisionNotes: revisionNotes.value.trim() || undefined,
        resolvedIssueIds: [...selectedRevisionIssueIds.value],
        resolutionNote: revisionBatchNote.value.trim() || undefined,
      }, (percent) => {
        uploadProgress.value = percent
      })
    } else {
      updatedTrack = await trackApi.uploadMasterDelivery(trackId.value, {
        file,
        deliveryMessage: message || null,
      }, (percent) => {
        uploadProgress.value = percent
      })
    }
    if (kind === 'delivery') {
      uploadFile.value = null
      deliveryMessage.value = ''
      resetDeliveryPreview()
      toastSuccess(t('workflowStep.deliveryUploaded'))
      if (updatedTrack.status !== previousStatus) {
        pushToTrackDetail()
        return
      }
      await loadPage()
      return
    }
    uploadFile.value = null
    revisionNotes.value = ''
    selectedRevisionIssueIds.value = []
    revisionBatchNote.value = ''
    resetDeliveryPreview()
    toastSuccess(t('workflowStep.revisionUploaded'))
    if (updatedTrack.status !== previousStatus) {
      pushToTrackDetail()
      return
    }
    await loadPage()
  } catch (err: any) {
    error.value = err.message || t('workflowStep.uploadFailed')
  } finally {
    uploading.value = false
  }
}

async function handleExternalSourceLinkSubmit() {
  if (!track.value || !canSubmitExternalStemLink.value) return
  const previousStatus = track.value.status
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const updatedTrack = await trackApi.submitSourceExternalLink(trackId.value, {
      revisionNotes: externalStemLinkNotes.value,
      resolvedIssueIds: [...selectedRevisionIssueIds.value],
      resolutionNote: revisionBatchNote.value.trim() || null,
    })
    externalStemLinkNotes.value = ''
    selectedRevisionIssueIds.value = []
    revisionBatchNote.value = ''
    toastSuccess(t('workflowStep.externalSourceLinkSubmitted'))
    if (updatedTrack.status !== previousStatus) {
      pushToTrackDetail()
      return
    }
    await loadPage()
  } catch (err: any) {
    error.value = err.message || t('workflowStep.uploadFailed')
  } finally {
    uploading.value = false
  }
}

async function confirmDelivery() {
  if (!track.value || !masterDelivery.value) return
  const previousStatus = track.value.status
  acting.value = true
  error.value = ''
  try {
    const updatedTrack = await trackApi.confirmDelivery(track.value.id, masterDelivery.value.id)
    toastSuccess(t('trackDetail.actions.confirm_delivery', 'Confirm Delivery'))
    if (updatedTrack.status !== previousStatus) {
      pushToTrackDetail()
      return
    }
    await loadPage()
  } catch (err: any) {
    error.value = err.message || t('workflowStep.transitionFailed')
  } finally {
    acting.value = false
  }
}

async function approveFinal() {
  if (!track.value) return
  const previousStatus = track.value.status
  acting.value = true
  error.value = ''
  try {
    const updatedTrack = await trackApi.approveFinalReview(track.value.id)
    if (updatedTrack.status !== previousStatus) {
      toastSuccess(t('workflowStep.finalApproved'))
      pushToTrackDetail()
      return
    }
    await loadPage()
    toastSuccess(t('workflowStep.actionSubmitted'))
  } catch (err: any) {
    error.value = err.message || t('workflowStep.transitionFailed')
  } finally {
    acting.value = false
  }
}

async function requestReturn() {
  if (!track.value) return
  acting.value = true
  error.value = ''
  try {
    await trackApi.requestReturnInFinalReview(track.value.id)
    toastSuccess(t('finalReview.returnRequested'))
  } catch (err: any) {
    error.value = err.message || t('workflowStep.transitionFailed')
  } finally {
    acting.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  resetDeliveryPreview()
  const file = input.files?.[0] ?? null
  if (file && file.size > MAX_AUDIO_SIZE) {
    toastError(t('upload.fileTooLarge', { max: '200 MB' }))
    input.value = ''
    return
  }
  uploadFile.value = file
  if (uploadFile.value) {
    localDeliveryPreviewUrl.value = URL.createObjectURL(uploadFile.value)
  }
}

function resolveForwardTargetLabel(decision: string): string | null {
  const targetStepId = currentStep.value?.transitions?.[decision]
  if (!targetStepId) return null
  const targetStep = workflowConfig.value?.steps.find(step => step.id === targetStepId)
  return targetStep ? translateStepLabel(targetStep, t) : null
}

function transitionLabel(transition: WorkflowTransitionOption) {
  const { decision, label: fallbackLabel } = transition
  if (decision === DIRECT_REVISION_REQUEST_DECISION) {
    return currentUserHasRevisionSuggestion.value
      ? t('workflowStep.directRevisionFromSubmitted')
      : t('workflowStep.directRevisionNow')
  }
  if (activeVariant.value === 'intake' && decision === 'accept') {
    const label = resolveForwardTargetLabel('accept')
    if (label) return t('workflowStep.forwardToStep', { step: label })
  }
  if (activeVariant.value === 'producer_gate' && decision === 'approve') {
    const label = resolveForwardTargetLabel('approve')
    if (label) return t('workflowStep.forwardToStep', { step: label })
  }
  if (currentStep.value?.type === 'review') {
    if (currentUserCanFinalizeReview.value) {
      if (transitionIsApprove(transition)) return t('workflowStep.reviewFinalizeApprove')
      if (transitionIsRevision(transition)) return t('workflowStep.reviewFinalizeRevision')
    }
    if (currentUserCanSubmitReview.value) {
      if (transitionIsApprove(transition)) return t('workflowStep.reviewSubmitApprove')
      if (transitionIsRevision(transition)) {
        return reviewUsesFirstRevisionRequest.value
          ? t('workflowStep.reviewSuggestRevision')
          : t('workflowStep.reviewSubmitRevision')
      }
    }
  }
  return translateWorkflowDecision(decision, workflowConfig.value, t, undefined, fallbackLabel)
}

const classicActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr),
    type: actionTypeForTransition(tr),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const deliveryActions = computed<WorkflowAction[]>(() => {
  const actions = transitions.value.map((tr) => ({
    label: transitionLabel(tr),
    type: actionTypeForTransition(tr),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  }))
  if (canConfirmDelivery.value) {
    actions.unshift({
      label: t('trackDetail.actions.confirm_delivery', 'Confirm Delivery'),
      type: 'advance',
      disabled: acting.value,
      handler: confirmDelivery,
    })
  }
  return actions
})

const finalReviewActions = computed<WorkflowAction[]>(() => {
  const actions = transitions.value
    .filter(tr => !isFinalReviewDedicatedTransition(tr))
    .map((tr) => ({
    label: transitionLabel(tr),
    type: actionTypeForTransition(tr),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
    }))
  if (canApproveFinal.value) {
    actions.unshift({
      label: t('finalReview.approveMaster'),
      type: 'advance',
      disabled: acting.value,
      handler: approveFinal,
    })
  }
  if (canRequestReturn.value) {
    actions.push({
      label: t('finalReview.requestReturn'),
      type: 'return',
      disabled: acting.value,
      handler: requestReturn,
    })
  }
  return actions
})

const peerReviewActions = computed<WorkflowAction[]>(() =>
  classicActions.value.map(action => ({
    ...action,
    disabled: action.disabled || (isPeerReviewChecklistEnabled.value && !checklistSaved.value),
  })),
)

function goBack() {
  pushToTrackDetail()
}

const genericReviewActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr),
    type: tr.decision === 'return' || tr.decision.includes('revision') ? 'return' : 'advance',
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const genericApprovalActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr),
    type: actionTypeForTransition(tr),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const peerReviewActionHint = computed((): string | undefined => {
  if (reviewWaitingForAssignment.value) return t('workflowStep.reviewWaitingForAssignment')
  if (isPeerReviewChecklistEnabled.value && !checklistSaved.value) return undefined
  if (currentUserCanFinalizeReview.value) return t('workflowStep.reviewFinalizeHint')
  if (reviewRequiresGroupFinalization.value && currentUserAssignment.value?.status === 'completed' && !reviewQuorumReached.value) {
    if (reviewUsesFirstRevisionRequest.value && currentUserHasRevisionSuggestion.value) {
      return t('workflowStep.reviewWaitingForQuorumEarlyRevision')
    }
    return t('workflowStep.reviewWaitingForQuorum', { completed: completedReviewCount.value, required: requiredReviewCount.value })
  }
  if (currentUserCanSubmitReview.value) {
    return reviewUsesFirstRevisionRequest.value
      ? t('workflowStep.reviewSubmitHintEarlyRevision')
      : t('workflowStep.reviewSubmitHint')
  }
  return undefined
})

const { handleWaveformHotkeys } = useWaveformHotkeys({
  issueFormRef,
  waveformRef,
  canUse: () => ['peer_review', 'producer_gate', 'mastering', 'final_review'].includes(activeVariant.value),
})

function handleIssueHover(issue: Issue) {
  hoveredIssueId.value = issue.id
}

function handleIssueLeave() {
  hoveredIssueId.value = null
}

function handleMasterVersionDownload(delivery: MasterDelivery) {
  if (!delivery.file_path) return
  const url = masterDeliveryAudioUrl(trackId.value, delivery.id, delivery.delivery_number, delivery.workflow_cycle)
  const historySuffix = historicalDeliveryDownloadSuffix(delivery, track.value?.workflow_cycle)
  downloadAudioAsset(url, `${track.value?.title ?? 'track'}_master_v${delivery.delivery_number}${historySuffix}`, delivery.file_path)
}
</script>


<template>
  <!-- Revision Type Selection Modal -->
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
        <!-- Source Audio Option -->
        <label
          class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors"
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
          <div class="flex-1">
            <div class="text-sm font-mono font-semibold text-foreground">
              {{ t('workflowStep.revisionTypeSourceAudio') }}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              {{ t('workflowStep.revisionTypeSourceAudioDesc') }}
            </div>
          </div>
        </label>

        <!-- Stem Files Option -->
        <label
          class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors"
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
          <div class="flex-1">
            <div class="text-sm font-mono font-semibold text-foreground">
              {{ t('workflowStep.revisionTypeStemFiles') }}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              {{ t('workflowStep.revisionTypeStemFilesDesc') }}
            </div>
          </div>
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

  <div v-if="loading" class="max-w-4xl mx-auto space-y-6">
    <div class="card animate-pulse h-24"></div>
  </div>

  <div v-else-if="loadError || !track || !currentStep" class="max-w-4xl mx-auto space-y-6">
    <div v-if="track?.status === 'source_followup_pending'" class="card space-y-3 border-warning/30">
      <h1 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.sourceFollowupPendingTitle') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('workflowStep.sourceFollowupPendingDesc') }}</p>
      <div>
        <button @click="pushToTrackDetail" class="btn-secondary text-sm">{{ t('common.backToTrack') }}</button>
      </div>
    </div>
    <div v-else class="card space-y-3">
      <p class="text-sm text-error">{{ loadError || t('common.loadFailed') }}</p>
      <div>
        <button @click="loadPage" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
      </div>
    </div>
  </div>

  <div v-else-if="activeVariant === 'intake'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <IntakeStep
      :track="track"
      :workflow-config="workflowConfig"
      :error="error"
      :show-reconnect-banner="wsHadConnection && !wsConnected"
      :ws-reconnect-attempts="wsReconnectAttempts"
      :total-issue-count="allCycleIssues.length"
      :open-issue-count="openCount"
      :resolved-issue-count="resolvedCount"
      :audio-url="audioUrl"
      :waveform-issues="waveformIssues"
      :track-id="trackId"
      :downloading="downloading"
      :download-progress="downloadProgress"
      :register-waveform="registerWaveform"
      @back="goBack"
      @ws-retry="wsRetry"
      @download="handleDownload"
      @waveform-ready="onWaveformReady"
      @waveform-timeupdate="onWaveformTimeUpdate"
      @waveform-playback-state-change="onWaveformPlaybackStateChange"
    />

    <WorkflowActionBar :actions="classicActions" />
  </div>
  <div v-else-if="activeVariant === 'peer_review'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <PeerReviewStep
      :track="track"
      :workflow-config="workflowConfig"
      :error="error"
      :waiting-for-assignment="reviewWaitingForAssignment"
      :can-finalize-review="currentUserCanFinalizeReview"
      :requires-group-finalization="reviewRequiresGroupFinalization"
      :current-user-assignment="currentUserAssignment"
      :quorum-reached="reviewQuorumReached"
      :uses-first-revision-request="reviewUsesFirstRevisionRequest"
      :has-revision-suggestion="currentUserHasRevisionSuggestion"
      :completed-review-count="completedReviewCount"
      :required-review-count="requiredReviewCount"
      :can-manage-assignments="canManageReviewAssignments"
      :assignment-saving="reviewerAssignmentSaving"
      :assignment-button-label="reviewerAssignmentButtonLabel"
      :assignments="currentStepAssignments"
      :audio-url="audioUrl"
      :waveform-issues="waveformIssues"
      :track-id="trackId"
      :has-comparable-versions="olderPlayableSourceVersions.length > 0"
      :show-source-compare="showSourceCompare"
      :source-compare-options="sourceCompareOptions"
      v-model:compare-source-version-id="selectedCompareSourceVersionId"
      :is-source-compare-active="isSourceCompareActive"
      :waveform-mode="waveformMode"
      :hovered-issue-id="hoveredIssueId"
      :downloading="downloading"
      :download-progress="downloadProgress"
      :register-waveform="registerWaveform"
      :register-issue-form="registerIssueForm"
      v-model:form-open="isIssueFormOpen"
      :issues="issues"
      :mention-candidates="mentionCandidates"
      :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
      :list-issues="fallbackWaveformIssues"
      :displayed-source-version-number="displayedSourceVersionNumber"
      :review-assignments="reviewAssignments"
      :batch-updating="batchUpdatingIssues"
      :batch-actions="stageBatchActions"
      v-model:selected-issue-ids="selectedStageIssueIds"
      v-model:batch-note="stageBatchNote"
      :checklist-enabled="isPeerReviewChecklistEnabled"
      :checklist-saved="checklistSaved"
      :checklist-prefill="checklistPrefill"
      :checklist-prefill-state-label="checklistPrefillStateLabel"
      :checklist-draft="checklistDraft"
      :checklist-save-button-label="checklistSaveButtonLabel"
      @back="goBack"
      @toggle-source-compare="toggleSourceCompare"
      @download="handleDownload"
      @waveform-ready="onWaveformReady"
      @waveform-timeupdate="onWaveformTimeUpdate"
      @waveform-playback-state-change="onWaveformPlaybackStateChange"
      @request-waveform-mode="onRequestWaveformMode"
      @issue-select="onIssueSelect"
      @issue-hover="handleIssueHover"
      @issue-leave="handleIssueLeave"
      @issue-created="onIssueCreated"
      @batch-clear="selectedStageIssueIds = []; stageBatchNote = ''"
      @batch-apply="applyStageBatchStatus($event)"
      @quick-status-change="onQuickIssueStatusChange"
      @open-reviewer-assignment="openReviewerAssignment"
      @submit-checklist="submitChecklist"
    />

    <WorkflowActionBar :actions="peerReviewActions" :hint="peerReviewActionHint" />
  </div>
  <div v-else-if="activeVariant === 'producer_gate'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <ProducerGateStep
      :track="track"
      :workflow-config="workflowConfig"
      :error="error"
      :total-issue-count="allCycleIssues.length"
      :open-issue-count="openCount"
      :resolved-issue-count="resolvedCount"
      :checklist-passed-count="checklistPassedCount"
      :checklist-item-count="checklistItems.length"
      :checklist-reviewer-count="checklistByReviewer.length"
      :audio-url="audioUrl"
      :waveform-issues="producerWaveformIssues"
      :track-id="trackId"
      :has-comparable-versions="olderPlayableSourceVersions.length > 0"
      :show-source-compare="showSourceCompare"
      :source-compare-options="sourceCompareOptions"
      v-model:compare-source-version-id="selectedCompareSourceVersionId"
      :is-source-compare-active="isSourceCompareActive"
      :waveform-mode="waveformMode"
      :hovered-issue-id="hoveredIssueId"
      :downloading="downloading"
      :download-progress="downloadProgress"
      :register-waveform="registerWaveform"
      :register-issue-form="registerIssueForm"
      v-model:form-open="isIssueFormOpen"
      :issues="issues"
      :mention-candidates="mentionCandidates"
      :displayed-source-version-number="displayedSourceVersionNumber"
      :review-assignments="reviewAssignments"
      :checklist-by-reviewer="checklistByReviewer"
      :peer-open-count="peerOpenCount"
      :peer-resolved-count="peerResolvedCount"
      :peer-disagreed-count="peerDisagreedCount"
      :peer-discussed-count="peerDiscussedCount"
      :peer-issues="peerIssues"
      :producer-open-count="producerOpenCount"
      :producer-resolved-count="producerResolvedCount"
      :producer-disagreed-count="producerDisagreedCount"
      :producer-snapshot-issues="producerSnapshotIssues"
      :batch-updating="batchUpdatingIssues"
      :producer-batch-actions="producerBatchActions"
      v-model:selected-producer-issue-ids="selectedProducerIssueIds"
      v-model:producer-batch-note="producerBatchNote"
      @back="goBack"
      @toggle-source-compare="toggleSourceCompare"
      @download="handleDownload"
      @waveform-ready="onWaveformReady"
      @waveform-timeupdate="onWaveformTimeUpdate"
      @waveform-playback-state-change="onWaveformPlaybackStateChange"
      @request-waveform-mode="onRequestWaveformMode"
      @issue-select="onIssueSelect"
      @issue-hover="handleIssueHover"
      @issue-leave="handleIssueLeave"
      @issue-created="onIssueCreated"
      @producer-batch-clear="selectedProducerIssueIds = []; producerBatchNote = ''"
      @producer-batch-apply="applyProducerBatchStatus($event)"
      @quick-status-change="onQuickIssueStatusChange"
      @open-issue="openIssueDrawer"
    />

    <WorkflowActionBar
      :actions="classicActions"
      layout="grouped"
      :group-label="t('producer.decisionGroupLabel')"
    />
  </div>
  <div v-else-if="activeVariant === 'final_review'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <FinalReviewStep
      :track="track"
      :workflow-config="workflowConfig"
      :error="error"
      :master-audio-url="masterAudioUrl"
      :master-delivery="masterDelivery"
      :track-id="trackId"
      :has-comparable-masters="olderPlayableMasterDeliveries.length > 0"
      :show-master-compare="showMasterCompare"
      :master-compare-options="masterCompareOptions"
      v-model:compare-master-delivery-id="selectedCompareMasterDeliveryId"
      :compare-master-audio-url="selectedCompareMasterAudioUrl"
      :waveform-mode="waveformMode"
      :hovered-issue-id="hoveredIssueId"
      :downloading="downloading"
      :download-progress="downloadProgress"
      :register-waveform="registerWaveform"
      :register-issue-form="registerIssueForm"
      v-model:form-open="isIssueFormOpen"
      :issues="issues"
      :mention-candidates="mentionCandidates"
      :final-review-issues="finalReviewIssues"
      :review-assignments="reviewAssignments"
      :batch-updating="batchUpdatingIssues"
      :batch-actions="stageBatchActions"
      v-model:selected-issue-ids="selectedStageIssueIds"
      v-model:batch-note="stageBatchNote"
      :composer-approval-label="composerApprovalLabel"
      :sorted-master-deliveries="sortedMasterDeliveries"
      @back="goBack"
      @toggle-master-compare="toggleMasterCompare"
      @download-master="handleMasterDownload"
      @waveform-ready="onWaveformReady"
      @waveform-timeupdate="onWaveformTimeUpdate"
      @waveform-playback-state-change="onWaveformPlaybackStateChange"
      @request-waveform-mode="onRequestWaveformMode"
      @issue-select="onIssueSelect"
      @issue-hover="handleIssueHover"
      @issue-leave="handleIssueLeave"
      @issue-created="onIssueCreated"
      @batch-clear="selectedStageIssueIds = []; stageBatchNote = ''"
      @batch-apply="applyStageBatchStatus($event)"
      @quick-status-change="onQuickIssueStatusChange"
      @compare-delivery="compareWithMasterDelivery($event.id)"
      @download-delivery="handleMasterVersionDownload"
    />

    <WorkflowActionBar :actions="finalReviewActions" />
  </div>
  <div v-else class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <button @click="goBack" class="btn-secondary !px-3 !py-2">
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-mono font-bold truncate">{{ track.title }}</h1>
        <p class="text-sm text-muted-foreground mt-0.5">
          {{ translateStepLabel(currentStep, t) }} · <span :class="{ 'font-mono': trackArtistUsesHash(track) }">{{ trackArtistDisplay(track) }}</span>
        </p>
        <p v-if="isProxySubmission" class="mt-1 text-xs text-muted-foreground">
          {{ t('trackDetail.externalComposers') }}: {{ externalComposerDisplayText(track) }} · {{ t('trackDetail.composerProxyActor') }}: {{ track.proxy_uploader?.display_name ?? track.submitter?.display_name ?? '--' }}
        </p>
      </div>
      <StatusBadge :status="track.status" type="track" :label="currentStep?.label ?? null" />
    </div>

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div class="card">
      <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />
    </div>

    <template v-if="isApprovalStep">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-end gap-2">
          <button
            v-if="olderPlayableSourceVersions.length > 0"
            @click="toggleSourceCompare"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <div v-if="showSourceCompare && olderPlayableSourceVersions.length > 0" class="space-y-2">
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
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <div v-if="fallbackStepIssues.length" class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.issues', { count: fallbackWaveformIssues.length }) }}</h3>
        <BatchIssueActions
          :selected-count="selectedStageIssueIds.length"
          :statuses="stageBatchActions"
          :note="stageBatchNote"
          :loading="batchUpdatingIssues"
          :issues="issues"
          :mention-users="mentionCandidates.issue_internal"
          @update:note="stageBatchNote = $event"
          @clear="selectedStageIssueIds = []; stageBatchNote = ''"
          @apply="applyStageBatchStatus($event)"
        />
        <IssueMarkerList
          :issues="fallbackWaveformIssues"
          :selectable="true"
          :selected-ids="selectedStageIssueIds"
          :current-source-version-number="displayedSourceVersionNumber"
          :track="track"
          :assignments="reviewAssignments"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="onIssueSelect"
          @update:selectedIds="selectedStageIssueIds = $event"
          @status-change="onQuickIssueStatusChange"
        />
      </div>

      <div class="card space-y-4">
        <IssueCreatePanel
          :track-id="trackId"
          :phase="currentStep.id"
          :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
          :issues="issues"
          :mention-users="mentionCandidates.issue_public"
          :public-mention-users="mentionCandidates.issue_public"
          :internal-mention-users="mentionCandidates.issue_internal"
          @created="onIssueCreated"
        />
      </div>

      <WorkflowActionBar :actions="genericApprovalActions" :hint="t('common.actions')" />
    </template>

    <template v-if="currentStep.type === 'review'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-end gap-2">
          <button
            v-if="olderPlayableSourceVersions.length > 0"
            @click="toggleSourceCompare"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <div v-if="showSourceCompare && olderPlayableSourceVersions.length > 0" class="space-y-2">
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
          :issues="fallbackWaveformIssues"
          :track-id="trackId"
          :compare-version-id="selectedCompareSourceVersionId"
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <div class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.issues', { count: fallbackWaveformIssues.length }) }}</h3>
        <BatchIssueActions
          :selected-count="selectedStageIssueIds.length"
          :statuses="stageBatchActions"
          :note="stageBatchNote"
          :loading="batchUpdatingIssues"
          :issues="issues"
          :mention-users="mentionCandidates.issue_internal"
          @update:note="stageBatchNote = $event"
          @clear="selectedStageIssueIds = []; stageBatchNote = ''"
          @apply="applyStageBatchStatus($event)"
        />
        <IssueMarkerList
          :issues="fallbackWaveformIssues"
          :selectable="true"
          :selected-ids="selectedStageIssueIds"
          :current-source-version-number="displayedSourceVersionNumber"
          :track="track"
          :assignments="reviewAssignments"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="onIssueSelect"
          @update:selectedIds="selectedStageIssueIds = $event"
          @status-change="onQuickIssueStatusChange"
        />
      </div>

      <div class="card space-y-4">
        <IssueCreatePanel
          :track-id="trackId"
          :phase="currentStep.id"
          :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
          :issues="issues"
          :mention-users="mentionCandidates.issue_public"
          :public-mention-users="mentionCandidates.issue_public"
          :internal-mention-users="mentionCandidates.issue_internal"
          @created="onIssueCreated"
        />
      </div>

      <WorkflowActionBar :actions="genericReviewActions" :hint="peerReviewActionHint" />
    </template>

    <template v-if="currentStep.type === 'revision'">
      <!-- 1. Waveform with hover interaction -->
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.currentAudio') }}</h3>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          ref="waveformRef"
          :audio-url="audioUrl"
          :issues="revisionWaveformIssues"
          :track-id="trackId"
          :hovered-issue-id="hoveredIssueId"
          @issueHover="handleIssueHover"
          @issueLeave="handleIssueLeave"
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <!-- 2. Issue summary + marker list (merged) -->
      <div class="card space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('producer.issueSummaryHeading') }}</h3>
            <p
              class="text-sm"
              :class="revisionOpenIssues.length > 0 ? 'text-warning' : 'text-success'"
            >
              {{ revisionOpenIssues.length > 0
                ? t('revision.openIssuesReminder', { count: revisionOpenIssues.length })
                : t('revision.allIssuesHandled') }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2 text-xs sm:justify-end">
            <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground">
              <span class="font-mono text-sm text-foreground">{{ revisionSnapshotIssues.length }}</span>
              <span>{{ t('producer.cycleIssues') }}</span>
            </div>
            <div class="inline-flex items-center gap-2 rounded-full bg-warning-bg px-3 py-1.5 text-warning">
              <span class="font-mono text-sm text-foreground">{{ revisionOpenIssues.length }}</span>
              <span>{{ t('producer.open') }}</span>
            </div>
            <div class="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1.5 text-success">
              <span class="font-mono text-sm text-foreground">{{ revisionResolvedIssues.length }}</span>
              <span>{{ t('producer.resolved') }}</span>
            </div>
          </div>
        </div>
        <BatchIssueActions
          :selected-count="selectedRevisionIssueIds.length"
          :statuses="revisionBatchActions"
          :note="revisionBatchNote"
          :loading="batchUpdatingIssues"
          :issues="issues"
          :mention-users="mentionCandidates.issue_internal"
          @update:note="revisionBatchNote = $event"
          @clear="selectedRevisionIssueIds = []; revisionBatchNote = ''"
          @apply="applyRevisionBatchStatus($event)"
        />
        <IssueMarkerList
          v-if="revisionSnapshotIssues.length"
          :issues="revisionSnapshotIssues"
          :track="track"
          :selectable="true"
          :selected-ids="selectedRevisionIssueIds"
          :current-source-version-number="track.version"
          :hovered-issue-id="hoveredIssueId"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="openIssueDrawer"
          @update:selectedIds="selectedRevisionIssueIds = $event"
          @hover="handleIssueHover"
          @leave="handleIssueLeave"
          @status-change="onQuickIssueStatusChange"
        />
      </div>

      <!-- 3a. Upload card (assignee only, at bottom) -->
      <div v-if="isRevisionAssignee" class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.uploadRevisedSource') }}</h3>

        <div
          v-if="isMasteringRevisionStep && requestedRevisionType"
          class="flex items-start gap-3 border border-info/20 bg-info-bg rounded-none p-4"
        >
          <Info class="w-4 h-4 text-info flex-shrink-0 mt-0.5" :stroke-width="2" />
          <div class="space-y-1">
            <p class="text-sm font-mono font-semibold text-info">{{ requestedRevisionTitle }}</p>
            <p class="text-xs text-muted-foreground">{{ requestedRevisionHint }}</p>
          </div>
        </div>

        <!-- Submission method selection for legacy mastering revisions without a requested type -->
        <div v-if="shouldShowRevisionSubmitMethod" class="space-y-3">
          <label class="block text-sm text-muted-foreground">{{ t('workflowStep.revisionSubmitMethod') }}</label>
          <div class="space-y-2">
            <label class="flex items-center gap-3 p-3 border rounded-none cursor-pointer"
                   :class="revisionUploadMode === 'file' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'">
              <input type="radio" value="file" v-model="revisionUploadMode" />
              <span class="text-sm text-foreground">{{ t('workflowStep.revisionSubmitMethodUploadFile') }}</span>
            </label>
            <label class="flex items-center gap-3 p-3 border rounded-none cursor-pointer"
                   :class="revisionUploadMode === 'link' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'">
              <input type="radio" value="link" v-model="revisionUploadMode" />
              <span class="text-sm text-foreground">{{ t('workflowStep.revisionSubmitMethodExternalLink') }}</span>
            </label>
          </div>
        </div>

        <template v-if="shouldShowRevisionFileUpload">
          <input
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
            @change="onFileChange"
            :disabled="uploading"
            class="input-field"
          />
          <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
            <div class="space-y-1">
              <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.revisedPreviewHeading') }}</h4>
            </div>
            <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" />
            <div>
              <label class="block text-sm text-muted-foreground mb-1">{{ t('workflowStep.revisionNotes') }}</label>
              <textarea v-model="revisionNotes" class="textarea-field w-full" rows="3" :placeholder="t('workflowStep.revisionNotesPlaceholder')"></textarea>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                @click="handleUpload('revision')"
                :disabled="uploading"
                class="btn-primary text-sm h-10 inline-flex items-center justify-center"
              >
                <Upload class="w-4 h-4 mr-2" />
                {{ uploading ? t('workflowStep.uploading') : t('workflowStep.uploadRevision') }}
              </button>
              <button
                @click="uploadFile = null; revisionNotes = ''; resetDeliveryPreview()"
                :disabled="uploading"
                class="btn-secondary text-sm"
              >
                {{ t('workflowStep.clearRevision') }}
              </button>
            </div>
          </div>
        </template>

        <div v-if="shouldShowExternalStemLinkForm" class="space-y-4 border border-primary/20 bg-primary/5 rounded-none p-4">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Link class="w-4 h-4 text-primary" :stroke-width="2" />
            </div>
            <div class="flex-1 space-y-1">
              <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.externalStemLinkTitle') }}</h4>
              <p class="text-xs text-muted-foreground">{{ t('workflowStep.externalStemLinkDesc') }}</p>
            </div>
          </div>

          <div class="border border-border bg-background rounded-none p-3 space-y-2">
            <div class="flex items-start gap-2">
              <Info class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" :stroke-width="2" />
              <div class="flex-1 space-y-1">
                <p class="text-xs font-mono text-muted-foreground">{{ t('workflowStep.externalStemLinkExampleHeading') }}</p>
                <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{{ t('workflowStep.externalStemLinkExample') }}</pre>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs text-muted-foreground">{{ t('workflowStep.externalStemLinkLabel') }}</label>
            <textarea
              v-model="externalStemLinkNotes"
              class="textarea-field w-full min-h-[140px]"
              :placeholder="t('workflowStep.externalStemLinkPlaceholder')"
              :disabled="uploading"
            ></textarea>
            <div class="flex items-start gap-2">
              <Info class="w-3.5 h-3.5 text-info flex-shrink-0 mt-0.5" :stroke-width="2" />
              <p class="text-xs text-info">{{ t('workflowStep.externalStemLinkHint') }}</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              @click="handleExternalSourceLinkSubmit"
              :disabled="uploading || !canSubmitExternalStemLink"
              class="btn-primary text-sm h-10 inline-flex items-center justify-center"
            >
              <Upload class="w-4 h-4 mr-2" />
              {{ uploading ? t('workflowStep.uploading') : t('workflowStep.submitExternalStemLink') }}
            </button>
            <button
              v-if="externalStemLinkNotes"
              @click="externalStemLinkNotes = ''"
              :disabled="uploading"
              class="btn-secondary text-sm"
            >
              {{ t('workflowStep.clearExternalStemLink') }}
            </button>
          </div>
        </div>

        <div v-if="uploading" class="space-y-1">
          <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
        </div>
      </div>

      <!-- 3b. Waiting card (non-assignee) or unresolved assignee warning -->
      <div v-else-if="revisionAssigneeUserId == null" class="card border border-warning/40 bg-warning-bg space-y-2">
        <h3 class="text-sm font-mono font-semibold text-warning">
          {{ t('workflowStep.revisionAssigneeUnresolved') }}
        </h3>
        <p class="text-sm text-muted-foreground">{{ t('workflowStep.revisionAssigneeUnresolvedDesc', { role: revisionAssigneeRoleLabel || t('workflowStep.unknownRole') }) }}</p>
      </div>
      <div v-else class="card space-y-2">
        <h3 class="text-sm font-mono font-semibold">
          {{ t('workflowStep.waitingForRevision', { assignee: revisionAssigneeRoleLabel }) }}
        </h3>
        <p class="text-sm text-muted-foreground">{{ t('workflowStep.waitingForRevisionDesc') }}</p>
      </div>

    </template>

    <template v-if="currentStep.type === 'delivery'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.sourceAudio') }}</h3>
          <div class="flex items-center gap-2">
            <button
              v-if="olderPlayableSourceVersions.length > 0"
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
        <div v-if="showSourceCompare && olderPlayableSourceVersions.length > 0" class="space-y-2">
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
        <WaveformPlayer :audio-url="audioUrl" :issues="waveformIssues" :track-id="trackId" :compare-version-id="selectedCompareSourceVersionId" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.uploadDelivery') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('workflowStep.deliveryMessageHint') }}</p>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryFileLabel') }}</label>
          <input
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
            @change="onFileChange"
            class="input-field"
          />
        </div>
        <div class="space-y-2">
          <label class="block text-xs text-muted-foreground">{{ t('workflowStep.deliveryMessageLabel') }}</label>
          <textarea
            v-model="deliveryMessage"
            class="textarea-field min-h-[120px]"
            :placeholder="t('workflowStep.deliveryMessagePlaceholder')"
            :disabled="uploading"
          ></textarea>
        </div>
        <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
          </div>
          <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            @click="handleUpload('delivery')"
            :disabled="uploading || !canSubmitDelivery"
            class="btn-primary text-sm h-10 inline-flex items-center justify-center"
          >
            <Upload class="w-4 h-4 mr-2" />
            {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
          </button>
          <button
            v-if="uploadFile"
            @click="uploadFile = null; resetDeliveryPreview()"
            :disabled="uploading"
            class="btn-secondary text-sm"
          >
            {{ t('workflowStep.clearSelectedDelivery') }}
          </button>
        </div>
      </div>

      <div v-if="masterDelivery" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.currentDelivery') }}</h3>
          <button v-if="masterAudioUrl" @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ masterDelivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
        </p>
        <div v-if="masterDelivery.delivery_message" class="border border-border bg-background rounded-none p-3">
          <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
          <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ masterDelivery.delivery_message }}</p>
        </div>
        <WaveformPlayer v-if="masterAudioUrl" :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" />
        <p v-else class="text-sm text-muted-foreground">{{ t('workflowStep.textDeliveryNoAudio') }}</p>
      </div>

      <WorkflowActionBar v-if="deliveryActions.length" :actions="deliveryActions" :hint="t('common.actions')" />
    </template>
  </div>

  <ReviewerAssignmentModal
    v-if="reviewerAssignmentModalOpen"
    :has-assignments="currentStepAssignments.length > 0"
    :selection-summary="reviewerAssignmentSelectionSummary"
    :loading="reviewerAssignmentLoadingMembers"
    :members="reviewerAssignmentMembers"
    :selected-user-ids="reviewerAssignmentSelectedUserIds"
    :saving="reviewerAssignmentSaving"
    :confirm-disabled="reviewerAssignmentConfirmDisabled"
    :is-member-disabled="reviewerAssignmentIsMemberDisabled"
    @close="closeReviewerAssignmentModal"
    @toggle-member="toggleReviewerAssignmentMember"
    @confirm="submitReviewerAssignment"
  />


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
    v-if="canSeeMasteringSidebar && track"
    :track-id="trackId"
    :track-completed="track.status === 'completed'"
    :issues="issues"
    :mention-users="mentionCandidates.mastering"
    @open-issue="openLinkedIssue"
  />
</template>
