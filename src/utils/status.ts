import type { TrackStatus } from '@/types'

export const TRACK_STATUS_COLORS: Record<TrackStatus, string> = {
  submitted: '#B2B2FF',
  peer_review: '#FF8400',
  peer_revision: '#CC6A00',
  producer_mastering_gate: '#B2B2FF',
  mastering: '#FF8400',
  mastering_revision: '#CC6A00',
  final_review: '#B2B2FF',
  completed: '#B6FFCE',
  rejected: '#FF5C33',
}
