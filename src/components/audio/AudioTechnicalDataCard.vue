<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, CircleAlert, Clock3 } from 'lucide-vue-next'
import type { AudioAnalysis } from '@/types'

const props = withDefaults(defineProps<{
  analysis?: AudioAnalysis | null
  title?: string
  summary?: boolean
  defaultChannelsExpanded?: boolean
}>(), {
  summary: false,
  defaultChannelsExpanded: false,
})

const { t } = useI18n()
const expanded = ref(props.defaultChannelsExpanded)
const result = computed(() => props.analysis?.result ?? null)

function metric(value: number | null | undefined, unit: string, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${value.toFixed(digits)} ${unit}`
}

function rate(value: number | null | undefined): string {
  if (!value) return '--'
  return value % 1000 === 0 ? `${value / 1000} kHz` : `${value} Hz`
}

function duration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function bitrate(value: number | null | undefined): string {
  if (!value) return '--'
  return `${Math.round(value / 1000)} kbps`
}

const isPcmAudio = computed(() => {
  const value = result.value
  if (!value) return false
  const codec = value.codec?.toLowerCase() ?? ''
  return codec.startsWith('pcm_')
})

const sampleFormatLabel = computed(() => {
  const value = result.value
  if (!value) return '--'
  if (value.sample_format && ['pcm_s16', 'pcm_s24', 'pcm_s32', 'pcm_f32'].includes(value.sample_format)) {
    return t(`audioAnalysis.sampleFormats.${value.sample_format}`)
  }
  return value.bit_depth ? t('audioAnalysis.sampleFormats.pcmUnknown', { depth: value.bit_depth }) : value.sample_format ?? '--'
})

const formatLabel = computed(() => {
  const value = result.value
  if (!value) return '--'
  const parts = [(value.container ?? value.codec ?? '--').toUpperCase()]
  if (isPcmAudio.value) parts.push(sampleFormatLabel.value)
  parts.push(rate(value.sample_rate_hz))
  return parts.join(' · ')
})

const channelCount = computed(() => Math.max(
  result.value?.sample_peak_dbfs_by_channel.length ?? 0,
  result.value?.true_peak_dbtp_by_channel.length ?? 0,
  result.value?.dc_offset_by_channel.length ?? 0,
))
</script>

<template>
  <div class="border border-border bg-background p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h4 class="text-sm font-mono font-semibold text-foreground">
          {{ title || t('audioAnalysis.title') }}
        </h4>
        <p v-if="result" class="mt-1 text-xs text-muted-foreground">{{ formatLabel }}</p>
      </div>
      <span
        v-if="analysis"
        class="rounded-full px-2 py-1 text-[11px] font-mono"
        :class="analysis.status === 'ready'
          ? 'bg-success-bg text-success'
          : analysis.status === 'failed'
            ? 'bg-error-bg text-error'
            : 'bg-warning-bg text-warning'"
      >
        {{ t(`audioAnalysis.status.${analysis.status}`) }}
      </span>
    </div>

    <div v-if="!analysis || analysis.status === 'pending' || analysis.status === 'processing'" class="flex items-start gap-2 text-xs text-muted-foreground">
      <Clock3 class="mt-0.5 h-3.5 w-3.5 text-warning" :stroke-width="2" />
      <span>{{ t('audioAnalysis.waiting') }}</span>
    </div>
    <div v-else-if="analysis.status === 'failed'" class="flex items-start gap-2 text-xs text-error">
      <CircleAlert class="mt-0.5 h-3.5 w-3.5" :stroke-width="2" />
      <span>{{ analysis.error || t('audioAnalysis.failed') }}</span>
    </div>
    <p v-else-if="analysis.status === 'not_applicable'" class="text-xs text-muted-foreground">
      {{ t('audioAnalysis.notApplicable') }}
    </p>

    <details v-else-if="result" class="space-y-3">
      <summary class="cursor-pointer text-xs text-muted-foreground">{{ t('audioAnalysis.details') }}</summary>
      <div class="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
        <div>
          <div class="text-[11px] text-muted-foreground">{{ t('audioAnalysis.samplePeak') }}</div>
          <div class="mt-0.5 text-sm font-mono text-foreground">{{ result.peak_status === 'silence' ? '−∞ dBFS' : metric(result.sample_peak_dbfs, 'dBFS') }}</div>
        </div>
        <div>
          <div class="text-[11px] text-muted-foreground">{{ t('audioAnalysis.truePeak') }}</div>
          <div class="mt-0.5 text-sm font-mono text-foreground">{{ result.peak_status === 'silence' ? '−∞ dBTP' : metric(result.true_peak_dbtp, 'dBTP') }}</div>
        </div>
        <div>
          <div class="text-[11px] text-muted-foreground">{{ t('audioAnalysis.dcOffset') }}</div>
          <div class="mt-0.5 text-sm font-mono text-foreground">{{ metric(result.dc_offset, '', 6) }}</div>
        </div>
        <div>
          <div class="text-[11px] text-muted-foreground">{{ t('audioAnalysis.integrated') }}</div>
          <div class="mt-0.5 text-sm font-mono text-foreground">{{ result.integrated_lufs == null ? t(`audioAnalysis.validity.${result.integrated_status ?? 'unavailable'}`) : metric(result.integrated_lufs, 'LUFS') }}</div>
        </div>
        <div>
          <div class="text-[11px] text-muted-foreground">{{ t('audioAnalysis.lra') }}</div>
          <div class="mt-0.5 text-sm font-mono text-foreground">{{ result.loudness_range_lu == null ? t(`audioAnalysis.validity.${result.lra_status ?? 'unavailable'}`) : metric(result.loudness_range_lu, 'LU') }}</div>
        </div>
      </div>

      <p v-if="result.lra_status === 'short_programme'" class="text-xs text-muted-foreground">{{ t('audioAnalysis.shortProgramme') }}</p>
      <dl v-if="!summary" class="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border pt-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt class="text-muted-foreground">{{ t('audioAnalysis.codec') }}</dt>
          <dd class="mt-0.5 break-all font-mono text-foreground">{{ result.codec || '--' }}</dd>
        </div>
        <div v-if="isPcmAudio">
          <dt class="text-muted-foreground">{{ t('audioAnalysis.sampleFormat') }}</dt>
          <dd class="mt-0.5 font-mono text-foreground">{{ sampleFormatLabel }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">{{ t('audioAnalysis.channels') }}</dt>
          <dd class="mt-0.5 font-mono text-foreground">
            {{ result.channels ?? '--' }}<span v-if="result.channel_layout"> · {{ result.channel_layout }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">{{ t('audioAnalysis.duration') }}</dt>
          <dd class="mt-0.5 font-mono text-foreground">{{ duration(result.duration_seconds) }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">{{ t('audioAnalysis.bitrate') }}</dt>
          <dd class="mt-0.5 font-mono text-foreground">{{ bitrate(result.bitrate_bps) }}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">{{ t('audioAnalysis.analyzerVersion') }}</dt>
          <dd class="mt-0.5 font-mono text-foreground">v{{ result.analyzer_version }}</dd>
        </div>
      </dl>
      <p v-if="result.ffmpeg_version" class="break-all text-xs text-muted-foreground">{{ result.ffmpeg_version }}</p>

      <button
        v-if="!summary && channelCount > 0"
        type="button"
        class="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': expanded }" :stroke-width="2" />
        {{ expanded ? t('audioAnalysis.hideChannels') : t('audioAnalysis.showChannels') }}
      </button>

      <div v-if="!summary && expanded" class="overflow-x-auto border-t border-border pt-3">
        <table class="w-full min-w-[480px] text-left text-xs">
          <thead class="text-muted-foreground">
            <tr>
              <th class="pb-2 font-normal">{{ t('audioAnalysis.channel') }}</th>
              <th class="pb-2 font-normal">{{ t('audioAnalysis.samplePeak') }}</th>
              <th class="pb-2 font-normal">{{ t('audioAnalysis.truePeak') }}</th>
              <th class="pb-2 font-normal">{{ t('audioAnalysis.dcOffset') }}</th>
            </tr>
          </thead>
          <tbody class="font-mono text-foreground">
            <tr v-for="index in channelCount" :key="index" class="border-t border-border">
              <td class="py-2">CH {{ index }}</td>
              <td class="py-2">{{ metric(result.sample_peak_dbfs_by_channel[index - 1], 'dBFS') }}</td>
              <td class="py-2">{{ metric(result.true_peak_dbtp_by_channel[index - 1], 'dBTP') }}</td>
              <td class="py-2">{{ metric(result.dc_offset_by_channel[index - 1], '', 6) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>
