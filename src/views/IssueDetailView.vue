<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, commentApi, trackAudioUrl, sourceVersionAudioUrl } from '@/api'
import { useTrackStore } from '@/stores/tracks'
import { fetchTrackDetailBundle } from '@/composables/useTrackDetail'
import { emptyMentionCandidates } from '@/utils/mentionCandidates'
import type { EditHistory, Issue, MentionCandidates, StageAssignment } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import IssueDetailContent from '@/components/IssueDetailContent.vue'
import { formatTimestamp, formatTimestampShort } from '@/utils/time'
import type { MarkerIndexReference } from '@/utils/timestamps'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { isIssueOpenOrInternal } from '@/utils/issueStatus'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackStore = useTrackStore()
const { error: toastError } = useToast()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const allTrackIssues = ref<Issue[]>([])
const loading = ref(true)
const showUnresolvedOnly = ref(false)
const currentSourceVersionNumber = ref<number | null>(null)
const cachedTrack = ref<import('@/types').Track | null>(null)
const reviewAssignments = ref<StageAssignment[]>([])
const mentionCandidates = ref<MentionCandidates>(emptyMentionCandidates())

const issueIsOutdated = computed(() => {
  if (!issue.value || issue.value.source_version_number == null || currentSourceVersionNumber.value == null) return false
  return issue.value.source_version_number !== currentSourceVersionNumber.value
})

const canOpenIssueSourceAudio = computed(() =>
  issueIsOutdated.value && issue.value?.source_version_id != null,
)

const displayedAudioVersionNumber = computed(() => {
  if (issueIsOutdated.value) return issue.value?.source_version_number ?? currentSourceVersionNumber.value
  return currentSourceVersionNumber.value ?? issue.value?.source_version_number ?? null
})

const waveformIssues = computed(() => {
  if (!issue.value) return []
  if (issueIsOutdated.value && !canOpenIssueSourceAudio.value) return []
  return [issue.value]
})

let loadCount = 0
let cachedTrackId: number | null = null
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)

const audioUrl = computed(() => {
  if (!issue.value) return ''
  if (canOpenIssueSourceAudio.value) {
    return sourceVersionAudioUrl(issue.value.track_id, issue.value.source_version_id!)
  }
  return trackAudioUrl(issue.value.track_id, issue.value.source_version_number ?? 0)
})

function onWaveformReady() {
  seekWaveformToIssue()
}

function seekWaveformToIssue() {
  if (!issue.value || !waveformRef.value) return
  const firstMarker = issue.value.markers[0]
  if (firstMarker) {
    waveformRef.value.seekTo(firstMarker.time_start)
  }
  if (issue.value.markers.some(m => m.marker_type === 'range')) {
    waveformRef.value.highlightIssue(issue.value)
  }
}

// When switching issues with the same audio, the WaveformPlayer persists (no
// new "ready" event). Detect this and seek to the new issue's timestamp.
let prevAudioUrl = audioUrl.value
watch(issueId, () => {
  nextTick(() => {
    const url = audioUrl.value
    if (url && url === prevAudioUrl) {
      seekWaveformToIssue()
    }
    prevAudioUrl = url
  })
})
watch(audioUrl, (url) => { prevAudioUrl = url })

const loadError = ref(false)

async function loadIssue(id: number) {
  const token = ++loadCount
  loadError.value = false
  const cached = allTrackIssues.value.find(i => i.id === id)
  if (!cached || cached.track_id !== trackStore.currentTrack?.id) {
    trackStore.setCurrentTrack(null)
  }
  if (cached) {
    issue.value = cached
    loading.value = false
  } else if (issue.value?.id !== id) {
    loading.value = true
  }
  try {
    const fetched = await issueApi.get(id)
    if (token !== loadCount) return
    issue.value = fetched
    if (fetched.track_id !== cachedTrackId) {
      const [all, { detail, assignments }] = await Promise.all([
        issueApi.listForTrack(fetched.track_id),
        fetchTrackDetailBundle(fetched.track_id),
      ])
      if (token !== loadCount) return
      allTrackIssues.value = all
      currentSourceVersionNumber.value = detail.track.version
      cachedTrack.value = detail.track
      trackStore.setCurrentTrack(detail.track)
      mentionCandidates.value = detail.mention_candidates ?? emptyMentionCandidates()
      reviewAssignments.value = assignments
      cachedTrackId = fetched.track_id
    }
  } catch {
    if (token === loadCount) loadError.value = true
  } finally {
    if (token === loadCount) loading.value = false
  }
}

onMounted(() => {
  loadIssue(issueId.value)
  window.addEventListener('keydown', handleKeydown)
})
watch(issueId, (id) => {
  loadIssue(id)
  nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const siblingIssues = computed(() => {
  if (!issue.value) return []
  const { phase, workflow_cycle } = issue.value
  return allTrackIssues.value
    .filter(i => i.phase === phase && i.workflow_cycle === workflow_cycle)
    .sort((a, b) => (a.markers[0]?.time_start ?? Infinity) - (b.markers[0]?.time_start ?? Infinity))
})

const visibleSiblingIssues = computed(() => {
  if (!showUnresolvedOnly.value) return siblingIssues.value
  return siblingIssues.value.filter(i => isIssueOpenOrInternal(i.status))
})

const currentSiblingIndex = computed(() =>
  siblingIssues.value.findIndex(i => i.id === issueId.value)
)
const prevIssue = computed(() =>
  currentSiblingIndex.value > 0 ? siblingIssues.value[currentSiblingIndex.value - 1] : null
)
const nextIssue = computed(() =>
  currentSiblingIndex.value < siblingIssues.value.length - 1
    ? siblingIssues.value[currentSiblingIndex.value + 1]
    : null
)

function isOutdatedIssue(item: Issue): boolean {
  if (item.source_version_number == null || currentSourceVersionNumber.value == null) return false
  return item.source_version_number !== currentSourceVersionNumber.value
}

async function playTrackReferenceAt(time: number) {
  if (!waveformRef.value) return
  await waveformRef.value.playFrom(time)
}

function openIssueReference(targetIssueId: number) {
  if (targetIssueId === issueId.value) return
  void router.push(`/issues/${targetIssueId}`)
}

function resolveIssueMarkerReference(reference: MarkerIndexReference) {
  const marker = issue.value?.markers[reference.zeroBasedIndex]
  if (!marker) return null
  return marker
}

async function jumpToIssueMarkerReference(reference: MarkerIndexReference) {
  const marker = resolveIssueMarkerReference(reference)
  if (!marker) return
  if (!waveformRef.value) return

  await waveformRef.value.playFrom(marker.time_start)
}

// Edit history
const historyItems = ref<EditHistory[]>([])
const showHistoryForCommentId = ref<number | null>(null)

async function showCommentHistory(commentId: number) {
  showHistoryForCommentId.value = commentId
  try {
    historyItems.value = await commentApi.history(commentId)
  } catch (e: any) {
    historyItems.value = []
    toastError(e?.message || t('editHistory.loadFailed'))
  }
}

function closeHistory() {
  showHistoryForCommentId.value = null
  historyItems.value = []
}

function onIssueUpdated(updated: Issue) {
  issue.value = updated
  const idx = allTrackIssues.value.findIndex(i => i.id === updated.id)
  if (idx !== -1) allTrackIssues.value[idx] = updated
}

function goBackToTrack() {
  if (!issue.value) return
  router.push({
    path: `/tracks/${issue.value.track_id}`,
    query: { returnTo: route.path },
  })
}

function handleKeydown(e: KeyboardEvent) {
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Space') {
    e.preventDefault()
    waveformRef.value?.togglePlay()
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault()
    const t = waveformRef.value?.getCurrentTime() ?? 0
    waveformRef.value?.seekTo(Math.max(0, t - 5))
  } else if (e.code === 'ArrowRight') {
    e.preventDefault()
    const t = waveformRef.value?.getCurrentTime() ?? 0
    waveformRef.value?.seekTo(t + 5)
  } else if (e.key === 'j' || e.key === 'J') {
    if (prevIssue.value) router.push(`/issues/${prevIssue.value.id}`)
  } else if (e.key === 'k' || e.key === 'K') {
    if (nextIssue.value) router.push(`/issues/${nextIssue.value.id}`)
  }
}

function openVersionCompare() {
  if (!issue.value?.track_id || !issue.value.source_version_id) return
  router.push({
    path: `/tracks/${issue.value.track_id}`,
    query: {
      compareVersion: String(issue.value.source_version_id),
      returnTo: route.path,
    },
  })
}
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>
  <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
    <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
    <button @click="loadIssue(issueId)" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
  </div>
    <div v-else-if="issue" class="max-w-7xl mx-auto space-y-6">
    <div
      v-if="issueIsOutdated"
      class="flex flex-col gap-3 border border-warning/30 bg-warning-bg px-4 py-4 text-sm text-warning lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="min-w-0">
        <p class="font-medium text-foreground">
          {{ t('issueDetail.outdatedVersionTitle', { issueVersion: issue.source_version_number, currentVersion: currentSourceVersionNumber }) }}
        </p>
        <p class="mt-1 text-warning">
          {{ t(canOpenIssueSourceAudio ? 'issueDetail.outdatedVersionBody' : 'issueDetail.outdatedVersionUnavailable') }}
        </p>
      </div>
      <button v-if="canOpenIssueSourceAudio" @click="openVersionCompare" class="btn-secondary text-sm whitespace-nowrap">
        {{ t('issueDetail.openVersionCompare') }}
      </button>
    </div>

    <!-- Header -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <button @click="goBackToTrack" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 max-w-xs truncate">
          <ChevronLeft class="w-4 h-4 shrink-0" :stroke-width="2" />
          <span class="truncate">{{ cachedTrack?.title || t('issueDetail.back') }}</span>
        </button>
        <div v-if="siblingIssues.length > 1" class="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
            :disabled="!prevIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="prevIssue?.title"
          >
            <ChevronLeft class="w-4 h-4" :stroke-width="2" />
          </button>
          <span class="font-mono text-xs">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
          <button
            @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
            :disabled="!nextIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="nextIssue?.title"
          >
            <ChevronRight class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>
      </div>
      <h1 class="text-2xl font-sans font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
        <span
          v-if="issue.source_version_number != null"
          class="inline-flex items-center rounded-full bg-border px-2 py-1 text-xs font-mono text-foreground"
        >
          v{{ issue.source_version_number }}
        </span>
        <StatusBadge :status="issue.phase" type="phase" />
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span v-if="issue.markers.length === 0" class="text-sm text-muted-foreground italic">{{ t('issue.generalIssue') }}</span>
        <template v-else v-for="(m, mi) in issue.markers" :key="mi">
          <span class="inline-flex items-center gap-1 whitespace-nowrap">
            <span class="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/60 select-none">{{ m.marker_type === 'range' ? t('issueType.range') : t('issueType.point') }}</span>
            <span class="text-sm font-mono text-muted-foreground">
              {{ formatTimestamp(m.time_start) }}<span v-if="m.time_end"> – {{ formatTimestamp(m.time_end) }}</span>
            </span>
          </span>
        </template>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Transition name="issue-detail-fade" mode="out-in">
        <div :key="issue.id" class="min-w-0 space-y-6">
          <!-- Waveform -->
          <div class="card overflow-hidden !p-0">
            <div class="px-4 pt-3 pb-2 border-b border-border flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-2 mr-auto">
                <span class="text-xs font-mono font-medium text-muted-foreground">{{ t('issueDetail.audioContext') }}</span>
                <span
                  v-if="displayedAudioVersionNumber != null"
                  class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
                >
                  v{{ displayedAudioVersionNumber }}
                </span>
              </div>
              <template v-if="issue.markers.length > 0">
                <span
                  v-for="(m, mi) in issue.markers"
                  :key="mi"
                  class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-mono text-muted-foreground"
                >
                  <span
                    v-if="m.marker_type === 'point'"
                    class="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"
                  />
                  <span
                    v-else
                    class="h-[3px] w-2.5 rounded-full bg-primary flex-shrink-0"
                  />
                  {{ formatTimestampShort(m.time_start) }}<span v-if="m.time_end" class="opacity-50 mx-0.5">–</span><span v-if="m.time_end">{{ formatTimestampShort(m.time_end) }}</span>
                </span>
              </template>
              <span v-else class="text-xs text-muted-foreground italic">{{ t('issue.generalIssue') }}</span>
            </div>
            <WaveformPlayer
              ref="waveformRef"
              :audio-url="audioUrl"
              :issues="waveformIssues"
              :track-id="issue.track_id"
              :height="120"
              @ready="onWaveformReady"
            />
            <div class="border-t border-border px-4 py-2 flex items-center justify-end gap-4">
              <span class="text-[11px] font-mono text-muted-foreground/50 whitespace-nowrap hidden sm:block select-none">{{ t('issueDetail.keyboardHint') }}</span>
            </div>
          </div>

          <IssueDetailContent
            :issue="issue"
            variant="page"
            :track="cachedTrack"
            :assignments="reviewAssignments"
            :issues="allTrackIssues"
            :mention-candidates="mentionCandidates"
            @updated="onIssueUpdated"
            @track-reference="playTrackReferenceAt"
            @marker-activate="jumpToIssueMarkerReference"
            @open-issue="openIssueReference"
            @show-comment-history="showCommentHistory"
          />
      </div>
      </Transition>

      <aside class="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-3rem)] lg:flex lg:flex-col">
        <div class="card space-y-4 lg:flex lg:flex-col lg:overflow-hidden">
          <div class="flex items-center justify-between gap-3 shrink-0">
            <h3 class="text-sm font-sans font-semibold text-foreground">
              {{ t('issueDetail.issueList', { count: visibleSiblingIssues.length }) }}
            </h3>
            <div class="flex items-center gap-1 text-muted-foreground">
              <button
                @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
                :disabled="!prevIssue"
                class="p-0.5 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                :title="prevIssue?.title"
              >
                <ChevronLeft class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
              <span class="text-xs font-mono">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
              <button
                @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
                :disabled="!nextIssue"
                class="p-0.5 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                :title="nextIssue?.title"
              >
                <ChevronRight class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
            </div>
          </div>

          <label class="flex items-center justify-between gap-3 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground cursor-pointer select-none shrink-0">
            <span>{{ t('issueDetail.onlyUnresolved') }}</span>
            <button
              type="button"
              @click.prevent="showUnresolvedOnly = !showUnresolvedOnly"
              class="relative h-6 w-11 overflow-hidden rounded-full transition-colors"
              :class="showUnresolvedOnly ? 'bg-primary' : 'bg-border'"
              :aria-pressed="showUnresolvedOnly"
            >
              <span
                class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform"
                :class="showUnresolvedOnly ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </label>

          <div class="space-y-2 lg:overflow-y-auto lg:pr-1 lg:min-h-0">
            <button
              v-for="item in visibleSiblingIssues"
              :key="item.id"
              type="button"
              @click="item.id !== issueId && router.push(`/issues/${item.id}`)"
              class="w-full border border-border p-3 text-left transition-colors"
              :class="[
                item.id === issueId ? 'bg-warning-bg border-primary/40' : 'bg-background hover:bg-card',
                isOutdatedIssue(item) ? 'opacity-60' : '',
              ]"
            >
              <div class="min-w-0 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-mono text-muted-foreground">#{{ item.local_number }}</span>
                  <span
                    v-if="item.source_version_number != null"
                    class="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-[11px] font-mono text-foreground"
                  >
                    v{{ item.source_version_number }}
                  </span>
                  <span v-if="item.id === issueId" class="inline-flex items-center rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-mono text-warning border border-warning/20">
                    {{ t('issueDetail.currentIssue') }}
                  </span>
                </div>
                <p class="text-sm font-medium leading-snug break-words" :class="isOutdatedIssue(item) ? 'text-muted-foreground' : 'text-foreground'">{{ item.title }}</p>
                <div class="flex items-center gap-2 flex-wrap">
                  <StatusBadge :status="item.severity" type="severity" />
                  <StatusBadge :status="item.status" type="issue" />
                </div>
                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-mono text-muted-foreground">
                  <template v-if="item.markers.length === 0">
                    <span class="italic">{{ t('issue.generalIssue') }}</span>
                  </template>
                  <template v-else v-for="(m, mi) in item.markers" :key="mi">
                    <span v-if="mi > 0" class="opacity-50">·</span>
                    <span class="whitespace-nowrap">{{ formatTimestampShort(m.time_start) }}<template v-if="m.time_end">-{{ formatTimestampShort(m.time_end) }}</template></span>
                  </template>
                </div>
              </div>
            </button>

            <p v-if="visibleSiblingIssues.length === 0" class="rounded-none border border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
              {{ t('issueDetail.noVisibleIssues') }}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>

  <EditHistoryModal
    v-if="showHistoryForCommentId !== null"
    :items="historyItems"
    @close="closeHistory"
  />
</template>

<style scoped>
.issue-detail-fade-enter-active,
.issue-detail-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.issue-detail-fade-enter-from,
.issue-detail-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
