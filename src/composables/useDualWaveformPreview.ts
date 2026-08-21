import { computed, nextTick, ref, type Ref } from 'vue'
import type { Issue } from '@/types'
import type WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import { useIssuePreviewPlayback, type PreviewAction } from '@/composables/useIssuePreviewPlayback'

type WaveformInstance = InstanceType<typeof WaveformPlayer>

interface DualWaveformPreviewDeps {
  selectedIssue: Ref<Issue | null>
  sourceWaveformRef: Ref<WaveformInstance | null>
  masterWaveformRef: Ref<WaveformInstance | null>
  usesMasterWaveform?: (issue: Issue | null) => boolean
}

export function useDualWaveformPreview({
  selectedIssue,
  sourceWaveformRef,
  masterWaveformRef,
  usesMasterWaveform,
}: DualWaveformPreviewDeps) {
  const sourceWaveformDuration = ref(0)
  const sourceWaveformCurrentTime = ref(0)
  const sourceWaveformIsPlaying = ref(false)
  const sourceWaveformPeaks = ref<number[]>([])
  const masterWaveformDuration = ref(0)
  const masterWaveformCurrentTime = ref(0)
  const masterWaveformIsPlaying = ref(false)
  const masterWaveformPeaks = ref<number[]>([])

  function issueUsesMasterWaveform(issue: Issue | null): boolean {
    if (usesMasterWaveform) return usesMasterWaveform(issue)
    return issue?.phase === 'final_review'
  }

  function onSourceWaveformReady(nextDuration: number) {
    sourceWaveformDuration.value = nextDuration
    nextTick(() => {
      sourceWaveformPeaks.value = sourceWaveformRef.value?.exportPeaks?.(400) ?? []
    })
  }

  function onSourceWaveformTimeUpdate(time: number) {
    sourceWaveformCurrentTime.value = time
  }

  function onSourceWaveformPlaybackStateChange(isPlaying: boolean) {
    sourceWaveformIsPlaying.value = isPlaying
  }

  function onMasterWaveformReady(nextDuration: number) {
    masterWaveformDuration.value = nextDuration
    nextTick(() => {
      masterWaveformPeaks.value = masterWaveformRef.value?.exportPeaks?.(400) ?? []
    })
  }

  function onMasterWaveformTimeUpdate(time: number) {
    masterWaveformCurrentTime.value = time
  }

  function onMasterWaveformPlaybackStateChange(isPlaying: boolean) {
    masterWaveformIsPlaying.value = isPlaying
  }

  function resetDualWaveformState() {
    sourceWaveformDuration.value = 0
    sourceWaveformCurrentTime.value = 0
    sourceWaveformIsPlaying.value = false
    sourceWaveformPeaks.value = []
    masterWaveformDuration.value = 0
    masterWaveformCurrentTime.value = 0
    masterWaveformIsPlaying.value = false
    masterWaveformPeaks.value = []
  }

  function previewTimeForIssue(issue: Issue | null): number {
    return issueUsesMasterWaveform(issue) ? masterWaveformCurrentTime.value : sourceWaveformCurrentTime.value
  }

  function previewDurationForIssue(issue: Issue | null): number {
    return issueUsesMasterWaveform(issue) ? masterWaveformDuration.value : sourceWaveformDuration.value
  }

  function previewIsPlayingForIssue(issue: Issue | null): boolean {
    return issueUsesMasterWaveform(issue) ? masterWaveformIsPlaying.value : sourceWaveformIsPlaying.value
  }

  function previewWaveformForIssue(issue: Issue | null) {
    return issueUsesMasterWaveform(issue) ? masterWaveformRef.value : sourceWaveformRef.value
  }

  function previewPeaksForIssue(issue: Issue | null): number[] {
    return issueUsesMasterWaveform(issue) ? masterWaveformPeaks.value : sourceWaveformPeaks.value
  }

  const issuePreviewPlayback = useIssuePreviewPlayback({
    selectedIssue,
    waveformFor: (issue) => previewWaveformForIssue(issue),
    currentTimeFor: (issue) => previewTimeForIssue(issue),
    isPlayingFor: (issue) => previewIsPlayingForIssue(issue),
  })

  const selectedIssuePreview = computed(() => {
    if (!selectedIssue.value) return null
    const duration = previewDurationForIssue(selectedIssue.value)
    if (duration <= 0) return null
    return {
      duration,
      currentTime: previewTimeForIssue(selectedIssue.value),
      isPreviewPlaying: issuePreviewPlayback.isPreviewPlaying.value,
      activeMarkerIndex: issuePreviewPlayback.activeMarkerIndex.value,
      peaks: previewPeaksForIssue(selectedIssue.value),
    }
  })

  async function handleIssuePreviewPlayAt(time: number) {
    await previewWaveformForIssue(selectedIssue.value)?.playFrom?.(time)
  }

  function handleIssuePreviewAction(_issue: Issue, action: PreviewAction) {
    void issuePreviewPlayback.handleAction(action)
  }

  return {
    sourceWaveformDuration,
    sourceWaveformCurrentTime,
    sourceWaveformIsPlaying,
    sourceWaveformPeaks,
    masterWaveformDuration,
    masterWaveformCurrentTime,
    masterWaveformIsPlaying,
    masterWaveformPeaks,
    issueUsesMasterWaveform,
    onSourceWaveformReady,
    onSourceWaveformTimeUpdate,
    onSourceWaveformPlaybackStateChange,
    onMasterWaveformReady,
    onMasterWaveformTimeUpdate,
    onMasterWaveformPlaybackStateChange,
    resetDualWaveformState,
    previewTimeForIssue,
    previewDurationForIssue,
    previewIsPlayingForIssue,
    previewWaveformForIssue,
    previewPeaksForIssue,
    issuePreviewPlayback,
    selectedIssuePreview,
    handleIssuePreviewPlayAt,
    handleIssuePreviewAction,
  }
}
