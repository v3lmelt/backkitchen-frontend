<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi, discussionApi, API_ORIGIN, resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue, Discussion, EditHistory, WorkflowEvent, TrackSourceVersion, WorkflowConfig, WorkflowStepDef, AlbumMember, MasterDelivery, StageAssignment } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { hashId } from '@/utils/hash'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import CommentInput from '@/components/common/CommentInput.vue'
import { Archive, Check, ChevronRight, UserRoundCog, Pencil, Trash2 } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useToast } from '@/composables/useToast'
import { translateStepLabel } from '@/utils/workflow'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { useTrackStore } from '@/stores/tracks'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const trackStore = useTrackStore()
const { t, te, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const { success: toastSuccess, error: toastError } = useToast()

/** Map event_type to a dot color class for visual categorisation */
function timelineDotColor(event: WorkflowEvent): string {
  const type = event.event_type
  if (type.includes('reject') || type.includes('reject')) return 'bg-error'
  if (type.includes('completed') || type.includes('approved') || type.includes('accepted')) return 'bg-success'
  if (type.includes('issue')) return 'bg-warning'
  if (type.includes('revision') || type.includes('returned')) return 'bg-warning'
  if (type.includes('upload') || type.includes('deliver')) return 'bg-info'
  return 'bg-border'
}

/** For transition events, return a short "A → B" status change label */
function transitionLabel(event: WorkflowEvent): string | null {
  if (!event.from_status || !event.to_status) return null
  if (event.from_status === event.to_status) return null
  const from = translateWorkflowStatus(event.from_status)
  const to = translateWorkflowStatus(event.to_status)
  return `${from} → ${to}`
}

function translateWorkflowStatus(status: string): string {
  const workflowStepKey = `workflowSteps.${status}`
  if (te(workflowStepKey)) return t(workflowStepKey)
  return t(`status.${status}`, status)
}

function translateWorkflowDecision(decision: string): string {
  if (decision.startsWith('reject_to_')) {
    const target = decision.slice('reject_to_'.length)
    return t('workflowStep.rejectToStep', { step: translateWorkflowStatus(target) })
  }
  const actionKey = `trackDetail.actions.${decision}`
  if (te(actionKey)) return t(actionKey)
  return decision.replaceAll('_', ' ')
}

// Anonymize peer reviewer only for the submitter during active peer review phases
const shouldAnonymizePeer = computed(() => {
  if (!track.value || !appStore.currentUser) return false
  const isSubmitter = appStore.currentUser.id === track.value.submitter_id
  const peerPhases = ['peer_review', 'peer_revision']
  return isSubmitter && peerPhases.includes(track.value.status)
})

// Single pass over issues — builds both number and peer-phase lookup
const issueMetadata = computed(() => {
  const numberMap = new Map<number, number>()
  const peerMap = new Map<number, boolean>()
  issues.value.forEach((issue, idx) => {
    numberMap.set(issue.id, idx + 1)
    peerMap.set(issue.id, issue.phase === 'peer')
  })
  return { numberMap, peerMap }
})

function formatTimelineEvent(event: WorkflowEvent): string {
  const payload = event.payload ?? {}
  const issueId = typeof payload.issue_id === 'number' ? payload.issue_id : null
  const { numberMap, peerMap } = issueMetadata.value

  const isPeer = issueId != null
    ? peerMap.get(issueId) === true
    : payload.phase === 'peer'

  const rawName = event.actor?.display_name
  const name = !rawName
    ? t('trackDetail.system')
    : isPeer && shouldAnonymizePeer.value && event.actor
      ? `#${hashId(event.actor.id)}`
      : rawName

  const num = issueId != null ? (numberMap.get(issueId) ?? null) : null

  switch (event.event_type) {
    case 'issue_created':
      return num != null
        ? t('dashboard.timeline.issueCreated', { name, num })
        : t('dashboard.events.issue_created', { name })
    case 'issue_comment_added':
      return num != null
        ? t('dashboard.timeline.issueCommented', { name, num })
        : t('dashboard.events.issue_comment_added', { name })
    case 'issue_updated': {
      const s = payload.status as string | undefined
      if (s === 'resolved') return num != null
        ? t('dashboard.timeline.issueResolved', { name, num })
        : t('dashboard.events.issue_updated', { name })
      if (s === 'internal_resolved') return num != null
        ? t('dashboard.timeline.issueInternalResolved', { name, num })
        : t('dashboard.events.issue_updated', { name })
      if (s === 'pending_discussion') return num != null
        ? t('dashboard.timeline.issuePendingDiscussion', { name, num })
        : t('dashboard.events.issue_updated', { name })
      if (s === 'open') return num != null
        ? t('dashboard.timeline.issueReopened', { name, num })
        : t('dashboard.events.issue_updated', { name })
      if (s === 'disagreed') return num != null
        ? t('dashboard.timeline.issueDisagreed', { name, num })
        : t('dashboard.events.issue_updated', { name })
      return num != null
        ? t('dashboard.timeline.issueUpdated', { name, num })
        : t('dashboard.events.issue_updated', { name })
    }
    default: {
      if (event.event_type.startsWith('workflow_transition_')) {
        const decision = event.event_type.slice('workflow_transition_'.length)
        return t('dashboard.events.workflow_transition', {
          name,
          action: translateWorkflowDecision(decision),
        })
      }

      if (event.event_type === 'workflow_review_progress') {
        const completed = typeof payload.completed_reviews === 'number' ? payload.completed_reviews : null
        const required = typeof payload.required_reviews === 'number' ? payload.required_reviews : null
        if (completed != null && required != null) {
          return t('dashboard.events.workflow_review_progress', { name, completed, required })
        }
        return t('dashboard.events.workflow_review_progress_generic', { name })
      }

      const key = `dashboard.events.${event.event_type}`
      if (te(key)) return t(key, { name })
      return `${name}: ${event.event_type.replaceAll('_', ' ')}`
    }
  }
}
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const discussions = ref<Discussion[]>([])
const events = ref<WorkflowEvent[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
const masterDeliveries = ref<MasterDelivery[]>([])
const reviewAssignments = ref<StageAssignment[]>([])
const workflowConfig = ref<WorkflowConfig | null>(null)
const loading = ref(true)
const loadError = ref(false)
const timelineExpanded = ref(false)
const timelineFilter = ref<'all' | 'transitions' | 'issues' | 'uploads'>('all')
const TIMELINE_PREVIEW_COUNT = 5
const mobileCtaBarRef = ref<HTMLElement | null>(null)
const mobileCtaBarHeight = ref(0)
const mobileCtaSpacerStyle = computed(() => ({ '--fixed-bottom-bar-height': `${mobileCtaBarHeight.value}px` }))

let mobileCtaResizeObserver: ResizeObserver | null = null

function updateMobileCtaHeight() {
  mobileCtaBarHeight.value = mobileCtaBarRef.value?.offsetHeight ?? 0
}

function observeMobileCtaBar() {
  mobileCtaResizeObserver?.disconnect()
  mobileCtaResizeObserver = null

  if (typeof ResizeObserver === 'undefined' || !mobileCtaBarRef.value) return

  mobileCtaResizeObserver = new ResizeObserver(() => {
    updateMobileCtaHeight()
  })
  mobileCtaResizeObserver.observe(mobileCtaBarRef.value)
}

const filteredEvents = computed(() => {
  const sorted = [...events.value].reverse()
  if (timelineFilter.value === 'all') return sorted
  if (timelineFilter.value === 'transitions')
    return sorted.filter(e => e.from_status && e.to_status && e.from_status !== e.to_status)
  if (timelineFilter.value === 'issues')
    return sorted.filter(e => e.event_type.startsWith('issue'))
  if (timelineFilter.value === 'uploads')
    return sorted.filter(e => e.event_type.includes('upload') || e.event_type.includes('deliver'))
  return sorted
})
const postingDiscussion = ref(false)
const postingDiscussionProgress = ref(0)
const discussionInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)
const showMasterCompare = ref(false)
const selectedCompareMasterDeliveryId = ref<number | null>(null)

onMounted(loadTrack)
onMounted(async () => {
  await nextTick()
  updateMobileCtaHeight()
  observeMobileCtaBar()

  window.addEventListener('resize', updateMobileCtaHeight)
})

onBeforeUnmount(() => {
  mobileCtaResizeObserver?.disconnect()
  window.removeEventListener('resize', updateMobileCtaHeight)
})

// Real-time: reload track data whenever another collaborator changes it
const wsReloading = ref(false)
const wsHadConnection = ref(false)
const { connected: wsConnected } = useTrackWebSocket(trackId.value, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadTrack()
  wsReloading.value = false
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

async function loadTrack() {
  loading.value = true
  loadError.value = false
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    trackStore.setCurrentTrack(detail.track)
    issues.value = detail.issues
    discussions.value = detail.discussions ?? []
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
    masterDeliveries.value = detail.master_deliveries ?? []
    workflowConfig.value = detail.workflow_config ?? null
    // Fetch review assignments for multi-reviewer progress display
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

const audioUrl = computed(() => {
  const t = track.value
  if (!t?.file_path) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/audio?v=${t.version ?? 0}`
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
  return sortedMasterDeliveries.value.filter(delivery => delivery.id !== currentId)
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
const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)
const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))
const currentWaveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return currentCycleIssues.value
  return currentCycleIssues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

// Multi-reviewer: filter assignments to current review step
const currentStepAssignments = computed(() => {
  const step = track.value?.workflow_step
  if (!step || step.type !== 'review') return []
  return reviewAssignments.value.filter(a => a.stage_id === step.id && a.status !== 'cancelled')
})

const hasMultipleReviewers = computed(() => currentStepAssignments.value.length > 0)
const completedReviewCount = computed(() => currentStepAssignments.value.filter(a => a.status === 'completed').length)
const totalReviewCount = computed(() => currentStepAssignments.value.length)

const customWorkflowActionLabel = computed(() => {
  const step = track.value?.workflow_step
  if (!step) return ''
  return t('trackDetail.openWorkflowStep', { step: translateStepLabel(step, t) })
})

function onIssueSelect(issue: Issue) {
  router.push({
    path: `/issues/${issue.id}`,
    query: route.query.returnTo ? { returnTo: String(route.query.returnTo) } : undefined,
  })
}

function openPrimaryAction(_action: string) {
  if (!track.value?.workflow_step) return
  router.push({
    path: `/tracks/${trackId.value}/step/${track.value.workflow_step.id}`,
    query: route.query.returnTo ? { returnTo: String(route.query.returnTo) } : undefined,
  })
}


async function handleDiscussionSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  postingDiscussion.value = true
  postingDiscussionProgress.value = 0
  try {
    const d = await discussionApi.create(trackId.value, {
      content: payload.content.trim(),
      images: payload.images.length ? payload.images : undefined,
    }, (p) => { postingDiscussionProgress.value = p })
    discussions.value.push(d)
    discussionInputRef.value?.reset()
  } finally {
    postingDiscussion.value = false
  }
}

function openImage(url: string) {
  window.open(resolveAssetUrl(url), '_blank')
}

// Discussion edit/delete
const editingDiscussionId = ref<number | null>(null)
const editingDiscussionContent = ref('')

function startEditDiscussion(d: Discussion) {
  editingDiscussionId.value = d.id
  editingDiscussionContent.value = d.content
}

async function saveEditDiscussion(d: Discussion) {
  const content = editingDiscussionContent.value.trim()
  if (!content) return
  try {
    const updated = await discussionApi.update(d.id, content)
    const idx = discussions.value.findIndex(x => x.id === d.id)
    if (idx !== -1) discussions.value[idx] = updated
    editingDiscussionId.value = null
  } catch { toastError(t('common.error')) }
}

async function deleteDiscussion(d: Discussion) {
  try {
    await discussionApi.delete(d.id)
    discussions.value = discussions.value.filter(x => x.id !== d.id)
  } catch { toastError(t('common.error')) }
}

// Discussion edit history
const discussionHistoryItems = ref<EditHistory[]>([])
const showHistoryForDiscussionId = ref<number | null>(null)

async function showDiscussionHistory(discussionId: number) {
  showHistoryForDiscussionId.value = discussionId
  try {
    discussionHistoryItems.value = await discussionApi.history(discussionId)
  } catch { discussionHistoryItems.value = [] }
}

function closeDiscussionHistory() {
  showHistoryForDiscussionId.value = null
  discussionHistoryItems.value = []
}

const currentVersionId = computed(() => track.value?.current_source_version?.id ?? null)
const olderVersions = computed(() =>
  sourceVersions.value
    .filter(v => v.id !== currentVersionId.value)
    .sort((a, b) => b.version_number - a.version_number)
)

const versionOptions = computed<SelectOption[]>(() =>
  olderVersions.value.map((v) => ({
    value: v.id,
    label: `V${v.version_number} · ${fmtDate(v.created_at)}`,
  }))
)

function masterDeliveryOptionLabel(delivery: MasterDelivery): string {
  const version = `v${delivery.delivery_number}`
  const cycle = track.value && delivery.workflow_cycle !== track.value.workflow_cycle
    ? ` · C${delivery.workflow_cycle}`
    : ''
  return `${version}${cycle} · ${fmtDate(delivery.created_at)}`
}

function toggleMasterCompare() {
  showMasterCompare.value = !showMasterCompare.value
  if (!showMasterCompare.value) {
    selectedCompareMasterDeliveryId.value = null
  }
}

const isProducer = computed(() => track.value?.producer_id === appStore.currentUser?.id)
const archiving = ref(false)
const showArchiveConfirm = ref(false)
const togglingVisibility = ref(false)

// ── Edit metadata ─────────────────────────────────────────────────────────
const canEditMetadata = computed(() => {
  if (!track.value || !appStore.currentUser) return false
  return appStore.currentUser.id === track.value.submitter_id || isProducer.value
})
const editingMetadata = ref(false)
const metadataForm = ref({ title: '', artist: '', bpm: '', original_title: '', original_artist: '' })
const savingMetadata = ref(false)

function startEditMetadata() {
  if (!track.value) return
  metadataForm.value = {
    title: track.value.title,
    artist: track.value.artist ?? '',
    bpm: track.value.bpm ?? '',
    original_title: track.value.original_title ?? '',
    original_artist: track.value.original_artist ?? '',
  }
  editingMetadata.value = true
}

async function saveMetadata() {
  if (!track.value) return
  savingMetadata.value = true
  try {
    const data: Record<string, string | null> = {}
    if (metadataForm.value.title && metadataForm.value.title !== track.value.title)
      data.title = metadataForm.value.title
    if (metadataForm.value.artist && metadataForm.value.artist !== (track.value.artist ?? ''))
      data.artist = metadataForm.value.artist
    const newBpm = metadataForm.value.bpm || null
    if (newBpm !== (track.value.bpm ?? null)) data.bpm = newBpm
    const newOT = metadataForm.value.original_title || null
    if (newOT !== (track.value.original_title ?? null)) data.original_title = newOT
    const newOA = metadataForm.value.original_artist || null
    if (newOA !== (track.value.original_artist ?? null)) data.original_artist = newOA

    if (Object.keys(data).length === 0) {
      editingMetadata.value = false
      return
    }
    const updated = await trackApi.updateMetadata(track.value.id, data)
    track.value = { ...track.value, ...updated }
    editingMetadata.value = false
    toastSuccess(t('trackDetail.metadataSaved'))
    await loadTrack()
  } catch {
    toastError(t('trackDetail.metadataSaveFailed'))
  } finally {
    savingMetadata.value = false
  }
}

async function toggleVisibility() {
  if (!track.value) return
  togglingVisibility.value = true
  try {
    const updated = await trackApi.setVisibility(track.value.id, !track.value.is_public)
    track.value = { ...track.value, is_public: updated.is_public }
  } catch {
    toastError(t('common.error'))
  } finally {
    togglingVisibility.value = false
  }
}

async function archiveTrack() {
  if (!track.value) return
  archiving.value = true
  try {
    await trackApi.archive(track.value.id)
    toastSuccess(t('trackDetail.archiveDone'))
    const returnTo = Array.isArray(route.query.returnTo) ? route.query.returnTo[0] : route.query.returnTo
    const fallback = `/albums/${track.value.album_id}/settings`
    await router.push(typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : fallback)
  } catch {
    toastError(t('common.error'))
  } finally {
    archiving.value = false
    showArchiveConfirm.value = false
  }
}

// Reassign reviewer
const canReassignReviewer = computed(() =>
  isProducer.value && track.value?.workflow_step?.type === 'review'
)
const isAutoAssign = computed(() => {
  const step = track.value?.workflow_step
  return step?.assignment_mode === 'auto' || (step?.assignee_user_id != null)
})
const showReassignModal = ref(false)
const reassignMembers = ref<AlbumMember[]>([])
const reassignSelectedUserIds = ref<number[]>([])
const reassigning = ref(false)
const reassignReviewerLimit = computed(() => Math.max(1, track.value?.workflow_step?.required_reviewer_count ?? 1))
const canSelectMoreReassignReviewers = computed(() => reassignSelectedUserIds.value.length < reassignReviewerLimit.value)

async function openReassignModal() {
  if (isAutoAssign.value) {
    await doReassign()
    return
  }
  reassignSelectedUserIds.value = []
  if (!reassignMembers.value.length && track.value) {
    const album = await albumApi.get(track.value.album_id)
    reassignMembers.value = album.members.filter(m => m.user_id !== track.value!.submitter_id)
  }
  showReassignModal.value = true
}

function toggleReassignMember(userId: number) {
  const exists = reassignSelectedUserIds.value.includes(userId)
  if (exists) {
    reassignSelectedUserIds.value = reassignSelectedUserIds.value.filter(id => id !== userId)
    return
  }
  if (!canSelectMoreReassignReviewers.value) return
  reassignSelectedUserIds.value = [...reassignSelectedUserIds.value, userId]
}

function isReassignMemberSelectionDisabled(userId: number): boolean {
  if (reassignSelectedUserIds.value.includes(userId)) return false
  return !canSelectMoreReassignReviewers.value
}

const reassignSelectionSummary = computed(() => t('trackDetail.reassignSelectionSummary', {
  selected: reassignSelectedUserIds.value.length,
  limit: reassignReviewerLimit.value,
}))

async function doReassign(userIds?: number[]) {
  if (!track.value) return
  reassigning.value = true
  try {
    const updated = await trackApi.reassignReviewer(track.value.id, userIds && userIds.length ? userIds : undefined)
    track.value = updated
    showReassignModal.value = false
    reassignSelectedUserIds.value = []
    try {
      reviewAssignments.value = await trackApi.listAssignments(track.value.id)
    } catch {
      reviewAssignments.value = []
    }
    if (updated.peer_reviewer_id !== null) {
      toastSuccess(t('trackDetail.reassignDone'))
    } else {
      toastError(t('trackDetail.reassignNoPool'))
    }
  } finally {
    reassigning.value = false
  }
}

const primaryActions = computed(() => {
  if (!track.value?.allowed_actions?.length) return []
  if (!track.value.workflow_step) return []
  return [{
    key: 'open-step',
    label: customWorkflowActionLabel.value,
    handler: () => openPrimaryAction('open-step'),
  }]
})

watch(() => primaryActions.value.length, async () => {
  await nextTick()
  updateMobileCtaHeight()
  observeMobileCtaBar()
})

// Reopen logic
const isMasteringEngineer = computed(() => track.value?.mastering_engineer_id === appStore.currentUser?.id)
const isSubmitter = computed(() => track.value?.submitter_id === appStore.currentUser?.id)
const canDirectReopen = computed(() => track.value?.status === 'completed' && (isProducer.value || isMasteringEngineer.value))
const canRequestReopen = computed(() => track.value?.status === 'completed' && isSubmitter.value && !isProducer.value && !isMasteringEngineer.value)
const showReopenModal = ref(false)
const reopenTargetStage = ref('')
const reopenReason = ref('')
const reopening = ref(false)

const reopenableStages = computed<WorkflowStepDef[]>(() => {
  if (!workflowConfig.value) return []
  const stages = workflowConfig.value.steps.filter(s => s.type === 'delivery' || s.type === 'revision')
  const priority: Record<string, number> = {
    mastering: 0,
    mastering_revision: 1,
  }
  return stages.slice().sort((a, b) => {
    const aPriority = priority[a.id] ?? 10
    const bPriority = priority[b.id] ?? 10
    if (aPriority !== bPriority) return aPriority - bPriority
    return a.order - b.order
  })
})

function reopenStageOptionLabel(step: WorkflowStepDef): string {
  const base = translateStepLabel(step, t)
  if (step.id === 'mastering') return t('trackDetail.reopenTargets.mastering', { stage: base })
  if (step.id === 'mastering_revision') return t('trackDetail.reopenTargets.mastering_revision', { stage: base })
  return base
}

async function handleReopen() {
  if (!track.value || !reopenTargetStage.value) return
  reopening.value = true
  try {
    if (canDirectReopen.value) {
      await trackApi.reopen(track.value.id, reopenTargetStage.value)
    } else {
      await trackApi.requestReopen(track.value.id, reopenTargetStage.value, reopenReason.value)
    }
    showReopenModal.value = false
    reopenTargetStage.value = ''
    reopenReason.value = ''
    await loadTrack()
  } finally {
    reopening.value = false
  }
}

watch([track, olderVersions, () => route.query.compareVersion], ([currentTrack, versions, compareVersion]) => {
  if (!currentTrack) return
  const rawValue = Array.isArray(compareVersion) ? compareVersion[0] : compareVersion
  if (!rawValue) return
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return
  if (versions.some(version => version.id === parsed)) {
    showVersionCompare.value = true
    selectedCompareVersionId.value = parsed
  }
})

watch(olderMasterDeliveries, (deliveries) => {
  if (deliveries.length > 0) return
  showMasterCompare.value = false
  selectedCompareMasterDeliveryId.value = null
})

watch(selectedCompareMasterDelivery, (delivery) => {
  if (!delivery) selectedCompareMasterDeliveryId.value = null
})
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>
  <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
    <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
    <button @click="loadTrack" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
  </div>
  <div v-else-if="track" class="max-w-7xl mx-auto">
    <div class="space-y-6">
      <!-- WebSocket disconnect banner -->
      <div
        v-if="wsHadConnection && !wsConnected"
        class="flex items-center gap-2 px-4 py-2.5 bg-warning-bg border border-warning/30 text-warning text-sm font-mono"
      >
        <span class="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0"></span>
        {{ t('trackDetail.liveDisconnected') }}
      </div>
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge
              :status="track.status"
              type="track"
              :variant="track.workflow_variant"
              :label="track.workflow_step?.label ?? null"
            />
            <span v-if="track.rejection_mode" class="text-xs text-muted-foreground">
              {{ t('trackDetail.rejectionMode', { mode: track.rejection_mode }) }}
            </span>
            <!-- Live indicator -->
            <span
              v-if="wsConnected"
              class="inline-flex items-center gap-1.5 text-xs text-success font-mono"
              :title="t('trackDetail.liveConnected')"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              {{ t('trackDetail.live') }}
            </span>
          </div>

          <!-- Editing metadata inline -->
          <template v-if="editingMetadata">
            <div class="card space-y-3">
              <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.editMetadataTitle') }}</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('upload.trackTitle') }}</label>
                  <input v-model="metadataForm.title" class="input-field w-full" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('upload.artist') }}</label>
                  <input v-model="metadataForm.artist" class="input-field w-full" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('upload.bpm') }}</label>
                  <input v-model="metadataForm.bpm" type="text" class="input-field w-full" :placeholder="t('upload.bpmPlaceholder')" />
                </div>
                <div></div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('upload.originalTitle') }}</label>
                  <input v-model="metadataForm.original_title" type="text" class="input-field w-full" :placeholder="t('upload.originalTitlePlaceholder')" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('upload.originalArtist') }}</label>
                  <input v-model="metadataForm.original_artist" type="text" class="input-field w-full" :placeholder="t('upload.originalArtistPlaceholder')" />
                </div>
              </div>
              <div class="flex gap-2">
                <button @click="saveMetadata" :disabled="savingMetadata || !metadataForm.title || !metadataForm.artist" class="btn-primary text-sm disabled:opacity-50">
                  <span class="flex items-center gap-1.5">
                    <Check class="w-4 h-4" :stroke-width="2" />
                    {{ savingMetadata ? t('common.loading') : t('common.save') }}
                  </span>
                </button>
                <button @click="editingMetadata = false" class="btn-secondary text-sm">{{ t('common.cancel') }}</button>
              </div>
            </div>
          </template>

          <!-- Normal display -->
          <template v-else>
            <div class="flex items-start gap-2">
              <div class="min-w-0">
                <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">
                  <span v-if="track.track_number" class="text-muted-foreground font-mono">#{{ track.track_number }}</span>
                  {{ track.title }}
                </h1>
                <p class="text-sm sm:text-base text-muted-foreground">
                  <span :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span> · source v{{ track.version }} · cycle {{ track.workflow_cycle }}
                </p>
                <div v-if="track.bpm || track.original_title || track.original_artist" class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <span v-if="track.bpm" class="font-mono">BPM {{ track.bpm }}</span>
                  <span v-if="track.original_title">{{ t('upload.originalTitle') }}: {{ track.original_title }}</span>
                  <span v-if="track.original_artist">{{ t('upload.originalArtist') }}: {{ track.original_artist }}</span>
                </div>
              </div>
              <button
                v-if="canEditMetadata"
                @click="startEditMetadata"
                class="shrink-0 mt-1 p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                :title="t('trackDetail.editMetadata')"
              >
                <Pencil class="w-4 h-4" :stroke-width="2" />
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="card">
        <h3 class="text-sm font-medium text-muted-foreground mb-3">{{ t('trackDetail.workflowStatus') }}</h3>
        <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" :variant="track.workflow_variant" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div class="lg:col-span-2 space-y-6">
          <div v-if="audioUrl">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium text-muted-foreground">{{ t('trackDetail.currentSourceAudio') }}</h3>
              <div class="flex items-center gap-2">
                <button
                  v-if="sourceVersions.length > 1"
                  @click="showVersionCompare = !showVersionCompare"
                  class="text-xs btn-secondary px-3 py-1">
                  {{ t('compare.title') }}
                </button>
                <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
                  {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
                </button>
              </div>
            </div>
            <!-- 版本选择器 -->
            <div v-if="showVersionCompare && olderVersions.length > 0" class="flex items-center gap-2 mb-3">
              <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
              <CustomSelect v-model="selectedCompareVersionId" :options="versionOptions" :placeholder="`-- ${t('compare.selectVersion')} --`" size="sm" />
              <button v-if="selectedCompareVersionId" @click="selectedCompareVersionId = null" class="text-xs text-muted-foreground hover:text-foreground">
                {{ t('compare.clear') }}
              </button>
            </div>
            <WaveformPlayer
              :audio-url="audioUrl"
              :issues="currentWaveformIssues"
              :track-id="trackId"
              :compare-version-id="selectedCompareVersionId"
              @regionClick="onIssueSelect"
            />
          </div>
          <div v-else class="card text-center text-muted-foreground py-8">
            {{ t('trackDetail.noAudioFile') }}
          </div>

          <!-- Master audio player -->
          <div v-if="masterAudioUrl">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                {{ t('trackDetail.masterAudio') }}
                <span v-if="track.current_master_delivery" class="text-xs text-muted-foreground ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
              </h3>
              <button
                v-if="olderMasterDeliveries.length > 0"
                @click="toggleMasterCompare"
                class="text-xs btn-secondary px-3 py-1"
              >
                {{ t('compare.title') }}
              </button>
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
              :audio-url="masterAudioUrl"
              :issues="[]"
              :track-id="trackId"
              playback-scope="master"
              :compare-audio-url="selectedCompareMasterAudioUrl"
            />
          </div>

          <div id="issues">
            <h3 class="text-sm font-sans font-semibold text-foreground mb-3">
              {{ t('trackDetail.issuesHeading', { count: currentCycleIssues.length }) }}
            </h3>
            <IssueMarkerList :issues="currentCycleIssues" :current-source-version-number="track.version" @select="onIssueSelect" />
          </div>

          <!-- Discussions -->
          <div
            class="card space-y-4"
            :class="discussions.length > 0 ? 'lg:flex-1 lg:flex lg:flex-col' : ''"
          >
            <h3 class="text-sm font-sans font-semibold text-foreground">
              {{ t('trackDetail.discussionsHeading', { count: discussions.length }) }}
            </h3>
            <div v-if="discussions.length === 0" class="text-sm text-muted-foreground">
              {{ t('trackDetail.noDiscussions') }}
            </div>
            <div v-else class="space-y-3 lg:flex-1">
              <div v-for="d in discussions" :key="d.id" class="flex gap-3 py-3 border-b border-border last:border-0">
                <div
                  class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  :style="{ backgroundColor: d.author?.avatar_color || '#6366f1' }"
                >
                  {{ d.author?.display_name?.charAt(0) || '?' }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-foreground">{{ d.author?.display_name || '?' }}</span>
                    <span class="text-xs text-muted-foreground">{{ fmtDate(d.created_at) }}</span>
                    <button
                      v-if="d.edited_at"
                      class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      @click="showDiscussionHistory(d.id)"
                    >
                      ({{ t('editHistory.edited') }})
                    </button>
                    <template v-if="d.author_id === appStore.currentUser?.id">
                      <button @click="startEditDiscussion(d)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                        <Pencil class="w-3.5 h-3.5" :stroke-width="2" />
                      </button>
                      <button @click="deleteDiscussion(d)" class="text-muted-foreground hover:text-error transition-colors">
                        <Trash2 class="w-3.5 h-3.5" :stroke-width="2" />
                      </button>
                    </template>
                  </div>
                  <template v-if="editingDiscussionId === d.id">
                    <textarea
                      v-model="editingDiscussionContent"
                      class="textarea-field w-full text-sm mt-1"
                      rows="3"
                      @keydown.ctrl.enter="saveEditDiscussion(d)"
                      @keydown.meta.enter="saveEditDiscussion(d)"
                    />
                    <div class="flex gap-2 mt-1">
                      <button @click="saveEditDiscussion(d)" class="btn-primary text-xs">{{ t('common.save') }}</button>
                      <button @click="editingDiscussionId = null" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
                    </div>
                  </template>
                  <template v-else>
                    <p class="text-sm text-foreground mt-1 whitespace-pre-wrap">{{ d.content }}</p>
                  </template>
                  <div v-if="d.images?.length" class="flex gap-2 mt-2">
                    <img
                      v-for="img in d.images"
                      :key="img.id"
                      :src="resolveAssetUrl(img.image_url)"
                      class="h-20 rounded border border-border object-cover cursor-pointer"
                      @click="openImage(img.image_url)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <CommentInput
              ref="discussionInputRef"
              :placeholder="t('trackDetail.discussionPlaceholder')"
              :submit-label="t('trackDetail.postDiscussion')"
              :submitting="postingDiscussion"
              :upload-progress="postingDiscussionProgress"
              :enable-audio="false"
              @submit="handleDiscussionSubmit"
            />
          </div>
        </div>

        <div class="space-y-4 lg:sticky lg:top-0 self-start">
        <!-- Workflow action CTA -->
        <div v-if="primaryActions.length" class="hidden lg:block border border-primary/40 bg-card rounded-none p-4 space-y-3">
          <button
            v-for="action in primaryActions"
            :key="action.key"
            @click="action.handler()"
            class="workflow-cta-btn group w-full flex items-center justify-between gap-2 rounded-full font-mono font-semibold px-5 h-11 text-sm transition-all
                   bg-primary hover:bg-primary-hover text-black
                   shadow-[0_0_16px_rgba(255,132,0,0.25)] hover:shadow-[0_0_24px_rgba(255,132,0,0.45)]"
          >
            {{ action.label }}
            <ChevronRight class="w-5 h-5 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
          </button>
        </div>

        <div class="card space-y-2 text-sm">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.trackSummary') }}</h3>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
            <span class="text-foreground" :class="{ 'font-mono': !track.submitter && track.submitter_id }">{{ track.submitter?.display_name ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span>
          </div>
          <!-- Multi-reviewer progress -->
          <template v-if="hasMultipleReviewers">
            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">{{ t('trackDetail.reviewers') }}</span>
                <span class="text-xs font-mono" :class="completedReviewCount === totalReviewCount ? 'text-success' : 'text-muted-foreground'">
                  {{ completedReviewCount }}/{{ totalReviewCount }}
                </span>
              </div>
              <div class="space-y-1">
                <div
                  v-for="assignment in currentStepAssignments"
                  :key="assignment.id"
                  class="flex items-center justify-between gap-2 text-xs"
                >
                  <span class="truncate" :class="shouldAnonymizePeer ? 'font-mono text-foreground' : 'text-foreground'">
                    {{ shouldAnonymizePeer ? `#${hashId(assignment.user_id)}` : (assignment.user?.display_name ?? `#${hashId(assignment.user_id)}`) }}
                  </span>
                  <span
                    class="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono"
                    :class="assignment.status === 'completed' ? 'bg-success-bg text-success' : 'bg-border text-muted-foreground'"
                  >
                    {{ assignment.status === 'completed' ? t('trackDetail.reviewDone') : t('trackDetail.reviewPending') }}
                  </span>
                </div>
              </div>
              <button
                v-if="canReassignReviewer"
                @click="openReassignModal"
                :disabled="reassigning"
                class="flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50 font-mono mt-1"
              >
                <UserRoundCog class="w-3.5 h-3.5" />
                {{ t('trackDetail.reassignReviewer') }}
              </button>
            </div>
          </template>
          <!-- Single reviewer fallback -->
          <div v-else class="flex justify-between items-center gap-2">
            <span class="text-muted-foreground shrink-0">{{ t('trackDetail.peerReviewer') }}</span>
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-foreground truncate" :class="{ 'font-mono': shouldAnonymizePeer }">{{ track.peer_reviewer ? (shouldAnonymizePeer ? `#${hashId(track.peer_reviewer.id)}` : track.peer_reviewer.display_name) : '--' }}</span>
              <button
                v-if="canReassignReviewer"
                @click="openReassignModal"
                :disabled="reassigning"
                class="shrink-0 flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50 font-mono"
              >
                <UserRoundCog class="w-3.5 h-3.5" />
                {{ t('trackDetail.reassignReviewer') }}
              </button>
            </div>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.openIssues') }}</span>
            <span class="text-foreground">{{ track.open_issue_count || 0 }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.currentMaster') }}</span>
            <span class="text-foreground">
              <span v-if="track.current_master_delivery">v{{ track.current_master_delivery.delivery_number }}</span>
              <span v-else>--</span>
            </span>
          </div>
          <div v-if="track.current_master_delivery" class="pt-2 border-t border-border">
            <div class="text-xs text-muted-foreground">{{ t('trackDetail.finalApprovals') }}</div>
            <div class="flex items-center justify-between mt-1">
              <span>{{ t('trackDetail.producer') }}</span>
              <span class="text-xs" :class="track.current_master_delivery.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
                {{ track.current_master_delivery.producer_approved_at ? t('common.approved') : t('common.pending') }}
              </span>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span>{{ t('trackDetail.submitter') }}</span>
              <span class="text-xs" :class="track.current_master_delivery.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
                {{ track.current_master_delivery.submitter_approved_at ? t('common.approved') : t('common.pending') }}
              </span>
            </div>
          </div>
        </div>

        <div class="card space-y-3 lg:flex-1 lg:flex lg:flex-col">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.timeline') }}</h3>
            <button
              v-if="filteredEvents.length > TIMELINE_PREVIEW_COUNT"
              @click="timelineExpanded = !timelineExpanded"
              class="text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
            >
              {{ timelineExpanded ? t('trackDetail.timelineCollapse') : t('trackDetail.timelineExpand', { count: filteredEvents.length }) }}
            </button>
          </div>
          <!-- Filter chips -->
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="f in (['all', 'transitions', 'issues', 'uploads'] as const)"
              :key="f"
              @click="timelineFilter = f; timelineExpanded = false"
              class="px-2.5 py-1 rounded-full text-xs font-mono transition-colors"
              :class="timelineFilter === f ? 'bg-primary text-background' : 'bg-border text-muted-foreground hover:text-foreground'"
            >
              {{ t(`trackDetail.timelineFilter.${f}`) }}
            </button>
          </div>
          <div v-if="filteredEvents.length === 0" class="text-sm text-muted-foreground">{{ t('trackDetail.noEvents') }}</div>
          <div v-else class="space-y-0 -mx-1 px-1 lg:flex-1" :class="!timelineExpanded && filteredEvents.length > TIMELINE_PREVIEW_COUNT ? 'max-h-72 overflow-hidden' : 'overflow-y-auto max-h-[32rem] lg:max-h-none'">
            <div
              v-for="event in (timelineExpanded ? filteredEvents : filteredEvents.slice(0, TIMELINE_PREVIEW_COUNT))"
              :key="event.id"
              class="flex gap-2.5 border-b border-border last:border-0 py-3 first:pt-0"
            >
              <span class="mt-1.5 flex-shrink-0 h-2 w-2 rounded-full" :class="timelineDotColor(event)"></span>
              <div class="min-w-0 flex-1">
                <div class="text-sm text-foreground">{{ formatTimelineEvent(event) }}</div>
                <div v-if="transitionLabel(event)" class="text-xs font-mono text-muted-foreground mt-0.5">
                  {{ transitionLabel(event) }}
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">{{ fmtDate(event.created_at) }}</div>
              </div>
            </div>
            <!-- Fade overlay when collapsed and there are more events -->
            <div
              v-if="!timelineExpanded && filteredEvents.length > TIMELINE_PREVIEW_COUNT"
              class="h-8 bg-gradient-to-t from-card to-transparent -mt-8 pointer-events-none"
            ></div>
          </div>
        </div>

        <!-- Reopen (completed tracks) -->
        <div v-if="canDirectReopen || canRequestReopen" class="pt-2">
          <button
            v-if="!showReopenModal"
            @click="showReopenModal = true"
            class="w-full flex items-center justify-center gap-2 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors h-10 text-sm font-mono"
          >
            {{ canDirectReopen ? t('trackDetail.reopen') : t('trackDetail.requestReopen') }}
          </button>
          <div v-else class="card space-y-3">
            <p class="text-sm text-muted-foreground">
              {{ canDirectReopen ? t('trackDetail.reopenDesc') : t('trackDetail.requestReopenDesc') }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ t('trackDetail.reopenMasteringHint') }}
            </p>
            <div class="space-y-2">
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('trackDetail.reopenTarget') }}</label>
              <select v-model="reopenTargetStage" class="select-field w-full">
                <option value="" disabled>{{ t('trackDetail.selectStage') }}</option>
                <option v-for="s in reopenableStages" :key="s.id" :value="s.id">{{ reopenStageOptionLabel(s) }}</option>
              </select>
            </div>
            <div v-if="canRequestReopen" class="space-y-2">
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('trackDetail.reopenReason') }}</label>
              <textarea v-model="reopenReason" class="textarea-field w-full text-sm h-20" :placeholder="t('trackDetail.reopenReasonPlaceholder')" />
            </div>
            <div class="flex gap-2">
              <button
                @click="handleReopen"
                :disabled="reopening || !reopenTargetStage || (canRequestReopen && !reopenReason.trim())"
                class="flex-1 btn-primary h-9 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ reopening ? t('common.loading') : t('common.confirm') }}
              </button>
              <button @click="showReopenModal = false" class="flex-1 btn-secondary h-9 text-sm">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Reassign reviewer modal (manual mode) -->
        <div v-if="showReassignModal" class="card space-y-3">
          <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.reassignReviewerTitle') }}</h4>
          <p class="text-xs text-muted-foreground">{{ t('trackDetail.reassignReviewerManual') }}</p>
          <p class="text-xs text-muted-foreground">{{ reassignSelectionSummary }}</p>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <label
              v-for="m in reassignMembers"
              :key="m.user_id"
              class="flex items-center gap-2 px-3 py-2 border border-border rounded-none cursor-pointer hover:bg-background/60 transition-colors"
              :class="[
                reassignSelectedUserIds.includes(m.user_id) ? 'border-primary bg-background' : '',
                isReassignMemberSelectionDisabled(m.user_id) ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : '',
              ]"
            >
              <input
                type="checkbox"
                class="checkbox"
                :checked="reassignSelectedUserIds.includes(m.user_id)"
                :disabled="isReassignMemberSelectionDisabled(m.user_id)"
                @change="toggleReassignMember(m.user_id)"
              />
              <span class="text-sm text-foreground">{{ m.user.display_name }}</span>
            </label>
          </div>
          <div class="flex gap-2">
            <button
              @click="doReassign(reassignSelectedUserIds)"
              :disabled="reassigning || reassignSelectedUserIds.length === 0"
              class="flex-1 btn-primary h-9 text-sm disabled:opacity-50"
            >
              {{ reassigning ? t('trackDetail.reassigning') : t('common.confirm') }}
            </button>
            <button @click="showReassignModal = false" class="flex-1 btn-secondary h-9 text-sm">
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>

        <!-- Visibility toggle (producer only, non-archived) -->
        <div v-if="isProducer && !track.archived_at" class="pt-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('trackDetail.visibility') }}</span>
            <button
              @click="toggleVisibility"
              :disabled="togglingVisibility"
              class="text-xs font-mono transition-colors disabled:opacity-50"
              :class="track.is_public ? 'text-success hover:text-success/70' : 'text-muted-foreground hover:text-foreground'"
            >
              {{ track.is_public ? t('trackDetail.visibilityPublic') : t('trackDetail.visibilityPrivate') }}
            </button>
          </div>
        </div>

        <!-- Archive (producer only) -->
        <div v-if="isProducer && !track.archived_at" class="pt-2">
          <button
            v-if="!showArchiveConfirm"
            @click="showArchiveConfirm = true"
            class="w-full flex items-center justify-center gap-2 rounded-full border border-border text-muted-foreground hover:text-error hover:border-error/40 transition-colors h-10 text-sm font-mono"
          >
            <Archive class="w-4 h-4" />
            {{ t('trackDetail.archive') }}
          </button>
          <div v-else class="card space-y-3">
            <p class="text-sm text-muted-foreground">{{ t('trackDetail.archiveConfirm') }}</p>
            <div class="flex gap-2">
              <button @click="archiveTrack" :disabled="archiving" class="flex-1 rounded-full bg-error hover:bg-error/80 text-white h-9 text-sm font-mono transition-colors disabled:opacity-50">
                {{ t('common.confirm') }}
              </button>
              <button @click="showArchiveConfirm = false" class="flex-1 btn-secondary h-9 text-sm">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

    <!-- Mobile fixed CTA -->
    <div v-if="primaryActions.length" class="fixed-bottom-bar-spacer lg:hidden" :style="mobileCtaSpacerStyle" aria-hidden="true"></div>

    <div v-if="primaryActions.length" ref="mobileCtaBarRef" class="fixed-bottom-bar lg:hidden">
      <div class="fixed-bottom-bar__surface flex items-center justify-end gap-2">
        <button
          v-for="action in primaryActions"
          :key="'m-' + action.key"
          @click="action.handler()"
          class="workflow-cta-btn group flex items-center gap-2 rounded-full font-mono font-semibold px-5 h-10 text-sm leading-none transition-all
                 bg-primary hover:bg-primary-hover text-black
                 shadow-[0_0_16px_rgba(255,132,0,0.25)] hover:shadow-[0_0_24px_rgba(255,132,0,0.45)]"
        >
          {{ action.label }}
          <ChevronRight class="w-4 h-4 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
        </button>
      </div>
    </div>
  </div>

  <EditHistoryModal
    v-if="showHistoryForDiscussionId !== null"
    :items="discussionHistoryItems"
    @close="closeDiscussionHistory"
  />
</template>

<style scoped>
.workflow-cta-btn {
  animation: cta-glow 3s ease-in-out infinite;
}
@keyframes cta-glow {
  0%, 100% { box-shadow: 0 0 16px rgba(255, 132, 0, 0.2); }
  50% { box-shadow: 0 0 28px rgba(255, 132, 0, 0.4); }
}
</style>
