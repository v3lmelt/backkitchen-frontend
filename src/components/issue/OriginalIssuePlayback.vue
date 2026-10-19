<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Issue, MasterDelivery, Track, TrackSourceVersion } from '@/types'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import IssuePlaybackPreview from '@/components/issue/IssuePlaybackPreview.vue'
import { useIssuePreviewPlayback } from '@/composables/useIssuePreviewPlayback'
import { issueOriginLabel, resolveIssueAudio } from '@/utils/issueAudio'

const props = defineProps<{ issue: Issue; track?: Track | null; sourceVersions?: TrackSourceVersion[]; masterDeliveries?: MasterDelivery[] }>()
const { t } = useI18n()
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const duration = ref(0)
const currentTime = ref(0)
const isPlaying = ref(false)
const peaks = ref<number[]>([])
const loadFailed = ref(false)
const audioUrl = computed(() => resolveIssueAudio(props.issue, props.track ?? null, props.sourceVersions ?? props.track?.source_versions, props.masterDeliveries))
const available = computed(() => Boolean(audioUrl.value) && !loadFailed.value)
const ready = computed(() => available.value && duration.value > 0)
const playback = useIssuePreviewPlayback({
  selectedIssue: computed(() => props.issue),
  waveformFor: () => ready.value ? waveformRef.value : null,
  currentTimeFor: () => currentTime.value,
  isPlayingFor: () => isPlaying.value,
})

watch([audioUrl, () => props.issue.id], () => {
  void playback.pause()
  duration.value = 0
  currentTime.value = 0
  isPlaying.value = false
  peaks.value = []
  loadFailed.value = false
}, { immediate: true })

async function onReady(value: number) {
  duration.value = value
  await nextTick()
  peaks.value = waveformRef.value?.exportPeaks(400) ?? []
}

async function playFrom(time: number) {
  if (!ready.value) return
  await playback.pause()
  await waveformRef.value?.playFrom(time)
}

defineExpose({ playFrom })
</script>

<template>
  <section class="space-y-2" :aria-label="t('issueHistory.originalAudio')">
    <p class="text-xs font-mono text-muted-foreground">{{ issueOriginLabel(issue, t, track ?? null, sourceVersions) }}</p>
    <p v-if="!available" role="status" class="border border-border bg-background p-3 text-xs text-muted-foreground">
      {{ t('issueHistory.audioUnavailable') }}
    </p>
    <p v-else-if="!ready" role="status" class="text-xs text-muted-foreground">{{ t('common.loading') }}</p>
    <div v-if="available" class="sr-only" aria-hidden="true">
      <WaveformPlayer
        :key="`${issue.id}:${audioUrl}`"
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="[issue]"
        playback-scope="local"
        :show-gain-control="false"
        :height="48"
        @ready="onReady"
        @timeupdate="currentTime = $event"
        @playback-state-change="isPlaying = $event"
        @load-error="loadFailed = true"
      />
    </div>
    <IssuePlaybackPreview
      v-if="ready"
      :issue="issue"
      :duration="duration"
      :current-time="currentTime"
      :is-preview-playing="playback.isPreviewPlaying.value"
      :active-marker-index="playback.activeMarkerIndex.value"
      :peaks="peaks"
      @action="playback.handleAction($event)"
    />
  </section>
</template>
