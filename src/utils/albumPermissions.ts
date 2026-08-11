import type { Album, User } from '@/types'
import { hasAdminRole } from '@/utils/admin'

type TranslationFn = (key: string) => string

export function viewerCanManageAlbum(
  entity: { producer_id: number | null; viewer_is_album_manager?: boolean },
  user: User | null | undefined,
): boolean {
  if (!user) return false
  return entity.viewer_is_album_manager === true || entity.producer_id === user.id || hasAdminRole(user, 'operator')
}

export function viewerCanForceTrackStatus(
  entity: { viewer_can_force_track_status?: boolean },
  user: User | null | undefined,
): boolean {
  if (!user) return false
  return entity.viewer_can_force_track_status === true || hasAdminRole(user, 'operator')
}

export function viewerCanAccessAlbum(album: Album, user: User | null | undefined): boolean {
  if (!user) return false
  return (
    viewerCanManageAlbum(album, user) ||
    album.mastering_engineer_id === user.id ||
    album.members.some(member => member.user_id === user.id)
  )
}

export type AlbumViewerRole =
  | 'producer'
  | 'masteringEngineer'
  | 'circleOwner'
  | 'coProducer'
  | 'admin'
  | 'member'

const ALBUM_VIEWER_ROLE_BADGE_CLASSES: Record<AlbumViewerRole, string> = {
  producer: 'bg-warning-bg text-warning',
  masteringEngineer: 'bg-info-bg text-info',
  circleOwner: 'bg-warning-bg text-warning',
  coProducer: 'bg-success-bg text-success',
  admin: 'bg-info-bg text-info',
  member: 'bg-border text-foreground',
}

export function albumViewerRole(album: Album, user: User | null | undefined): AlbumViewerRole | null {
  if (!user) return null
  if (album.producer_id === user.id) return 'producer'
  if (album.mastering_engineer_id === user.id) return 'masteringEngineer'
  if (album.viewer_circle_role === 'owner') return 'circleOwner'
  if (album.viewer_circle_role === 'co_producer') return 'coProducer'
  if (hasAdminRole(user, 'operator')) return 'admin'
  if (album.viewer_is_album_manager === true) return 'coProducer'
  return 'member'
}

export function albumViewerRoleLabel(album: Album, user: User | null | undefined, t: TranslationFn): string {
  const role = albumViewerRole(album, user)
  return role ? t(`roles.${role}`) : ''
}

export function albumViewerRoleBadgeClass(album: Album, user: User | null | undefined): string {
  const role = albumViewerRole(album, user)
  return role ? ALBUM_VIEWER_ROLE_BADGE_CLASSES[role] : 'bg-border text-foreground'
}
