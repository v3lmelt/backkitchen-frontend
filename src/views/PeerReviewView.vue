<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { trackApi, issueApi, checklistApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Issue } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()

function createEmptyIssue() {
  return {
    title: '',
    description: '',
    severity: 'major' as const,
    issue_type: 'point' as 'point' | 'range',
    time_start: 0,
    time_end: null as number | null,
    author_id: 0,
    status: 'open' as const,
  }
}

// New issue form
const showNewIssue = ref(false)
const newIssue = ref(createEmptyIssue())

// Checklist
const checklistLabels = ['Mix Balance', 'Low-End', 'Stereo Image', 'Loudness', 'Format Compliance']
const checklist = ref(checklistLabels.map(label => ({
  label,
  passed: false,
  note: '',
})))

onMounted(async () => {
  try {
    const [t, i] = await Promise.all([
      trackApi.get(trackId.value),
      issueApi.listForTrack(trackId.value),
    ])
    track.value = t
    issues.value = i

    // Set to in_review if submitted
    if (t.status === 'submitted') {
      const updated = await trackApi.updateStatus(trackId.value, 'in_review')
      track.value = updated
    }
  } finally {
    loading.value = false
  }
})

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')

function onWaveformClick(time: number) {
  newIssue.value.issue_type = 'point'
  newIssue.value.time_start = Math.round(time * 10) / 10
  newIssue.value.time_end = null
  showNewIssue.value = true
}

function onWaveformRangeSelect(start: number, end: number) {
  newIssue.value.issue_type = 'range'
  newIssue.value.time_start = start
  newIssue.value.time_end = end
  showNewIssue.value = true
}

async function submitIssue() {
  if (!appStore.currentUser) return

  if (newIssue.value.issue_type === 'range') {
    if (newIssue.value.time_end === null) {
      alert('Range issues require an end time.')
      return
    }
    if (newIssue.value.time_end <= newIssue.value.time_start) {
      alert('Range issue end time must be greater than start time.')
      return
    }
  }

  newIssue.value.author_id = appStore.currentUser.id
  const created = await issueApi.create(trackId.value, newIssue.value)
  issues.value = [...issues.value, created].sort((a, b) => a.time_start - b.time_start)
  showNewIssue.value = false
  newIssue.value = createEmptyIssue()
}

async function submitChecklist() {
  if (!appStore.currentUser) return
  await checklistApi.submit(
    trackId.value,
    appStore.currentUser.id,
    checklist.value.map(item => ({
      label: item.label,
      passed: item.passed,
      note: item.note || undefined,
    }))
  )
  alert('Checklist submitted!')
}

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const issueFormTitle = computed(() => {
  if (newIssue.value.issue_type === 'range' && newIssue.value.time_end !== null) {
    return `New Issue from ${formatTime(newIssue.value.time_start)} to ${formatTime(newIssue.value.time_end)}`
  }
  return `New Issue at ${formatTime(newIssue.value.time_start)}`
})

const selectedRange = computed(() => {
  if (!showNewIssue.value || newIssue.value.issue_type !== 'range' || newIssue.value.time_end === null) {
    return null
  }

  return {
    start: newIssue.value.time_start,
    end: newIssue.value.time_end,
  }
})

watch(() => newIssue.value.issue_type, issueType => {
  if (issueType === 'point') {
    newIssue.value.time_end = null
  }
})
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-mono font-bold text-foreground">Review: {{ track.title }}</h1>
        <p class="text-muted-foreground">{{ track.artist }} &middot; v{{ track.version }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <!-- Waveform -->
    <div v-if="audioUrl">
      <p class="text-xs text-muted-foreground mb-2">Click to mark a point issue, or drag across the waveform to create and adjust a range issue.</p>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="issues"
        :selected-range="selectedRange"
        selectable
        @click="onWaveformClick"
        @regionClick="onIssueSelect"
        @rangeSelect="onWaveformRangeSelect"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left: Issues + New Issue Form -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold text-foreground">Issues ({{ issues.length }})</h3>
          <button @click="showNewIssue = !showNewIssue" class="btn-primary text-xs">
            + Add Issue
          </button>
        </div>

        <!-- New Issue Form -->
        <div v-if="showNewIssue" class="card space-y-3 border-primary/50">
          <h4 class="text-sm font-mono font-semibold text-foreground">{{ issueFormTitle }}</h4>
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

      <!-- Right: Checklist -->
      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold text-foreground">Review Checklist</h3>
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
        <button @click="submitChecklist" class="btn-primary text-sm w-full">
          Submit Checklist
        </button>
      </div>
    </div>
  </div>
</template>
