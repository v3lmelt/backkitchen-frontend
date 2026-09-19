import { describe, expect, it } from 'vitest'
import { albumDeadlineInfo } from './albumDeadline'

const now = Date.parse('2026-09-19T12:00:00Z')
const t = (key: string, params: Record<string, number>) => `${key}:${params.days ?? ''}`

describe('albumDeadlineInfo', () => {
  it.each(['2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z'])(
    'hides past and future deadlines for completed albums (%s)', deadline => {
      expect(albumDeadlineInfo({ deadline, is_completed: true }, t, now)).toBeNull()
    },
  )

  it('hides archived, missing and invalid deadlines', () => {
    expect(albumDeadlineInfo({ deadline: '2020-01-01', archived_at: '2026-09-01' }, t, now)).toBeNull()
    expect(albumDeadlineInfo({}, t, now)).toBeNull()
    expect(albumDeadlineInfo({ deadline: 'invalid' }, t, now)).toBeNull()
  })

  it.each([
    ['2026-09-17T12:00:00Z', 'dashboard.deadlineOverdue:2', true],
    ['2026-09-19T12:00:00Z', 'dashboard.deadlineToday:', true],
    ['2026-09-21T12:00:00Z', 'dashboard.deadlineDaysLeft:2', false],
  ] as const)('retains active deadline behavior for %s', (deadline, text, overdue) => {
    expect(albumDeadlineInfo({ deadline, is_completed: false }, t, now)).toEqual({ text, overdue })
  })
})
