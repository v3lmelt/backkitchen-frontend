<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { trackApi } from '@/api'
import type { Track, Issue, WorkflowEvent } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const events = ref<WorkflowEvent[]>([])
const loading = ref(true)
const waveformRef = ref<InstanceType<typeof WaveformPlayer>>()

onMounted(loadTrack)

async function loadTrack() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    issues.value = detail.issues
    events.value = detail.events
  } finally {
    loading.value = false
  }
}

const audioUrl = computed(() => track.value?.file_path ? `/api/tracks/${trackId.value}/audio` : '')
const currentCycleIssues = computed(() => issues.value.filter(issue => issue.workflow_cycle === track.value?.workflow_cycle))
const actionLabels: Record<string, string> = {
  intake: 'Open Intake',
  peer_review: 'Open Peer Review',
  upload_revision: 'Upload Revision',
  resubmit: 'Resubmit Track',
  producer_gate: 'Open Producer Gate',
  mastering: 'Open Mastering',
  final_review: 'Open Final Review',
}

function onIssueSelect(issue: Issue) {
  waveformRef.value?.seekTo(issue.time_start)
  router.push(`/issues/${issue.id}`)
}

function openPrimaryAction(action: string) {
  if (action === 'peer_review') router.push(`/tracks/${trackId.value}/review`)
  if (action === 'upload_revision' || action === 'resubmit') router.push(`/tracks/${trackId.value}/revision`)
  if (action === 'producer_gate' || action === 'intake') router.push(`/tracks/${trackId.value}/producer`)
  if (action === 'mastering') router.push(`/tracks/${trackId.value}/mastering`)
  if (action === 'final_review') router.push(`/tracks/${trackId.value}/final-review`)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="track" class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <StatusBadge :status="track.status" type="track" />
          <span v-if="track.rejection_mode" class="text-xs text-muted-foreground">
            rejection mode: {{ track.rejection_mode }}
          </span>
        </div>
        <h1 class="text-2xl font-mono font-bold text-foreground">{{ track.title }}</h1>
        <p class="text-muted-foreground">
          {{ track.artist }} · source v{{ track.version }} · cycle {{ track.workflow_cycle }}
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button
          v-for="action in track.allowed_actions"
          :key="action"
          @click="openPrimaryAction(action)"
          class="btn-primary text-sm"
        >
          {{ actionLabels[action] || action.replaceAll('_', ' ') }}
        </button>
      </div>
    </div>

    <div class="card">
      <h3 class="text-sm font-medium text-muted-foreground mb-3">Workflow Status</h3>
      <WorkflowProgress :status="track.status" />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div class="xl:col-span-2 space-y-6">
        <div v-if="audioUrl">
          <h3 class="text-sm font-medium text-muted-foreground mb-2">Current Source Audio</h3>
          <WaveformPlayer
            ref="waveformRef"
            :audio-url="audioUrl"
            :issues="currentCycleIssues"
            @regionClick="onIssueSelect"
          />
        </div>
        <div v-else class="card text-center text-muted-foreground py-8">
          No source audio file uploaded for this track yet.
        </div>

        <div>
          <h3 class="text-sm font-mono font-semibold text-foreground mb-3">
            Issues ({{ currentCycleIssues.length }})
          </h3>
          <IssueMarkerList :issues="currentCycleIssues" @select="onIssueSelect" />
        </div>
      </div>

      <div class="space-y-4">
        <div class="card space-y-2 text-sm">
          <h3 class="text-sm font-mono font-semibold text-foreground">Track Summary</h3>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Submitter</span>
            <span class="text-foreground">{{ track.submitter?.display_name || '--' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Peer Reviewer</span>
            <span class="text-foreground">{{ track.peer_reviewer?.display_name || '--' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Open Issues</span>
            <span class="text-foreground">{{ track.open_issue_count || 0 }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Current Master</span>
            <span class="text-foreground">
              <span v-if="track.current_master_delivery">v{{ track.current_master_delivery.delivery_number }}</span>
              <span v-else>--</span>
            </span>
          </div>
          <div v-if="track.current_master_delivery" class="pt-2 border-t border-border">
            <div class="text-xs text-muted-foreground">Final approvals</div>
            <div class="flex items-center justify-between mt-1">
              <span>Producer</span>
              <span class="text-xs" :class="track.current_master_delivery.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
                {{ track.current_master_delivery.producer_approved_at ? 'Approved' : 'Pending' }}
              </span>
            </div>
            <div class="flex items-center justify-between mt-1">
              <span>Submitter</span>
              <span class="text-xs" :class="track.current_master_delivery.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
                {{ track.current_master_delivery.submitter_approved_at ? 'Approved' : 'Pending' }}
              </span>
            </div>
          </div>
        </div>

        <div class="card space-y-3">
          <h3 class="text-sm font-mono font-semibold text-foreground">Timeline</h3>
          <div v-if="events.length === 0" class="text-sm text-muted-foreground">No workflow events yet.</div>
          <div v-for="event in events" :key="event.id" class="border-b border-border last:border-0 pb-3 last:pb-0">
            <div class="text-sm text-foreground">{{ event.event_type.replaceAll('_', ' ') }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              {{ event.actor?.display_name || 'System' }} · {{ formatDate(event.created_at) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
