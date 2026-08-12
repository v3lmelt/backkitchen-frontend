import { describe, expect, it } from 'vitest'
import { anonTokenFor, hashId } from './hash'

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

describe('anonTokenFor', () => {
  it('prefers the server-computed anon_token when present', () => {
    expect(anonTokenFor({ id: 1, anon_token: 'SERVER' })).toBe('SERVER')
  })

  it('falls back to the local hash of the user id', () => {
    expect(anonTokenFor({ id: 1 })).toBe(hashId(1))
    expect(anonTokenFor({ id: 1, anon_token: null })).toBe(hashId(1))
  })

  it('falls back to the explicit id when no user object is embedded', () => {
    expect(anonTokenFor(null, 42)).toBe(hashId(42))
    expect(anonTokenFor(undefined, 42)).toBe(hashId(42))
  })

  it('returns an empty string when nothing identifies the user', () => {
    expect(anonTokenFor(null)).toBe('')
  })
})
