<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, trackApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { ChecklistItem, Issue, Track } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const appStore = useAppStore()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const allCycleIssues = ref<Issue[]>([])
const checklist = ref<ChecklistItem[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()

const showNewIssue = ref(false)
const newIssue = ref({
  title: '',
  description: '',
  severity: 'major' as const,
  issue_type: 'point' as 'point' | 'range',
  time_start: 0,
  time_end: null as number | null,
  phase: 'producer' as const,
})

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    allCycleIssues.value = detail.issues.filter(
      issue => issue.workflow_cycle === detail.track.workflow_cycle,
    )
    checklist.value = detail.checklist_items
  } finally {
    loading.value = false
  }
}

const isSubmittedState = computed(() => track.value?.status === 'submitted')
const isMasteringGateState = computed(() => track.value?.status === 'producer_mastering_gate')

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')

const producerIssues = computed(() =>
  allCycleIssues.value.filter(i => i.phase === 'producer'),
)
const peerIssues = computed(() =>
  allCycleIssues.value.filter(i => i.phase !== 'producer'),
)

const selectedRange = computed(() => {
  if (newIssue.value.issue_type === 'range' && showNewIssue.value && newIssue.value.time_end !== null) {
    return { start: newIssue.value.time_start, end: newIssue.value.time_end }
  }
  return null
})

function onWaveformClick(time: number) {
  newIssue.value.issue_type = 'point'
  newIssue.value.time_start = roundToMilliseconds(time)
  newIssue.value.time_end = null
  showNewIssue.value = true
}

function onRangeSelect(start: number, end: number) {
  newIssue.value.issue_type = 'range'
  newIssue.value.time_start = start
  newIssue.value.time_end = end
  showNewIssue.value = true
}

watch(() => newIssue.value.issue_type, (type) => {
  if (type === 'point') newIssue.value.time_end = null
})

async function submitIssue() {
  const created = await issueApi.create(trackId.value, newIssue.value)
  allCycleIssues.value.push(created)
  showNewIssue.value = false
  newIssue.value = {
    title: '',
    description: '',
    severity: 'major',
    issue_type: 'point',
    time_start: 0,
    time_end: null,
    phase: 'producer',
  }
}

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  waveformRef.value?.highlightIssue(issue)
}

async function handleIntake(decision: 'accept' | 'reject_final' | 'reject_resubmittable') {
  await trackApi.intakeDecision(trackId.value, decision)
  router.push(`/tracks/${trackId.value}`)
}

async function handleGate(decision: 'send_to_mastering' | 'request_peer_revision') {
  await trackApi.producerGate(trackId.value, decision)
  router.push(`/tracks/${trackId.value}`)
}

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
        <p class="text-muted-foreground">{{ t('producer.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <WorkflowProgress :status="track.status" />

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-foreground">{{ allCycleIssues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ allCycleIssues.filter(i => i.status === 'open').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ allCycleIssues.filter(i => i.status === 'resolved').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary">{{ checklist.filter(item => item.passed).length }}/{{ checklist.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.checklistPassed') }}</div>
      </div>
    </div>

    <div v-if="isSubmittedState" class="card space-y-4 border-primary/50">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.intakeHeading') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('producer.intakeDesc') }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button @click="handleIntake('accept')" class="btn-primary text-sm">{{ t('producer.acceptAndAssign') }}</button>
        <button @click="handleIntake('reject_final')" class="btn-secondary text-sm">{{ t('producer.rejectFinal') }}</button>
        <button @click="handleIntake('reject_resubmittable')" class="btn-secondary text-sm">{{ t('producer.rejectResubmittable') }}</button>
      </div>
    </div>

    <template v-if="isMasteringGateState">
      <!-- Waveform Player -->
      <div v-if="audioUrl">
        <p class="text-xs text-muted-foreground mb-2">{{ t('producer.waveformHint') }}</p>
        <WaveformPlayer
          ref="waveformRef"
          :audio-url="audioUrl"
          :issues="producerIssues"
          :selectable="true"
          :selected-range="selectedRange"
          @click="onWaveformClick"
          @regionClick="onIssueSelect"
          @rangeSelect="onRangeSelect"
        />
      </div>

      <!-- Producer Issues -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-sans font-semibold text-foreground">
            {{ t('producer.producerIssuesHeading', { count: producerIssues.length }) }}
          </h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">
            {{ t('common.addIssue') }}
          </button>
        </div>

        <div v-if="showNewIssue" class="card space-y-3 border-primary/50">
          <h4 class="text-sm font-sans font-semibold text-foreground">
            {{ t('common.newIssueAt', { time: formatTime(newIssue.time_start) }) }}
          </h4>
          <input v-model="newIssue.title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
          <textarea v-model="newIssue.description" class="textarea-field w-full h-20" :placeholder="t('common.descriptionPlaceholder')" />
          <div class="grid grid-cols-2 gap-3">
            <select v-model="newIssue.severity" class="select-field">
              <option value="critical">{{ t('severity.critical') }}</option>
              <option value="major">{{ t('severity.major') }}</option>
              <option value="minor">{{ t('severity.minor') }}</option>
              <option value="suggestion">{{ t('severity.suggestion') }}</option>
            </select>
            <select v-model="newIssue.issue_type" class="select-field">
              <option value="point">{{ t('issueType.point') }}</option>
              <option value="range">{{ t('issueType.range') }}</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button @click="submitIssue" class="btn-primary text-sm">{{ t('common.submitIssue') }}</button>
            <button @click="showNewIssue = false" class="btn-secondary text-sm">{{ t('common.cancel') }}</button>
          </div>
        </div>

        <IssueMarkerList :issues="producerIssues" @select="onIssueSelect" />
      </div>

      <!-- Checklist -->
      <div v-if="checklist.length > 0" class="card">
        <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.checklistHeading') }}</h3>
        <div class="space-y-2">
          <div v-for="item in checklist" :key="item.id" class="flex items-center gap-3 text-sm">
            <span :class="item.passed ? 'text-success' : 'text-error'">
              {{ item.passed ? 'OK' : 'NG' }}
            </span>
            <span class="text-foreground">{{ item.label }}</span>
            <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
          </div>
        </div>
      </div>

      <!-- Peer Issue Summary -->
      <div class="card">
        <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('producer.peerIssueSummaryHeading') }}</h3>
        <div class="space-y-2">
          <div v-for="issue in peerIssues" :key="issue.id" class="flex items-center justify-between py-1">
            <div class="flex items-center gap-2">
              <StatusBadge :status="issue.phase" type="phase" />
              <StatusBadge :status="issue.severity" type="severity" />
              <span class="text-sm text-foreground">{{ issue.title }}</span>
            </div>
            <StatusBadge :status="issue.status" type="issue" />
          </div>
          <div v-if="peerIssues.length === 0" class="text-sm text-muted-foreground">{{ t('producer.noIssues') }}</div>
        </div>
      </div>

      <!-- Gate Decision -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button @click="handleGate('send_to_mastering')" class="btn-primary text-sm py-3">
          {{ t('producer.sendToMastering') }}
        </button>
        <button @click="handleGate('request_peer_revision')" class="btn-secondary text-sm py-3">
          {{ t('producer.requestRevision') }}
        </button>
      </div>
    </template>
  </div>
</template>
