<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { trackApi, issueApi, checklistApi } from '@/api'
import type { Track, Issue, ChecklistItem } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'

const route = useRoute()
const router = useRouter()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const checklist = ref<ChecklistItem[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [t, i, c] = await Promise.all([
      trackApi.get(trackId.value),
      issueApi.listForTrack(trackId.value),
      checklistApi.get(trackId.value),
    ])
    track.value = t
    issues.value = i
    checklist.value = c
  } finally {
    loading.value = false
  }
})

const openIssueCount = computed(() => issues.value.filter(i => i.status === 'open').length)
const resolvedCount = computed(() => issues.value.filter(i => i.status === 'resolved').length)
const passedChecks = computed(() => checklist.value.filter(c => c.passed).length)

async function approve() {
  if (!confirm('Approve this track? This will mark it as final.')) return
  await trackApi.updateStatus(trackId.value, 'approved')
  router.push(`/tracks/${trackId.value}`)
}

async function requestRevision() {
  await trackApi.updateStatus(trackId.value, 'revision')
  router.push(`/tracks/${trackId.value}`)
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-mono font-bold text-foreground">Producer Decision: {{ track.title }}</h1>
        <p class="text-muted-foreground">Review all feedback and make a final decision</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        Back to Track
      </button>
    </div>

    <WorkflowProgress :status="track.status" />

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-foreground">{{ issues.length }}</div>
        <div class="text-xs text-muted-foreground">Total Issues</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ openIssueCount }}</div>
        <div class="text-xs text-muted-foreground">Open</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ resolvedCount }}</div>
        <div class="text-xs text-muted-foreground">Resolved</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary">{{ passedChecks }}/{{ checklist.length }}</div>
        <div class="text-xs text-muted-foreground">Checklist Passed</div>
      </div>
    </div>

    <!-- Checklist Review -->
    <div v-if="checklist.length > 0" class="card">
      <h3 class="text-sm font-mono font-semibold text-foreground mb-3">Review Checklist</h3>
      <div class="space-y-2">
        <div v-for="item in checklist" :key="item.id" class="flex items-center gap-3 text-sm">
          <span :class="item.passed ? 'text-success' : 'text-error'">
            {{ item.passed ? '&#10003;' : '&#10005;' }}
          </span>
          <span class="text-foreground">{{ item.label }}</span>
          <span v-if="item.note" class="text-muted-foreground text-xs">- {{ item.note }}</span>
        </div>
      </div>
    </div>

    <!-- Issues Summary -->
    <div class="card">
      <h3 class="text-sm font-mono font-semibold text-foreground mb-3">Issues Summary</h3>
      <div class="space-y-2">
        <div v-for="issue in issues" :key="issue.id" class="flex items-center justify-between py-1">
          <div class="flex items-center gap-2">
            <StatusBadge :status="issue.severity" type="severity" />
            <span class="text-sm text-foreground">{{ issue.title }}</span>
          </div>
          <StatusBadge :status="issue.status" type="issue" />
        </div>
        <div v-if="issues.length === 0" class="text-sm text-muted-foreground">No issues raised.</div>
      </div>
    </div>

    <!-- Decision Buttons -->
    <div class="flex gap-4">
      <button
        @click="approve"
        class="flex-1 bg-success-bg text-success font-medium px-6 py-3 rounded-full text-sm hover:opacity-80 transition-opacity border border-success/30"
      >
        Approve Track
      </button>
      <button
        @click="requestRevision"
        class="flex-1 bg-error-bg text-error font-medium px-6 py-3 rounded-full text-sm hover:opacity-80 transition-opacity border border-error/30"
      >
        Request Revision
      </button>
    </div>
  </div>
</template>
