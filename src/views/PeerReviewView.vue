<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { checklistApi, trackApi } from '@/api'
import type { ChecklistItem, Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import IssueDetailPanel from '@/components/IssueDetailPanel.vue'
import { useToast } from '@/composables/useToast'
import { useAudioDownload } from '@/composables/useAudioDownload'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { success: toastSuccess } = useToast()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const existingChecklist = ref<ChecklistItem[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()
const error = ref('')

// English labels are used as API keys; translated for display via translateChecklistLabel()
const checklistLabels = ['Arrangement', 'Balance', 'Low-End', 'Stereo Image', 'Technical Cleanliness']
const checklistLabelKeyMap: Record<string, string> = {
  'Arrangement': 'arrangement',
  'Balance': 'balance',
  'Low-End': 'lowEnd',
  'Stereo Image': 'stereoImage',
  'Technical Cleanliness': 'technicalCleanliness',
}

function translateChecklistLabel(label: string): string {
  const key = checklistLabelKeyMap[label]
  return key ? t(`checklistLabels.${key}`) : label
}

const checklist = ref(checklistLabels.map(label => ({ label, passed: false, note: '' })))

const checklistSaved = computed(() => existingChecklist.value.length > 0)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues.filter(issue => issue.phase === 'peer' && issue.workflow_cycle === detail.track.workflow_cycle)
    existingChecklist.value = detail.checklist_items
    if (existingChecklist.value.length) {
      checklist.value = checklistLabels.map(label => {
        const item = existingChecklist.value.find(entry => entry.label === label)
        return { label, passed: item?.passed ?? false, note: item?.note ?? '' }
      })
    }
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')

async function submitChecklist() {
  error.value = ''
  try {
    existingChecklist.value = await checklistApi.submit(
      trackId.value,
      checklist.value.map(item => ({
        label: item.label,
        passed: item.passed,
        note: item.note || undefined,
      })),
    )
    toastSuccess(t('peerReview.checklistSubmitted'))
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
  }
}

async function finish(decision: 'needs_revision' | 'pass') {
  error.value = ''
  try {
    await trackApi.finishPeerReview(trackId.value, decision)
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    error.value = err.message || t('common.requestFailed')
  }
}

const selectedIssue = ref<Issue | null>(null)

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  waveformRef.value?.highlightIssue(issue)
  selectedIssue.value = issue
}

function onIssueUpdated(updated: Issue) {
  const idx = issues.value.findIndex(i => i.id === updated.id)
  if (idx !== -1) issues.value[idx] = updated
}

const { downloading, downloadAudio } = useAudioDownload()

function handleDownload() {
  if (!audioUrl.value || !track.value) return
  const ext = track.value.file_path?.split('.').pop() || 'wav'
  downloadAudio(audioUrl.value, `${track.value.title}.${ext}`)
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('peerReview.heading', { title: track.title }) }}</h1>
        <p class="text-muted-foreground">{{ t('peerReview.subheading', { version: track.version }) }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <div v-if="error" class="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
      {{ error }}
    </div>

    <div v-if="audioUrl">
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs text-muted-foreground">{{ t('peerReview.waveformHint') }}</p>
        <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
          {{ downloading ? '…' : t('common.downloadAudio') }}
        </button>
      </div>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="issues"
        :selectable="true"
        :selected-range="issueFormRef?.selectedRange ?? null"
        @click="(t: number) => issueFormRef?.handleClick(t)"
        @regionClick="onIssueSelect"
        @rangeSelect="(s: number, e: number) => issueFormRef?.handleRangeSelect(s, e)"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <IssueCreatePanel
          ref="issueFormRef"
          :track-id="trackId"
          phase="peer"
          @created="(issue: Issue) => issues.push(issue)"
        >
          <template #heading>
            <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.issuesHeading', { count: issues.length }) }}</h3>
          </template>
        </IssueCreatePanel>

        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.checklistHeading') }}</h3>
        <div v-for="item in checklist" :key="item.label" class="flex items-start gap-3">
          <input
            type="checkbox"
            v-model="item.passed"
            class="mt-1 rounded border-border bg-card text-primary focus:ring-primary"
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
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button @click="submitChecklist" class="btn-secondary text-sm">
            {{ t('peerReview.saveChecklist') }}
          </button>
          <button
            @click="finish('needs_revision')"
            class="btn-primary text-sm"
            :disabled="!checklistSaved"
            :class="{ 'opacity-40 cursor-not-allowed': !checklistSaved }"
          >
            {{ t('peerReview.requestRevision') }}
          </button>
          <button
            @click="finish('pass')"
            class="btn-primary text-sm"
            :disabled="!checklistSaved"
            :class="{ 'opacity-40 cursor-not-allowed': !checklistSaved }"
          >
            {{ t('peerReview.passToProducer') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <IssueDetailPanel :issue="selectedIssue" @close="selectedIssue = null" @updated="onIssueUpdated" />
</template>
