import type { Track } from '@/types'

export function trackComposerIds(track: Track | null | undefined): number[] {
  if (!track) return []
  const ids = track.composer_ids?.length ? track.composer_ids : []
  return Array.from(new Set(ids.filter((id): id is number => id != null)))
}

export function isTrackComposer(track: Track | null | undefined, userId: number | null | undefined): boolean {
  if (userId == null) return false
  return trackComposerIds(track).includes(userId)
}

export function isComposerActor(track: Track | null | undefined, userId: number | null | undefined): boolean {
  if (!track || userId == null) return false
  if (isTrackComposer(track, userId)) return true
  if (trackComposerIds(track).length > 0) return false
  if (externalComposerDisplayNames(track).length > 0) return track.producer_id === userId
  return track.submitter_id === userId
}

export function platformComposerDisplayNames(track: Track | null | undefined): string[] {
  if (!track) return []
  const usersById = new Map((track.composers ?? []).map(user => [user.id, user.display_name]))
  return trackComposerIds(track).map((id) => {
    if (usersById.has(id)) return usersById.get(id)!
    if (track.submitter?.id === id) return track.submitter.display_name
    return `#${id}`
  })
}

export function externalComposerDisplayNames(track: Track | null | undefined): string[] {
  if (!track) return []
  if (track.external_composer_names?.length) return track.external_composer_names
  if (track.external_composers?.length) return track.external_composers.map(composer => composer.name)
  return track.external_submitter_name ? [track.external_submitter_name] : []
}

export function trackComposerDisplayNames(track: Track | null | undefined): string[] {
  return [
    ...platformComposerDisplayNames(track),
    ...externalComposerDisplayNames(track),
  ]
}

export function trackComposerDisplayText(track: Track | null | undefined, fallback = '--'): string {
  const names = trackComposerDisplayNames(track)
  return names.length ? names.join(' / ') : fallback
}

export function platformComposerDisplayText(track: Track | null | undefined, fallback = '--'): string {
  const names = platformComposerDisplayNames(track)
  return names.length ? names.join(' / ') : fallback
}

export function externalComposerDisplayText(track: Track | null | undefined, fallback = '--'): string {
  const names = externalComposerDisplayNames(track)
  return names.length ? names.join(' / ') : fallback
}
