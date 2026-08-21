import { ref, unref, watch, type MaybeRef } from 'vue'

import { trackApi } from '@/api'
import { useTrackStore } from '@/stores/tracks'
import { emptyMentionCandidates } from '@/utils/mentionCandidates'
import type {
  Issue,
  MasterDelivery,
  MentionCandidates,
  StageAssignment,
  Track,
  TrackDetailResponse,
  TrackSourceVersion,
  WorkflowConfig,
} from '@/types'

export interface TrackDetailBundle {
  detail: TrackDetailResponse
  assignments: StageAssignment[]
}

/**
 * Fetches the track detail together with its review assignments. Assignment
 * lookup failure is tolerated (falls back to an empty list), matching the
 * behavior the track views have always had. Views that manage their own
 * loading state (e.g. the issue detail page) share this instead of
 * `useTrackDetail`.
 */
export async function fetchTrackDetailBundle(trackId: number): Promise<TrackDetailBundle> {
  const detail = await trackApi.get(trackId)
  const assignments = await trackApi.listAssignments(trackId).catch(() => [] as StageAssignment[])
  return { detail, assignments }
}

export interface UseTrackDetailOptions {
  /** Runs at the start of every load, before the request is made. */
  onLoadStart?: () => void
  /** Runs right after the detail payload is applied, before assignments load. */
  onDetailApplied?: (detail: TrackDetailResponse) => void | Promise<void>
  /** Runs after the assignments load; `isCurrent()` reports stale loads. */
  onLoaded?: (detail: TrackDetailResponse, isCurrent: () => boolean) => void | Promise<void>
  /** Runs when the route track id changes, after the core refs are reset. */
  onTrackIdChange?: () => void
  /** Also null the track ref on load failure (default keeps the last track). */
  clearTrackOnError?: boolean
  /** Maps a load failure to the loadError string. */
  errorMessage?: (err: any) => string
}

/**
 * Shared track-detail loading for the track-centric views (workflow step,
 * track detail, mastering). Handles the serialization guard so a stale or
 * superseded load cannot clobber newer state, applies the detail payload to
 * refs (issues filtered to the track's current workflow_cycle; `allIssues`
 * keeps the unfiltered list for cross-cycle metadata such as timeline issue
 * numbers), loads review assignments, and resets everything when the track id
 * changes.
 */
export function useTrackDetail(trackId: MaybeRef<number>, options: UseTrackDetailOptions = {}) {
  const trackStore = useTrackStore()

  const track = ref<Track | null>(null)
  const issues = ref<Issue[]>([])
  const allIssues = ref<Issue[]>([])
  const mentionCandidates = ref<MentionCandidates>(emptyMentionCandidates())
  const sourceVersions = ref<TrackSourceVersion[]>([])
  const masterDeliveries = ref<MasterDelivery[]>([])
  const workflowConfig = ref<WorkflowConfig | null>(null)
  const reviewAssignments = ref<StageAssignment[]>([])
  const loading = ref(true)
  const loadError = ref('')

  const errorMessage = options.errorMessage ?? ((err: any) => err?.message || 'load failed')

  let loadSerial = 0

  async function load() {
    const serial = ++loadSerial
    const requestedTrackId = unref(trackId)
    const isCurrent = () => serial === loadSerial && requestedTrackId === unref(trackId)
    if (!track.value) loading.value = true
    loadError.value = ''
    options.onLoadStart?.()
    try {
      const detail = await trackApi.get(requestedTrackId)
      if (!isCurrent()) return
      track.value = detail.track
      trackStore.setCurrentTrack(detail.track)
      sourceVersions.value = detail.source_versions ?? detail.track.source_versions ?? []
      masterDeliveries.value = detail.master_deliveries ?? []
      workflowConfig.value = detail.workflow_config ?? null
      allIssues.value = detail.issues ?? []
      issues.value = allIssues.value.filter(
        issue => issue.workflow_cycle === detail.track.workflow_cycle,
      )
      mentionCandidates.value = detail.mention_candidates ?? emptyMentionCandidates()
      await options.onDetailApplied?.(detail)
      if (!isCurrent()) return
      try {
        const assignments = await trackApi.listAssignments(requestedTrackId)
        if (!isCurrent()) return
        reviewAssignments.value = assignments
      } catch {
        if (!isCurrent()) return
        reviewAssignments.value = []
      }
      await options.onLoaded?.(detail, isCurrent)
    } catch (err: any) {
      if (!isCurrent()) return
      trackStore.setCurrentTrack(null)
      if (options.clearTrackOnError) track.value = null
      loadError.value = errorMessage(err)
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  watch(() => unref(trackId), () => {
    track.value = null
    issues.value = []
    allIssues.value = []
    mentionCandidates.value = emptyMentionCandidates()
    sourceVersions.value = []
    masterDeliveries.value = []
    workflowConfig.value = null
    reviewAssignments.value = []
    options.onTrackIdChange?.()
    void load()
  })

  return {
    track,
    issues,
    allIssues,
    mentionCandidates,
    sourceVersions,
    masterDeliveries,
    workflowConfig,
    reviewAssignments,
    loading,
    loadError,
    load,
  }
}
