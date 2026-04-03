<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { checklistApi, issueApi, trackApi } from '@/api'
import type { ChecklistItem, Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const existingChecklist = ref<ChecklistItem[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()
const error = ref('')

const showNewIssue = ref(false)
const newIssue = ref({
  title: '',
  description: '',
  severity: 'major' as const,
  issue_type: 'point' as 'point' | 'range',
  time_start: 0,
  time_end: null as number | null,
  phase: 'peer' as const,
})

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

function onWaveformClick(time: number) {
  newIssue.value.time_start = roundToMilliseconds(time)
  showNewIssue.value = true
}

async function submitIssue() {
  const created = await issueApi.create(trackId.value, newIssue.value)
  issues.value.push(created)
  showNewIssue.value = false
  newIssue.value = {
    title: '',
    description: '',
    severity: 'major',
    issue_type: 'point',
    time_start: 0,
    time_end: null,
    phase: 'peer',
  }
}

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
    alert(t('peerReview.checklistSubmitted'))
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

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
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
      <p class="text-xs text-muted-foreground mb-2">{{ t('peerReview.waveformHint') }}</p>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="issues"
        @click="onWaveformClick"
        @regionClick="onIssueSelect"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('peerReview.issuesHeading', { count: issues.length }) }}</h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">
            {{ t('common.addIssue') }}
          </button>
        </div>

        <div v-if="showNewIssue" class="card space-y-3 border-primary/50">
          <h4 class="text-sm font-sans font-semibold text-foreground">{{ t('common.newIssueAt', { time: formatTime(newIssue.time_start) }) }}</h4>
          <input v-model="newIssue.title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
          <textarea v-model="newIssue.description" class="input-field w-full h-20 resize-none" :placeholder="t('common.descriptionPlaceholder')" />
          <div class="grid grid-cols-2 gap-3">
            <select v-model="newIssue.severity" class="input-field">
              <option value="critical">{{ t('severity.critical') }}</option>
              <option value="major">{{ t('severity.major') }}</option>
              <option value="minor">{{ t('severity.minor') }}</option>
              <option value="suggestion">{{ t('severity.suggestion') }}</option>
            </select>
            <select v-model="newIssue.issue_type" class="input-field">
              <option value="point">{{ t('issueType.point') }}</option>
              <option value="range">{{ t('issueType.range') }}</option>
            </select>
          </div>
          <div v-if="newIssue.issue_type === 'range'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted-foreground">{{ t('peerReview.startLabel') }}</label>
              <input v-model.number="newIssue.time_start" type="number" step="0.001" class="input-field w-full" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">{{ t('peerReview.endLabel') }}</label>
              <input v-model.number="newIssue.time_end" type="number" step="0.001" class="input-field w-full" />
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="submitIssue" class="btn-primary text-sm">{{ t('common.submitIssue') }}</button>
            <button @click="showNewIssue = false" class="btn-secondary text-sm">{{ t('common.cancel') }}</button>
          </div>
        </div>

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
          <button @click="finish('needs_revision')" class="btn-primary text-sm">
            {{ t('peerReview.requestRevision') }}
          </button>
          <button @click="finish('pass')" class="btn-primary text-sm">
            {{ t('peerReview.passToProducer') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
