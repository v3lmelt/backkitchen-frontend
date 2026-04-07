<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, r2Api, uploadToR2, uploadWithProgress, API_ORIGIN } from '@/api'
import type { Issue, Track } from '@/types'
import { useAppStore } from '@/stores/app'
import { extractAudioDuration } from '@/utils/audio'
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
const masterFile = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)

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

const audioUrl = computed(() => track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio` : '')
const waveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return issues.value
  return issues.value.filter(issue => issue.source_version_number == null || issue.source_version_number === currentVersion)
})

const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

function onIssueSelect(issue: Issue) {
  router.push(`/issues/${issue.id}`)
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
  uploadProgress.value = 0
  try {
    if (appStore.r2Enabled) {
      const file = masterFile.value
      const [presigned, duration] = await Promise.all([
        r2Api.requestMasterDeliveryUpload(trackId.value, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (p) => {
        uploadProgress.value = p
      })
      await r2Api.confirmMasterDeliveryUpload(trackId.value, {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
      })
    } else {
      const form = new FormData()
      form.append('file', masterFile.value)
      await uploadWithProgress(
        `/tracks/${trackId.value}/master-deliveries`, form, (p) => { uploadProgress.value = p }
      )
    }
    router.push(`/tracks/${trackId.value}`)
  } finally {
    uploading.value = false
  }
}

const workflowActions = computed<WorkflowAction[]>(() => [
  {
    label: t('mastering.requestRevision'),
    type: 'return',
    handler: requestRevision,
  },
  {
    label: uploading.value ? t('mastering.uploading') : t('mastering.uploadMaster'),
    type: 'advance',
    disabled: !masterFile.value || uploading.value,
    handler: uploadMasterDelivery,
  },
])
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="track" class="min-h-full flex flex-col">
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('mastering.heading', { title: track.title }) }}</h1>
          <p class="text-sm sm:text-base text-muted-foreground">{{ t('mastering.subheading') }}</p>
        </div>
        <button @click="router.push(`/tracks/${trackId}`)" class="btn-secondary text-sm flex-shrink-0 self-start">
          {{ t('common.backToTrack') }}
        </button>
      </div>

      <div v-if="audioUrl">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-muted-foreground">{{ t('mastering.waveformHint') }}</p>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer
          :audio-url="audioUrl"
          :issues="waveformIssues"
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
            phase="mastering"
            @created="(issue: Issue) => issues.push(issue)"
          >
            <template #heading>
              <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.issuesHeading', { count: issues.length }) }}</h3>
            </template>
          </IssueCreatePanel>

          <IssueMarkerList :issues="issues" :current-source-version-number="track.version" @select="onIssueSelect" />
        </div>

        <div class="card space-y-4">
          <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('mastering.actionsHeading') }}</h3>
          <div class="text-sm text-muted-foreground">{{ t('mastering.uploadReady') }}</div>
          <input type="file" accept="audio/*" @change="onMasterFileSelect" class="input-field w-full" />
          <div v-if="uploading" class="space-y-1">
            <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
          </div>
        </div>
      </div>
    </div>

    <WorkflowActionBar :actions="workflowActions" :hint="t('mastering.actionHint')" />
  </div>
</template>
