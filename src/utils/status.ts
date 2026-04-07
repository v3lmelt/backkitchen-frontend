/** Known status → colour mappings (legacy workflow). */
const KNOWN_COLORS: Record<string, string> = {
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

/** Default colour for custom / unknown step IDs. */
const DEFAULT_COLOR = '#B2B2FF'

/**
 * Look up the colour for any track status string.
 * Falls back to a default for custom workflow step IDs.
 */
export function getTrackStatusColor(status: string): string {
  return KNOWN_COLORS[status] ?? DEFAULT_COLOR
}

/**
 * Legacy export — kept for backward compat.
 * New code should prefer `getTrackStatusColor()`.
 */
export const TRACK_STATUS_COLORS = KNOWN_COLORS as Record<string, string>
