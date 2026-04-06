<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, discussionApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue, Discussion, WorkflowEvent, TrackSourceVersion } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { hashId } from '@/utils/hash'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import type { WorkflowProgressAction } from '@/components/workflow/WorkflowProgress.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { ChevronRight } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t, te, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

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
const loading = ref(true)
const newDiscussionContent = ref('')
const postingDiscussion = ref(false)
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)

onMounted(loadTrack)

async function loadTrack() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues
    discussions.value = detail.discussions ?? []
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio` : '')
const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))
const currentWaveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return currentCycleIssues.value
  return currentCycleIssues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

const actionLabel = (action: string) => {
  const key = `trackDetail.actions.${action}`
  return t(key, action.replaceAll('_', ' '))
}

function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
}

function openPrimaryAction(action: string) {
  if (action === 'peer_review') router.push(`/tracks/${trackId.value}/review`)
  if (action === 'upload_revision' || action === 'resubmit') router.push(`/tracks/${trackId.value}/revision`)
  if (action === 'producer_gate' || action === 'intake') router.push(`/tracks/${trackId.value}/producer`)
  if (action === 'mastering') router.push(`/tracks/${trackId.value}/mastering`)
  if (action === 'final_review') router.push(`/tracks/${trackId.value}/final-review`)
}


async function postDiscussion() {
  if (!newDiscussionContent.value.trim()) return
  postingDiscussion.value = true
  try {
    const d = await discussionApi.create(trackId.value, { content: newDiscussionContent.value.trim() })
    discussions.value.push(d)
    newDiscussionContent.value = ''
  } finally {
    postingDiscussion.value = false
  }
}

function openImage(url: string) {
  window.open(url, '_blank')
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

const progressActions = computed<WorkflowProgressAction[]>(() => {
  if (!track.value?.allowed_actions?.length) return []
  return track.value.allowed_actions.map(action => ({
    label: actionLabel(action),
    handler: () => openPrimaryAction(action),
  }))
})

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
}, { immediate: true })
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <StatusBadge :status="track.status" type="track" />
          <span v-if="track.rejection_mode" class="text-xs text-muted-foreground">
            {{ t('trackDetail.rejectionMode', { mode: track.rejection_mode }) }}
          </span>
        </div>
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">
          <span v-if="track.track_number" class="text-muted-foreground font-mono">#{{ track.track_number }}</span>
          {{ track.title }}
        </h1>
        <p class="text-sm sm:text-base text-muted-foreground">
          {{ track.artist }} · source v{{ track.version }} · cycle {{ track.workflow_cycle }}
        </p>
      </div>
    </div>

    <div class="card">
      <h3 class="text-sm font-medium text-muted-foreground mb-3">{{ t('trackDetail.workflowStatus') }}</h3>
      <WorkflowProgress :status="track.status" :actions="progressActions" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <div v-if="audioUrl">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-muted-foreground">{{ t('trackDetail.currentSourceAudio') }}</h3>
            <button
              v-if="sourceVersions.length > 1"
              @click="showVersionCompare = !showVersionCompare"
              class="text-xs btn-secondary px-3 py-1">
              {{ t('compare.title') }}
            </button>
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

        <div>
          <h3 class="text-sm font-sans font-semibold text-foreground mb-3">
            {{ t('trackDetail.issuesHeading', { count: currentCycleIssues.length }) }}
          </h3>
          <IssueMarkerList :issues="currentCycleIssues" :current-source-version-number="track.version" @select="onIssueSelect" />
        </div>

        <!-- Discussions -->
        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">
            {{ t('trackDetail.discussionsHeading', { count: discussions.length }) }}
          </h3>
          <div v-if="discussions.length === 0" class="text-sm text-muted-foreground">
            {{ t('trackDetail.noDiscussions') }}
          </div>
          <div v-else class="space-y-3">
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
                </div>
                <p class="text-sm text-foreground mt-1 whitespace-pre-wrap">{{ d.content }}</p>
                <div v-if="d.images?.length" class="flex gap-2 mt-2">
                  <img
                    v-for="img in d.images"
                    :key="img.id"
                    :src="img.image_url"
                    class="h-20 rounded border border-border object-cover cursor-pointer"
                    @click="openImage(img.image_url)"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <textarea
              v-model="newDiscussionContent"
              class="textarea-field flex-1 text-sm h-20"
              :placeholder="t('trackDetail.discussionPlaceholder')"
              @keydown.ctrl.enter="postDiscussion"
              @keydown.meta.enter="postDiscussion"
            />
          </div>
          <button
            @click="postDiscussion"
            :disabled="!newDiscussionContent.trim() || postingDiscussion"
            class="btn-primary text-sm"
          >
            {{ postingDiscussion ? t('common.loading') : t('trackDetail.postDiscussion') }}
          </button>
        </div>
      </div>

      <div class="space-y-4">
        <!-- Workflow action CTA -->
        <div v-if="track.allowed_actions?.length" class="hidden lg:block border border-primary/40 bg-card rounded-none p-4 space-y-3">
          <button
            v-for="action in track.allowed_actions"
            :key="action"
            @click="openPrimaryAction(action)"
            class="workflow-cta-btn group w-full flex items-center justify-between gap-2 rounded-full font-mono font-semibold px-5 h-11 text-sm transition-all
                   bg-primary hover:bg-primary-hover text-black
                   shadow-[0_0_16px_rgba(255,132,0,0.25)] hover:shadow-[0_0_24px_rgba(255,132,0,0.45)]"
          >
            {{ actionLabel(action) }}
            <ChevronRight class="w-5 h-5 transition-transform group-hover:translate-x-0.5" :stroke-width="2.5" />
          </button>
        </div>

        <div class="card space-y-2 text-sm">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.trackSummary') }}</h3>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
            <span class="text-foreground">{{ track.submitter?.display_name || '--' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.peerReviewer') }}</span>
            <span class="text-foreground" :class="{ 'font-mono': shouldAnonymizePeer }">{{ track.peer_reviewer ? (shouldAnonymizePeer ? `#${hashId(track.peer_reviewer.id)}` : track.peer_reviewer.display_name) : '--' }}</span>
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

        <div class="card space-y-3">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.timeline') }}</h3>
          <div v-if="events.length === 0" class="text-sm text-muted-foreground">{{ t('trackDetail.noEvents') }}</div>
          <div v-else class="max-h-80 overflow-y-auto space-y-0 -mx-1 px-1">
            <div v-for="event in events" :key="event.id" class="border-b border-border last:border-0 py-3 first:pt-0">
              <div class="text-sm text-foreground">{{ formatTimelineEvent(event) }}</div>
              <div class="text-xs text-muted-foreground mt-0.5">{{ fmtDate(event.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile sticky CTA -->
    <div
      v-if="track.allowed_actions?.length"
      class="lg:hidden sticky -bottom-6 z-30 -mx-4 md:-mx-6 -mb-6 border-t border-border bg-[#111111] px-4 md:px-6 py-3 flex items-center justify-end"
    >
      <button
        v-for="action in track.allowed_actions"
        :key="'m-' + action"
        @click="openPrimaryAction(action)"
        class="workflow-cta-btn group flex items-center gap-2 rounded-full font-mono font-semibold px-5 h-10 text-sm leading-none transition-all
               bg-primary hover:bg-primary-hover text-black
               shadow-[0_0_16px_rgba(255,132,0,0.25)] hover:shadow-[0_0_24px_rgba(255,132,0,0.45)]"
      >
        {{ actionLabel(action) }}
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
</style>
