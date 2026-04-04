<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, trackApi } from '@/api'
import type { Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import { formatTimestamp, roundToMilliseconds } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()
const masterFile = ref<File | null>(null)
const uploading = ref(false)

const showNewIssue = ref(false)
const newIssue = ref({
  title: '',
  description: '',
  severity: 'major' as const,
  issue_type: 'point' as 'point' | 'range',
  time_start: 0,
  time_end: null as number | null,
  phase: 'mastering' as const,
})

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues.filter(issue => issue.phase === 'mastering' && issue.workflow_cycle === detail.track.workflow_cycle)
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
    phase: 'mastering',
  }
}

async function requestRevision() {
  await trackApi.requestMasteringRevision(trackId.value)
  router.push(`/tracks/${trackId.value}`)
}

function onMasterFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  masterFile.value = input.files?.[0] || null
}

async function uploadMasterDelivery() {
  if (!masterFile.value) return
  uploading.value = true
  try {
    await trackApi.uploadMasterDelivery(trackId.value, masterFile.value)
    router.push(`/tracks/${trackId.value}`)
  } finally {
    uploading.value = false
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
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('mastering.heading', { title: track.title }) }}</h1>
        <p class="text-muted-foreground">{{ t('mastering.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <div v-if="audioUrl">
      <p class="text-xs text-muted-foreground mb-2">{{ t('mastering.waveformHint') }}</p>
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
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: issues.length }) }}</h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">{{ t('common.addIssue') }}</button>
        </div>

        <div v-if="showNewIssue" class="card space-y-3 border-primary/50">
          <h4 class="text-sm font-sans font-semibold text-foreground">{{ t('common.newIssueAt', { time: formatTime(newIssue.time_start) }) }}</h4>
          <input v-model="newIssue.title" class="input-field w-full" :placeholder="t('common.issueTitlePlaceholder')" />
          <textarea v-model="newIssue.description" class="input-field w-full h-20 resize-none" :placeholder="t('common.descriptionPlaceholder')" />
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

        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.actionsHeading') }}</h3>
        <button @click="requestRevision" class="btn-secondary text-sm w-full">
          {{ t('mastering.requestRevision') }}
        </button>
        <div class="border-t border-border pt-4 space-y-3">
          <div class="text-sm text-muted-foreground">{{ t('mastering.uploadReady') }}</div>
          <input type="file" accept="audio/*" @change="onMasterFileSelect" class="input-field w-full" />
          <button
            @click="uploadMasterDelivery"
            :disabled="!masterFile || uploading"
            :class="[
              'w-full text-sm font-medium px-4 py-3 rounded-full transition-colors',
              !masterFile || uploading ? 'bg-border text-muted-foreground cursor-not-allowed' : 'btn-primary'
            ]"
          >
            {{ uploading ? t('mastering.uploading') : t('mastering.uploadMaster') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
