<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { trackApi, issueApi } from '@/api'
import type { Track, Issue } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const trackId = computed(() => Number(route.params.id))
const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()

onMounted(async () => {
  try {
    const [t, i] = await Promise.all([
      trackApi.get(trackId.value),
      issueApi.listForTrack(trackId.value),
    ])
    track.value = t
    issues.value = i
  } finally {
    loading.value = false
  }
})

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  router.push(`/issues/${issue.id}`)
}

function goToReview() {
  router.push(`/tracks/${trackId.value}/review`)
}

function goToRevision() {
  router.push(`/tracks/${trackId.value}/revision`)
}

function goToDecision() {
  router.push(`/tracks/${trackId.value}/decision`)
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-mono font-bold text-foreground">{{ track.title }}</h1>
        <p class="text-muted-foreground">{{ track.artist }} &middot; v{{ track.version }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="track.status === 'submitted' || track.status === 'revision'"
          @click="goToReview"
          class="btn-primary text-sm"
        >
          Start Review
        </button>
        <button
          v-if="track.status === 'in_review'"
          @click="goToRevision"
          class="btn-secondary text-sm"
        >
          Author Revision
        </button>
        <button
          v-if="track.status === 'in_review'"
          @click="goToDecision"
          class="btn-primary text-sm"
        >
          Producer Decision
        </button>
      </div>
    </div>

    <!-- Workflow Progress -->
    <div class="card">
      <h3 class="text-sm font-medium text-muted-foreground mb-3">Workflow Status</h3>
      <WorkflowProgress :status="track.status" />
    </div>

    <!-- Waveform -->
    <div v-if="audioUrl">
      <h3 class="text-sm font-medium text-muted-foreground mb-2">Waveform</h3>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="issues"
        @regionClick="onIssueSelect"
      />
    </div>
    <div v-else class="card text-center text-muted-foreground py-8">
      No audio file uploaded
    </div>

    <!-- Track Info + Issues -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Info -->
      <div class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">Track Info</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Status</span>
            <StatusBadge :status="track.status" type="track" />
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">BPM</span>
            <span class="text-foreground">{{ track.bpm || '--' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Version</span>
            <span class="text-foreground">v{{ track.version }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Issues</span>
            <span class="text-foreground">{{ issues.length }}</span>
          </div>
        </div>
      </div>

      <!-- Issues List -->
      <div class="lg:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-mono font-semibold text-foreground">Issues ({{ issues.length }})</h3>
        </div>
        <IssueMarkerList :issues="issues" @select="onIssueSelect" />
      </div>
    </div>
  </div>
</template>
