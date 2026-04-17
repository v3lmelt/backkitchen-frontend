<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { checklistApi, issueApi, trackApi, r2Api, uploadToR2, API_ORIGIN } from '@/api'
import type {
  ChecklistItem,
  ChecklistTemplateItem,
  Issue,
  StageAssignment,
  Track,
  TrackSourceVersion,
  User,
  WorkflowConfig,
  MasterDelivery,
  WorkflowStepDef,
  WorkflowTransitionOption,
} from '@/types'
import { formatLocaleDate, formatTimestampShort } from '@/utils/time'
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
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import DiscussionPanel from '@/components/common/DiscussionPanel.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import { ChevronLeft, Upload, AlertCircle, CheckCircle2 } from 'lucide-vue-next'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useDiscussions } from '@/composables/useDiscussions'
import { useToast } from '@/composables/useToast'
import { useAppStore } from '@/stores/app'
import { useTrackStore } from '@/stores/tracks'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { translateStepLabel } from '@/utils/workflow'
import { hashId } from '@/utils/hash'
import { extractAudioDuration } from '@/utils/audio'
import { activeAssignmentsForStep, canUserChangeIssueStatus, canUserSubmitIssueStatus } from '@/utils/reviewAssignments'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { success: toastSuccess, error: toastError } = useToast()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

const MAX_AUDIO_SIZE = 200 * 1024 * 1024 // 200 MB
const appStore = useAppStore()
const trackStore = useTrackStore()
const trackId = computed(() => Number(route.params.id))
const chatSidebarRef = ref<InstanceType<typeof MasteringChatSidebar> | null>(null)

const wsReloading = ref(false)
useTrackWebSocket(trackId.value, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadPage()
  wsReloading.value = false
}, {
  onDiscussionEvent: (event, discussionId) => {
    chatSidebarRef.value?.handleDiscussionEvent(event, discussionId)
  },
})

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
const masterDeliveries = ref<MasterDelivery[]>([])
const workflowConfig = ref<WorkflowConfig | null>(null)
const checklistItems = ref<ChecklistItem[]>([])
const templateItems = ref<ChecklistTemplateItem[]>([])
const checklistDraft = ref<{ label: string; passed: boolean; note: string }[]>([])
const reviewAssignments = ref<StageAssignment[]>([])
const loading = ref(true)
const loadError = ref('')
const acting = ref(false)
const uploadFile = ref<File | null>(null)
const localDeliveryPreviewUrl = ref('')
const revisionNotes = ref('')
const uploading = ref(false)
const error = ref('')
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const uploadProgress = ref(0)
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const waveformDuration = ref(0)
const waveformCurrentTime = ref(0)
const waveformIsPlaying = ref(false)
const hoveredIssueId = ref<number | null>(null)
const selectedIssue = ref<Issue | null>(null)
const selectedStageIssueIds = ref<number[]>([])
const selectedProducerIssueIds = ref<number[]>([])
const selectedRevisionIssueIds = ref<number[]>([])
const stageBatchNote = ref('')
const producerBatchNote = ref('')
const revisionBatchNote = ref('')
const batchUpdatingIssues = ref(false)
const isIssueFormOpen = ref(false)
const waveformMode = computed<'seek' | 'annotate'>(() => (isIssueFormOpen.value ? 'annotate' : 'seek'))
const showSourceCompare = ref(false)
const selectedCompareSourceVersionId = ref<number | null>(null)

// ── Mastering discussion (composable) ──────────────────────────────────────
const masteringDiscussion = useDiscussions(trackId, 'mastering')

function isIssueUnresolved(status: Issue['status']): boolean {
  return status === 'open' || status === 'pending_discussion' || status === 'disagreed'
}

function onRequestWaveformMode(next: 'seek' | 'annotate') {
  if (next === 'annotate' && isSourceCompareActive.value) return
  if (next === 'annotate') issueFormRef.value?.openForm?.()
  else issueFormRef.value?.closeForm?.()
}

const defaultChecklistLabelKeyMap: Record<string, string> = {
  Arrangement: 'arrangement',
  Balance: 'balance',
  'Low-End': 'lowEnd',
  'Stereo Image': 'stereoImage',
  'Technical Cleanliness': 'technicalCleanliness',
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
  return Boolean(uploading.value || uploadFile.value)
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
const transitions = computed<WorkflowTransitionOption[]>(() => track.value?.workflow_transitions ?? [])
const currentStepAssignments = computed(() => activeAssignmentsForStep(reviewAssignments.value, currentStep.value?.id))
const completedReviewCount = computed(() => currentStepAssignments.value.filter(assignment => assignment.status === 'completed').length)
const requiredReviewCount = computed(() => Math.max(1, currentStep.value?.required_reviewer_count ?? 1))
const currentUserAssignment = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId) return null
  // Prefer a pending assignment over a completed one when the same user has
  // multiple active records for this step (can happen after a reassignment
  // that re-includes a user who previously completed their review).
  const mine = currentStepAssignments.value.filter(assignment => assignment.user_id === userId)
  return mine.find(assignment => assignment.status === 'pending') ?? mine[0] ?? null
})
const reviewQuorumReached = computed(() => completedReviewCount.value >= requiredReviewCount.value)
const reviewRequiresGroupFinalization = computed(() => currentStep.value?.type === 'review' && requiredReviewCount.value > 1)
const reviewAllowsInternalIssueVisibility = computed(() => {
  if (currentStep.value?.type !== 'review') return false
  const assignmentCount = currentStepAssignments.value.length
  const reviewerScopeCount = Math.max(requiredReviewCount.value, assignmentCount)
  return reviewerScopeCount > 1
})
const reviewWaitingForAssignment = computed(() => currentStep.value?.type === 'review' && currentStepAssignments.value.length === 0)
const currentUserCanFinalizeReview = computed(() =>
  currentUserAssignment.value?.status === 'completed'
  && reviewRequiresGroupFinalization.value
  && reviewQuorumReached.value,
)
const currentUserCanSubmitReview = computed(() => currentUserAssignment.value?.status === 'pending')

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
  track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio?v=${track.value.version ?? 0}` : '',
)
const currentSourceVersionId = computed(() => track.value?.current_source_version?.id ?? null)
const olderSourceVersions = computed(() =>
  sourceVersions.value
    .filter(version => version.id !== currentSourceVersionId.value)
    .sort((a, b) => b.version_number - a.version_number),
)
const sourceCompareOptions = computed<SelectOption[]>(() =>
  olderSourceVersions.value.map((version) => ({
    value: version.id,
    label: `v${version.version_number} · ${fmtDate(version.created_at)}`,
  })),
)
const selectedCompareSourceVersion = computed(() =>
  olderSourceVersions.value.find(version => version.id === selectedCompareSourceVersionId.value) ?? null,
)
const isSourceCompareActive = computed(() => selectedCompareSourceVersion.value !== null)
const displayedSourceVersionNumber = computed(() =>
  selectedCompareSourceVersion.value?.version_number ?? track.value?.version ?? null,
)

const showMasterCompare = ref(false)
const selectedCompareMasterDeliveryId = ref<number | null>(null)

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
const fallbackStepIssues = computed(() => {
  const fallbackPhases = ['peer', 'producer', 'mastering', 'final_review']
  return issues.value.filter(i => fallbackPhases.includes(i.phase))
})
function filterIssuesForDisplayedSourceVersion(list: Issue[]): Issue[] {
  const version = displayedSourceVersionNumber.value
  if (version == null) return list
  return list.filter(issue => issue.source_version_number == null || issue.source_version_number === version)
}
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
const currentUserChecklistItems = computed(() =>
  checklistItems.value.filter(item => item.reviewer_id === appStore.currentUser?.id),
)
const checklistPassedCount = computed(() => checklistItems.value.filter(item => item.passed).length)
const checklistSaved = computed(() => currentUserChecklistItems.value.length > 0)
const checklistByReviewer = computed(() => {
  const groups = new Map<number, { user: User | null | undefined; items: ChecklistItem[] }>()
  for (const item of checklistItems.value) {
    if (!groups.has(item.reviewer_id)) {
      const assignment = reviewAssignments.value.find(a => a.user_id === item.reviewer_id)
      groups.set(item.reviewer_id, { user: assignment?.user, items: [] })
    }
    groups.get(item.reviewer_id)!.items.push(item)
  }
  return Array.from(groups.values())
})
const masterDelivery = computed<MasterDelivery | null>(() => track.value?.current_master_delivery ?? null)
const masterAudioUrl = computed(() => {
  const d = masterDelivery.value
  if (!d) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-audio?v=${d.delivery_number}&c=${d.workflow_cycle ?? 1}`
})
const sortedMasterDeliveries = computed(() =>
  [...masterDeliveries.value].sort((a, b) => {
    if (a.workflow_cycle !== b.workflow_cycle) return b.workflow_cycle - a.workflow_cycle
    return b.delivery_number - a.delivery_number
  }),
)
const olderMasterDeliveries = computed(() => {
  const currentId = masterDelivery.value?.id ?? null
  return sortedMasterDeliveries.value
    .filter(delivery => delivery.id !== currentId)
})
const masterCompareOptions = computed<SelectOption[]>(() =>
  olderMasterDeliveries.value.map((delivery) => ({
    value: delivery.id,
    label: masterDeliveryOptionLabel(delivery),
  })),
)
const selectedCompareMasterDelivery = computed(() =>
  olderMasterDeliveries.value.find(delivery => delivery.id === selectedCompareMasterDeliveryId.value) ?? null,
)
const selectedCompareMasterAudioUrl = computed(() => {
  const delivery = selectedCompareMasterDelivery.value
  if (!delivery) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}`
})
const finalReviewIssues = computed(() => {
  const deliveryId = masterDelivery.value?.id ?? null
  if (!deliveryId) return []
  return issues.value.filter(
    issue => issue.phase === 'final_review' && issue.master_delivery_id === deliveryId,
  )
})
const canConfirmDelivery = computed(() => {
  if (currentStep.value?.type !== 'delivery' || !track.value || !masterDelivery.value) return false
  if (!currentStep.value.require_confirmation) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  if (masterDelivery.value.confirmed_at) return false
  if (currentStep.value?.assignee_user_id) return currentStep.value.assignee_user_id === userId
  switch (currentStep.value?.assignee_role) {
    case 'submitter':
      return track.value.submitter_id === userId
    case 'producer':
      return track.value.producer_id === userId
    case 'peer_reviewer':
      return track.value.peer_reviewer_id === userId
    case 'mastering_engineer':
      return track.value.mastering_engineer_id === userId
    default:
      return false
  }
})
const canApproveFinal = computed(() => {
  if (!track.value || !masterDelivery.value) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  if (userId === track.value.producer_id) return !masterDelivery.value.producer_approved_at
  if (userId === track.value.submitter_id) return !masterDelivery.value.submitter_approved_at
  return false
})
const canRequestReturn = computed(() => {
  if (!track.value) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  return userId === track.value.submitter_id && userId !== track.value.producer_id
})
const canSeeMasteringSidebar = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId || !track.value) return false
  const isParticipant = userId === track.value.submitter_id
    || userId === track.value.producer_id
    || userId === track.value.mastering_engineer_id
  const supportsSidebar = activeVariant.value === 'mastering' || activeVariant.value === 'final_review'
  return isParticipant && supportsSidebar
})

// Resolve the user id the current revision step is assigned to.
// Uses assignee_user_id override if present, otherwise maps the assignee_role
// back to the track/album-level user id.
const revisionAssigneeUserId = computed<number | null>(() => {
  const step = currentStep.value
  if (!step || step.type !== 'revision' || !track.value) return null
  if (step.assignee_user_id != null) return step.assignee_user_id
  switch (step.assignee_role) {
    case 'submitter':
      return track.value.submitter_id ?? null
    case 'producer':
      return track.value.producer_id ?? null
    case 'mastering_engineer':
      return track.value.mastering_engineer_id ?? null
    case 'peer_reviewer':
      return track.value.peer_reviewer_id ?? null
    default:
      return null
  }
})

const isRevisionAssignee = computed(() => {
  const assigneeId = revisionAssigneeUserId.value
  const userId = appStore.currentUser?.id
  return assigneeId != null && userId != null && assigneeId === userId
})

const revisionAssigneeRoleLabel = computed(() => {
  const role = currentStep.value?.assignee_role
  if (!role) return ''
  return t(`workflowBuilder.roles.${role}`, role)
})

async function loadPeerChecklist(albumId: number) {
  try {
    const template = await checklistApi.getTemplate(albumId)
    templateItems.value = template.items
  } catch {
    templateItems.value = [
      { label: 'Arrangement', required: true, sort_order: 0 },
      { label: 'Balance', required: true, sort_order: 1 },
      { label: 'Low-End', required: true, sort_order: 2 },
      { label: 'Stereo Image', required: true, sort_order: 3 },
      { label: 'Technical Cleanliness', required: true, sort_order: 4 },
    ]
  }

  const labels = templateItems.value
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(item => item.label)

  if (currentUserChecklistItems.value.length > 0) {
    checklistDraft.value = labels.map(label => {
      const item = currentUserChecklistItems.value.find(entry => entry.label === label)
      return { label, passed: item?.passed ?? false, note: item?.note ?? '' }
    })
    return
  }

  checklistDraft.value = labels.map(label => ({ label, passed: false, note: '' }))
}

async function loadPage() {
  if (!track.value) loading.value = true
  loadError.value = ''
  error.value = ''
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    trackStore.setCurrentTrack(detail.track)
    sourceVersions.value = detail.source_versions ?? []
    masterDeliveries.value = detail.master_deliveries ?? []
    workflowConfig.value = detail.workflow_config ?? null
    issues.value = detail.issues.filter(
      issue => issue.workflow_cycle === detail.track.workflow_cycle,
    )
    syncIssueDrawerFromRoute()
    checklistItems.value = detail.checklist_items
    try {
      reviewAssignments.value = await trackApi.listAssignments(trackId.value)
    } catch {
      reviewAssignments.value = []
    }

    // Redirect mastering steps to the dedicated mastering page
    if (inferClassicVariant(detail.track.workflow_step ?? null) === 'mastering') {
      router.replace({ path: `/tracks/${trackId.value}/mastering`, query: route.query })
      return
    }

    if (inferClassicVariant(detail.track.workflow_step ?? null) === 'peer_review') {
      await loadPeerChecklist(detail.track.album_id)
    } else {
      templateItems.value = []
      checklistDraft.value = []
    }
    if (inferClassicVariant(detail.track.workflow_step ?? null) === 'mastering') {
      masteringDiscussion.discussions.value = (detail.discussions ?? []).filter(d => d.phase === 'mastering')
    }
  } catch (err: any) {
    trackStore.setCurrentTrack(null)
    track.value = null
    loadError.value = err?.message || t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

watch(olderSourceVersions, (versions) => {
  if (!versions.some(version => version.id === selectedCompareSourceVersionId.value)) {
    selectedCompareSourceVersionId.value = null
  }
  if (versions.length === 0) {
    showSourceCompare.value = false
  }
})

watch(isSourceCompareActive, (active) => {
  if (!active) return
  issueFormRef.value?.closeForm?.()
  hoveredIssueId.value = null
})

watch(() => route.query.issue, () => {
  syncIssueDrawerFromRoute()
})

function toggleSourceCompare() {
  showSourceCompare.value = !showSourceCompare.value
  if (!showSourceCompare.value) {
    selectedCompareSourceVersionId.value = null
  }
}

watch(olderMasterDeliveries, (deliveries) => {
  if (!deliveries.some(delivery => delivery.id === selectedCompareMasterDeliveryId.value)) {
    selectedCompareMasterDeliveryId.value = null
  }
  if (deliveries.length === 0) {
    showMasterCompare.value = false
  }
})

function masterDeliveryOptionLabel(delivery: MasterDelivery): string {
  const version = `v${delivery.delivery_number}`
  return `${version} · ${fmtDate(delivery.created_at)}`
}

function historicalDeliveryDownloadSuffix(delivery: MasterDelivery): string {
  if (!track.value || delivery.workflow_cycle === track.value.workflow_cycle) return ''
  const timestamp = delivery.created_at.replace(/\D/g, '').slice(0, 12)
  return timestamp ? `_history_${timestamp}` : '_history'
}

function toggleMasterCompare() {
  showMasterCompare.value = !showMasterCompare.value
  if (!showMasterCompare.value) {
    selectedCompareMasterDeliveryId.value = null
  }
}

function compareWithMasterDelivery(deliveryId: number) {
  showMasterCompare.value = true
  selectedCompareMasterDeliveryId.value = deliveryId
}

function handleMasterVersionDownload(delivery: MasterDelivery) {
  const url = `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}`
  const historySuffix = historicalDeliveryDownloadSuffix(delivery)
  downloadAudioAsset(url, `${track.value?.title ?? 'track'}_master_v${delivery.delivery_number}${historySuffix}`, delivery.file_path)
}

function parseIssueQuery(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  const issueId = Number(raw)
  return Number.isInteger(issueId) && issueId > 0 ? issueId : null
}

function buildRouteQueryWithoutIssue(): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'issue') continue
    if (typeof value === 'string' && value.length > 0) query[key] = value
    else if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) query[key] = value[0]
  }
  return query
}

function replaceIssueDrawerQuery(issueId: number | null) {
  const query = buildRouteQueryWithoutIssue()
  if (issueId != null) query.issue = String(issueId)
  void router.replace({
    path: route.path,
    query: Object.keys(query).length > 0 ? query : undefined,
  })
}

function syncIssueDrawerFromRoute() {
  const issueId = parseIssueQuery(route.query.issue)
  if (issueId == null) {
    selectedIssue.value = null
    return
  }
  selectedIssue.value = issues.value.find(issue => issue.id === issueId) ?? null
}

function onIssueSelect(issue: Issue) {
  openIssueDrawer(issue)
}

function openIssueDrawer(issue: Issue) {
  selectedIssue.value = issue
  if (parseIssueQuery(route.query.issue) !== issue.id) {
    replaceIssueDrawerQuery(issue.id)
  }
}

function openLinkedIssue(issueId: number) {
  const localIssue = issues.value.find(issue => issue.id === issueId)
  if (localIssue) {
    openIssueDrawer(localIssue)
    return
  }

  void router.push(`/issues/${issueId}`)
}

function closeIssueDrawer() {
  selectedIssue.value = null
  if (parseIssueQuery(route.query.issue) != null) {
    replaceIssueDrawerQuery(null)
  }
}

function onWaveformReady(nextDuration: number) {
  waveformDuration.value = nextDuration
}

function onWaveformTimeUpdate(time: number) {
  waveformCurrentTime.value = time
}

function onWaveformPlaybackStateChange(isPlaying: boolean) {
  waveformIsPlaying.value = isPlaying
}

function issuePreviewWindow(issue: Issue | null): { start: number; end: number } | null {
  if (!issue?.markers.length) return null
  const start = Math.min(...issue.markers.map(marker => marker.time_start))
  const end = Math.max(...issue.markers.map(marker => marker.time_end ?? marker.time_start + 0.75))
  return { start, end }
}

function issuePreviewStart(issue: Issue | null): number | null {
  return issuePreviewWindow(issue)?.start ?? null
}

function isIssuePreviewActive(issue: Issue | null): boolean {
  const window = issuePreviewWindow(issue)
  if (!window) return false
  return waveformCurrentTime.value >= Math.max(0, window.start - 0.1)
    && waveformCurrentTime.value <= window.end + 0.1
}

const selectedIssuePreview = computed(() => {
  if (!selectedIssue.value || waveformDuration.value <= 0) return null
  return {
    duration: waveformDuration.value,
    currentTime: waveformCurrentTime.value,
    isPlaying: waveformIsPlaying.value,
    isActive: isIssuePreviewActive(selectedIssue.value),
  }
})

function onIssueUpdated(updatedIssue: Issue) {
  issues.value = issues.value.map(issue => issue.id === updatedIssue.id ? updatedIssue : issue)
  if (selectedIssue.value?.id === updatedIssue.id) {
    selectedIssue.value = updatedIssue
  }
}

async function onQuickIssueStatusChange({ issue, status }: { issue: Issue; status: Issue['status'] }) {
  const previousIssue = { ...issue }
  onIssueUpdated({ ...issue, status })
  try {
    const updatedIssue = await issueApi.update(issue.id, { status })
    onIssueUpdated(updatedIssue)
  } catch (err: any) {
    onIssueUpdated(previousIssue)
    toastError(err.message || t('workflowStep.transitionFailed'))
  }
}

async function handleIssuePreviewPlayAt(time: number) {
  await waveformRef.value?.playFrom?.(time)
}

function handleIssuePreviewSeekAt(time: number) {
  waveformRef.value?.seekTo?.(time)
}

async function handleIssuePreviewToggle(issue: Issue) {
  const start = issuePreviewStart(issue)
  if (start == null) return
  if (isIssuePreviewActive(issue)) {
    await waveformRef.value?.togglePlay?.()
    return
  }
  await waveformRef.value?.playFrom?.(start)
}

function canCurrentUserChangeIssueStatus(issue: Issue): boolean {
  return canUserChangeIssueStatus(appStore.currentUser?.id, track.value, issue, reviewAssignments.value)
}

function canCurrentUserSubmitIssueStatus(issue: Issue): boolean {
  return canUserSubmitIssueStatus(appStore.currentUser?.id, track.value, issue)
}

function availableBatchActionsForIssue(issue: Issue): Issue['status'][] {
  if (canCurrentUserSubmitIssueStatus(issue) && issue.status === 'open') return ['resolved', 'disagreed']
  if (canCurrentUserChangeIssueStatus(issue) && issue.status === 'open') return ['resolved', 'pending_discussion']
  if (canCurrentUserChangeIssueStatus(issue) && issue.status === 'pending_discussion') return ['open', 'internal_resolved']
  if (canCurrentUserChangeIssueStatus(issue) && issue.status === 'internal_resolved') return ['open']
  if (canCurrentUserChangeIssueStatus(issue) && issue.status === 'resolved') return ['open']
  if (canCurrentUserChangeIssueStatus(issue) && issue.status === 'disagreed') return ['open']
  return []
}

function intersectBatchActions(selectedIssues: Issue[]): Issue['status'][] {
  if (!selectedIssues.length) return []
  const [firstIssue, ...rest] = selectedIssues
  return availableBatchActionsForIssue(firstIssue).filter(status =>
    rest.every(issue => availableBatchActionsForIssue(issue).includes(status)),
  )
}

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

async function applyBatchIssueStatusChange(
  selectedIssues: Issue[],
  selectedIds: typeof selectedProducerIssueIds,
  note: typeof producerBatchNote,
  status: Issue['status'],
) {
  if (!track.value || !selectedIssues.length) return
  batchUpdatingIssues.value = true
  try {
    const updatedIssues = await issueApi.batchUpdate(trackId.value, {
      issue_ids: selectedIssues.map(issue => issue.id),
      status,
      status_note: note.value.trim() || undefined,
    })
    const updatedById = new Map(updatedIssues.map(issue => [issue.id, issue]))
    issues.value = issues.value.map(issue => {
      const updated = updatedById.get(issue.id)
      return updated ? { ...issue, ...updated } : issue
    })
    if (selectedIssue.value && updatedById.has(selectedIssue.value.id)) {
      selectedIssue.value = { ...selectedIssue.value, ...updatedById.get(selectedIssue.value.id)! }
    }
    selectedIds.value = []
    note.value = ''
  } catch (err: any) {
    toastError(err.message || t('workflowStep.transitionFailed'))
  } finally {
    batchUpdatingIssues.value = false
  }
}

function applyProducerBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedProducerIssues.value, selectedProducerIssueIds, producerBatchNote, status)
}

function applyRevisionBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedRevisionIssues.value, selectedRevisionIssueIds, revisionBatchNote, status)
}

function applyStageBatchStatus(status: Issue['status']) {
  return applyBatchIssueStatusChange(selectedStageIssues.value, selectedStageIssueIds, stageBatchNote, status)
}

function peerIssueMarkerSummary(issue: Issue): string {
  if (!issue.markers.length) return t('issue.generalIssue')
  return issue.markers
    .map(marker => marker.time_end == null
      ? formatTimestampShort(marker.time_start)
      : `${formatTimestampShort(marker.time_start)} - ${formatTimestampShort(marker.time_end)}`)
    .join(' · ')
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

async function executeTransition(decision: string) {
  if (!track.value) return
  const previousStatus = track.value.status
  if (decision === 'reject_final') {
    const confirmed = window.confirm(t('producer.rejectFinalConfirm'))
    if (!confirmed) return
  }
  acting.value = true
  error.value = ''
  try {
    if (activeVariant.value === 'peer_review' && checklistDraft.value.length > 0) {
      await persistChecklist()
    }
    const updatedTrack = await trackApi.workflowTransition(trackId.value, decision)
    if (updatedTrack.status === previousStatus) {
      await loadPage()
      return
    }
    pushToTrackDetail()
  } catch (err: any) {
    error.value = err.message || t('workflowStep.transitionFailed')
  } finally {
    acting.value = false
  }
}

async function handleUpload(kind: 'revision' | 'delivery') {
  if (!uploadFile.value || !track.value) return
  const previousStatus = track.value.status
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const file = uploadFile.value
    let updatedTrack: Track
    if (appStore.r2Enabled) {
      const requestFn = kind === 'revision' ? r2Api.requestSourceVersionUpload : r2Api.requestMasterDeliveryUpload
      const confirmFn = kind === 'revision' ? r2Api.confirmSourceVersionUpload : r2Api.confirmMasterDeliveryUpload
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
      const confirmParams: { upload_id: string; object_key: string; duration: number | null; revision_notes?: string | null } = {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
      }
      if (kind === 'revision' && revisionNotes.value.trim()) {
        confirmParams.revision_notes = revisionNotes.value.trim()
      }
      updatedTrack = await confirmFn(trackId.value, confirmParams)
    } else if (kind === 'revision') {
      updatedTrack = await trackApi.uploadSourceVersion(trackId.value, file, revisionNotes.value.trim() || undefined, (percent) => {
        uploadProgress.value = percent
      })
    } else {
      updatedTrack = await trackApi.uploadMasterDelivery(trackId.value, file, (percent) => {
        uploadProgress.value = percent
      })
    }
    if (kind === 'delivery') {
      uploadFile.value = null
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

function transitionLabel(decision: string, fallbackLabel: string) {
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
      if (decision === 'pass' || decision === 'approve') return t('workflowStep.reviewFinalizeApprove')
      if (decision.includes('revision') || decision.includes('reject')) return t('workflowStep.reviewFinalizeRevision')
    }
    if (currentUserCanSubmitReview.value) {
      if (decision === 'pass' || decision === 'approve') return t('workflowStep.reviewSubmitApprove')
      if (decision.includes('revision') || decision.includes('reject')) return t('workflowStep.reviewSubmitRevision')
    }
  }
  if (decision.startsWith('reject_to_')) {
    const targetStepId = decision.slice('reject_to_'.length)
    const targetStep = workflowConfig.value?.steps.find(step => step.id === targetStepId)
    const label = targetStep ? translateStepLabel(targetStep, t) : targetStepId
    return t('workflowStep.rejectToStep', { step: label })
  }
  return t(`trackDetail.actions.${decision}`, fallbackLabel)
}

function translateChecklistLabel(label: string): string {
  const key = defaultChecklistLabelKeyMap[label]
  return key ? t(`checklistLabels.${key}`) : label
}

async function persistChecklist(showToast = false) {
  error.value = ''
  checklistItems.value = await checklistApi.submit(
    trackId.value,
    checklistDraft.value.map(item => ({
      label: item.label,
      passed: item.passed,
      note: item.note || undefined,
    })),
  )
  if (showToast) {
    toastSuccess(t('peerReview.checklistSubmitted'))
  }
}

async function submitChecklist() {
  try {
    await persistChecklist(true)
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
  }
}

function actionTypeForTransition(decision: string): WorkflowAction['type'] {
  if (decision === 'reject_final') return 'reject'
  if (decision.includes('reject') || decision.includes('revision') || decision === 'return') return 'return'
  return 'advance'
}

const classicActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr.decision, tr.label),
    type: actionTypeForTransition(tr.decision),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const deliveryActions = computed<WorkflowAction[]>(() => {
  const actions = transitions.value.map((tr) => ({
    label: transitionLabel(tr.decision, tr.label),
    type: actionTypeForTransition(tr.decision),
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
    .filter(tr => tr.decision !== 'approve' && tr.decision !== 'reject_final' && tr.decision !== 'reject_resubmittable')
    .map((tr) => ({
    label: transitionLabel(tr.decision, tr.label),
    type: actionTypeForTransition(tr.decision),
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

function goBack() {
  pushToTrackDetail()
}

const genericReviewActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr.decision, tr.label),
    type: tr.decision === 'return' || tr.decision.includes('revision') ? 'return' : 'advance',
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const genericApprovalActions = computed<WorkflowAction[]>(() =>
  transitions.value.map((tr) => ({
    label: transitionLabel(tr.decision, tr.label),
    type: actionTypeForTransition(tr.decision),
    disabled: acting.value,
    handler: () => executeTransition(tr.decision),
  })),
)

const peerReviewActionHint = computed(() => {
  if (reviewWaitingForAssignment.value) return t('workflowStep.reviewWaitingForAssignment')
  if (!checklistSaved.value) return t('peerReview.checklistRequiredHint')
  if (currentUserCanFinalizeReview.value) return t('workflowStep.reviewFinalizeHint')
  if (reviewRequiresGroupFinalization.value && currentUserAssignment.value?.status === 'completed' && !reviewQuorumReached.value) {
    return t('workflowStep.reviewWaitingForQuorum', { completed: completedReviewCount.value, required: requiredReviewCount.value })
  }
  if (currentUserCanSubmitReview.value) return t('workflowStep.reviewSubmitHint')
  return t('peerReview.actionHint')
})

function canUseWaveformShortcuts(): boolean {
  return ['peer_review', 'producer_gate', 'mastering', 'final_review'].includes(activeVariant.value)
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
}

function handleWaveformHotkeys(event: KeyboardEvent) {
  if (!canUseWaveformShortcuts()) return
  if (isEditableTarget(event.target)) return
  if (!issueFormRef.value || !waveformRef.value) return

  if (event.key === ' ') {
    event.preventDefault()
    waveformRef.value.togglePlay?.()
    return
  }

  if (event.key === '[') {
    event.preventDefault()
    const time = waveformRef.value.getCurrentTime?.() ?? 0
    issueFormRef.value.setRangeAnchorAt?.(time)
    return
  }

  if (event.key === ']') {
    event.preventDefault()
    const time = waveformRef.value.getCurrentTime?.() ?? 0
    issueFormRef.value.commitRangeFromAnchorTo?.(time)
    return
  }

  if (event.key === 'Backspace') {
    event.preventDefault()
    issueFormRef.value.removeLastMarker?.()
    return
  }

  if (event.key === 'Escape') {
    issueFormRef.value.clearRangeAnchor?.()
  }
}

function handleIssueHover(issue: Issue) {
  hoveredIssueId.value = issue.id
}

function handleIssueLeave() {
  hoveredIssueId.value = null
}
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto space-y-6">
    <div class="card animate-pulse h-24"></div>
  </div>

  <div v-else-if="loadError || !track || !currentStep" class="max-w-4xl mx-auto space-y-6">
    <div class="card space-y-3">
      <p class="text-sm text-error">{{ loadError || t('common.loadFailed') }}</p>
      <div>
        <button @click="loadPage" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
      </div>
    </div>
  </div>

  <div v-else-if="activeVariant === 'intake'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('producer.subheading') }}</p>
        </div>
        <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

      <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
        {{ error }}
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card text-center">
          <div class="text-2xl font-bold text-foreground">{{ allCycleIssues.length }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-error">{{ openCount }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-success">{{ resolvedCount }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-primary">{{ track.version }}</div>
          <div class="text-xs text-muted-foreground">{{ t('dashboard.colVersion') }}</div>
        </div>
      </div>

      <div class="card space-y-4 border-primary/50">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.intakeHeading') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('producer.intakeDesc') }}</p>
      </div>

      <div v-if="audioUrl">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-muted-foreground leading-relaxed">{{ t('producer.waveformHint') }}</p>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1 shrink-0">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          ref="waveformRef"
          :audio-url="audioUrl"
          :issues="waveformIssues"
          :track-id="trackId"
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>
    </div>

    <WorkflowActionBar :actions="classicActions" :hint="t('producer.intakeHint')" />
  </div>

  <div v-else-if="activeVariant === 'peer_review'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('peerReview.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('peerReview.subheading', { version: track.version }) }}</p>
        </div>
        <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
        {{ error }}
      </div>

      <div class="card space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.reviewTeamHeading') }}</h3>
            <p class="text-xs text-muted-foreground">
              <template v-if="reviewWaitingForAssignment">
                {{ t('workflowStep.reviewWaitingForAssignment') }}
              </template>
              <template v-else-if="currentUserCanFinalizeReview">
                {{ t('workflowStep.reviewFinalizeReady') }}
              </template>
              <template v-else-if="reviewRequiresGroupFinalization && currentUserAssignment?.status === 'completed' && !reviewQuorumReached">
                {{ t('workflowStep.reviewWaitingForQuorum', { completed: completedReviewCount, required: requiredReviewCount }) }}
              </template>
              <template v-else>
                {{ t('workflowStep.reviewSubmitHint') }}
              </template>
            </p>
          </div>
          <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-mono text-muted-foreground">
            <span class="text-foreground">{{ completedReviewCount }}/{{ requiredReviewCount }}</span>
            <span>{{ t('workflowStep.reviewProgress') }}</span>
          </div>
        </div>

        <div v-if="currentStepAssignments.length > 0" class="space-y-2">
          <div
            v-for="assignment in currentStepAssignments"
            :key="assignment.id"
            class="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 text-sm"
          >
            <span class="text-foreground">
              {{ assignment.user?.display_name ?? `#${assignment.user_id}` }}
            </span>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span
                class="rounded-full px-2.5 py-1"
                :class="assignment.status === 'completed' ? 'bg-success-bg text-success' : 'bg-border text-muted-foreground'"
              >
                {{ assignment.status === 'completed' ? t('workflowStep.reviewSubmitted') : t('workflowStep.reviewPending') }}
              </span>
              <span v-if="assignment.decision" class="rounded-full bg-info-bg px-2.5 py-1 text-info">
                {{ assignment.decision === 'pass' || assignment.decision === 'approve'
                  ? t('workflowStep.reviewDecisionApprove')
                  : t('workflowStep.reviewDecisionRevision') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="audioUrl">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-muted-foreground leading-relaxed">{{ t('peerReview.waveformHint') }}</p>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="olderSourceVersions.length > 0"
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
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="mb-3 space-y-2">
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
          :selectable="true"
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
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <IssueCreatePanel
            ref="issueFormRef"
            :track-id="trackId"
            phase="peer"
            :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
            @created="onIssueCreated"
            @formOpenChange="(open: boolean) => (isIssueFormOpen = open)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.issuesHeading', { count: fallbackWaveformIssues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <BatchIssueActions
            :selected-count="selectedStageIssueIds.length"
            :statuses="stageBatchActions"
            :note="stageBatchNote"
            :loading="batchUpdatingIssues"
            @update:note="stageBatchNote = $event"
            @clear="selectedStageIssueIds = []; stageBatchNote = ''"
            @apply="applyStageBatchStatus($event)"
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

        <div
          class="card space-y-4"
          :class="checklistSaved ? '' : 'border-warning/60 ring-1 ring-warning/40'"
        >
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.checklistHeading') }}</h3>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono"
              :class="checklistSaved ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'"
            >
              <CheckCircle2 v-if="checklistSaved" class="w-3.5 h-3.5" :stroke-width="2" />
              <AlertCircle v-else class="w-3.5 h-3.5" :stroke-width="2" />
              {{ checklistSaved ? t('peerReview.checklistSavedBadge') : t('peerReview.checklistRequiredBadge') }}
            </span>
          </div>
          <div v-for="item in checklistDraft" :key="item.label" class="flex items-start gap-3">
            <input
              v-model="item.passed"
              type="checkbox"
              class="checkbox mt-1"
            />
            <div class="flex-1">
              <div class="text-sm text-foreground">{{ translateChecklistLabel(item.label) }}</div>
              <input
                v-model="item.note"
                class="input-field w-full text-xs mt-1"
                :placeholder="t('common.notesOptionalPlaceholder')"
              />
            </div>
          </div>
          <button @click="submitChecklist" class="btn-secondary text-sm">
            {{ t('peerReview.saveChecklist') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="!checklistSaved" class="mt-4 flex items-start gap-3 border border-warning/60 bg-warning-bg px-4 py-3 text-warning">
      <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" :stroke-width="2" />
      <div class="space-y-0.5">
        <div class="text-sm font-sans font-semibold">{{ t('peerReview.checklistBlockerTitle') }}</div>
        <div class="text-xs text-muted-foreground">{{ t('peerReview.checklistBlockerDesc') }}</div>
      </div>
    </div>

    <WorkflowActionBar :actions="classicActions.map(action => ({ ...action, disabled: action.disabled || !checklistSaved }))" :hint="peerReviewActionHint" />
  </div>

  <div v-else-if="activeVariant === 'producer_gate'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('producer.subheading') }}</p>
        </div>
        <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

      <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
        {{ error }}
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card text-center">
          <div class="text-2xl font-bold text-foreground">{{ allCycleIssues.length }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-error">{{ openCount }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-success">{{ resolvedCount }}</div>
          <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
        </div>
        <div class="card text-center">
          <div v-if="checklistByReviewer.length <= 1" class="text-2xl font-bold text-primary">
            {{ checklistPassedCount }}/{{ checklistItems.length }}
          </div>
          <div v-else class="text-2xl font-bold text-primary">{{ checklistByReviewer.length }}</div>
          <div class="text-xs text-muted-foreground">
            {{ checklistByReviewer.length <= 1 ? t('producer.checklistPassed') : t('producer.checklistReviewers') }}
          </div>
        </div>
      </div>

      <div v-if="audioUrl">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-muted-foreground leading-relaxed">{{ t('producer.waveformHint') }}</p>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="olderSourceVersions.length > 0"
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
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="mb-3 space-y-2">
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
          :issues="producerWaveformIssues"
          :track-id="trackId"
          :compare-version-id="selectedCompareSourceVersionId"
          :selectable="true"
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
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <IssueCreatePanel
        ref="issueFormRef"
        :track-id="trackId"
        phase="producer"
        @created="onIssueCreated"
        @formOpenChange="(open: boolean) => (isIssueFormOpen = open)"
      >
        <template #heading>
          <h3 class="text-sm font-sans font-semibold text-foreground">
            {{ t('producer.producerIssuesHeading', { count: producerWaveformIssues.length }) }}
          </h3>
        </template>
      </IssueCreatePanel>

      <IssueMarkerList
        :issues="producerWaveformIssues"
        :current-source-version-number="displayedSourceVersionNumber"
        :hovered-issue-id="hoveredIssueId"
        :track="track"
        :assignments="reviewAssignments"
        :show-activity="true"
        :enable-quick-actions="true"
        @select="onIssueSelect"
        @hover="handleIssueHover"
        @leave="handleIssueLeave"
        @status-change="onQuickIssueStatusChange"
      />

      <div v-if="checklistItems.length > 0" class="card">
        <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.checklistHeading') }}</h3>
        <div v-if="checklistByReviewer.length === 1" class="space-y-2">
          <div v-for="item in checklistByReviewer[0].items" :key="item.id" class="flex items-center gap-3 text-sm">
            <span :class="item.passed ? 'text-success' : 'text-error'">{{ item.passed ? 'OK' : 'NG' }}</span>
            <span class="text-foreground">{{ item.label }}</span>
            <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
          </div>
        </div>
        <div v-else class="space-y-5">
          <div v-for="(group, idx) in checklistByReviewer" :key="group.user?.id ?? idx">
            <div class="text-xs font-mono text-muted-foreground mb-2">
              {{ group.user?.username ?? `#${idx + 1}` }}
            </div>
            <div class="space-y-2">
              <div v-for="item in group.items" :key="item.id" class="flex items-center gap-3 text-sm">
                <span :class="item.passed ? 'text-success' : 'text-error'">{{ item.passed ? 'OK' : 'NG' }}</span>
                <span class="text-foreground">{{ item.label }}</span>
                <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card space-y-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.peerIssueSummaryHeading') }}</h3>
            <p class="text-xs text-muted-foreground">{{ t('producer.peerIssueSummaryHint') }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs sm:min-w-[220px]">
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-error">{{ peerOpenCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.open') }}</div>
            </div>
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-success">{{ peerResolvedCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.resolved') }}</div>
            </div>
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-warning">{{ peerDisagreedCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.disagreed') }}</div>
            </div>
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-info">{{ peerDiscussedCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.activeDiscussions') }}</div>
            </div>
          </div>
        </div>

        <div v-if="peerIssues.length" class="space-y-3">
          <button
            v-for="issue in peerIssues"
            :key="issue.id"
            type="button"
            class="peer-issue-card w-full border border-border bg-background p-4 text-left transition-colors hover:border-muted-foreground/60 hover:bg-card"
                @click="openIssueDrawer(issue)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <StatusBadge :status="issue.severity" type="severity" />
                  <StatusBadge :status="issue.status" type="issue" />
                  <span class="text-xs font-mono text-muted-foreground">{{ peerIssueMarkerSummary(issue) }}</span>
                </div>
                <div>
                  <div class="text-sm font-medium text-foreground">{{ issue.title }}</div>
                  <p class="mt-1 text-sm text-muted-foreground">{{ issue.description }}</p>
                </div>
              </div>
              <span class="text-xs font-mono text-muted-foreground whitespace-nowrap">{{ fmtDate(issue.updated_at) }}</span>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span class="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                {{ t('issueDetail.commentsHeading', { count: issue.comment_count ?? 0 }) }}
              </span>
              <span
                v-if="(issue.comment_count ?? 0) > 0"
                class="rounded-full bg-info-bg px-2.5 py-1 text-info"
              >
                {{ t('producer.hasDiscussion') }}
              </span>
              <span class="text-primary">{{ t('producer.viewConversation') }}</span>
            </div>
          </button>
        </div>

        <div v-else class="text-sm text-muted-foreground">{{ t('producer.noPeerIssues') }}</div>

      </div>

      <div class="card space-y-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.producerFollowupHeading') }}</h3>
            <p class="text-xs text-muted-foreground">{{ t('producer.producerFollowupHint') }}</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs sm:min-w-[220px]">
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-error">{{ producerOpenCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.open') }}</div>
            </div>
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-success">{{ producerResolvedCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.resolved') }}</div>
            </div>
            <div class="border border-border bg-background px-3 py-2 space-y-1">
              <div class="font-mono text-lg text-info">{{ producerDisagreedCount }}</div>
              <div class="text-muted-foreground">{{ t('producer.disagreed') }}</div>
            </div>
          </div>
        </div>

        <BatchIssueActions
          :selected-count="selectedProducerIssueIds.length"
          :statuses="producerBatchActions"
          :note="producerBatchNote"
          :loading="batchUpdatingIssues"
          @update:note="producerBatchNote = $event"
          @clear="selectedProducerIssueIds = []; producerBatchNote = ''"
          @apply="applyProducerBatchStatus($event)"
        />

        <IssueMarkerList
          :issues="producerSnapshotIssues"
          :track="track"
          :selectable="true"
          :selected-ids="selectedProducerIssueIds"
          :current-source-version-number="track.version"
          :hovered-issue-id="hoveredIssueId"
          :show-activity="true"
          :enable-quick-actions="true"
          @select="openIssueDrawer"
          @update:selectedIds="selectedProducerIssueIds = $event"
          @hover="handleIssueHover"
          @leave="handleIssueLeave"
          @status-change="onQuickIssueStatusChange"
        />
      </div>
    </div>

    <WorkflowActionBar
      :actions="classicActions"
      :hint="t('producer.gateHint')"
      layout="grouped"
      :group-label="t('producer.decisionGroupLabel')"
    />
  </div>

  <div v-else-if="activeVariant === 'mastering'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('mastering.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('mastering.subheading') }}</p>
        </div>
        <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
        {{ error }}
      </div>

      <div v-if="audioUrl">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-muted-foreground leading-relaxed">{{ t('mastering.waveformHint') }}</p>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="olderSourceVersions.length > 0"
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
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="mb-3 space-y-2">
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
          :selectable="true"
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
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <IssueCreatePanel
            ref="issueFormRef"
            :track-id="trackId"
            phase="mastering"
            :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
            @created="onIssueCreated"
            @formOpenChange="(open: boolean) => (isIssueFormOpen = open)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: fallbackWaveformIssues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <BatchIssueActions
            :selected-count="selectedStageIssueIds.length"
            :statuses="stageBatchActions"
            :note="stageBatchNote"
            :loading="batchUpdatingIssues"
            @update:note="stageBatchNote = $event"
            @clear="selectedStageIssueIds = []; stageBatchNote = ''"
            @apply="applyStageBatchStatus($event)"
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

        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.actionsHeading') }}</h3>
          <div class="text-sm text-muted-foreground">{{ t('mastering.uploadReady') }}</div>
          <input type="file" accept="audio/*" @change="onFileChange" class="input-field w-full" />
          <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
            <div class="space-y-1">
              <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
              <p class="text-sm text-muted-foreground">{{ t('workflowStep.deliveryPreviewNotice') }}</p>
            </div>
            <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" :compact="true" :height="96" />
            <div class="flex flex-wrap gap-2">
              <button
                @click="handleUpload('delivery')"
                :disabled="uploading"
                class="btn-primary text-sm h-10 inline-flex items-center justify-center"
              >
                <Upload class="w-4 h-4 mr-2" />
                {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
              </button>
              <button
                @click="uploadFile = null; resetDeliveryPreview()"
                :disabled="uploading"
                class="btn-secondary text-sm"
              >
                {{ t('workflowStep.clearSelectedDelivery') }}
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
      </div>

      <div v-if="masterAudioUrl" class="card space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.currentDelivery') }}</h3>
            <p class="text-xs text-muted-foreground mt-1">
              {{ masterDelivery?.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="olderMasterDeliveries.length > 0"
              @click="toggleMasterCompare"
              class="btn-secondary text-xs px-3 py-1"
            >
              {{ t('compare.title') }}
            </button>
            <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
              {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
            </button>
          </div>
        </div>
        <div v-if="showMasterCompare && olderMasterDeliveries.length > 0" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect
            v-model="selectedCompareMasterDeliveryId"
            :options="masterCompareOptions"
            :placeholder="`-- ${t('compare.selectVersion')} --`"
            size="sm"
          />
          <button
            v-if="selectedCompareMasterDeliveryId"
            @click="selectedCompareMasterDeliveryId = null"
            class="text-xs text-muted-foreground hover:text-foreground"
          >
            {{ t('compare.clear') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" :compare-audio-url="selectedCompareMasterAudioUrl" />
      </div>

      <div v-if="sortedMasterDeliveries.length > 0" class="card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.masterVersionHistory') }}</h3>
          <span class="text-xs text-muted-foreground">{{ sortedMasterDeliveries.length }}</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="delivery in sortedMasterDeliveries"
            :key="delivery.id"
            class="flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-mono font-semibold text-foreground">{{ masterDeliveryOptionLabel(delivery) }}</span>
                <span v-if="delivery.id === masterDelivery?.id" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                  {{ t('compare.currentVersion') }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button
                v-if="delivery.id !== masterDelivery?.id"
                @click="compareWithMasterDelivery(delivery.id)"
                class="btn-secondary text-xs px-3 py-1"
              >
                {{ t('compare.title') }}
              </button>
              <button @click="handleMasterVersionDownload(delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
                {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Mastering Discussion -->
      <DiscussionPanel
        :discussions="masteringDiscussion.discussions.value"
        :issues="issues"
        :heading="t('mastering.discussionHeading', { count: masteringDiscussion.discussions.value.length })"
        :empty-text="t('mastering.noDiscussions')"
        :placeholder="t('mastering.discussionPlaceholder')"
        :submit-label="t('mastering.postDiscussion')"
        :posting="masteringDiscussion.posting.value"
        :posting-progress="masteringDiscussion.postingProgress.value"
        :editing-id="masteringDiscussion.editingId.value"
        :editing-content="masteringDiscussion.editingContent.value"
        :history-items="masteringDiscussion.historyItems.value"
        :show-history-for-id="masteringDiscussion.showHistoryForId.value"
        :loading="masteringDiscussion.loading.value"
        :load-error="masteringDiscussion.loadError.value"
        :enable-audio="true"
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
        @update:editing-content="masteringDiscussion.editingContent.value = $event"
      />
    </div>

      <WorkflowActionBar :actions="deliveryActions" :hint="t('mastering.actionHint')" />
  </div>

  <div v-else-if="activeVariant === 'final_review'" class="max-w-4xl mx-auto min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('finalReview.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('finalReview.subheading') }}</p>
        </div>
        <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
        {{ error }}
      </div>

      <div v-if="masterAudioUrl">
        <div class="flex items-start justify-between gap-3 mb-2">
          <p class="text-xs text-muted-foreground leading-relaxed">{{ t('finalReview.waveformHint') }}</p>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="olderMasterDeliveries.length > 0"
              @click="toggleMasterCompare"
              class="btn-secondary text-xs px-3 py-1"
            >
              {{ t('compare.title') }}
            </button>
            <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
              {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
            </button>
          </div>
        </div>
        <div v-if="showMasterCompare && olderMasterDeliveries.length > 0" class="flex items-center gap-2 mb-3">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect
            v-model="selectedCompareMasterDeliveryId"
            :options="masterCompareOptions"
            :placeholder="`-- ${t('compare.selectVersion')} --`"
            size="sm"
          />
          <button
            v-if="selectedCompareMasterDeliveryId"
            @click="selectedCompareMasterDeliveryId = null"
            class="text-xs text-muted-foreground hover:text-foreground"
          >
            {{ t('compare.clear') }}
          </button>
        </div>
        <WaveformPlayer
          ref="waveformRef"
          :audio-url="masterAudioUrl"
          :compare-audio-url="selectedCompareMasterAudioUrl"
          :issues="finalReviewIssues"
          :track-id="trackId"
          playback-scope="master"
          :selectable="true"
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
          @ready="onWaveformReady"
          @timeupdate="onWaveformTimeUpdate"
          @playbackStateChange="onWaveformPlaybackStateChange"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <IssueCreatePanel
            ref="issueFormRef"
            :track-id="trackId"
            phase="final_review"
            :master-delivery-id="masterDelivery?.id ?? null"
            @created="onIssueCreated"
            @formOpenChange="(open: boolean) => (isIssueFormOpen = open)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.issuesHeading', { count: finalReviewIssues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <BatchIssueActions
            :selected-count="selectedStageIssueIds.length"
            :statuses="stageBatchActions"
            :note="stageBatchNote"
            :loading="batchUpdatingIssues"
            @update:note="stageBatchNote = $event"
            @clear="selectedStageIssueIds = []; stageBatchNote = ''"
            @apply="applyStageBatchStatus($event)"
          />

          <IssueMarkerList
            :issues="finalReviewIssues"
            :selectable="true"
            :selected-ids="selectedStageIssueIds"
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

        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.approvalStatus') }}</h3>
          <div class="flex items-center justify-between text-sm">
            <span>{{ t('finalReview.producer') }}</span>
            <span :class="masterDelivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
              {{ masterDelivery?.producer_approved_at ? t('common.approved') : t('common.pending') }}
            </span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>{{ t('finalReview.submitter') }}</span>
            <span :class="masterDelivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
              {{ masterDelivery?.submitter_approved_at ? t('common.approved') : t('common.pending') }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="sortedMasterDeliveries.length > 0" class="card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('workflowStep.masterVersionHistory') }}</h3>
          <span class="text-xs text-muted-foreground">{{ sortedMasterDeliveries.length }}</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="delivery in sortedMasterDeliveries"
            :key="delivery.id"
            class="flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-mono font-semibold text-foreground">{{ masterDeliveryOptionLabel(delivery) }}</span>
                <span v-if="delivery.id === masterDelivery?.id" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                  {{ t('compare.currentVersion') }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button
                v-if="delivery.id !== masterDelivery?.id"
                @click="compareWithMasterDelivery(delivery.id)"
                class="btn-secondary text-xs px-3 py-1"
              >
                {{ t('compare.title') }}
              </button>
              <button @click="handleMasterVersionDownload(delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
                {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <WorkflowActionBar :actions="finalReviewActions" :hint="t('finalReview.actionHint')" />
  </div>

  <div v-else class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <button @click="goBack" class="btn-secondary !px-3 !py-2">
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-mono font-bold truncate">{{ track.title }}</h1>
        <p class="text-sm text-muted-foreground mt-0.5">
          {{ translateStepLabel(currentStep, t) }} · <span :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span>
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
            v-if="olderSourceVersions.length > 0"
            @click="toggleSourceCompare"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="space-y-2">
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
          @created="onIssueCreated"
        />
      </div>

      <WorkflowActionBar :actions="genericApprovalActions" :hint="t('common.actions')" />
    </template>

    <template v-if="currentStep.type === 'review'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-end gap-2">
          <button
            v-if="olderSourceVersions.length > 0"
            @click="toggleSourceCompare"
            class="btn-secondary text-xs px-3 py-1"
          >
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="space-y-2">
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
        <div v-else class="border border-success/20 bg-success-bg px-4 py-3 text-sm text-success">
          {{ t('producer.noIssues') }}
        </div>
      </div>

      <!-- 3a. Upload card (assignee only, at bottom) -->
      <div v-if="isRevisionAssignee" class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.uploadRevisedSource') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('workflowStep.uploadRevisedSourceDesc') }}</p>
        <input
          type="file"
          accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
          @change="onFileChange"
          class="input-field"
        />
        <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.revisedPreviewHeading') }}</h4>
            <p class="text-sm text-muted-foreground">{{ t('workflowStep.revisedPreviewNotice') }}</p>
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
              v-if="olderSourceVersions.length > 0"
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
        <div v-if="showSourceCompare && olderSourceVersions.length > 0" class="space-y-2">
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
        <input
          type="file"
          accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
          @change="onFileChange"
          class="input-field"
        />
        <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
            <p class="text-sm text-muted-foreground">{{ t('workflowStep.deliveryPreviewNotice') }}</p>
          </div>
          <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" />
          <div class="flex flex-wrap gap-2">
            <button
              @click="handleUpload('delivery')"
              :disabled="uploading"
              class="btn-primary text-sm h-10 inline-flex items-center justify-center"
            >
              <Upload class="w-4 h-4 mr-2" />
              {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
            </button>
            <button
              @click="uploadFile = null; resetDeliveryPreview()"
              :disabled="uploading"
              class="btn-secondary text-sm"
            >
              {{ t('workflowStep.clearSelectedDelivery') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="masterAudioUrl" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.currentDelivery') }}</h3>
          <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ masterDelivery?.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
        </p>
        <WaveformPlayer :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" />
      </div>

      <WorkflowActionBar v-if="deliveryActions.length" :actions="deliveryActions" :hint="t('common.actions')" />
    </template>
  </div>

  <IssueDetailPanel
    :issue="selectedIssue"
    :track="track"
    :assignments="reviewAssignments"
    :issues="issues"
    :preview="selectedIssuePreview"
    @close="closeIssueDrawer"
    @updated="onIssueUpdated"
    @open-issue="openLinkedIssue"
    @preview-play-at="handleIssuePreviewPlayAt"
    @preview-seek-at="handleIssuePreviewSeekAt"
    @preview-toggle="handleIssuePreviewToggle"
  />

  <MasteringChatSidebar
    v-if="canSeeMasteringSidebar && track"
    ref="chatSidebarRef"
    :track-id="trackId"
    :track-completed="track.status === 'completed'"
    :issues="issues"
    @open-issue="openLinkedIssue"
  />
</template>
