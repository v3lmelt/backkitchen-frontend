import type { Track } from '@/types'

export function trackComposerIds(track: Track | null | undefined): number[] {
  if (!track) return []
  const ids = track.composer_ids?.length ? track.composer_ids : []
  const ordered = track.submitter_id != null ? [track.submitter_id, ...ids] : ids
  return Array.from(new Set(ordered.filter((id): id is number => id != null)))
}

export function isTrackComposer(track: Track | null | undefined, userId: number | null | undefined): boolean {
  if (userId == null) return false
  return trackComposerIds(track).includes(userId)
}

export function trackComposerDisplayNames(track: Track | null | undefined): string[] {
  if (!track) return []
  const usersById = new Map((track.composers ?? []).map(user => [user.id, user.display_name]))
  return trackComposerIds(track).map((id) => {
    if (usersById.has(id)) return usersById.get(id)!
    if (track.submitter?.id === id) return track.submitter.display_name
    return `#${id}`
  })
}

export function trackComposerDisplayText(track: Track | null | undefined, fallback = '--'): string {
  const names = trackComposerDisplayNames(track)
  return names.length ? names.join(' / ') : fallback
}
