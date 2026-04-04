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

  it('uses hex color format', () => {
    for (const color of Object.values(TRACK_STATUS_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('maps completed to green and rejected to red', () => {
    expect(TRACK_STATUS_COLORS.completed).toBe('#B6FFCE')
    expect(TRACK_STATUS_COLORS.rejected).toBe('#FF5C33')
  })
})
