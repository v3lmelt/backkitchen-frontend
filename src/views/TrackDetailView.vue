<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi } from '@/api'
import type { Track, Issue, WorkflowEvent, TrackSourceVersion } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const { t, te, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

// FNV-1a 32-bit — must stay in sync with IssueMarkerList.vue
function hashId(id: number): string {
  let h = 2166136261
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase()
}

const issueNumberMap = computed(() => {
  const m = new Map<number, number>()
  issues.value.forEach((issue, idx) => m.set(issue.id, idx + 1))
  return m
})

const issuePeerMap = computed(() => {
  const m = new Map<number, boolean>()
  issues.value.forEach(issue => m.set(issue.id, issue.phase === 'peer'))
  return m
})

function formatTimelineEvent(event: WorkflowEvent): string {
  const payload = event.payload ?? {}
  const issueId = typeof payload.issue_id === 'number' ? payload.issue_id : null

  // Peer-phase: check via issues map, or directly from issue_created payload
  const isPeer = issueId != null
    ? issuePeerMap.value.get(issueId) === true
    : payload.phase === 'peer'

  const rawName = event.actor?.display_name
  const name = !rawName
    ? t('trackDetail.system')
    : isPeer && event.actor
      ? `#${hashId(event.actor.id)}`
      : rawName

  const num = issueId != null ? (issueNumberMap.value.get(issueId) ?? null) : null

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
      if (s === 'resolved') return t('dashboard.timeline.issueResolved', { name, num: num ?? '?' })
      if (s === 'will_fix')  return t('dashboard.timeline.issueWillFix',  { name, num: num ?? '?' })
      if (s === 'disagreed') return t('dashboard.timeline.issueDisagreed', { name, num: num ?? '?' })
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
const events = ref<WorkflowEvent[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)

onMounted(loadTrack)

async function loadTrack() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues
    events.value = detail.events
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')
const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))

const actionLabel = (action: string) => {
  const key = `trackDetail.actions.${action}`
  return t(key, action.replaceAll('_', ' '))
}

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  router.push(`/issues/${issue.id}`)
}

function openPrimaryAction(action: string) {
  if (action === 'peer_review') router.push(`/tracks/${trackId.value}/review`)
  if (action === 'upload_revision' || action === 'resubmit') router.push(`/tracks/${trackId.value}/revision`)
  if (action === 'producer_gate' || action === 'intake') router.push(`/tracks/${trackId.value}/producer`)
  if (action === 'mastering') router.push(`/tracks/${trackId.value}/mastering`)
  if (action === 'final_review') router.push(`/tracks/${trackId.value}/final-review`)
}


const currentVersionId = computed(() => track.value?.current_source_version?.id ?? null)
const olderVersions = computed(() =>
  sourceVersions.value
    .filter(v => v.id !== currentVersionId.value)
    .sort((a, b) => b.version_number - a.version_number)
)
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <StatusBadge :status="track.status" type="track" />
          <span v-if="track.rejection_mode" class="text-xs text-muted-foreground">
            {{ t('trackDetail.rejectionMode', { mode: track.rejection_mode }) }}
          </span>
        </div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ track.title }}</h1>
        <p class="text-muted-foreground">
          {{ track.artist }} · source v{{ track.version }} · cycle {{ track.workflow_cycle }}
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button
          v-for="action in track.allowed_actions"
          :key="action"
          @click="openPrimaryAction(action)"
          class="btn-primary text-sm"
        >
          {{ actionLabel(action) }}
        </button>
      </div>
    </div>

    <div class="card">
      <h3 class="text-sm font-medium text-muted-foreground mb-3">{{ t('trackDetail.workflowStatus') }}</h3>
      <WorkflowProgress :status="track.status" />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div class="xl:col-span-2 space-y-6">
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
            <span class="text-xs text-gray-400">{{ t('compare.selectVersion') }}</span>
            <select v-model="selectedCompareVersionId" class="select-field-sm">
              <option :value="null">-- {{ t('compare.selectVersion') }} --</option>
              <option v-for="v in olderVersions" :key="v.id" :value="v.id">
                V{{ v.version_number }} · {{ fmtDate(v.created_at) }}
              </option>
            </select>
            <button v-if="selectedCompareVersionId" @click="selectedCompareVersionId = null" class="text-xs text-gray-500 hover:text-gray-300">
              {{ t('compare.clear') }}
            </button>
          </div>
          <WaveformPlayer
            ref="waveformRef"
            :audio-url="audioUrl"
            :issues="currentCycleIssues"
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
          <IssueMarkerList :issues="currentCycleIssues" @select="onIssueSelect" />
        </div>
      </div>

      <div class="space-y-4">
        <div class="card space-y-2 text-sm">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('trackDetail.trackSummary') }}</h3>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
            <span class="text-foreground">{{ track.submitter?.display_name || '--' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">{{ t('trackDetail.peerReviewer') }}</span>
            <span class="text-foreground">{{ track.peer_reviewer?.display_name || '--' }}</span>
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
  </div>
</template>
