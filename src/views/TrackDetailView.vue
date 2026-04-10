<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi, discussionApi, API_ORIGIN, resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue, Discussion, WorkflowEvent, TrackSourceVersion, WorkflowConfig, WorkflowStepDef, AlbumMember } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { hashId } from '@/utils/hash'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { Archive, ChevronRight, UserRoundCog, ImageIcon, X, Pencil, Trash2 } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useToast } from '@/composables/useToast'
import { translateStepLabel } from '@/utils/workflow'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
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
  const from = t(`status.${event.from_status}`, event.from_status)
  const to = t(`status.${event.to_status}`, event.to_status)
  return `${from} → ${to}`
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
const workflowConfig = ref<WorkflowConfig | null>(null)
const loading = ref(true)
const loadError = ref(false)
const timelineExpanded = ref(false)
const timelineFilter = ref<'all' | 'transitions' | 'issues' | 'uploads'>('all')
const TIMELINE_PREVIEW_COUNT = 5

const filteredEvents = computed(() => {
  if (timelineFilter.value === 'all') return events.value
  if (timelineFilter.value === 'transitions')
    return events.value.filter(e => e.from_status && e.to_status && e.from_status !== e.to_status)
  if (timelineFilter.value === 'issues')
    return events.value.filter(e => e.event_type.startsWith('issue'))
  if (timelineFilter.value === 'uploads')
    return events.value.filter(e => e.event_type.includes('upload') || e.event_type.includes('deliver'))
  return events.value
})
const newDiscussionContent = ref('')
const postingDiscussion = ref(false)
const discussionImages = ref<File[]>([])
const discussionImagePreviews = computed(() => discussionImages.value.map(f => URL.createObjectURL(f)))
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)
const canPostDiscussion = computed(() =>
  !postingDiscussion.value && (!!newDiscussionContent.value.trim() || discussionImages.value.length > 0)
)

onMounted(loadTrack)

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
    issues.value = detail.issues
    discussions.value = detail.discussions ?? []
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
    workflowConfig.value = detail.workflow_config ?? null
  } catch {
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
const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)
const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))
const currentWaveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return currentCycleIssues.value
  return currentCycleIssues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

const customWorkflowActionLabel = computed(() => {
  const step = track.value?.workflow_step
  if (!step) return ''
  return t('trackDetail.openWorkflowStep', { step: translateStepLabel(step, t) })
})

function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
}

function openPrimaryAction(_action: string) {
  if (!track.value?.workflow_step) return
  router.push(`/tracks/${trackId.value}/step/${track.value.workflow_step.id}`)
}


async function postDiscussion() {
  if (!newDiscussionContent.value.trim() && discussionImages.value.length === 0) return
  postingDiscussion.value = true
  try {
    const d = await discussionApi.create(trackId.value, {
      content: newDiscussionContent.value.trim(),
      images: discussionImages.value.length ? discussionImages.value : undefined,
    })
    discussions.value.push(d)
    newDiscussionContent.value = ''
    discussionImages.value = []
  } finally {
    postingDiscussion.value = false
  }
}

function addDiscussionImages(files: FileList | null) {
  if (!files) return
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) discussionImages.value.push(file)
  }
}

function removeDiscussionImage(index: number) {
  discussionImages.value.splice(index, 1)
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

const isProducer = computed(() => track.value?.producer_id === appStore.currentUser?.id)
const archiving = ref(false)
const showArchiveConfirm = ref(false)
const togglingVisibility = ref(false)

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
    router.push(`/albums/${track.value.album_id}`)
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
const reassignSelectedUserId = ref<number | null>(null)
const reassigning = ref(false)

async function openReassignModal() {
  if (isAutoAssign.value) {
    await doReassign()
    return
  }
  reassignSelectedUserId.value = null
  if (!reassignMembers.value.length && track.value) {
    const album = await albumApi.get(track.value.album_id)
    reassignMembers.value = album.members.filter(m => m.user_id !== track.value!.submitter_id)
  }
  showReassignModal.value = true
}

async function doReassign(userId?: number) {
  if (!track.value) return
  reassigning.value = true
  try {
    const updated = await trackApi.reassignReviewer(track.value.id, userId)
    track.value = updated
    showReassignModal.value = false
    reassignSelectedUserId.value = null
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
        <div class="min-w-0">
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
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">
            <span v-if="track.track_number" class="text-muted-foreground font-mono">#{{ track.track_number }}</span>
            {{ track.title }}
          </h1>
          <p class="text-sm sm:text-base text-muted-foreground">
            <span :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span> · source v{{ track.version }} · cycle {{ track.workflow_cycle }}
          </p>
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
            </div>
            <WaveformPlayer
              :audio-url="masterAudioUrl"
              :issues="[]"
              :track-id="trackId"
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
            <textarea
              v-model="newDiscussionContent"
              class="textarea-field w-full text-sm h-20"
              :placeholder="t('trackDetail.discussionPlaceholder')"
              @keydown.ctrl.enter="postDiscussion"
              @keydown.meta.enter="postDiscussion"
            />
            <div v-if="discussionImagePreviews.length" class="flex flex-wrap gap-2">
              <div
                v-for="(preview, i) in discussionImagePreviews"
                :key="i"
                class="relative group"
              >
                <img :src="preview" class="h-20 rounded border border-border object-cover" />
                <button
                  type="button"
                  @click="removeDiscussionImage(i)"
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X class="w-3 h-3" :stroke-width="2.5" />
                </button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="postDiscussion"
                :disabled="!canPostDiscussion"
                class="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ postingDiscussion ? t('common.loading') : t('trackDetail.postDiscussion') }}
              </button>
              <label class="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40 cursor-pointer transition-colors">
                <ImageIcon class="w-4 h-4" :stroke-width="2" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="sr-only"
                  @change="addDiscussionImages(($event.target as HTMLInputElement).files)"
                />
              </label>
            </div>
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
          <div class="flex justify-between items-center gap-2">
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
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <label
              v-for="m in reassignMembers"
              :key="m.user_id"
              class="flex items-center gap-2 px-3 py-2 border border-border rounded-none cursor-pointer hover:bg-background/60 transition-colors"
              :class="reassignSelectedUserId === m.user_id ? 'border-primary bg-background' : ''"
            >
              <input type="radio" class="hidden" :value="m.user_id" v-model="reassignSelectedUserId" />
              <span class="text-sm text-foreground">{{ m.user.display_name }}</span>
            </label>
          </div>
          <div class="flex gap-2">
            <button
              @click="doReassign(reassignSelectedUserId ?? undefined)"
              :disabled="reassigning || reassignSelectedUserId === null"
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

    <!-- Mobile sticky CTA -->
    <div
      v-if="primaryActions.length"
      class="mobile-cta-bar lg:hidden border-t border-border bg-[#111111] px-4 md:px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-end"
    >
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
</template>

<style scoped>
.workflow-cta-btn {
  animation: cta-glow 3s ease-in-out infinite;
}
@keyframes cta-glow {
  0%, 100% { box-shadow: 0 0 16px rgba(255, 132, 0, 0.2); }
  50% { box-shadow: 0 0 28px rgba(255, 132, 0, 0.4); }
}

.mobile-cta-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 30;
}
@media (min-width: 768px) {
  .mobile-cta-bar {
    left: var(--sidebar-w, 15rem);
  }
}
</style>
