<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi, r2Api, uploadToR2, API_ORIGIN, issueApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue, WorkflowEvent, TrackSourceVersion, WorkflowConfig, WorkflowStepDef, AlbumMember, StageAssignment } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { hashId } from '@/utils/hash'
import {
  externalComposerDisplayText,
  isComposerActor,
  platformComposerDisplayText,
  trackComposerDisplayText,
  trackComposerIds,
} from '@/utils/trackComposers'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import IssueDetailPanel from '@/components/IssueDetailPanel.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import DiscussionPanel from '@/components/common/DiscussionPanel.vue'
import MasteringChatSidebar from '@/components/chat/MasteringChatSidebar.vue'
import { Archive, Check, ChevronRight, UserRoundCog, Pencil, Upload } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useDiscussions } from '@/composables/useDiscussions'
import { useToast } from '@/composables/useToast'
import { buildTrackWorkspaceRoute, translateStepLabel, translateWorkflowStatusLabel } from '@/utils/workflow'
import { activeAssignmentsForStep } from '@/utils/reviewAssignments'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { useIssuePreviewPlayback, type PreviewAction } from '@/composables/useIssuePreviewPlayback'
import { useTrackStore } from '@/stores/tracks'
import { emptyMentionCandidates } from '@/utils/mentionCandidates'
import { extractAudioDuration } from '@/utils/audio'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const trackStore = useTrackStore()
const { t, te, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const { success: toastSuccess, error: toastError } = useToast()


type IssueDetailMode = 'inline' | 'legacy'

const ISSUE_DETAIL_MODE_STORAGE_PREFIX = 'backkitchen_issue_detail_mode'

function normalizeIssueDetailMode(value: string | null): IssueDetailMode {
  return value === 'legacy' ? 'legacy' : 'inline'
}

function readIssueDetailMode(key: string): IssueDetailMode {
  if (typeof localStorage === 'undefined') return 'inline'
  try {
    return normalizeIssueDetailMode(localStorage.getItem(key))
  } catch {
    return 'inline'
  }
}

function writeIssueDetailMode(key: string, mode: IssueDetailMode) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, mode)
  } catch {
    // Local storage can be unavailable in private browsing or hardened clients.
  }
}

const issueDetailModeStorageKey = computed(() => {
  const userId = appStore.currentUser?.id
  return userId ? `${ISSUE_DETAIL_MODE_STORAGE_PREFIX}_${userId}` : ISSUE_DETAIL_MODE_STORAGE_PREFIX
})
const issueDetailMode = ref<IssueDetailMode>(readIssueDetailMode(issueDetailModeStorageKey.value))

function setIssueDetailMode(mode: IssueDetailMode) {
  if (issueDetailMode.value === mode) return
  issueDetailMode.value = mode
  writeIssueDetailMode(issueDetailModeStorageKey.value, mode)
  syncIssueDrawerFromRoute()
}

watch(issueDetailModeStorageKey, (key) => {
  issueDetailMode.value = readIssueDetailMode(key)
  syncIssueDrawerFromRoute()
})
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
  return translateWorkflowStatusLabel(status, workflowConfig.value, t, te)
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
  const isComposer = isComposerActor(track.value, appStore.currentUser.id)
  const peerPhases = ['peer_review', 'peer_revision']
  return isComposer && peerPhases.includes(track.value.status)
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
const selectedIssue = ref<Issue | null>(null)
const sourceWaveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const masterWaveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const sourceWaveformDuration = ref(0)
const sourceWaveformCurrentTime = ref(0)
const sourceWaveformIsPlaying = ref(false)
const sourceWaveformPeaks = ref<number[]>([])
const masterWaveformDuration = ref(0)
const masterWaveformCurrentTime = ref(0)
const masterWaveformIsPlaying = ref(false)
const masterWaveformPeaks = ref<number[]>([])
const mentionCandidates = ref(emptyMentionCandidates())
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
const generalDiscussion = useDiscussions(trackId, 'general', { paginated: true })
const chatSidebarRef = ref<InstanceType<typeof MasteringChatSidebar> | null>(null)
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)

onMounted(loadTrack)
onMounted(() => { generalDiscussion.load() })
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
const { connected: wsConnected, reconnectAttempts: wsReconnectAttempts, retry: wsRetry } = useTrackWebSocket(trackId, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadTrack()
  wsReloading.value = false
}, {
  onDiscussionEvent: (event, discussionId) => {
    chatSidebarRef.value?.handleDiscussionEvent(event, discussionId)
    generalDiscussion.applyRealtimeEvent(event, discussionId)
  },
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

function applyTrack(updated: Track) {
  track.value = updated
  trackStore.setCurrentTrack(updated)
}

let reviewAssignmentsLoadCount = 0
let trackLoadSerial = 0

async function loadTrack() {
  const serial = ++trackLoadSerial
  const requestedTrackId = trackId.value
  if (!track.value) loading.value = true
  loadError.value = false
  try {
    const detail = await trackApi.get(requestedTrackId)
    if (serial !== trackLoadSerial || requestedTrackId !== trackId.value) return
    applyTrack(detail.track)
    issues.value = detail.issues
    syncIssueDrawerFromRoute()
    mentionCandidates.value = detail.mention_candidates ?? emptyMentionCandidates()
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
    workflowConfig.value = detail.workflow_config ?? null
    try {
      const assignments = await trackApi.listAssignments(requestedTrackId)
      if (serial !== trackLoadSerial || requestedTrackId !== trackId.value) return
      reviewAssignments.value = assignments
    } catch {
      if (serial !== trackLoadSerial || requestedTrackId !== trackId.value) return
      reviewAssignments.value = []
    }
  } catch {
    if (serial !== trackLoadSerial || requestedTrackId !== trackId.value) return
    trackStore.setCurrentTrack(null)
    loadError.value = true
  } finally {
    if (serial === trackLoadSerial && requestedTrackId === trackId.value) {
      loading.value = false
    }
  }
}

watch(trackId, () => {
  track.value = null
  issues.value = []
  mentionCandidates.value = emptyMentionCandidates()
  selectedIssue.value = null
  sourceWaveformDuration.value = 0
  sourceWaveformCurrentTime.value = 0
  sourceWaveformIsPlaying.value = false
  sourceWaveformPeaks.value = []
  masterWaveformDuration.value = 0
  masterWaveformCurrentTime.value = 0
  masterWaveformIsPlaying.value = false
  masterWaveformPeaks.value = []
  if (parseIssueQuery(route.query.issue) != null) {
    replaceIssueDrawerQuery(null)
  }
  events.value = []
  sourceVersions.value = []
  reviewAssignments.value = []
  workflowConfig.value = null
  void loadTrack()
})

watch(() => route.query.issue, () => {
  syncIssueDrawerFromRoute()
})

const audioUrl = computed(() => {
  const t = track.value
  if (!t?.file_path) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/audio?v=${t.version ?? 0}`
})
const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

const masterAudioUrl = computed(() => {
  const d = track.value?.current_master_delivery
  if (!d?.file_path) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-audio?v=${d.delivery_number}&c=${d.workflow_cycle ?? 1}`
})
const { downloading: masterDownloading, downloadProgress: masterDownloadProgress, downloadTrackAudio: downloadMasterAudio } = useAudioDownload()
const handleMasterDownload = () => downloadMasterAudio(masterAudioUrl, track, '_master')

watch(audioUrl, () => {
  sourceWaveformDuration.value = 0
  sourceWaveformCurrentTime.value = 0
  sourceWaveformIsPlaying.value = false
  sourceWaveformPeaks.value = []
})

watch(masterAudioUrl, () => {
  masterWaveformDuration.value = 0
  masterWaveformCurrentTime.value = 0
  masterWaveformIsPlaying.value = false
  masterWaveformPeaks.value = []
})

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
// The API already scopes `issues` to what this viewer may see. Keep this list
// aligned with `track.open_issue_count`; waveform markers remain scoped above to
// the specific audio asset they annotate.
const visibleIssueList = computed(() => issues.value)

// Multi-reviewer: filter assignments to current review step
const currentStepAssignments = computed(() => {
  const step = track.value?.workflow_step
  if (!step || step.type !== 'review') return []
  return activeAssignmentsForStep(reviewAssignments.value, step.id)
})

const hasMultipleReviewers = computed(() => currentStepAssignments.value.length > 0)
const completedReviewCount = computed(() => currentStepAssignments.value.filter(a => a.status === 'completed').length)
const totalReviewCount = computed(() => {
  const step = track.value?.workflow_step
  if (step?.assignment_mode === 'fixed') {
    return Math.max(1, currentStepAssignments.value.length)
  }
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

function legacyIssueQuery(): Record<string, string> | undefined {
  const returnTo = Array.isArray(route.query.returnTo) ? route.query.returnTo[0] : route.query.returnTo
  return typeof returnTo === 'string' && returnTo.length > 0 ? { returnTo } : undefined
}

function openLegacyIssuePage(issueId: number) {
  void router.push({
    path: `/issues/${issueId}`,
    query: legacyIssueQuery(),
  })
}

function syncIssueDrawerFromRoute() {
  const issueId = parseIssueQuery(route.query.issue)
  if (issueId == null) {
    selectedIssue.value = null
    return
  }

  if (issueDetailMode.value === 'legacy') {
    selectedIssue.value = null
    openLegacyIssuePage(issueId)
    return
  }

  selectedIssue.value = issues.value.find(issue => issue.id === issueId) ?? null
}

function openIssueDrawer(issue: Issue) {
  selectedIssue.value = issue
  if (parseIssueQuery(route.query.issue) !== issue.id) {
    replaceIssueDrawerQuery(issue.id)
  }
}

function closeIssueDrawer() {
  selectedIssue.value = null
  if (parseIssueQuery(route.query.issue) != null) {
    replaceIssueDrawerQuery(null)
  }
}

function onIssueSelect(issue: Issue) {
  if (issueDetailMode.value === 'legacy') {
    openLegacyIssuePage(issue.id)
    return
  }
  openIssueDrawer(issue)
}

function openIssueReference(issueId: number) {
  const localIssue = issues.value.find(issue => issue.id === issueId)
  if (localIssue && issueDetailMode.value === 'inline') {
    openIssueDrawer(localIssue)
    return
  }

  openLegacyIssuePage(issueId)
}

function onSourceWaveformReady(nextDuration: number) {
  sourceWaveformDuration.value = nextDuration
  nextTick(() => {
    sourceWaveformPeaks.value = sourceWaveformRef.value?.exportPeaks?.(400) ?? []
  })
}

function onSourceWaveformTimeUpdate(time: number) {
  sourceWaveformCurrentTime.value = time
}

function onSourceWaveformPlaybackStateChange(isPlaying: boolean) {
  sourceWaveformIsPlaying.value = isPlaying
}

function onMasterWaveformReady(nextDuration: number) {
  masterWaveformDuration.value = nextDuration
  nextTick(() => {
    masterWaveformPeaks.value = masterWaveformRef.value?.exportPeaks?.(400) ?? []
  })
}

function onMasterWaveformTimeUpdate(time: number) {
  masterWaveformCurrentTime.value = time
}

function onMasterWaveformPlaybackStateChange(isPlaying: boolean) {
  masterWaveformIsPlaying.value = isPlaying
}

function issueUsesMasterWaveform(issue: Issue | null): boolean {
  return issue?.phase === 'final_review'
}

function previewTimeForIssue(issue: Issue | null): number {
  return issueUsesMasterWaveform(issue) ? masterWaveformCurrentTime.value : sourceWaveformCurrentTime.value
}

function previewDurationForIssue(issue: Issue | null): number {
  return issueUsesMasterWaveform(issue) ? masterWaveformDuration.value : sourceWaveformDuration.value
}

function previewIsPlayingForIssue(issue: Issue | null): boolean {
  return issueUsesMasterWaveform(issue) ? masterWaveformIsPlaying.value : sourceWaveformIsPlaying.value
}

function previewWaveformForIssue(issue: Issue | null) {
  return issueUsesMasterWaveform(issue) ? masterWaveformRef.value : sourceWaveformRef.value
}

function previewPeaksForIssue(issue: Issue | null): number[] {
  return issueUsesMasterWaveform(issue) ? masterWaveformPeaks.value : sourceWaveformPeaks.value
}

const issuePreviewPlayback = useIssuePreviewPlayback({
  selectedIssue,
  waveformFor: (issue) => previewWaveformForIssue(issue),
  currentTimeFor: (issue) => previewTimeForIssue(issue),
  isPlayingFor: (issue) => previewIsPlayingForIssue(issue),
})

const selectedIssuePreview = computed(() => {
  if (!selectedIssue.value) return null
  const duration = previewDurationForIssue(selectedIssue.value)
  if (duration <= 0) return null
  return {
    duration,
    currentTime: previewTimeForIssue(selectedIssue.value),
    isPreviewPlaying: issuePreviewPlayback.isPreviewPlaying.value,
    activeMarkerIndex: issuePreviewPlayback.activeMarkerIndex.value,
    peaks: previewPeaksForIssue(selectedIssue.value),
  }
})

async function handleIssuePreviewPlayAt(time: number) {
  await previewWaveformForIssue(selectedIssue.value)?.playFrom?.(time)
}

function handleIssuePreviewAction(_issue: Issue, action: PreviewAction) {
  void issuePreviewPlayback.handleAction(action)
}

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
    toastError(err?.message || t('workflowStep.transitionFailed'))
  }
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

function sourceVersionOptionLabel(version: TrackSourceVersion): string {
  const prefix = version.source_kind === 'external_link'
    ? t('workflowStep.externalSourceVersionLabel')
    : `V${version.version_number}`
  return `${prefix} · ${fmtDate(version.created_at)}`
}

const olderPlayableVersions = computed(() =>
  olderVersions.value.filter(version => version.source_kind !== 'external_link' && version.file_path !== null),
)

const versionOptions = computed<SelectOption[]>(() =>
  olderPlayableVersions.value.map((v) => ({
    value: v.id,
    label: sourceVersionOptionLabel(v),
  }))
)

const currentVersionRevisionNotes = computed(() => {
  const cv = track.value?.current_source_version
  if (!cv) return null
  const sv = sourceVersions.value.find(v => v.id === cv.id)
  return sv?.revision_notes ?? cv.revision_notes ?? null
})
const currentVersionNotesLabel = computed(() => {
  const currentSource = track.value?.current_source_version
  const version = currentSource?.version_number ?? track.value?.version
  return currentSource?.source_kind === 'external_link'
    ? t('trackDetail.externalSourceLinkLabel', { version })
    : t('trackDetail.revisionNotesLabel', { version })
})


const selectedCompareVersionNotes = computed(() => {
  if (!selectedCompareVersionId.value) return null
  const sv = olderPlayableVersions.value.find(v => v.id === selectedCompareVersionId.value)
  return sv?.revision_notes ?? null
})

const isProducer = computed(() => track.value?.producer_id === appStore.currentUser?.id)
const canSeeMastering = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId || !track.value) return false
  return isComposerActor(track.value, userId)
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
  return isComposerActor(track.value, appStore.currentUser.id) || isProducer.value
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
  return step?.assignment_mode === 'auto' || step?.assignment_mode === 'fixed' || (step?.assignee_user_id != null)
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
    reassigning.value = true
    try {
      const album = await albumApi.get(track.value.album_id)
      const composerIds = new Set(trackComposerIds(track.value))
      reassignMembers.value = album.members.filter(m => !composerIds.has(m.user_id))
    } catch (e: any) {
      toastError(e?.message || t('common.requestFailed'))
      return
    } finally {
      reassigning.value = false
    }
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
    applyTrack(updated)
    showReassignModal.value = false
    reassignSelectedUserIds.value = []
    if (updated.peer_reviewer_id !== null) {
      toastSuccess(t('trackDetail.reassignDone'))
    } else {
      toastError(t('trackDetail.reassignNoPool'))
    }
    const assignmentsToken = ++reviewAssignmentsLoadCount
    trackApi.listAssignments(updated.id)
      .then((assignments) => {
        if (assignmentsToken === reviewAssignmentsLoadCount) reviewAssignments.value = assignments
      })
      .catch(() => {
        toastError(t('trackDetail.reassignRefreshFailed'))
      })
  } catch (e: any) {
    toastError(e?.message || t('common.requestFailed'))
  } finally {
    reassigning.value = false
  }
}

const canResubmitRejectedTrack = computed(() =>
  Boolean(track.value?.allowed_actions?.includes('resubmit'))
)
const resubmitFile = ref<File | null>(null)
const resubmitUploading = ref(false)
const resubmitProgress = ref(0)

function onResubmitFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  resubmitFile.value = input.files?.[0] ?? null
}

async function submitRejectedTrackAgain() {
  if (!track.value || !resubmitFile.value) return
  resubmitUploading.value = true
  resubmitProgress.value = 0
  try {
    const updated = await trackApi.uploadSourceVersion(
      track.value.id,
      resubmitFile.value,
      undefined,
      percent => { resubmitProgress.value = percent },
    )
    resubmitFile.value = null
    resubmitProgress.value = 0
    applyTrack(updated)
    toastSuccess(t('trackDetail.resubmitDone'))
    await router.push(buildTrackWorkspaceRoute(updated, {
      returnTo: typeof route.query.returnTo === 'string' ? route.query.returnTo : null,
    }))
  } catch {
    toastError(t('trackDetail.resubmitFailed'))
  } finally {
    resubmitUploading.value = false
  }
}

const pendingSourceFollowupRequest = computed(() => track.value?.pending_source_followup_request ?? null)
const canRequestSourceFollowup = computed(() =>
  Boolean(track.value?.allowed_actions?.includes('request_source_followup'))
)
const canDecideSourceFollowup = computed(() =>
  Boolean(track.value?.allowed_actions?.includes('decide_source_followup'))
)
const canCancelSourceFollowup = computed(() =>
  Boolean(track.value?.allowed_actions?.includes('cancel_source_followup'))
)
const sourceFollowupFile = ref<File | null>(null)
const sourceFollowupReason = ref('')
const sourceFollowupUploading = ref(false)
const sourceFollowupProgress = ref(0)
const sourceFollowupTargetStage = ref('')
const sourceFollowupDeciding = ref(false)

function sourceFollowupTargetIsMasteringRelated(step: WorkflowStepDef): boolean {
  return step.type === 'delivery'
    || step.ui_variant === 'mastering'
    || step.id.includes('master')
    || step.id.includes('mastering')
}

const sourceFollowupTargetStages = computed<WorkflowStepDef[]>(() => {
  if (!workflowConfig.value) return []
  const steps = workflowConfig.value.steps
  const deliveryOrders = steps.filter(step => step.type === 'delivery').map(step => step.order)
  const firstDeliveryOrder = deliveryOrders.length ? Math.min(...deliveryOrders) : null
  return steps
    .filter(step => step.type !== 'revision')
    .filter(step => firstDeliveryOrder == null || step.order <= firstDeliveryOrder)
    .filter(step => isProducer.value || sourceFollowupTargetIsMasteringRelated(step))
    .slice()
    .sort((a, b) => a.order - b.order)
})

watch(sourceFollowupTargetStages, (stages) => {
  if (stages.some(stage => stage.id === sourceFollowupTargetStage.value)) {
    return
  }
  const preferredStage = stages.find(sourceFollowupTargetIsMasteringRelated) ?? stages[0]
  sourceFollowupTargetStage.value = preferredStage?.id ?? ''
})

function onSourceFollowupFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  sourceFollowupFile.value = input.files?.[0] ?? null
}

function resetSourceFollowupForm() {
  sourceFollowupFile.value = null
  sourceFollowupReason.value = ''
  sourceFollowupProgress.value = 0
}

async function submitSourceFollowupRequest() {
  if (!track.value || !sourceFollowupFile.value || !sourceFollowupReason.value.trim()) return
  sourceFollowupUploading.value = true
  sourceFollowupProgress.value = 0
  try {
    const file = sourceFollowupFile.value
    let updated: Track
    if (appStore.r2Enabled) {
      const [presigned, duration] = await Promise.all([
        r2Api.requestSourceFollowupUpload(track.value.id, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (percent) => {
        sourceFollowupProgress.value = percent
      })
      updated = await r2Api.confirmSourceFollowupUpload(track.value.id, {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
        reason: sourceFollowupReason.value.trim(),
      })
    } else {
      updated = await trackApi.createSourceFollowup(
        track.value.id,
        file,
        sourceFollowupReason.value.trim(),
        percent => { sourceFollowupProgress.value = percent },
      )
    }
    applyTrack(updated)
    resetSourceFollowupForm()
    showReopenModal.value = false
    toastSuccess(t('trackDetail.sourceFollowup.requested'))
    await loadTrack()
  } catch (e: any) {
    toastError(e?.message || t('trackDetail.sourceFollowup.requestFailed'))
  } finally {
    sourceFollowupUploading.value = false
  }
}

async function decideSourceFollowup(decision: 'approve' | 'reject') {
  const request = pendingSourceFollowupRequest.value
  if (!request) return
  if (decision === 'approve' && !sourceFollowupTargetStage.value) return
  sourceFollowupDeciding.value = true
  try {
    const updated = await trackApi.decideSourceFollowup(request.id, {
      decision,
      target_stage_id: decision === 'approve' ? sourceFollowupTargetStage.value : null,
    })
    applyTrack(updated)
    toastSuccess(decision === 'approve'
      ? t('trackDetail.sourceFollowup.approved')
      : t('trackDetail.sourceFollowup.rejected'))
    await loadTrack()
  } catch (e: any) {
    toastError(e?.message || t('trackDetail.sourceFollowup.decideFailed'))
  } finally {
    sourceFollowupDeciding.value = false
  }
}

async function cancelSourceFollowup() {
  const request = pendingSourceFollowupRequest.value
  if (!request) return
  sourceFollowupDeciding.value = true
  try {
    const updated = await trackApi.cancelSourceFollowup(request.id)
    applyTrack(updated)
    toastSuccess(t('trackDetail.sourceFollowup.cancelled'))
    await loadTrack()
  } catch (e: any) {
    toastError(e?.message || t('trackDetail.sourceFollowup.cancelFailed'))
  } finally {
    sourceFollowupDeciding.value = false
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
const isSubmitter = computed(() => isComposerActor(track.value, appStore.currentUser?.id))
const composerSummary = computed(() => trackComposerDisplayText(track.value))
const platformComposerSummary = computed(() => platformComposerDisplayText(track.value))
const externalComposerSummary = computed(() => externalComposerDisplayText(track.value))
const hasPlatformComposers = computed(() => platformComposerSummary.value !== '--')
const hasExternalComposers = computed(() => externalComposerSummary.value !== '--')
const trackArtistDisplay = computed(() => {
  if (!track.value) return '--'
  if (track.value.artist) return track.value.artist
  if (composerSummary.value !== '--') return composerSummary.value
  return track.value.submitter_id ? `#${hashId(track.value.submitter_id)}` : '--'
})
const trackArtistUsesHash = computed(() => Boolean(
  track.value && !track.value.artist && composerSummary.value === '--' && track.value.submitter_id,
))
const isProxySubmission = computed(() => Boolean(track.value?.is_proxy_submission && track.value.external_submitter_name))
const composerApprovalLabel = computed(() =>
  isProxySubmission.value ? t('trackDetail.externalSubmitterProxy') : t('trackDetail.composers')
)
const composerProxyActorDisplay = computed(() => {
  if (!track.value || hasPlatformComposers.value || !hasExternalComposers.value) return ''
  return track.value.proxy_uploader?.display_name ?? track.value.submitter?.display_name ?? '--'
})
const canDirectReopen = computed(() => track.value?.status === 'completed' && (isProducer.value || isMasteringEngineer.value))
const canRequestReopen = computed(() => track.value?.status === 'completed' && isSubmitter.value && !isProducer.value && !isMasteringEngineer.value)
const completedProcessMode = ref<'reopen' | 'source_followup'>('reopen')
const completedProcessButtonLabel = computed(() => {
  if (track.value?.status === 'completed' && canRequestSourceFollowup.value) return t('trackDetail.processCompleted')
  return canDirectReopen.value ? t('trackDetail.reopen') : t('trackDetail.requestReopen')
})
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

function resetReopenForm() {
  showReopenModal.value = false
  completedProcessMode.value = 'reopen'
  reopenTargetStage.value = ''
  reopenReason.value = ''
  reopenMasteringNotes.value = ''
  reopenResets.value = []
}

async function handleReopen() {
  if (!track.value || !reopenTargetStage.value) return
  reopening.value = true
  try {
    if (canDirectReopen.value) {
      const updated = await trackApi.reopen(
        track.value.id,
        reopenTargetStage.value,
        reopenMasteringNotes.value.trim() || undefined,
      )
      applyTrack(updated)
      toastSuccess(t('trackDetail.reopenDone'))
      // reopen may reset issues/events depending on target stage; refresh in the
      // background so the UI updates in place without awaiting a second round-trip.
      loadTrack()
    } else {
      await trackApi.requestReopen(track.value.id, reopenTargetStage.value, reopenReason.value, reopenMasteringNotes.value.trim() || undefined)
      toastSuccess(t('trackDetail.reopenRequested'))
    }
    resetReopenForm()
  } catch (e: any) {
    toastError(e?.message || t('trackDetail.reopenFailed'))
  } finally {
    reopening.value = false
  }
}

watch([track, olderPlayableVersions, () => route.query.compareVersion], ([currentTrack, versions, compareVersion]) => {
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
                  <span v-if="track.track_number" class="text-muted-foreground font-mono">
                    {{ t('trackDetail.trackNumberLabel', { number: track.track_number }) }}
                  </span>
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
                <span :class="{ 'font-mono': trackArtistUsesHash }">{{ trackArtistDisplay }}</span> · source v{{ track.version }}
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
                  v-if="olderPlayableVersions.length > 0"
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
            <div v-if="showVersionCompare && olderPlayableVersions.length > 0" class="flex items-center gap-2 mb-3">
              <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
              <CustomSelect v-model="selectedCompareVersionId" :options="versionOptions" :placeholder="`-- ${t('compare.selectVersion')} --`" size="sm" />
              <button v-if="selectedCompareVersionId" @click="selectedCompareVersionId = null" class="text-xs text-muted-foreground hover:text-foreground">
                {{ t('compare.clear') }}
              </button>
            </div>
            <WaveformPlayer
              ref="sourceWaveformRef"
              :audio-url="audioUrl"
              :issues="currentWaveformIssues"
              :track-id="trackId"
              :compare-version-id="selectedCompareVersionId"
              @regionClick="onIssueSelect"
              @ready="onSourceWaveformReady"
              @timeupdate="onSourceWaveformTimeUpdate"
              @playbackStateChange="onSourceWaveformPlaybackStateChange"
            />
            <div v-if="currentVersionRevisionNotes" class="mt-2 px-3 py-2 border border-border rounded-none bg-card">
              <p class="text-xs font-mono text-muted-foreground mb-0.5">{{ currentVersionNotesLabel }}</p>
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
            <WaveformPlayer
              ref="masterWaveformRef"
              :audio-url="masterAudioUrl"
              :issues="masterWaveformIssues"
              :track-id="trackId"
              playback-scope="master"
              @regionClick="onIssueSelect"
              @ready="onMasterWaveformReady"
              @timeupdate="onMasterWaveformTimeUpdate"
              @playbackStateChange="onMasterWaveformPlaybackStateChange"
            />
          </div>
          <div v-else-if="track.current_master_delivery && canSeeMastering" class="card space-y-3">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-sm font-medium text-muted-foreground">
                {{ t('trackDetail.masterAudio') }}
                <span class="text-xs ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
              </h3>
            </div>
            <p class="text-sm text-muted-foreground">{{ t('workflowStep.textDeliveryNoAudio') }}</p>
            <div v-if="track.current_master_delivery.delivery_message" class="border border-border bg-background rounded-none p-3">
              <p class="text-xs text-muted-foreground mb-1">{{ t('workflowStep.deliveryMessageLabel') }}</p>
              <p class="whitespace-pre-wrap break-words text-sm text-foreground">{{ track.current_master_delivery.delivery_message }}</p>
            </div>
          </div>

          <div id="issues">
            <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="space-y-1">
                <h3 class="text-sm font-sans font-semibold text-foreground">
                  {{ t('trackDetail.issuesHeading', { count: visibleIssueList.length }) }}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {{ t('trackDetail.issueDetailModeHint') }}
                </p>
              </div>
              <div class="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background p-1">
                <button
                  type="button"
                  class="rounded-full px-3 py-1.5 text-xs font-mono transition-colors"
                  :class="issueDetailMode === 'inline' ? 'bg-button-primary text-button-primary-foreground' : 'bg-border text-muted-foreground hover:text-foreground'"
                  :aria-pressed="issueDetailMode === 'inline'"
                  @click="setIssueDetailMode('inline')"
                >
                  {{ t('trackDetail.issueDetailModeInline') }}
                </button>
                <button
                  type="button"
                  class="rounded-full px-3 py-1.5 text-xs font-mono transition-colors"
                  :class="issueDetailMode === 'legacy' ? 'bg-button-primary text-button-primary-foreground' : 'bg-border text-muted-foreground hover:text-foreground'"
                  :aria-pressed="issueDetailMode === 'legacy'"
                  @click="setIssueDetailMode('legacy')"
                >
                  {{ t('trackDetail.issueDetailModeLegacy') }}
                </button>
              </div>
            </div>
            <IssueMarkerList
              :issues="visibleIssueList"
              :current-source-version-number="track.version"
              :track="track"
              :assignments="reviewAssignments"
              :show-activity="true"
              :enable-quick-actions="true"
              @select="onIssueSelect"
              @status-change="onQuickIssueStatusChange"
            />
          </div>

          <!-- General Discussions -->
          <DiscussionPanel
            :discussions="generalDiscussion.discussions.value"
            :issues="issues"
            :mention-users="mentionCandidates.general"
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
            :has-more="generalDiscussion.hasMore.value"
            :loading-older="generalDiscussion.loadingOlder.value"
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
            @load-older="generalDiscussion.loadOlder"
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
                   bg-button-primary hover:bg-button-primary-hover text-button-primary-foreground
                   shadow-[0_0_16px_rgb(var(--color-primary)_/_0.25)] hover:shadow-[0_0_24px_rgb(var(--color-primary)_/_0.45)]"
          >
            {{ action.label }}
            <ChevronRight class="w-5 h-5 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
          </button>
        </div>

        <div v-if="pendingSourceFollowupRequest" class="card space-y-3 border-warning/30">
          <div class="space-y-1">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.sourceFollowup.pendingTitle') }}</h3>
            <p class="text-xs text-muted-foreground">{{ t('trackDetail.sourceFollowup.pendingDesc') }}</p>
          </div>
          <div class="border border-border bg-background p-3 space-y-1">
            <p class="text-xs font-mono text-muted-foreground">{{ t('trackDetail.sourceFollowup.reason') }}</p>
            <p class="text-sm text-foreground whitespace-pre-wrap">{{ pendingSourceFollowupRequest.reason }}</p>
          </div>
          <div v-if="canDecideSourceFollowup" class="space-y-3">
            <div class="space-y-1">
              <label class="text-xs text-muted-foreground">{{ t('trackDetail.sourceFollowup.targetStage') }}</label>
              <select v-model="sourceFollowupTargetStage" class="select-field w-full">
                <option v-for="stage in sourceFollowupTargetStages" :key="stage.id" :value="stage.id">
                  {{ reopenStageOptionLabel(stage) }}
                </option>
              </select>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn-primary flex-1 h-9 text-sm disabled:opacity-50"
                :disabled="sourceFollowupDeciding || !sourceFollowupTargetStage"
                @click="decideSourceFollowup('approve')"
              >
                {{ sourceFollowupDeciding ? t('common.loading') : t('trackDetail.sourceFollowup.approve') }}
              </button>
              <button
                type="button"
                class="flex-1 rounded-full bg-error text-white h-9 text-sm font-mono disabled:opacity-50"
                :disabled="sourceFollowupDeciding"
                @click="decideSourceFollowup('reject')"
              >
                {{ t('trackDetail.sourceFollowup.reject') }}
              </button>
            </div>
          </div>
          <button
            v-if="canCancelSourceFollowup"
            type="button"
            class="btn-secondary w-full h-9 text-sm"
            :disabled="sourceFollowupDeciding"
            @click="cancelSourceFollowup"
          >
            {{ t('trackDetail.sourceFollowup.cancel') }}
          </button>
        </div>

        <div v-if="canRequestSourceFollowup && track.status !== 'completed'" class="card space-y-3 border-primary/40">
          <div class="space-y-1">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.sourceFollowup.title') }}</h3>
            <p class="text-xs text-muted-foreground">{{ t('trackDetail.sourceFollowup.desc') }}</p>
          </div>
          <input
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
            class="input-field w-full"
            :disabled="sourceFollowupUploading"
            @change="onSourceFollowupFileChange"
          />
          <p v-if="sourceFollowupFile" class="text-xs text-muted-foreground truncate">{{ sourceFollowupFile.name }}</p>
          <textarea
            v-model="sourceFollowupReason"
            class="textarea-field w-full text-sm h-20"
            :placeholder="t('trackDetail.sourceFollowup.reasonPlaceholder')"
          />
          <div v-if="sourceFollowupUploading" class="space-y-1">
            <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: sourceFollowupProgress + '%' }"></div>
            </div>
            <p class="text-xs text-muted-foreground text-right">{{ sourceFollowupProgress }}%</p>
          </div>
          <button
            type="button"
            class="btn-primary w-full h-10 text-sm inline-flex items-center justify-center gap-2"
            :disabled="!sourceFollowupFile || !sourceFollowupReason.trim() || sourceFollowupUploading"
            @click="submitSourceFollowupRequest"
          >
            <Upload class="w-4 h-4" :stroke-width="2" />
            {{ sourceFollowupUploading ? t('trackDetail.sourceFollowup.uploading') : t('trackDetail.sourceFollowup.submit') }}
          </button>
        </div>

        <div v-if="canResubmitRejectedTrack" class="card space-y-3 border-primary/40">
          <div class="space-y-1">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.resubmitTitle') }}</h3>
            <p class="text-xs text-muted-foreground">{{ t('trackDetail.resubmitDesc') }}</p>
          </div>
          <input
            type="file"
            accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
            class="input-field w-full"
            :disabled="resubmitUploading"
            @change="onResubmitFileChange"
          />
          <p v-if="resubmitFile" class="text-xs text-muted-foreground truncate">
            {{ resubmitFile.name }}
          </p>
          <div v-if="resubmitUploading" class="space-y-1">
            <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: resubmitProgress + '%' }"></div>
            </div>
            <p class="text-xs text-muted-foreground text-right">{{ resubmitProgress }}%</p>
          </div>
          <button
            type="button"
            class="btn-primary w-full h-10 text-sm inline-flex items-center justify-center gap-2"
            :disabled="!resubmitFile || resubmitUploading"
            @click="submitRejectedTrackAgain"
          >
            <Upload class="w-4 h-4" :stroke-width="2" />
            {{ resubmitUploading ? t('trackDetail.resubmitUploading') : t('trackDetail.resubmitButton') }}
          </button>
        </div>

        <div class="card space-y-2 text-sm">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.trackSummary') }}</h3>
          <div class="flex justify-between gap-4">
            <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
            <span class="text-foreground text-right" :class="{ 'font-mono': !track.submitter && track.submitter_id }">{{ track.submitter?.display_name ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span>
          </div>
          <div v-if="hasPlatformComposers" class="flex justify-between gap-4">
            <span class="text-muted-foreground">{{ t('trackDetail.platformComposers') }}</span>
            <span class="text-foreground text-right">{{ platformComposerSummary }}</span>
          </div>
          <div v-if="hasExternalComposers" class="flex justify-between gap-4">
            <span class="text-muted-foreground">{{ t('trackDetail.externalComposers') }}</span>
            <span class="text-foreground text-right">{{ externalComposerSummary }}</span>
          </div>
          <div v-if="composerProxyActorDisplay" class="flex justify-between gap-4">
            <span class="text-muted-foreground">{{ t('trackDetail.composerProxyActor') }}</span>
            <span class="text-foreground text-right">{{ composerProxyActorDisplay }}</span>
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
              <span>{{ composerApprovalLabel }}</span>
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
              :class="timelineFilter === f ? 'bg-button-primary text-button-primary-foreground' : 'bg-border text-muted-foreground hover:text-foreground'"
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

        <!-- Reopen / source follow-up (completed tracks) -->
        <div v-if="canDirectReopen || canRequestReopen || (track.status === 'completed' && canRequestSourceFollowup)" class="pt-2">
          <button
            v-if="!showReopenModal"
            @click="showReopenModal = true"
            class="w-full flex items-center justify-center gap-2 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors h-10 text-sm font-mono"
          >
            {{ completedProcessButtonLabel }}
          </button>
          <div v-else class="card space-y-3">
            <div v-if="track.status === 'completed' && canRequestSourceFollowup" class="flex gap-2">
              <button
                type="button"
                class="btn-secondary flex-1 h-9 text-xs"
                :class="completedProcessMode === 'reopen' ? 'border-primary text-primary' : ''"
                @click="completedProcessMode = 'reopen'"
              >
                {{ t('trackDetail.sourceFollowup.reopenOnly') }}
              </button>
              <button
                type="button"
                class="btn-secondary flex-1 h-9 text-xs"
                :class="completedProcessMode === 'source_followup' ? 'border-primary text-primary' : ''"
                @click="completedProcessMode = 'source_followup'"
              >
                {{ t('trackDetail.sourceFollowup.withSource') }}
              </button>
            </div>
            <template v-if="completedProcessMode === 'source_followup'">
              <p class="text-sm text-muted-foreground">{{ t('trackDetail.sourceFollowup.completedDesc') }}</p>
              <input
                type="file"
                accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
                class="input-field w-full"
                :disabled="sourceFollowupUploading"
                @change="onSourceFollowupFileChange"
              />
              <p v-if="sourceFollowupFile" class="text-xs text-muted-foreground truncate">{{ sourceFollowupFile.name }}</p>
              <textarea
                v-model="sourceFollowupReason"
                class="textarea-field w-full text-sm h-20"
                :placeholder="t('trackDetail.sourceFollowup.reasonPlaceholder')"
              />
              <div v-if="sourceFollowupUploading" class="space-y-1">
                <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: sourceFollowupProgress + '%' }"></div>
                </div>
                <p class="text-xs text-muted-foreground text-right">{{ sourceFollowupProgress }}%</p>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 btn-primary h-9 text-sm disabled:opacity-50"
                  :disabled="!sourceFollowupFile || !sourceFollowupReason.trim() || sourceFollowupUploading"
                  @click="submitSourceFollowupRequest"
                >
                  {{ sourceFollowupUploading ? t('trackDetail.sourceFollowup.uploading') : t('trackDetail.sourceFollowup.submit') }}
                </button>
                <button @click="showReopenModal = false" class="flex-1 btn-secondary h-9 text-sm">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </template>
            <template v-else>
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
            </template>
          </div>
        </div>

        <!-- Reassign reviewer modal (manual mode) -->
        <Teleport to="body">
          <div v-if="showReassignModal" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showReassignModal = false">
            <div class="absolute inset-0 bg-overlay/60" />
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
                 bg-button-primary hover:bg-button-primary-hover text-button-primary-foreground
                 shadow-[0_0_16px_rgb(var(--color-primary)_/_0.25)] hover:shadow-[0_0_24px_rgb(var(--color-primary)_/_0.45)]"
        >
          {{ action.label }}
          <ChevronRight class="w-4 h-4 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
        </button>
      </div>
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
      @open-issue="openIssueReference"
      @preview-play-at="handleIssuePreviewPlayAt"
      @preview-action="handleIssuePreviewAction"
    />
    <MasteringChatSidebar
      v-if="canSeeMastering && track"
      ref="chatSidebarRef"
      :track-id="trackId"
      :track-completed="track.status === 'completed'"
      :issues="issues"
      :mention-users="mentionCandidates.mastering"
      @open-issue="openIssueReference"
    />
  </div>

</template>

<style scoped>
.workflow-cta-btn {
  animation: cta-glow 3s ease-in-out infinite;
}
@keyframes cta-glow {
  0%, 100% { box-shadow: 0 0 16px rgb(var(--color-primary) / 0.2); }
  50% { box-shadow: 0 0 28px rgb(var(--color-primary) / 0.4); }
}
</style>
