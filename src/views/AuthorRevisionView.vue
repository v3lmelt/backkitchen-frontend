<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { trackApi, issueApi } from '@/api'
import type { Track, Issue, IssueStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)

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

const openIssues = computed(() => issues.value.filter(i => i.status === 'open'))
const respondedIssues = computed(() => issues.value.filter(i => i.status !== 'open'))

async function respondToIssue(issue: Issue, status: IssueStatus) {
  const updated = await issueApi.update(issue.id, { status })
  const idx = issues.value.findIndex(i => i.id === issue.id)
  if (idx !== -1) issues.value[idx] = updated
}

async function submitRevision() {
  await trackApi.updateStatus(trackId.value, 'in_review')
  router.push(`/tracks/${trackId.value}`)
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-mono font-bold text-foreground">Revision: {{ track.title }}</h1>
        <p class="text-muted-foreground">Respond to review issues and upload revised version</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-3 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ openIssues.length }}</div>
        <div class="text-xs text-muted-foreground">Open Issues</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warning">
          {{ issues.filter(i => i.status === 'will_fix').length }}
        </div>
        <div class="text-xs text-muted-foreground">Will Fix</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">
          {{ issues.filter(i => i.status === 'resolved' || i.status === 'disagreed').length }}
        </div>
        <div class="text-xs text-muted-foreground">Resolved/Disagreed</div>
      </div>
    </div>

    <!-- Open Issues -->
    <div v-if="openIssues.length > 0">
      <h3 class="text-sm font-mono font-semibold text-foreground mb-3">Open Issues - Needs Response</h3>
      <div class="space-y-3">
        <div v-for="issue in openIssues" :key="issue.id" class="card">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <StatusBadge :status="issue.severity" type="severity" />
                <span class="text-xs text-muted-foreground">{{ formatTime(issue.time_start) }}</span>
              </div>
              <h4 class="text-sm font-medium text-foreground">{{ issue.title }}</h4>
              <p class="text-xs text-muted-foreground mt-1">{{ issue.description }}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="respondToIssue(issue, 'will_fix')" class="btn-primary text-xs">
                Will Fix
              </button>
              <button @click="respondToIssue(issue, 'disagreed')" class="btn-secondary text-xs">
                Disagree
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Responded Issues -->
    <div v-if="respondedIssues.length > 0">
      <h3 class="text-sm font-mono font-semibold text-foreground mb-3">Responded Issues</h3>
      <div class="space-y-2">
        <div v-for="issue in respondedIssues" :key="issue.id" class="card opacity-75">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <StatusBadge :status="issue.status" type="issue" />
              <span class="text-sm text-foreground">{{ issue.title }}</span>
            </div>
            <span class="text-xs text-muted-foreground">{{ formatTime(issue.time_start) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Submit Revision -->
    <div class="card border-primary/50">
      <h3 class="text-sm font-mono font-semibold text-foreground mb-2">Upload Revised Version</h3>
      <p class="text-xs text-muted-foreground mb-3">
        Upload your revised audio file after addressing the issues above.
      </p>
      <div class="flex gap-3">
        <label class="btn-secondary text-sm cursor-pointer">
          Choose File
          <input type="file" accept="audio/*" class="hidden" />
        </label>
        <button
          @click="submitRevision"
          :disabled="openIssues.length > 0"
          :class="[
            'text-sm font-medium px-4 py-2 rounded-full transition-colors',
            openIssues.length > 0
              ? 'bg-border text-muted-foreground cursor-not-allowed'
              : 'btn-primary'
          ]"
        >
          Submit for Re-Review
        </button>
      </div>
      <p v-if="openIssues.length > 0" class="text-xs text-warning mt-2">
        Please respond to all open issues before submitting.
      </p>
    </div>
  </div>
</template>
