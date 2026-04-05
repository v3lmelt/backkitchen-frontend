<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, trackApi } from '@/api'
import type { Issue, IssueStatus, Track, TrackSourceVersion } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { formatTimestamp, formatLocaleDate } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const sourceVersions = ref<TrackSourceVersion[]>([])
const loading = ref(true)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const selectedIssueIds = ref<number[]>([])
const showVersionCompare = ref(false)
const selectedCompareVersionId = ref<number | null>(null)
const showBatchModal = ref(false)
const batchTargetStatus = ref<IssueStatus>('will_fix')
const batchStatusNote = ref('')

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
    const phase = detail.track.status === 'mastering_revision' ? 'mastering' : 'peer'
    issues.value = detail.issues.filter(issue => issue.phase === phase && issue.workflow_cycle === detail.track.workflow_cycle)
  } finally {
    loading.value = false
  }
}

const pendingIssues = computed(() => issues.value.filter(issue => issue.status === 'open'))
const respondedIssues = computed(() => issues.value.filter(issue => issue.status !== 'open'))
const revisionLabel = computed(() =>
  track.value?.status === 'mastering_revision'
    ? t('revision.masteringRevision')
    : t('revision.peerRevision')
)
const uploadButtonLabel = computed(() =>
  track.value?.status === 'mastering_revision'
    ? t('revision.submitBackToMastering')
    : t('revision.submitBackToPeer')
)
const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')
const waveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return issues.value
  return issues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

const { downloading, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

const currentVersionId = computed(() => track.value?.current_source_version?.id ?? null)
const olderVersions = computed(() =>
  sourceVersions.value
    .filter(v => v.id !== currentVersionId.value)
    .sort((a, b) => b.version_number - a.version_number)
)

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

async function respondToIssue(issue: Issue, status: IssueStatus) {
  const updated = await issueApi.update(issue.id, { status })
  const idx = issues.value.findIndex(entry => entry.id === issue.id)
  if (idx !== -1) issues.value[idx] = updated
}

async function submitRevision() {
  if (!selectedFile.value) return
  uploading.value = true
  try {
    await trackApi.uploadSourceVersion(trackId.value, selectedFile.value)
    router.push(`/tracks/${trackId.value}`)
  } finally {
    uploading.value = false
  }
}

const formatDate = (d: string) => formatLocaleDate(d, locale.value)

function openBatchAction(status: IssueStatus) {
  batchTargetStatus.value = status
  batchStatusNote.value = ''
  showBatchModal.value = true
}

async function confirmBatchAction() {
  if (selectedIssueIds.value.length === 0) return
  const updatedIssues = await issueApi.batchUpdate(trackId.value, {
    issue_ids: selectedIssueIds.value,
    status: batchTargetStatus.value,
    status_note: batchStatusNote.value || undefined,
  })
  for (const updated of updatedIssues) {
    const idx = issues.value.findIndex(i => i.id === updated.id)
    if (idx !== -1) issues.value[idx] = updated
  }
  selectedIssueIds.value = []
  showBatchModal.value = false
}

function onIssueSelectToggle(issueId: number) {
  const idx = selectedIssueIds.value.indexOf(issueId)
  if (idx === -1) {
    selectedIssueIds.value.push(issueId)
  } else {
    selectedIssueIds.value.splice(idx, 1)
  }
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ revisionLabel }}: {{ track.title }}</h1>
        <p class="text-muted-foreground">{{ t('revision.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ pendingIssues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.openCount') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warning">{{ issues.filter(issue => issue.status === 'will_fix').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.willFixCount') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ respondedIssues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.respondedCount') }}</div>
      </div>
    </div>

    <div v-if="audioUrl">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-muted-foreground">{{ t('peerReview.waveformHint') }}</span>
        <div class="flex items-center gap-2">
          <button
            v-if="sourceVersions.length > 1"
            @click="showVersionCompare = !showVersionCompare"
            class="text-xs btn-secondary px-3 py-1">
            {{ t('compare.title') }}
          </button>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? '…' : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
      <div v-if="showVersionCompare && olderVersions.length > 0" class="flex items-center gap-2 mb-3">
        <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
        <select v-model="selectedCompareVersionId" class="select-field-sm">
          <option :value="null">-- {{ t('compare.selectVersion') }} --</option>
          <option v-for="v in olderVersions" :key="v.id" :value="v.id">
            V{{ v.version_number }} · {{ formatDate(v.created_at) }}
          </option>
        </select>
        <button v-if="selectedCompareVersionId" @click="selectedCompareVersionId = null" class="text-xs text-muted-foreground hover:text-foreground">
          {{ t('compare.clear') }}
        </button>
      </div>
      <WaveformPlayer
        :audio-url="audioUrl"
        :issues="waveformIssues"
        :track-id="trackId"
        :compare-version-id="selectedCompareVersionId"
      />
    </div>

    <div v-if="pendingIssues.length > 0">
      <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('revision.openIssuesHeading') }}</h3>
      <div class="space-y-3">
        <div v-for="issue in pendingIssues" :key="issue.id" class="card">
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              :checked="selectedIssueIds.includes(issue.id)"
              @change="onIssueSelectToggle(issue.id)"
              class="mt-1 rounded border-border bg-card text-primary focus:ring-primary flex-shrink-0"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <StatusBadge :status="issue.severity" type="severity" />
                <span class="text-xs text-muted-foreground">{{ formatTimestamp(issue.time_start) }}</span>
              </div>
              <h4 class="text-sm font-medium text-foreground">{{ issue.title }}</h4>
              <p class="text-xs text-muted-foreground mt-1">{{ issue.description }}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="respondToIssue(issue, 'will_fix')" class="btn-primary text-xs">{{ t('revision.willFix') }}</button>
              <button @click="respondToIssue(issue, 'disagreed')" class="btn-secondary text-xs">{{ t('revision.disagree') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="respondedIssues.length > 0">
      <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('revision.respondedIssuesHeading') }}</h3>
      <div class="space-y-2">
        <div v-for="issue in respondedIssues" :key="issue.id" class="card opacity-80">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <StatusBadge :status="issue.status" type="issue" />
              <span class="text-sm text-foreground">{{ issue.title }}</span>
            </div>
            <span class="text-xs text-muted-foreground">{{ formatTimestamp(issue.time_start) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-primary/50 space-y-3">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('revision.uploadHeading') }}</h3>
      <p class="text-xs text-muted-foreground">{{ t('revision.uploadHint') }}</p>
      <input type="file" accept="audio/*" @change="onFileSelect" class="input-field w-full" />
      <button
        @click="submitRevision"
        :disabled="!selectedFile || uploading"
        :class="[
          'text-sm font-medium px-4 py-2 rounded-full transition-colors',
          !selectedFile || uploading ? 'bg-border text-muted-foreground cursor-not-allowed' : 'btn-primary'
        ]"
      >
        {{ uploading ? t('revision.uploading') : uploadButtonLabel }}
      </button>
    </div>

    <Transition name="slide-up">
      <div v-if="selectedIssueIds.length > 0"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-card border border-border rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-3 z-50">
        <span class="text-sm text-muted-foreground">{{ selectedIssueIds.length }} {{ t('issue.selected') }}</span>
        <div class="h-4 w-px bg-border"></div>
        <button @click="openBatchAction('will_fix')" class="px-3 py-1.5 rounded-full text-sm bg-warning-bg text-warning border border-warning/30 hover:bg-warning/20 transition-colors">
          {{ t('issue.status.will_fix') }}
        </button>
        <button @click="openBatchAction('resolved')" class="px-3 py-1.5 rounded-full text-sm bg-success-bg text-success border border-success/30 hover:bg-success/20 transition-colors">
          {{ t('issue.status.resolved') }}
        </button>
        <button @click="selectedIssueIds = []" class="btn-secondary text-sm">
          {{ t('common.cancel') }}
        </button>
      </div>
    </Transition>

    <div v-if="showBatchModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-card border border-border rounded-2xl p-6 w-full max-w-md space-y-4">
        <h3 class="font-semibold text-foreground">{{ t('issue.batchStatusNote') }}</h3>
        <textarea
          v-model="batchStatusNote"
          :placeholder="t('issue.batchStatusNote')"
          class="textarea-field w-full"
          rows="3"
        ></textarea>
        <div class="flex gap-2">
          <button @click="confirmBatchAction" class="btn-primary text-sm">
            {{ t('common.confirm') }}
          </button>
          <button @click="showBatchModal = false" class="btn-secondary text-sm">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px);
}
</style>
