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

export function albumViewerRoleLabel(album: Album, user: User | null | undefined, t: TranslationFn): string {
  if (!user) return ''
  if (album.producer_id === user.id) return t('roles.producer')
  if (album.mastering_engineer_id === user.id) return t('roles.masteringEngineer')
  if (album.viewer_is_album_manager === true) return t('roles.coProducer')
  if (hasAdminRole(user, 'operator')) return t('roles.admin')
  return t('roles.member')
}
