<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi, trackApi } from '@/api'
import type { Issue, IssueStatus, Track } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatTimestamp } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    const phase = detail.track.status === 'mastering_revision' ? 'mastering' : 'peer'
    issues.value = detail.issues.filter(issue => issue.phase === phase && issue.workflow_cycle === detail.track.workflow_cycle)
  } finally {
    loading.value = false
  }
}

const pendingIssues = computed(() => issues.value.filter(issue => issue.status === 'open'))
const respondedIssues = computed(() => issues.value.filter(issue => issue.status !== 'open'))
const revisionLabel = computed(() =>
  track.value?.status === 'mastering_revision'
    ? t('revision.masteringRevision')
    : t('revision.peerRevision')
)
const uploadButtonLabel = computed(() =>
  track.value?.status === 'mastering_revision'
    ? t('revision.submitBackToMastering')
    : t('revision.submitBackToPeer')
)

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

async function respondToIssue(issue: Issue, status: IssueStatus) {
  const updated = await issueApi.update(issue.id, { status })
  const idx = issues.value.findIndex(entry => entry.id === issue.id)
  if (idx !== -1) issues.value[idx] = updated
}

async function submitRevision() {
  if (!selectedFile.value) return
  uploading.value = true
  try {
    await trackApi.uploadSourceVersion(trackId.value, selectedFile.value)
    router.push(`/tracks/${trackId.value}`)
  } finally {
    uploading.value = false
  }
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
        <h1 class="text-2xl font-sans font-bold text-foreground">{{ revisionLabel }}: {{ track.title }}</h1>
        <p class="text-muted-foreground">{{ t('revision.subheading') }}</p>
      </div>
      <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm">
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ pendingIssues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.openCount') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warning">{{ issues.filter(issue => issue.status === 'will_fix').length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.willFixCount') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ respondedIssues.length }}</div>
        <div class="text-xs text-muted-foreground">{{ t('revision.respondedCount') }}</div>
      </div>
    </div>

    <div v-if="pendingIssues.length > 0">
      <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('revision.openIssuesHeading') }}</h3>
      <div class="space-y-3">
        <div v-for="issue in pendingIssues" :key="issue.id" class="card">
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
              <button @click="respondToIssue(issue, 'will_fix')" class="btn-primary text-xs">{{ t('revision.willFix') }}</button>
              <button @click="respondToIssue(issue, 'disagreed')" class="btn-secondary text-xs">{{ t('revision.disagree') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="respondedIssues.length > 0">
      <h3 class="text-sm font-sans font-semibold text-foreground mb-3">{{ t('revision.respondedIssuesHeading') }}</h3>
      <div class="space-y-2">
        <div v-for="issue in respondedIssues" :key="issue.id" class="card opacity-80">
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

    <div class="card border-primary/50 space-y-3">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('revision.uploadHeading') }}</h3>
      <p class="text-xs text-muted-foreground">{{ t('revision.uploadHint') }}</p>
      <input type="file" accept="audio/*" @change="onFileSelect" class="input-field w-full" />
      <button
        @click="submitRevision"
        :disabled="!selectedFile || uploading"
        :class="[
          'text-sm font-medium px-4 py-2 rounded-full transition-colors',
          !selectedFile || uploading ? 'bg-border text-muted-foreground cursor-not-allowed' : 'btn-primary'
        ]"
      >
        {{ uploading ? t('revision.uploading') : uploadButtonLabel }}
      </button>
    </div>
  </div>
</template>
