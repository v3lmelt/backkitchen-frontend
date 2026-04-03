<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { issueApi, trackApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Issue, Track } from '@/types'
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

const showNewIssue = ref(false)
const newIssue = ref({
  title: '',
  description: '',
  severity: 'major' as const,
  issue_type: 'point' as 'point' | 'range',
  time_start: 0,
  time_end: null as number | null,
  phase: 'final_review' as const,
})

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    const deliveryId = detail.track.current_master_delivery?.id ?? null
    issues.value = detail.issues.filter(issue => issue.phase === 'final_review' && issue.master_delivery_id === deliveryId)
  } finally {
    loading.value = false
  }
}

const masterAudioUrl = computed(() => track.value?.current_master_delivery ? `/api/tracks/${trackId.value}/master-audio` : '')
const currentUserId = computed(() => appStore.currentUser?.id)
const canApprove = computed(() => {
  if (!track.value?.current_master_delivery || !currentUserId.value) return false
  if (currentUserId.value === track.value.producer_id) return !track.value.current_master_delivery.producer_approved_at
  if (currentUserId.value === track.value.submitter_id) return !track.value.current_master_delivery.submitter_approved_at
  return false
})

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
    phase: 'final_review',
  }
}

async function approve() {
  await trackApi.approveFinalReview(trackId.value)
  await loadPage()
}

async function returnToMastering() {
  await trackApi.returnToMastering(trackId.value)
  router.push(`/tracks/${trackId.value}`)
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
        <h1 class="text-2xl font-mono font-bold text-foreground">Final Review: {{ track.title }}</h1>
        <p class="text-muted-foreground">Producer and submitter both need to approve the current master delivery.</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <div v-if="masterAudioUrl">
      <p class="text-xs text-muted-foreground mb-2">Click the waveform to mark final review issues on the current master.</p>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="masterAudioUrl"
        :issues="issues"
        @click="onWaveformClick"
        @regionClick="onIssueSelect"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold text-foreground">Final Review Issues ({{ issues.length }})</h3>
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
        <h3 class="text-sm font-mono font-semibold text-foreground">Approval Status</h3>
        <div class="flex items-center justify-between text-sm">
          <span>Producer</span>
          <span :class="track.current_master_delivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.producer_approved_at ? 'Approved' : 'Pending' }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span>Submitter</span>
          <span :class="track.current_master_delivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.submitter_approved_at ? 'Approved' : 'Pending' }}
          </span>
        </div>
        <button @click="approve" :disabled="!canApprove" class="btn-primary text-sm w-full">
          Approve Current Master
        </button>
        <button @click="returnToMastering" :disabled="issues.length === 0" class="btn-secondary text-sm w-full">
          Return to Mastering
        </button>
      </div>
    </div>
  </div>
</template>
