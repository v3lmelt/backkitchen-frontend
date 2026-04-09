<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, API_ORIGIN } from '@/api'
import type { Track, Issue, WorkflowConfig, WorkflowStepDef, WorkflowTransitionOption } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssueMarkerList from '@/components/audio/IssueMarkerList.vue'
import IssueCreatePanel from '@/components/IssueCreatePanel.vue'
import { ChevronLeft, Upload } from 'lucide-vue-next'
import { useAudioDownload } from '@/composables/useAudioDownload'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const trackId = computed(() => Number(route.params.id))

const track = ref<Track | null>(null)
const issues = ref<Issue[]>([])
const workflowConfig = ref<WorkflowConfig | null>(null)
const loading = ref(true)
const acting = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)

onMounted(loadPage)

async function loadPage() {
  loading.value = true
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    workflowConfig.value = detail.workflow_config ?? null
    issues.value = detail.issues.filter(
      issue => issue.workflow_cycle === detail.track.workflow_cycle,
    )
  } finally {
    loading.value = false
  }
}

const currentStep = computed<WorkflowStepDef | null>(() => track.value?.workflow_step ?? null)
const transitions = computed<WorkflowTransitionOption[]>(() => track.value?.workflow_transitions ?? [])

const audioUrl = computed(() =>
  track.value?.file_path ? `${API_ORIGIN}/api/tracks/${trackId.value}/audio` : '',
)

const { downloading, downloadProgress, downloadTrackAudio } = useAudioDownload()
const handleDownload = () => downloadTrackAudio(audioUrl, track)

const stepIssues = computed(() =>
  issues.value.filter(i => i.phase === currentStep.value?.id || i.phase === track.value?.status),
)
const waveformIssues = computed(() => {
  const currentVersion = track.value?.version
  if (currentVersion == null) return stepIssues.value
  return stepIssues.value.filter(
    issue => issue.source_version_number == null || issue.source_version_number === currentVersion,
  )
})

async function executeTransition(decision: string) {
  if (!track.value) return
  acting.value = true
  try {
    await trackApi.workflowTransition(trackId.value, decision)
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    alert(err.message || t('workflowStep.transitionFailed'))
  } finally {
    acting.value = false
  }
}

async function handleUpload(kind: 'revision' | 'delivery') {
  if (!uploadFile.value || !track.value) return
  uploading.value = true
  try {
    const fn = kind === 'revision' ? trackApi.uploadSourceVersion : trackApi.uploadMasterDelivery
    await fn(trackId.value, uploadFile.value)
    router.push(`/tracks/${trackId.value}`)
  } catch (err: any) {
    alert(err.message || t('workflowStep.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  uploadFile.value = input.files?.[0] ?? null
}

function goBack() {
  router.push(`/tracks/${trackId.value}`)
}
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto space-y-6">
    <div class="card animate-pulse h-24"></div>
  </div>

  <div v-else-if="!track || !currentStep" class="max-w-4xl mx-auto space-y-6">
    <div class="card text-muted-foreground">{{ t('common.loading') }}</div>
  </div>

  <div v-else class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <button @click="goBack" class="btn-secondary !px-3 !py-2">
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-mono font-bold truncate">{{ track.title }}</h1>
        <p class="text-sm text-muted-foreground mt-0.5">
          {{ currentStep.label }} &middot; {{ track.artist }}
        </p>
      </div>
      <StatusBadge :status="track.status" type="track" />
    </div>

    <!-- Workflow progress -->
    <div class="card">
      <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />
    </div>

    <!-- Gate step: show issues + decision buttons -->
    <template v-if="currentStep.type === 'gate'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-end">
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="audioUrl" :issues="waveformIssues" />
      </div>

      <div v-if="issues.length" class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.issues', { count: issues.length }) }}</h3>
        <IssueMarkerList :issues="waveformIssues" @select="(i) => router.push(`/issues/${i.id}`)" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('common.actions') }}</h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="tr in transitions"
            :key="tr.decision"
            @click="executeTransition(tr.decision)"
            :disabled="acting"
            :class="[
              'btn-primary',
              tr.decision.includes('reject') ? '!bg-error hover:!bg-error/80' : '',
            ]"
          >
            {{ tr.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- Review step: show issues, create issues, decision -->
    <template v-if="currentStep.type === 'review'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-end">
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="audioUrl" :issues="waveformIssues" />
      </div>

      <div class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.issues', { count: stepIssues.length }) }}</h3>
        <IssueMarkerList :issues="waveformIssues" @select="(i) => router.push(`/issues/${i.id}`)" />
      </div>

      <div class="card space-y-4">
        <IssueCreatePanel
          :track-id="trackId"
          :phase="currentStep.id"
          @created="loadPage"
        />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('common.actions') }}</h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="tr in transitions"
            :key="tr.decision"
            @click="executeTransition(tr.decision)"
            :disabled="acting"
            :class="[
              tr.decision === 'return' || tr.decision.includes('revision') ? 'btn-secondary' : 'btn-primary',
            ]"
          >
            {{ tr.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- Revision step: upload new source version -->
    <template v-if="currentStep.type === 'revision'">
      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.uploadRevisedSource') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('workflowStep.uploadRevisedSourceDesc') }}</p>
        <input
          type="file"
          accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
          @change="onFileChange"
          class="input-field"
        />
        <button
          @click="handleUpload('revision')"
          :disabled="!uploadFile || uploading"
          class="btn-primary"
        >
          <Upload class="w-4 h-4 mr-2" />
          {{ uploading ? t('workflowStep.uploading') : t('workflowStep.uploadRevision') }}
        </button>
      </div>

      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.currentAudio') }}</h3>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="audioUrl" :issues="waveformIssues" />
      </div>

      <div v-if="stepIssues.length" class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.issuesToAddress', { count: stepIssues.length }) }}</h3>
        <IssueMarkerList :issues="waveformIssues" @select="(i) => router.push(`/issues/${i.id}`)" />
      </div>
    </template>

    <!-- Delivery step: upload master + transition buttons -->
    <template v-if="currentStep.type === 'delivery'">
      <div v-if="audioUrl" class="card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.sourceAudio') }}</h3>
          <button @click="handleDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
        <WaveformPlayer :audio-url="audioUrl" :issues="waveformIssues" />
      </div>

      <div class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('workflowStep.uploadDelivery') }}</h3>
        <input
          type="file"
          accept=".mp3,.wav,.flac,.ogg,.aac,.m4a,.wma"
          @change="onFileChange"
          class="input-field"
        />
        <button
          @click="handleUpload('delivery')"
          :disabled="!uploadFile || uploading"
          class="btn-primary"
        >
          <Upload class="w-4 h-4 mr-2" />
          {{ uploading ? t('workflowStep.uploading') : t('workflowStep.uploadAndDeliver') }}
        </button>
      </div>

      <div v-if="transitions.length" class="card space-y-4">
        <h3 class="text-sm font-mono font-semibold">{{ t('common.actions') }}</h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="tr in transitions"
            :key="tr.decision"
            @click="executeTransition(tr.decision)"
            :disabled="acting"
            class="btn-secondary"
          >
            {{ tr.label }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
