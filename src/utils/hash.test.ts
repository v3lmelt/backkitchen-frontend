import { describe, expect, it } from 'vitest'
import { hashId } from './hash'

describe('hashId', () => {
  it('returns a 6-character uppercase hex string', () => {
    const result = hashId(1)
    expect(result).toMatch(/^[0-9A-F]{6}$/)
  })

  it('is deterministic', () => {
    expect(hashId(42)).toBe(hashId(42))
  })

  it('produces different hashes for different ids', () => {
    expect(hashId(1)).not.toBe(hashId(2))
    expect(hashId(100)).not.toBe(hashId(101))
  })

  it('handles 0', () => {
    const result = hashId(0)
    expect(result).toMatch(/^[0-9A-F]{6}$/)
  })

  it('handles large numbers', () => {
    const result = hashId(999999)
    expect(result).toMatch(/^[0-9A-F]{6}$/)
  })
})
