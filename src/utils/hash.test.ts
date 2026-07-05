import { describe, expect, it } from 'vitest'
import { hashId } from './hash'

function legacyHashId(id: number): string {
  let h = 2166136261
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase()
}

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

  it('rotates ids away from the legacy hash', () => {
    expect(hashId(1)).not.toBe(legacyHashId(1))
  })
})
