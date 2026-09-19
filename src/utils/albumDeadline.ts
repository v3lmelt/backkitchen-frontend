import type { Album } from '@/types'
import { parseUTC } from '@/utils/time'

type DeadlineAlbum = Pick<Album, 'deadline' | 'is_completed' | 'archived_at'>
type Translate = (key: string, params: Record<string, number>) => string

export function albumDeadlineInfo(
  album: DeadlineAlbum,
  t: Translate,
  now = Date.now(),
): { text: string; overdue: boolean } | null {
  if (album.is_completed || album.archived_at || !album.deadline) return null
  const deadline = parseUTC(album.deadline).getTime()
  if (!Number.isFinite(deadline)) return null
  const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: t('dashboard.deadlineOverdue', { days: Math.abs(diffDays) }), overdue: true }
  if (diffDays === 0) return { text: t('dashboard.deadlineToday', {}), overdue: true }
  return { text: t('dashboard.deadlineDaysLeft', { days: diffDays }), overdue: false }
}
