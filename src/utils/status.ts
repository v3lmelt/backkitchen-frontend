/** Known status → colour mappings (legacy workflow). */
const KNOWN_COLORS: Record<string, string> = {
  submitted: 'rgb(var(--color-chart-intake))',
  intake: 'rgb(var(--color-chart-intake))',
  peer_review: 'rgb(var(--color-chart-review))',
  peer_revision: 'rgb(var(--color-chart-revision))',
  peer_review_revision: 'rgb(var(--color-chart-revision))',
  producer_mastering_gate: 'rgb(var(--color-chart-gate))',
  producer_gate: 'rgb(var(--color-chart-gate))',
  producer_gate_revision: 'rgb(var(--color-chart-revision))',
  producer_revision: 'rgb(var(--color-chart-revision))',
  mastering: 'rgb(var(--color-chart-mastering))',
  mastering_revision: 'rgb(var(--color-chart-revision))',
  final_review: 'rgb(var(--color-chart-gate))',
  completed: 'rgb(var(--color-chart-completed))',
  rejected: 'rgb(var(--color-chart-rejected))',
}

/** Default colour for custom / unknown step IDs. */
const DEFAULT_COLOR = 'rgb(var(--color-chart-fallback))'

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
