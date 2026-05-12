import { describe, expect, it } from 'vitest'
import { TRACK_STATUS_COLORS } from './status'

describe('TRACK_STATUS_COLORS', () => {
  it('has an entry for every track status', () => {
    const statuses = [
      'submitted', 'peer_review', 'peer_revision',
      'producer_mastering_gate', 'mastering', 'mastering_revision',
      'final_review', 'completed', 'rejected',
    ] as const
    for (const status of statuses) {
      expect(TRACK_STATUS_COLORS[status]).toBeTruthy()
    }
  })

  it('uses theme token color format', () => {
    for (const color of Object.values(TRACK_STATUS_COLORS)) {
      expect(color).toMatch(/^rgb\(var\(--color-[a-z-]+\)\)$/)
    }
  })

  it('maps completed and rejected to chart status tokens', () => {
    expect(TRACK_STATUS_COLORS.completed).toBe('rgb(var(--color-chart-completed))')
    expect(TRACK_STATUS_COLORS.rejected).toBe('rgb(var(--color-chart-rejected))')
  })
})
