<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { checklistApi, issueApi, trackApi } from '@/api'
import type { ChecklistItem, Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'

const route = useRoute()
const router = useRouter()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const existingChecklist = ref<ChecklistItem[]>([])
const error = ref('')
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
  phase: 'peer' as const,
})

const checklistLabels = ['Arrangement', 'Balance', 'Low-End', 'Stereo Image', 'Technical Cleanliness']
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
    alert('Checklist submitted.')
  } catch (err: any) {
    error.value = err.message || 'Request failed.'
  }
}

async function finish(decision: 'needs_revision' | 'pass') {
  error.value = ''
  try {
    await trackApi.finishPeerReview(trackId.value, decision)
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    error.value = err.message || 'Request failed.'
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
        <h1 class="text-2xl font-mono font-bold text-foreground">Peer Review: {{ track.title }}</h1>
        <p class="text-muted-foreground">Assigned reviewer workflow for source v{{ track.version }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <div v-if="error" class="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
      {{ error }}
    </div>

    <div v-if="audioUrl">
      <p class="text-xs text-muted-foreground mb-2">Click the waveform to mark a peer review issue.</p>
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
          <h3 class="text-sm font-mono font-semibold text-foreground">Peer Issues ({{ issues.length }})</h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">
            + Add Issue
          </button>
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
          <div v-if="newIssue.issue_type === 'range'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted-foreground">Start (s)</label>
              <input v-model.number="newIssue.time_start" type="number" step="0.1" class="input-field w-full" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">End (s)</label>
              <input v-model.number="newIssue.time_end" type="number" step="0.1" class="input-field w-full" />
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="submitIssue" class="btn-primary text-sm">Submit Issue</button>
            <button @click="showNewIssue = false" class="btn-secondary text-sm">Cancel</button>
          </div>
        </div>

        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">Peer Review Checklist</h3>
        <div v-for="item in checklist" :key="item.label" class="flex items-start gap-3">
          <input
            type="checkbox"
            v-model="item.passed"
            class="mt-1 rounded border-border bg-card text-primary focus:ring-primary"
          />
          <div class="flex-1">
            <div class="text-sm text-foreground">{{ item.label }}</div>
            <input
              v-model="item.note"
              class="input-field w-full text-xs mt-1"
              placeholder="Notes (optional)"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button @click="submitChecklist" class="btn-secondary text-sm">
            Save Checklist
          </button>
          <button @click="finish('needs_revision')" class="btn-primary text-sm">
            Request Revision
          </button>
          <button @click="finish('pass')" class="btn-primary text-sm">
            Pass to Producer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
