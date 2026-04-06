<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Issue, Track } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import WorkflowActionBar from '@/components/workflow/WorkflowActionBar.vue'
import type { WorkflowAction } from '@/components/workflow/WorkflowActionBar.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const appStore = useAppStore()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const issueFormRef = ref<InstanceType<typeof IssueCreatePanel>>()

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

const masterAudioUrl = computed(() => track.value?.current_master_delivery ? `${API_ORIGIN}/api/tracks/${trackId.value}/master-audio` : '')
const masterDeliveryId = computed(() => track.value?.current_master_delivery?.id ?? null)

const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(masterAudioUrl, track, '_master')

const currentUserId = computed(() => appStore.currentUser?.id)
const canApprove = computed(() => {
  if (!track.value?.current_master_delivery || !currentUserId.value) return false
  if (currentUserId.value === track.value.producer_id) return !track.value.current_master_delivery.producer_approved_at
  if (currentUserId.value === track.value.submitter_id) return !track.value.current_master_delivery.submitter_approved_at
  return false
})

function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
}

async function approve() {
  await trackApi.approveFinalReview(trackId.value)
  await loadPage()
}

async function returnToMastering() {
  await trackApi.returnToMastering(trackId.value)
  router.push(`/tracks/${trackId.value}`)
}

const workflowActions = computed<WorkflowAction[]>(() => [
  {
    label: t('finalReview.returnToMastering'),
    type: 'return',
    disabled: issues.value.length === 0,
    handler: returnToMastering,
  },
  {
    label: t('finalReview.approveMaster'),
    type: 'advance',
    disabled: !canApprove.value,
    handler: approve,
  },
])
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('finalReview.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('finalReview.subheading') }}</p>
        </div>
        <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="masterAudioUrl">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-muted-foreground">{{ t('finalReview.waveformHint') }}</p>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          :audio-url="masterAudioUrl"
          :issues="issues"
          :selectable="true"
          :selected-range="issueFormRef?.selectedRange ?? null"
          @click="(t: number) => issueFormRef?.handleClick(t)"
          @regionClick="onIssueSelect"
          @rangeSelect="(s: number, e: number) => issueFormRef?.handleRangeSelect(s, e)"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-4">
          <IssueCreatePanel
            ref="issueFormRef"
            :track-id="trackId"
            phase="final_review"
            :master-delivery-id="masterDeliveryId"
            @created="(issue: Issue) => issues.push(issue)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.issuesHeading', { count: issues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <IssueMarkerList :issues="issues" @select="onIssueSelect" />
        </div>

        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('finalReview.approvalStatus') }}</h3>
          <div class="flex items-center justify-between text-sm">
            <span>{{ t('finalReview.producer') }}</span>
            <span :class="track.current_master_delivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
              {{ track.current_master_delivery?.producer_approved_at ? t('common.approved') : t('common.pending') }}
            </span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>{{ t('finalReview.submitter') }}</span>
            <span :class="track.current_master_delivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
              {{ track.current_master_delivery?.submitter_approved_at ? t('common.approved') : t('common.pending') }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <WorkflowActionBar :actions="workflowActions" :hint="t('finalReview.actionHint')" />
  </div>
</template>
