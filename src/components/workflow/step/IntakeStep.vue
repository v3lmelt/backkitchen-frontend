<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronLeft } from 'lucide-vue-next'
import type { Issue, Track, WorkflowConfig } from '@/types'
import WorkflowProgress from '@/components/workflow/WorkflowProgress.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'

defineProps<{
  track: Track
  workflowConfig: WorkflowConfig | null
  error: string
  showReconnectBanner: boolean
  wsReconnectAttempts: number
  totalIssueCount: number
  openIssueCount: number
  resolvedIssueCount: number
  audioUrl: string
  waveformIssues: Issue[]
  trackId: number
  downloading: boolean
  downloadProgress: number
  registerWaveform: (el: unknown) => void
}>()

const emit = defineEmits<{
  back: []
  wsRetry: []
  download: []
  waveformReady: [duration: number]
  waveformTimeupdate: [time: number]
  waveformPlaybackStateChange: [isPlaying: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-sans font-bold text-foreground">{{ t('producer.heading', { title: track.title }) }}</h1>
      </div>
      <button @click="emit('back')" class="btn-secondary !px-3 !py-2 flex-shrink-0 self-start" :aria-label="t('common.backToTrack')" :title="t('common.backToTrack')">
        <ChevronLeft class="w-4 h-4" />
      </button>
    </div>

    <WorkflowProgress :status="track.status" :workflow-config="workflowConfig" />

    <div v-if="error" class="card border border-error/40 bg-error-bg text-sm text-error">
      {{ error }}
    </div>

    <div
      v-if="showReconnectBanner"
      class="card border border-warning/40 bg-warning-bg text-xs text-warning flex items-center justify-between gap-3"
    >
      <span class="truncate">{{ wsReconnectAttempts > 0 ? t('trackDetail.liveReconnecting', { n: wsReconnectAttempts }) : t('trackDetail.liveDisconnected') }}</span>
      <button @click="emit('wsRetry')" class="font-mono underline underline-offset-2 hover:no-underline flex-shrink-0">
        {{ t('trackDetail.liveRetryNow') }}
      </button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-foreground">{{ totalIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.cycleIssues') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-error">{{ openIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.open') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-success">{{ resolvedIssueCount }}</div>
        <div class="text-xs text-muted-foreground">{{ t('producer.resolved') }}</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary">{{ track.version }}</div>
        <div class="text-xs text-muted-foreground">{{ t('dashboard.colVersion') }}</div>
      </div>
    </div>

    <div class="card space-y-4 border-primary/50">
      <h3 class="text-sm font-sans font-semibold text-foreground">{{ t('producer.intakeHeading') }}</h3>
    </div>

    <div v-if="audioUrl">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p class="text-xs text-muted-foreground leading-relaxed">{{ t('producer.waveformHint') }}</p>
        <button @click="emit('download')" :disabled="downloading" class="btn-secondary text-xs px-3 py-1 shrink-0">
          {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
        </button>
      </div>
      <WaveformPlayer
        :ref="registerWaveform"
        :audio-url="audioUrl"
        :issues="waveformIssues"
        :track-id="trackId"
        @ready="emit('waveformReady', $event)"
        @timeupdate="emit('waveformTimeupdate', $event)"
        @playbackStateChange="emit('waveformPlaybackStateChange', $event)"
      />
    </div>
  </div>
</template>
