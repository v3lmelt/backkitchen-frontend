import { describe, expect, it } from 'vitest'
import { roundToMilliseconds, formatRelativeTime, formatLocaleDate, formatTimestamp } from './time'

describe('roundToMilliseconds', () => {
  it('rounds to 3 decimal places', () => {
    expect(roundToMilliseconds(1.23456)).toBe(1.235)
    expect(roundToMilliseconds(0)).toBe(0)
    expect(roundToMilliseconds(5.1)).toBe(5.1)
    expect(roundToMilliseconds(99.9999)).toBe(100)
  })
})

describe('formatRelativeTime', () => {
  it('returns "just now" for < 1 min in en', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now, 'en')).toBe('just now')
  })

  it('returns minutes ago in en', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
    expect(formatRelativeTime(fiveMinAgo, 'en')).toBe('5m ago')
  })

  it('returns hours ago in en', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString()
    expect(formatRelativeTime(twoHoursAgo, 'en')).toBe('2h ago')
  })

  it('returns days ago in en', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    expect(formatRelativeTime(threeDaysAgo, 'en')).toBe('3d ago')
  })

  it('returns zh-CN variants', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now, 'zh-CN')).toBe('刚刚')

    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
    expect(formatRelativeTime(fiveMinAgo, 'zh-CN')).toBe('5分钟前')

    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString()
    expect(formatRelativeTime(twoHoursAgo, 'zh-CN')).toBe('2小时前')

    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    expect(formatRelativeTime(threeDaysAgo, 'zh-CN')).toBe('3天前')
  })
})

describe('formatLocaleDate', () => {
  it('formats a date for en locale', () => {
    const result = formatLocaleDate('2024-06-15T14:30:00Z', 'en')
    expect(result).toBeTruthy()
  })

  it('formats a date for zh-CN locale', () => {
    const result = formatLocaleDate('2024-06-15T14:30:00Z', 'zh-CN')
    expect(result).toBeTruthy()
  })
})

describe('formatTimestamp', () => {
  it('formats 0 seconds', () => {
    expect(formatTimestamp(0)).toBe('0:00.000')
  })

  it('formats whole seconds', () => {
    expect(formatTimestamp(5)).toBe('0:05.000')
    expect(formatTimestamp(65)).toBe('1:05.000')
  })

  it('formats fractional seconds', () => {
    expect(formatTimestamp(3.456)).toBe('0:03.456')
  })

  it('handles negative input as 0', () => {
    expect(formatTimestamp(-5)).toBe('0:00.000')
  })

  it('handles milliseconds rounding to 1000', () => {
    // 59.9999 -> ms rounds to 1000, so carry to next second
    expect(formatTimestamp(59.9999)).toBe('1:00.000')
  })

  it('pads seconds with leading zero', () => {
    expect(formatTimestamp(2.1)).toBe('0:02.100')
  })

  it('pads milliseconds with leading zeros', () => {
    expect(formatTimestamp(1.005)).toBe('0:01.005')
  })
})
