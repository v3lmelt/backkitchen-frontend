import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Issue, IssueMarker } from '@/types'

const POINT_MARKER_DURATION = 0.75

interface WaveformApi {
  playFrom?: (time: number) => void | Promise<void>
  seekTo?: (time: number) => void
  togglePlay?: () => void | Promise<void>
}

export type PreviewAction =
  | { type: 'playSequence' }
  | { type: 'playMarker'; index: number }
  | { type: 'pause' }
  | { type: 'seek'; time: number }

export interface IssuePreviewPlaybackDeps {
  selectedIssue: Ref<Issue | null> | ComputedRef<Issue | null>
  waveformFor: (issue: Issue) => WaveformApi | null | undefined
  currentTimeFor: (issue: Issue) => number
  isPlayingFor: (issue: Issue) => boolean
}

interface Segment {
  markerIndex: number
  start: number
  end: number
}

interface Plan {
  issueId: number
  segments: Segment[]
  index: number
}

function makeSegments(markers: IssueMarker[]): Segment[] {
  return markers
    .map<Segment>((marker, markerIndex) => ({
      markerIndex,
      start: marker.time_start,
      end: marker.time_end ?? marker.time_start + POINT_MARKER_DURATION,
    }))
    .sort((a, b) => a.start - b.start)
}

export function useIssuePreviewPlayback(deps: IssuePreviewPlaybackDeps) {
  const plan = ref<Plan | null>(null)

  const activeIssue = computed(() => deps.selectedIssue.value)

  const activeMarkerIndex = computed<number | null>(() => {
    const current = plan.value
    const issue = activeIssue.value
    if (!current || !issue || current.issueId !== issue.id) return null
    return current.segments[current.index]?.markerIndex ?? null
  })

  const isPreviewPlaying = computed<boolean>(() => {
    const issue = activeIssue.value
    if (!plan.value || !issue || plan.value.issueId !== issue.id) return false
    return deps.isPlayingFor(issue)
  })

  // Advance plan as currentTime crosses segment boundaries.
  watch(
    () => {
      const issue = activeIssue.value
      return issue ? deps.currentTimeFor(issue) : 0
    },
    (time) => {
      const current = plan.value
      const issue = activeIssue.value
      if (!current || !issue || current.issueId !== issue.id) return
      const segment = current.segments[current.index]
      if (!segment) return
      if (time < segment.end) return

      const nextIndex = current.index + 1
      const next = current.segments[nextIndex]
      if (!next) {
        plan.value = null
        if (deps.isPlayingFor(issue)) {
          void deps.waveformFor(issue)?.togglePlay?.()
        }
        return
      }
      plan.value = { ...current, index: nextIndex }
      // Only seek forward if there's a gap; otherwise let playback flow naturally.
      if (time < next.start - 0.05) {
        deps.waveformFor(issue)?.seekTo?.(next.start)
      }
    },
  )

  // Clear plan if the selected issue changes to a different one, or unselected.
  watch(
    () => activeIssue.value?.id ?? null,
    (id) => {
      if (plan.value && plan.value.issueId !== id) {
        plan.value = null
      }
    },
  )

  async function playSequence() {
    const issue = activeIssue.value
    if (!issue) return
    const segments = makeSegments(issue.markers)
    if (!segments.length) return
    plan.value = { issueId: issue.id, segments, index: 0 }
    await deps.waveformFor(issue)?.playFrom?.(segments[0].start)
  }

  async function playMarker(index: number) {
    const issue = activeIssue.value
    if (!issue) return
    const marker = issue.markers[index]
    if (!marker) return
    const segment: Segment = {
      markerIndex: index,
      start: marker.time_start,
      end: marker.time_end ?? marker.time_start + POINT_MARKER_DURATION,
    }
    plan.value = { issueId: issue.id, segments: [segment], index: 0 }
    await deps.waveformFor(issue)?.playFrom?.(segment.start)
  }

  async function pause() {
    const issue = activeIssue.value
    plan.value = null
    if (issue && deps.isPlayingFor(issue)) {
      await deps.waveformFor(issue)?.togglePlay?.()
    }
  }

  function seek(time: number) {
    const issue = activeIssue.value
    if (!issue) return
    plan.value = null
    deps.waveformFor(issue)?.seekTo?.(time)
  }

  async function handleAction(action: PreviewAction) {
    switch (action.type) {
      case 'playSequence':
        await playSequence()
        break
      case 'playMarker':
        await playMarker(action.index)
        break
      case 'pause':
        await pause()
        break
      case 'seek':
        seek(action.time)
        break
    }
  }

  return {
    activeMarkerIndex,
    isPreviewPlaying,
    handleAction,
    playSequence,
    playMarker,
    pause,
    seek,
  }
}
