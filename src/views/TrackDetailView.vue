<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue, WorkflowEvent, TrackSourceVersion, WorkflowConfig, WorkflowStepDef, AlbumMember, StageAssignment } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { hashId } from '@/utils/hash'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import DiscussionPanel from '@/components/common/DiscussionPanel.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import { Archive, Check, ChevronRight, UserRoundCog, Pencil } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useDiscussions } from '@/composables/useDiscussions'
import { useToast } from '@/composables/useToast'
import { buildTrackWorkspaceRoute, translateStepLabel } from '@/utils/workflow'
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

function inferTrackWorkflowVariant(trackData: Track | null): 'generic' | 'mastering' | 'final_review' {
  const step = trackData?.workflow_step
  if (!step) return 'generic'
  if (step.ui_variant === 'mastering' || step.ui_variant === 'final_review') return step.ui_variant
  if (step.id === 'mastering' || step.id === 'mastering_revision') return 'mastering'
  if (step.id === 'final_review') return 'final_review'
  return 'generic'
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
const events = ref<WorkflowEvent[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
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
const generalDiscussion = useDiscussions(trackId)
const chatSidebarRef = ref<InstanceType<typeof MasteringChatSidebar> | null>(null)
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)

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
}, {
  onDiscussionEvent: (event, discussionId) => {
    chatSidebarRef.value?.handleDiscussionEvent(event, discussionId)
  },
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

async function loadTrack() {
  if (!track.value) loading.value = true
  loadError.value = false
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    trackStore.setCurrentTrack(detail.track)
    issues.value = detail.issues
    const allDiscussions = detail.discussions ?? []
    generalDiscussion.discussions.value = allDiscussions.filter(d => d.phase !== 'mastering')
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
    workflowConfig.value = detail.workflow_config ?? null
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
const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

const masterAudioUrl = computed(() => {
  const d = track.value?.current_master_delivery
  if (!d) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-audio?v=${d.delivery_number}&c=${d.workflow_cycle ?? 1}`
})
const { downloading: masterDownloading, downloadProgress: masterDownloadProgress, downloadTrackAudio: downloadMasterAudio } = useAudioDownload()
const handleMasterDownload = () => downloadMasterAudio(masterAudioUrl, track, '_master')

const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))
const currentWaveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return currentCycleIssues.value
  return currentCycleIssues.value.filter(issue => issue.phase !== 'final_review' && (issue.source_version_number == null || issue.source_version_number === currentVersion))
})
const masterWaveformIssues = computed(() => {
  const deliveryId = track.value?.current_master_delivery?.id
  if (!deliveryId) return []
  return currentCycleIssues.value.filter(issue => issue.phase === 'final_review' && issue.master_delivery_id === deliveryId)
})
const currentIssueList = computed(() => {
  const deliveryId = track.value?.current_master_delivery?.id
  return currentCycleIssues.value.filter(issue => {
    if (issue.phase === 'final_review') return deliveryId != null && issue.master_delivery_id === deliveryId
    return true
  })
})

// Multi-reviewer: filter assignments to current review step
const currentStepAssignments = computed(() => {
  const step = track.value?.workflow_step
  if (!step || step.type !== 'review') return []
  return reviewAssignments.value.filter(a => a.stage_id === step.id && a.status !== 'cancelled')
})

const hasMultipleReviewers = computed(() => currentStepAssignments.value.length > 0)
const completedReviewCount = computed(() => currentStepAssignments.value.filter(a => a.status === 'completed').length)
const totalReviewCount = computed(() => {
  const step = track.value?.workflow_step
  if (step?.required_reviewer_count != null && step.required_reviewer_count > 0) {
    return step.required_reviewer_count
  }
  return currentStepAssignments.value.length
})

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

function openIssueReference(issueId: number) {
  const localIssue = issues.value.find(issue => issue.id === issueId)
  if (localIssue) {
    onIssueSelect(localIssue)
    return
  }

  router.push({
    path: `/issues/${issueId}`,
    query: route.query.returnTo ? { returnTo: String(route.query.returnTo) } : undefined,
  })
}

function openPrimaryAction(_action: string) {
  if (!track.value) return
  router.push(buildTrackWorkspaceRoute(track.value, {
    returnTo: typeof route.query.returnTo === 'string' ? route.query.returnTo : null,
  }))
}

function openMasteringWorkspace() {
  router.push({
    path: `/tracks/${trackId.value}/mastering`,
    query: { returnTo: route.fullPath },
  })
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

const currentVersionRevisionNotes = computed(() => {
  const cv = track.value?.current_source_version
  if (!cv) return null
  const sv = sourceVersions.value.find(v => v.id === cv.id)
  return sv?.revision_notes ?? cv.revision_notes ?? null
})

const selectedCompareVersionNotes = computed(() => {
  if (!selectedCompareVersionId.value) return null
  const sv = sourceVersions.value.find(v => v.id === selectedCompareVersionId.value)
  return sv?.revision_notes ?? null
})

const isProducer = computed(() => track.value?.producer_id === appStore.currentUser?.id)
const canSeeMastering = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId || !track.value) return false
  return userId === track.value.submitter_id
    || userId === track.value.producer_id
    || userId === track.value.mastering_engineer_id
})
const hasMasteringHistory = computed(() => Boolean(track.value?.current_master_delivery))
const isActiveMasteringFlow = computed(() => {
  if (!track.value) return false
  const workflowVariant = inferTrackWorkflowVariant(track.value)
  if (workflowVariant === 'mastering' || workflowVariant === 'final_review') return true
  return ['mastering', 'mastering_revision', 'final_review'].includes(track.value.status)
})
const canOpenMastering = computed(() => (
  canSeeMastering.value && (isActiveMasteringFlow.value || hasMasteringHistory.value)
))
const masteringEntryLabel = computed(() => (
  isActiveMasteringFlow.value
    ? t('trackDetail.goToMastering')
    : t('trackDetail.viewMasteringHistory')
))
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
  } catch {
    toastError(t('trackDetail.metadataSaveFailed'))
  } finally {
    savingMetadata.value = false
  }
}

// ── Edit author notes / mastering notes ──────────────────────────────────
const editingAuthorNotes = ref(false)
const authorNotesForm = ref('')
const savingAuthorNotes = ref(false)

function startEditAuthorNotes() {
  authorNotesForm.value = track.value?.author_notes ?? ''
  editingAuthorNotes.value = true
}

async function saveAuthorNotes() {
  if (!track.value) return
  savingAuthorNotes.value = true
  try {
    const updated = await trackApi.updateAuthorNotes(track.value.id, authorNotesForm.value.trim() || null)
    track.value = { ...track.value, author_notes: updated.author_notes }
    editingAuthorNotes.value = false
    toastSuccess(t('trackDetail.notesSaved'))
  } catch {
    toastError(t('common.error'))
  } finally {
    savingAuthorNotes.value = false
  }
}

async function toggleVisibility() {
  if (!track.value) return
  togglingVisibility.value = true
  try {
    const updated = await trackApi.setVisibility(track.value.id, !track.value.is_public)
    track.value = { ...track.value, is_public: updated.is_public }
    toastSuccess(t(updated.is_public ? 'trackDetail.visibilitySetPublic' : 'trackDetail.visibilitySetPrivate'))
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
  // Pre-select reviewers who are currently still pending on this step so the
  // producer does not accidentally drop a reviewer who is mid-review when
  // they only intend to adjust part of the roster.
  const stageId = track.value?.workflow_step?.id
  reassignSelectedUserIds.value = stageId
    ? reviewAssignments.value
        .filter(a => a.stage_id === stageId && a.status === 'pending')
        .map(a => a.user_id)
        .slice(0, reassignReviewerLimit.value)
    : []
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
const reopenMasteringNotes = ref('')
const reopening = ref(false)
const reopenResets = ref<string[]>([])
const loadingResets = ref(false)

const reopenTargetIsMastering = computed(() => {
  const id = reopenTargetStage.value
  return id.includes('mastering') || id.includes('master')
})

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

function reopenResetLabel(reset: string): string {
  if (reset.startsWith('stage_assignments:')) {
    const stages = reset.slice('stage_assignments:'.length)
    return t('trackDetail.reopenResets.stageAssignments', { stages })
  }
  const key = `trackDetail.reopenResets.${reset}`
  return t(key)
}

watch(reopenTargetStage, async (stageId) => {
  reopenResets.value = []
  if (!stageId || !track.value) return
  loadingResets.value = true
  try {
    const res = await trackApi.previewReopen(track.value.id, stageId)
    reopenResets.value = res.resets
  } catch {
    reopenResets.value = []
  } finally {
    loadingResets.value = false
  }
})

async function handleReopen() {
  if (!track.value || !reopenTargetStage.value) return
  reopening.value = true
  try {
    if (canDirectReopen.value) {
      await trackApi.reopen(track.value.id, reopenTargetStage.value)
      toastSuccess(t('trackDetail.reopenDone'))
    } else {
      await trackApi.requestReopen(track.value.id, reopenTargetStage.value, reopenReason.value, reopenMasteringNotes.value.trim() || undefined)
      toastSuccess(t('trackDetail.reopenRequested'))
    }
    showReopenModal.value = false
    reopenTargetStage.value = ''
    reopenReason.value = ''
    reopenMasteringNotes.value = ''
    reopenResets.value = []
    await loadTrack()
  } catch (e: any) {
    toastError(e?.message || t('trackDetail.reopenFailed'))
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
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">
                  <span v-if="track.track_number" class="text-muted-foreground font-mono">#{{ track.track_number }}</span>
                  {{ track.title }}
                </h1>
                <button
                  v-if="canEditMetadata"
                  @click="startEditMetadata"
                  class="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  :title="t('trackDetail.editMetadata')"
                >
                  <Pencil class="w-4 h-4" :stroke-width="2" />
                </button>
              </div>
              <p class="text-sm sm:text-base text-muted-foreground">
                <span :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span> · source v{{ track.version }}
              </p>
              <div v-if="track.bpm || track.original_title || track.original_artist" class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                <span v-if="track.bpm" class="font-mono">BPM {{ track.bpm }}</span>
                <span v-if="track.original_title">{{ t('upload.originalTitle') }}: {{ track.original_title }}</span>
                <span v-if="track.original_artist">{{ t('upload.originalArtist') }}: {{ track.original_artist }}</span>
              </div>
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
            <div v-if="currentVersionRevisionNotes" class="mt-2 px-3 py-2 border border-border rounded-none bg-card">
              <p class="text-xs font-mono text-muted-foreground mb-0.5">{{ t('trackDetail.revisionNotesLabel', { version: track.version }) }}</p>
              <p class="text-sm text-foreground whitespace-pre-wrap">{{ currentVersionRevisionNotes }}</p>
            </div>
            <div v-if="selectedCompareVersionNotes" class="mt-2 px-3 py-2 border border-border rounded-none bg-card">
              <p class="text-xs font-mono text-muted-foreground mb-0.5">{{ t('trackDetail.revisionNotesLabel', { version: sourceVersions.find(v => v.id === selectedCompareVersionId)?.version_number }) }}</p>
              <p class="text-sm text-foreground whitespace-pre-wrap">{{ selectedCompareVersionNotes }}</p>
            </div>
          </div>
          <div v-else class="card text-center text-muted-foreground py-8">
            {{ t('trackDetail.noAudioFile') }}
          </div>

          <!-- Master delivery audio (read-only preview) -->
          <div v-if="masterAudioUrl && canSeeMastering">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                {{ t('trackDetail.masterAudio') }}
                <span v-if="track.current_master_delivery" class="text-xs ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
              </h3>
              <button @click="handleMasterDownload" :disabled="masterDownloading" class="btn-secondary text-xs px-3 py-1">
                {{ masterDownloading ? `${masterDownloadProgress}%` : t('common.downloadAudio') }}
              </button>
            </div>
            <WaveformPlayer :audio-url="masterAudioUrl" :issues="masterWaveformIssues" :track-id="trackId" playback-scope="master" @regionClick="onIssueSelect" />
          </div>

          <div id="issues">
            <h3 class="text-sm font-sans font-semibold text-foreground mb-3">
              {{ t('trackDetail.issuesHeading', { count: currentIssueList.length }) }}
            </h3>
            <IssueMarkerList :issues="currentIssueList" :current-source-version-number="track.version" @select="onIssueSelect" />
          </div>

          <!-- General Discussions -->
          <DiscussionPanel
            :discussions="generalDiscussion.discussions.value"
            :issues="issues"
            :heading="t('trackDetail.discussionsHeading', { count: generalDiscussion.discussions.value.length })"
            :empty-text="t('trackDetail.noDiscussions')"
            :placeholder="t('trackDetail.discussionPlaceholder')"
            :submit-label="t('trackDetail.postDiscussion')"
            :posting="generalDiscussion.posting.value"
            :posting-progress="generalDiscussion.postingProgress.value"
            :editing-id="generalDiscussion.editingId.value"
            :editing-content="generalDiscussion.editingContent.value"
            :history-items="generalDiscussion.historyItems.value"
            :show-history-for-id="generalDiscussion.showHistoryForId.value"
            :loading="generalDiscussion.loading.value"
            :load-error="generalDiscussion.loadError.value"
            @submit="generalDiscussion.submit"
            @start-edit="generalDiscussion.startEdit"
            @save-edit="generalDiscussion.saveEdit"
            @cancel-edit="generalDiscussion.cancelEdit"
            @remove="generalDiscussion.remove"
            @show-history="generalDiscussion.showHistory"
            @close-history="generalDiscussion.closeHistory"
            @open-image="generalDiscussion.openImage"
            @open-issue="openIssueReference"
            @retry="generalDiscussion.load"
            @update:editing-content="generalDiscussion.editingContent.value = $event"
          />
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
          <div v-if="canOpenMastering" class="pt-2 border-t border-border">
            <button
              type="button"
              class="w-full flex items-center justify-center gap-2 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors h-9 text-sm font-mono"
              @click="openMasteringWorkspace"
            >
              {{ masteringEntryLabel }}
              <ChevronRight class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </div>

        <!-- Author Notes -->
        <div v-if="track.author_notes || isSubmitter" class="card space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.authorNotes') }}</h3>
            <button v-if="isSubmitter && !editingAuthorNotes" @click="startEditAuthorNotes" class="text-xs text-primary hover:text-primary-hover font-mono">
              {{ t('common.edit') }}
            </button>
          </div>
          <template v-if="editingAuthorNotes">
            <textarea v-model="authorNotesForm" class="textarea-field w-full" rows="3" :placeholder="t('trackDetail.authorNotesPlaceholder')"></textarea>
            <div class="flex gap-2">
              <button @click="saveAuthorNotes" :disabled="savingAuthorNotes" class="btn-primary text-xs px-3 py-1.5">{{ t('common.save') }}</button>
              <button @click="editingAuthorNotes = false" class="btn-secondary text-xs px-3 py-1.5">{{ t('common.cancel') }}</button>
            </div>
          </template>
          <p v-else-if="track.author_notes" class="text-sm text-muted-foreground whitespace-pre-wrap">{{ track.author_notes }}</p>
          <p v-else class="text-xs text-muted-foreground italic">{{ t('trackDetail.noAuthorNotes') }}</p>
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
            <div v-if="reopenTargetIsMastering" class="space-y-2">
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('trackDetail.reopenMasteringNotesLabel') }}</label>
              <textarea v-model="reopenMasteringNotes" class="textarea-field w-full text-sm h-20" :placeholder="t('trackDetail.reopenMasteringNotesPlaceholder')" />
              <p class="text-xs text-muted-foreground">{{ t('trackDetail.reopenMasteringNotesHint') }}</p>
            </div>
            <!-- Reset warnings -->
            <div v-if="loadingResets" class="text-xs text-muted-foreground">{{ t('common.loading') }}</div>
            <div v-else-if="reopenResets.length > 0" class="bg-warning-bg border border-warning/20 p-3 space-y-1.5">
              <p class="text-xs font-mono font-semibold text-warning">{{ t('trackDetail.reopenResetsTitle') }}</p>
              <ul class="text-xs text-warning/80 space-y-0.5 list-disc list-inside">
                <li v-for="reset in reopenResets" :key="reset">{{ reopenResetLabel(reset) }}</li>
              </ul>
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
        <Teleport to="body">
          <div v-if="showReassignModal" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showReassignModal = false">
            <div class="absolute inset-0 bg-black/60" />
            <div class="relative bg-card border border-border rounded-none p-5 w-full max-w-sm space-y-3 shadow-lg">
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
                  :disabled="reassigning || reassignSelectedUserIds.length < reassignReviewerLimit"
                  class="flex-1 btn-primary h-9 text-sm disabled:opacity-50"
                >
                  {{ reassigning ? t('trackDetail.reassigning') : t('common.confirm') }}
                </button>
                <button @click="showReassignModal = false" class="flex-1 btn-secondary h-9 text-sm">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- Visibility toggle (producer only, non-archived) -->
        <div v-if="isProducer && !track.archived_at" class="pt-2">
          <div class="flex items-center justify-between gap-4">
            <div class="space-y-1">
              <span class="text-xs text-muted-foreground">{{ t('trackDetail.visibility') }}</span>
              <p class="text-xs font-mono text-foreground">
                {{ track.is_public ? t('trackDetail.visibilityPublic') : t('trackDetail.visibilityPrivate') }}
              </p>
            </div>
            <button
              @click="toggleVisibility"
              :disabled="togglingVisibility"
              class="btn-secondary h-8 shrink-0 px-3 text-xs disabled:opacity-50"
            >
              {{ track.is_public ? t('trackDetail.setPrivate') : t('trackDetail.setPublic') }}
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

    <MasteringChatSidebar
      v-if="canSeeMastering && track"
      ref="chatSidebarRef"
      :track-id="trackId"
      :track-completed="track.status === 'completed'"
      :issues="issues"
      @open-issue="openIssueReference"
    />
  </div>

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
