<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { issueApi, trackApi } from '@/api'
import type { Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'

const route = useRoute()
const router = useRouter()
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
  newIssue.value.time_start = Math.round(time * 10) / 10
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
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-mono font-bold text-foreground">Mastering Review: {{ track.title }}</h1>
        <p class="text-muted-foreground">Review the current source audio, request revisions, or deliver mastered audio.</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <div v-if="audioUrl">
      <p class="text-xs text-muted-foreground mb-2">Click the waveform to create mastering issues.</p>
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
          <h3 class="text-sm font-mono font-semibold text-foreground">Mastering Issues ({{ issues.length }})</h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">+ Add Issue</button>
        </div>

        <div v-if="showNewIssue" class="card space-y-3 border-primary/50">
          <h4 class="text-sm font-mono font-semibold text-foreground">New Issue at {{ formatTime(newIssue.time_start) }}</h4>
          <input v-model="newIssue.title" class="input-field w-full" placeholder="Issue title" />
          <textarea v-model="newIssue.description" class="input-field w-full h-20 resize-none" placeholder="Description..." />
          <div class="grid grid-cols-2 gap-3">
            <select v-model="newIssue.severity" class="input-field">
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="suggestion">Suggestion</option>
            </select>
            <select v-model="newIssue.issue_type" class="input-field">
              <option value="point">Point</option>
              <option value="range">Range</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button @click="submitIssue" class="btn-primary text-sm">Submit Issue</button>
            <button @click="showNewIssue = false" class="btn-secondary text-sm">Cancel</button>
          </div>
        </div>

        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">Mastering Actions</h3>
        <button @click="requestRevision" class="btn-secondary text-sm w-full">
          Request Source Revision
        </button>
        <div class="border-t border-border pt-4 space-y-3">
          <div class="text-sm text-muted-foreground">Upload mastered delivery when ready.</div>
          <input type="file" accept="audio/*" @change="onMasterFileSelect" class="input-field w-full" />
          <button
            @click="uploadMasterDelivery"
            :disabled="!masterFile || uploading"
            :class="[
              'w-full text-sm font-medium px-4 py-3 rounded-full transition-colors',
              !masterFile || uploading ? 'bg-border text-muted-foreground cursor-not-allowed' : 'btn-primary'
            ]"
          >
            {{ uploading ? 'Uploading...' : 'Upload Master Delivery' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
