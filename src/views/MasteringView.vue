<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, issueApi, r2Api, uploadToR2, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import { useTrackStore } from '@/stores/tracks'
import type {
  Track, MasterDelivery, WorkflowConfig,
  Issue, TrackSourceVersion, StageAssignment, WorkflowTransitionOption,
} from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { extractAudioDuration } from '@/utils/audio'
import { translateStepLabel } from '@/utils/workflow'
import { activeAssignmentsForStep, canUserReviewIssue } from '@/utils/reviewAssignments'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import WorkflowActionBar from '@/components/workflow/WorkflowActionBar.vue'
import type { WorkflowAction } from '@/components/workflow/WorkflowActionBar.vue'
import BatchIssueActions from '@/components/workflow/BatchIssueActions.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useToast } from '@/composables/useToast'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { ChevronLeft, ChevronDown, Upload, Check } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const trackStore = useTrackStore()
const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const { success: toastSuccess, error: toastError } = useToast()

const MAX_AUDIO_SIZE = 200 * 1024 * 1024

const trackId = computed(() => Number(route.params.id))
const track = ref<Track | null>(null)
const masterDeliveries = ref<MasterDelivery[]>([])
const workflowConfig = ref<WorkflowConfig | null>(null)
const issues = ref<Issue[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
const reviewAssignments = ref<StageAssignment[]>([])
const loading = ref(true)
const loadError = ref(false)
const acting = ref(false)
const actionError = ref('')

// Mastering notes editing
const editingMasteringNotes = ref(false)
const masteringNotesForm = ref('')
const savingMasteringNotes = ref(false)
const masteringNotesExpanded = ref(false)

// Chat sidebar
const chatSidebarRef = ref<InstanceType<typeof MasteringChatSidebar> | null>(null)

// Tabs
const activeTab = ref<'listen' | 'issues' | 'delivery'>('listen')
const masteringTabs = computed(() => [
  { key: 'listen' as const, label: t('masteringPage.tabs.listen') },
  { key: 'issues' as const, label: t('masteringPage.tabs.issues') },
  { key: 'delivery' as const, label: t('masteringPage.tabs.delivery') },
])

// Collapsible version history
const versionHistoryExpanded = ref(false)

// Issues / waveform annotation
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const hoveredIssueId = ref<number | null>(null)
const selectedStageIssueIds = ref<number[]>([])
const stageBatchNote = ref('')
const batchUpdatingIssues = ref(false)
const isIssueFormOpen = ref(false)
const waveformMode = computed<'seek' | 'annotate'>(() =>
  activeTab.value === 'issues' && isIssueFormOpen.value ? 'annotate' : 'seek',
)

// Source version comparison
const showSourceCompare = ref(false)
const selectedCompareSourceVersionId = ref<number | null>(null)

// Delivery upload
const uploadFile = ref<File | null>(null)
const localDeliveryPreviewUrl = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')

// Master delivery comparison
const showMasterCompare = ref(false)
const selectedCompareMasterDeliveryId = ref<number | null>(null)

// Computed
const isSubmitter = computed(() => track.value?.submitter_id === appStore.currentUser?.id)
const isMasteringEngineer = computed(() => track.value?.mastering_engineer_id === appStore.currentUser?.id)
const canSeeMasteringDiscussion = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId || !track.value) return false
  return userId === track.value.submitter_id
    || userId === track.value.producer_id
    || userId === track.value.mastering_engineer_id
})

const masterAudioUrl = computed(() => {
  const d = track.value?.current_master_delivery
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
  const currentId = track.value?.current_master_delivery?.id ?? null
  return sortedMasterDeliveries.value.filter(d => d.id !== currentId)
})

const masterCompareOptions = computed<SelectOption[]>(() =>
  olderMasterDeliveries.value.map(d => ({
    value: d.id,
    label: masterDeliveryOptionLabel(d),
  })),
)

const selectedCompareMasterDelivery = computed(() =>
  olderMasterDeliveries.value.find(d => d.id === selectedCompareMasterDeliveryId.value) ?? null,
)

const selectedCompareMasterAudioUrl = computed(() => {
  const d = selectedCompareMasterDelivery.value
  if (!d) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${d.id}/audio?v=${d.delivery_number}&c=${d.workflow_cycle}`
})

const canApproveFinal = computed(() => {
  if (!track.value?.current_master_delivery) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  if (userId === track.value.producer_id) return !track.value.current_master_delivery.producer_approved_at
  if (userId === track.value.submitter_id) return !track.value.current_master_delivery.submitter_approved_at
  return false
})

// Source audio
const audioUrl = computed(() =>
  track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio?v=${track.value.version ?? 0}` : '',
)
const currentSourceVersionId = computed(() => track.value?.current_source_version?.id ?? null)
const olderSourceVersions = computed(() =>
  sourceVersions.value
    .filter(v => v.id !== currentSourceVersionId.value)
    .sort((a, b) => b.version_number - a.version_number),
)
const sourceCompareOptions = computed<SelectOption[]>(() =>
  olderSourceVersions.value.map(v => ({
    value: v.id,
    label: `v${v.version_number} · ${fmtDate(v.created_at)}`,
  })),
)
const selectedCompareSourceVersion = computed(() =>
  olderSourceVersions.value.find(v => v.id === selectedCompareSourceVersionId.value) ?? null,
)
const isSourceCompareActive = computed(() => selectedCompareSourceVersion.value !== null)
const displayedSourceVersionNumber = computed(() =>
  selectedCompareSourceVersion.value?.version_number ?? track.value?.version ?? null,
)

// Issues
const fallbackStepIssues = computed(() => {
  const fallbackPhases = ['peer', 'producer', 'mastering', 'final_review']
  return issues.value.filter(i => fallbackPhases.includes(i.phase))
})
function filterIssuesForDisplayedSourceVersion(list: Issue[]): Issue[] {
  const version = displayedSourceVersionNumber.value
  if (version == null) return list
  return list.filter(issue => issue.source_version_number == null || issue.source_version_number === version)
}
const fallbackWaveformIssues = computed(() => filterIssuesForDisplayedSourceVersion(fallbackStepIssues.value))
const masteringWaveformPhases = ['mastering', 'final_review']
const masteringWaveformIssues = computed(() =>
  issues.value.filter(i => masteringWaveformPhases.includes(i.phase)),
)
const waveformIssues = computed(() => filterIssuesForDisplayedSourceVersion(masteringWaveformIssues.value))

// Review assignments
const currentStep = computed(() => track.value?.workflow_step ?? null)
const currentStepAssignments = computed(() => activeAssignmentsForStep(reviewAssignments.value, currentStep.value?.id))
const reviewAllowsInternalIssueVisibility = computed(() => {
  if (currentStep.value?.type !== 'review') return false
  const assignmentCount = currentStepAssignments.value.length
  const requiredCount = Math.max(1, currentStep.value?.required_reviewer_count ?? 1)
  return Math.max(requiredCount, assignmentCount) > 1
})

// Workflow transitions
const transitions = computed<WorkflowTransitionOption[]>(() => track.value?.workflow_transitions ?? [])

function actionTypeForTransition(decision: string): WorkflowAction['type'] {
  if (decision === 'reject_final') return 'reject'
  if (decision.includes('reject') || decision.includes('revision') || decision === 'return') return 'return'
  return 'advance'
}

function transitionLabel(decision: string, fallbackLabel: string) {
  if (decision.startsWith('reject_to_')) {
    const targetStepId = decision.slice('reject_to_'.length)
    const targetStep = workflowConfig.value?.steps.find(step => step.id === targetStepId)
    const label = targetStep ? translateStepLabel(targetStep, t) : targetStepId
    return t('workflowStep.rejectToStep', { step: label })
  }
  return t(`trackDetail.actions.${decision}`, fallbackLabel)
}

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
      type: 'advance' as const,
      disabled: acting.value,
      handler: handleConfirmDelivery,
    })
  }
  return actions
})

// Batch issue actions
const stageBatchIssueList = computed(() => fallbackWaveformIssues.value)

function canCurrentUserReviewIssue(issue: Issue): boolean {
  return canUserReviewIssue(appStore.currentUser?.id, track.value, issue, reviewAssignments.value)
}

function canCurrentUserSubmitIssue(issue: Issue): boolean {
  return Boolean(track.value && appStore.currentUser?.id === track.value.submitter_id && ['open', 'disagreed'].includes(issue.status))
}

function availableBatchActionsForIssue(issue: Issue): Issue['status'][] {
  if (canCurrentUserSubmitIssue(issue) && issue.status === 'open') return ['resolved', 'disagreed']
  if (canCurrentUserReviewIssue(issue) && issue.status === 'open') return ['resolved', 'pending_discussion']
  if (canCurrentUserReviewIssue(issue) && issue.status === 'pending_discussion') return ['open', 'internal_resolved']
  if (canCurrentUserReviewIssue(issue) && issue.status === 'internal_resolved') return ['open']
  if (canCurrentUserReviewIssue(issue) && issue.status === 'resolved') return ['open']
  if (canCurrentUserReviewIssue(issue) && issue.status === 'disagreed') return ['open']
  return []
}

function intersectBatchActions(selectedIssues: Issue[]): Issue['status'][] {
  if (!selectedIssues.length) return []
  const [firstIssue, ...rest] = selectedIssues
  return availableBatchActionsForIssue(firstIssue).filter(status =>
    rest.every(issue => availableBatchActionsForIssue(issue).includes(status)),
  )
}

const selectedStageIssues = computed(() =>
  stageBatchIssueList.value.filter(issue => selectedStageIssueIds.value.includes(issue.id)),
)
const stageBatchActions = computed(() => intersectBatchActions(selectedStageIssues.value))

const canUploadDelivery = computed(() => isMasteringEngineer.value && track.value != null)

const { downloading, downloadProgress, downloadTrackAudio, downloadAudioAsset } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)
const handleMasterDownload = () => downloadTrackAudio(masterAudioUrl, track, '_master')

// WebSocket
const wsReloading = ref(false)
const wsHadConnection = ref(false)
const { connected: wsConnected } = useTrackWebSocket(trackId.value, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadData()
  wsReloading.value = false
}, {
  onDiscussionEvent: (event, discussionId) => {
    chatSidebarRef.value?.handleDiscussionEvent(event, discussionId)
  },
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

onMounted(loadData)
onMounted(() => {
  window.addEventListener('keydown', handleWaveformHotkeys)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWaveformHotkeys)
  resetDeliveryPreview()
})

onBeforeRouteLeave(() => {
  if (!uploading.value && !uploadFile.value) return true
  return window.confirm(t('workflowStep.leaveUploadConfirm'))
})

async function loadData() {
  if (!track.value) loading.value = true
  loadError.value = false
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    trackStore.setCurrentTrack(detail.track)
    masterDeliveries.value = detail.master_deliveries ?? []
    workflowConfig.value = detail.workflow_config ?? null
    sourceVersions.value = detail.source_versions ?? []
    issues.value = (detail.issues ?? []).filter(
      (issue: Issue) => issue.workflow_cycle === detail.track.workflow_cycle,
    )
    try {
      reviewAssignments.value = await trackApi.listAssignments(trackId.value)
    } catch {
      reviewAssignments.value = []
    }
  } catch {
    trackStore.setCurrentTrack(null)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

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
  if (!uploadFile.value || !track.value) return
  uploading.value = true
  uploadProgress.value = 0
  uploadError.value = ''
  try {
    const file = uploadFile.value
    if (appStore.r2Enabled) {
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
      await r2Api.confirmMasterDeliveryUpload(trackId.value, {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
      })
    } else {
      await trackApi.uploadMasterDelivery(trackId.value, file, (p) => {
        uploadProgress.value = p
      })
    }
    uploadFile.value = null
    resetDeliveryPreview()
    toastSuccess(t('workflowStep.deliveryUploaded'))
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
  try {
    const updated = await trackApi.approveFinalReview(track.value.id)
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.approved'))
  } catch {
    toastError(t('common.error'))
  }
}

// Confirm delivery
async function handleConfirmDelivery() {
  if (!track.value?.current_master_delivery) return
  try {
    const updated = await trackApi.confirmDelivery(track.value.id, track.value.current_master_delivery.id)
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.deliveryConfirmed'))
  } catch {
    toastError(t('common.error'))
  }
}

const canConfirmDelivery = computed(() => {
  if (!track.value?.current_master_delivery) return false
  if (track.value.current_master_delivery.confirmed_at) return false
  return isMasteringEngineer.value
})

// Workflow transition
async function executeTransition(decision: string) {
  if (!track.value) return
  if (decision === 'reject_final') {
    const confirmed = window.confirm(t('producer.rejectFinalConfirm'))
    if (!confirmed) return
  }
  acting.value = true
  actionError.value = ''
  try {
    const previousStatus = track.value.status
    const updatedTrack = await trackApi.workflowTransition(trackId.value, decision)
    if (updatedTrack.status === previousStatus) {
      await loadData()
      return
    }
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    actionError.value = err.message || t('workflowStep.transitionFailed')
  } finally {
    acting.value = false
  }
}

// Issue handlers
function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
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
  if (next === 'annotate') issueFormRef.value?.openForm?.()
  else issueFormRef.value?.closeForm?.()
}

// Batch issue actions
async function applyBatchIssueStatusChange(status: Issue['status']) {
  if (!track.value || !selectedStageIssues.value.length) return
  batchUpdatingIssues.value = true
  try {
    const updatedIssues = await issueApi.batchUpdate(trackId.value, {
      issue_ids: selectedStageIssues.value.map(issue => issue.id),
      status,
      status_note: stageBatchNote.value.trim() || undefined,
    })
    const updatedById = new Map(updatedIssues.map(issue => [issue.id, issue]))
    issues.value = issues.value.map(issue => {
      const updated = updatedById.get(issue.id)
      return updated ? { ...issue, ...updated } : issue
    })
    selectedStageIssueIds.value = []
    stageBatchNote.value = ''
  } catch (err: any) {
    toastError(err.message || t('workflowStep.transitionFailed'))
  } finally {
    batchUpdatingIssues.value = false
  }
}

// Source compare
function toggleSourceCompare() {
  showSourceCompare.value = !showSourceCompare.value
  if (!showSourceCompare.value) selectedCompareSourceVersionId.value = null
}

// Waveform hotkeys
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
}

function handleWaveformHotkeys(event: KeyboardEvent) {
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

// Watchers for source compare
watch(olderSourceVersions, (versions) => {
  if (!versions.some(v => v.id === selectedCompareSourceVersionId.value)) {
    selectedCompareSourceVersionId.value = null
  }
  if (versions.length === 0) showSourceCompare.value = false
})

watch(isSourceCompareActive, (active) => {
  if (!active) return
  issueFormRef.value?.closeForm?.()
  hoveredIssueId.value = null
})

watch([stageBatchIssueList], ([issuesList]) => {
  const validIds = new Set(issuesList.map(issue => issue.id))
  selectedStageIssueIds.value = selectedStageIssueIds.value.filter(id => validIds.has(id))
  if (selectedStageIssueIds.value.length === 0) stageBatchNote.value = ''
})

// Master compare
function toggleMasterCompare() {
  showMasterCompare.value = !showMasterCompare.value
  if (!showMasterCompare.value) selectedCompareMasterDeliveryId.value = null
}

function masterDeliveryOptionLabel(delivery: MasterDelivery): string {
  const version = `v${delivery.delivery_number}`
  const cycle = track.value && delivery.workflow_cycle !== track.value.workflow_cycle
    ? ` · C${delivery.workflow_cycle}`
    : ''
  return `${version}${cycle} · ${fmtDate(delivery.created_at)}`
}

function compareWithMasterDelivery(deliveryId: number) {
  showMasterCompare.value = true
  selectedCompareMasterDeliveryId.value = deliveryId
}

function handleMasterVersionDownload(delivery: MasterDelivery) {
  const cycleSuffix = track.value && delivery.workflow_cycle !== track.value.workflow_cycle
    ? `_cycle${delivery.workflow_cycle}`
    : ''
  const url = `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}`
  downloadAudioAsset(url, `${track.value?.title ?? 'track'}_master_v${delivery.delivery_number}${cycleSuffix}`, delivery.file_path)
}

watch(activeTab, () => {
  showSourceCompare.value = false
  selectedCompareSourceVersionId.value = null
  showMasterCompare.value = false
  selectedCompareMasterDeliveryId.value = null
  isIssueFormOpen.value = false
})

watch(olderMasterDeliveries, (deliveries) => {
  if (deliveries.length > 0) return
  showMasterCompare.value = false
  selectedCompareMasterDeliveryId.value = null
})
</script>

<template>
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
      class="flex items-center gap-2 px-4 py-2.5 bg-warning-bg border border-warning/30 text-warning text-sm font-mono"
    >
      <span class="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0"></span>
      {{ t('trackDetail.liveDisconnected') }}
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
        <p class="text-sm text-muted-foreground">{{ track.title }} · {{ track.artist ?? '--' }}</p>
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
          <p v-else class="text-xs text-muted-foreground italic">{{ t('trackDetail.noMasteringNotes') }}</p>
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
    <template v-if="activeTab === 'listen'">
      <!-- Source audio -->
      <div v-if="audioUrl" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('mastering.waveformHint') }}</h3>
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
        />
      </div>

      <!-- Master delivery audio -->
      <div v-if="masterAudioUrl" class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold text-foreground">
            {{ t('masteringPage.currentDelivery') }}
            <span v-if="track.current_master_delivery" class="text-xs text-muted-foreground ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
          </h3>
          <div class="flex items-center gap-2">
            <button v-if="olderMasterDeliveries.length > 0" @click="toggleMasterCompare" class="btn-secondary text-xs px-3 py-1">
              {{ t('compare.title') }}
            </button>
            <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
              {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
            </button>
          </div>
        </div>
        <div v-if="showMasterCompare && olderMasterDeliveries.length > 0" class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
          <CustomSelect v-model="selectedCompareMasterDeliveryId" :options="masterCompareOptions" :placeholder="`-- ${t('compare.selectVersion')} --`" size="sm" />
          <button v-if="selectedCompareMasterDeliveryId" @click="selectedCompareMasterDeliveryId = null" class="text-xs text-muted-foreground hover:text-foreground">
            {{ t('compare.clear') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" :compare-audio-url="selectedCompareMasterAudioUrl" />
      </div>
    </template>

    <!-- ═══ Tab: Issues ═══ -->
    <template v-if="activeTab === 'issues'">
      <!-- Source waveform for annotation context -->
      <div v-if="audioUrl" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('mastering.waveformHint') }}</h3>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          ref="waveformRef"
          :audio-url="audioUrl"
          :issues="waveformIssues"
          :track-id="trackId"
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
        />
      </div>

      <!-- Issue create + list (mastering engineer) -->
      <div v-if="isMasteringEngineer" class="space-y-4">
        <IssueCreatePanel
          ref="issueFormRef"
          :track-id="trackId"
          phase="mastering"
          :allow-internal-visibility="reviewAllowsInternalIssueVisibility"
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
          @select="onIssueSelect"
          @update:selectedIds="selectedStageIssueIds = $event"
          @hover="handleIssueHover"
          @leave="handleIssueLeave"
        />
      </div>

      <!-- Non-mastering-engineer: read-only issue list -->
      <div v-if="!isMasteringEngineer" class="space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: fallbackWaveformIssues.length }) }}</h3>
        <IssueMarkerList
          :issues="fallbackWaveformIssues"
          :current-source-version-number="displayedSourceVersionNumber"
          :hovered-issue-id="hoveredIssueId"
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
        <p class="text-sm text-muted-foreground">{{ t('masteringPage.uploadHint') }}</p>
        <input type="file" accept="audio/*" @change="onFileChange" class="input-field w-full" />
        <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
          <div class="space-y-1">
            <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
            <p class="text-sm text-muted-foreground">{{ t('workflowStep.deliveryPreviewNotice') }}</p>
          </div>
          <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" :compact="true" :height="96" />
          <div class="flex flex-wrap gap-2">
            <button @click="handleUploadDelivery" :disabled="uploading" class="btn-primary text-sm h-10 inline-flex items-center justify-center">
              <Upload class="w-4 h-4 mr-2" />
              {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
            </button>
            <button @click="uploadFile = null; resetDeliveryPreview()" :disabled="uploading" class="btn-secondary text-sm">
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
        <div v-if="uploadError" class="text-sm text-error">{{ uploadError }}</div>
      </div>

      <!-- Approval status + actions -->
      <div v-if="masterAudioUrl" class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.approvalStatus') }}</h3>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('trackDetail.producer') }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.producer_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.submitter_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex gap-2 pt-1">
          <button v-if="canConfirmDelivery" @click="handleConfirmDelivery" class="btn-primary text-sm flex items-center gap-1.5">
            <Check class="w-4 h-4" :stroke-width="2" />
            {{ t('masteringPage.confirmDelivery') }}
          </button>
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
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-mono font-semibold text-foreground">{{ masterDeliveryOptionLabel(delivery) }}</span>
                <span v-if="delivery.id === track.current_master_delivery?.id" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                  {{ t('compare.currentVersion') }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button v-if="delivery.id !== track.current_master_delivery?.id" @click="compareWithMasterDelivery(delivery.id)" class="btn-secondary text-xs px-3 py-1">
                {{ t('compare.title') }}
              </button>
              <button @click="handleMasterVersionDownload(delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
                {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

    <WorkflowActionBar v-if="deliveryActions.length" :actions="deliveryActions" :hint="t('mastering.actionHint')" />
  </div>

  <!-- Chat sidebar -->
  <MasteringChatSidebar
    v-if="canSeeMasteringDiscussion && track"
    ref="chatSidebarRef"
    :track-id="trackId"
    :track-completed="track.status === 'completed'"
  />
</template>
