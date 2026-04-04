import type { TrackStatus } from '@/types'

export const TRACK_STATUS_COLORS: Record<TrackStatus, string> = {
  submitted: '#6b7280',
  peer_review: '#3b82f6',
  peer_revision: '#f59e0b',
  producer_mastering_gate: '#8b5cf6',
  mastering: '#06b6d4',
  mastering_revision: '#f97316',
  final_review: '#ec4899',
  completed: '#10b981',
  rejected: '#ef4444',
}
