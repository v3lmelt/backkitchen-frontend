import { masterDeliveryAudioUrl, sourceVersionAudioUrl, trackAudioUrl } from '@/api'
import type { Issue, MasterDelivery, Track, TrackSourceVersion } from '@/types'

type Translate = (key: string, values?: Record<string, string | number>) => string

/** The source record for the physical file, not an external handoff record. */
export function currentPlayableSource(track: Track | null, versions: TrackSourceVersion[] = []): TrackSourceVersion | null {
  if (!track?.file_path) return null
  const current = track.current_source_version
  if (current && current.source_kind !== 'external_link' && current.file_path === track.file_path) return current
  let source: TrackSourceVersion | null = null
  for (const version of versions) {
    if (version.source_kind !== 'external_link' && version.file_path === track.file_path
      && (!source || version.version_number > source.version_number)) source = version
  }
  return source
}

export function currentSourceAudioUrl(track: Track | null, versions: TrackSourceVersion[] = []): string {
  if (!track?.file_path) return ''
  const source = currentPlayableSource(track, versions)
  return source ? sourceVersionAudioUrl(track.id, source) : trackAudioUrl(track.id, track.version)
}

function legacySourceIsUnambiguous(track: Track | null, source: TrackSourceVersion | null, versions: TrackSourceVersion[]): boolean {
  if (!track?.file_path) return false
  const physicalVersion = source?.version_number ?? track.version
  if (physicalVersion !== 1) return false
  return !versions.some(version => version.source_kind !== 'external_link' && version.id !== source?.id)
}

export function issuesForSourceAudio(
  issues: Issue[], source: TrackSourceVersion | null, track: Track | null, allowCurrentLegacy = false,
  versions: TrackSourceVersion[] = track?.source_versions ?? [],
): Issue[] {
  const canUseLegacy = allowCurrentLegacy && legacySourceIsUnambiguous(track, source, versions)
  return issues.filter(issue => {
    if (issue.master_delivery_id != null) return false
    if (issue.source_version_id != null) return source != null && issue.source_version_id === source.id
    return canUseLegacy && issue.source_version_number == null && issue.phase !== 'final_review'
      && track != null && issue.workflow_cycle === track.workflow_cycle
  })
}

export function issuesForMasterAudio(issues: Issue[], delivery: MasterDelivery | null): Issue[] {
  if (!delivery) return []
  return issues.filter(issue => issue.master_delivery_id === delivery.id)
}

export function issueBelongsToCurrentVersion(issue: Issue, track: Track | null, versions: TrackSourceVersion[] = track?.source_versions ?? []): boolean {
  if (!track) return false
  if (issue.master_delivery_id != null) {
    const delivery = track.current_master_delivery
    return delivery != null && issue.master_delivery_id === delivery.id
      && (issue.master_delivery_workflow_cycle == null || issue.master_delivery_workflow_cycle === delivery.workflow_cycle)
  }
  if (issue.source_version_id != null) return issue.source_version_id === track.current_source_version?.id
  if (issue.source_version_number != null || issue.workflow_cycle !== track.workflow_cycle) return false
  return issue.markers.length === 0
    || legacySourceIsUnambiguous(track, currentPlayableSource(track, versions), versions)
}

export function issueOriginLabel(issue: Issue, t: Translate, track: Track | null = null, versions: TrackSourceVersion[] = track?.source_versions ?? []): string {
  if (issue.master_delivery_id != null) {
    const delivery = track?.current_master_delivery?.id === issue.master_delivery_id ? track.current_master_delivery : null
    const number = issue.master_delivery_number ?? delivery?.delivery_number
    const cycle = issue.master_delivery_workflow_cycle ?? delivery?.workflow_cycle
    return number == null || cycle == null ? t('issueHistory.masterOriginUnknown')
      : t('issueHistory.masterOrigin', { cycle, number })
  }
  if (issue.source_version_id != null || issue.source_version_number != null) {
    const source = versions.find(version => version.id === issue.source_version_id)
      ?? (track?.current_source_version?.id === issue.source_version_id ? track.current_source_version : null)
    const number = source?.version_number ?? issue.source_version_number
    return number == null ? t('issueHistory.sourceOriginUnknown') : t('issueHistory.sourceOrigin', { number })
  }
  return t('issueHistory.unboundOrigin', { cycle: issue.workflow_cycle })
}

/** Never substitute a current file for a bound or historical issue's missing audio. */
export function resolveIssueAudio(
  issue: Issue, track: Track | null, versions: TrackSourceVersion[] = track?.source_versions ?? [], deliveries: MasterDelivery[] = [],
): string {
  if (issue.master_delivery_id != null) {
    if (track?.viewer_can_access_master_audio === false) return ''
    if (track?.viewer_is_mastering_participant === false && issue.master_delivery_id !== track.current_master_delivery?.id) return ''
    const delivery = track?.current_master_delivery?.id === issue.master_delivery_id ? track.current_master_delivery
      : deliveries.find(item => item.id === issue.master_delivery_id)
    if (!delivery?.file_path) return ''
    return masterDeliveryAudioUrl(issue.track_id, delivery)
  }
  if (issue.source_version_id != null) {
    const source = versions.find(version => version.id === issue.source_version_id)
      ?? (track?.current_source_version?.id === issue.source_version_id ? track.current_source_version : null)
    if (!source?.file_path || source.source_kind === 'external_link') return ''
    return sourceVersionAudioUrl(issue.track_id, source)
  }
  if (track?.id !== issue.track_id || issue.source_version_number != null || issue.phase === 'final_review'
    || issue.workflow_cycle !== track?.workflow_cycle) return ''
  if (!legacySourceIsUnambiguous(track, currentPlayableSource(track, versions), versions)) return ''
  return currentSourceAudioUrl(track, versions)
}
