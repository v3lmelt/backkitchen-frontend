import { describe, expect, it } from 'vitest'

import { stepIsMasteringRelated } from './workflow'

describe('stepIsMasteringRelated', () => {
  it('prefers the backend-computed flag when present', () => {
    // Fallback heuristics would disagree with these.
    expect(stepIsMasteringRelated({ id: 'custom', type: 'approval', ui_variant: null, is_mastering_related: true })).toBe(true)
    expect(stepIsMasteringRelated({ id: 'mastering', type: 'delivery', ui_variant: 'mastering', is_mastering_related: false })).toBe(false)
  })

  it('falls back to a mastering-only heuristic when the flag is absent', () => {
    // Mastering flow steps are identified by id/ui_variant, not by being a
    // delivery-type step: a custom delivery step in a non-mastering workflow is
    // NOT mastering-related (narrowed from the previous `type === 'delivery'`
    // broad match).
    expect(stepIsMasteringRelated({ id: 'mastering', type: 'delivery', ui_variant: 'mastering' })).toBe(true)
    expect(stepIsMasteringRelated({ id: 'anything', type: 'delivery', ui_variant: null })).toBe(false)
    expect(stepIsMasteringRelated({ id: 'anything', type: 'approval', ui_variant: 'mastering' })).toBe(true)
    expect(stepIsMasteringRelated({ id: 'mastering_revision', type: 'revision', ui_variant: null })).toBe(true)
    expect(stepIsMasteringRelated({ id: 'peer_review', type: 'review', ui_variant: 'peer_review' })).toBe(false)
  })

  it('treats null/undefined steps and null flags as fallback/false', () => {
    expect(stepIsMasteringRelated(null)).toBe(false)
    expect(stepIsMasteringRelated(undefined)).toBe(false)
    expect(stepIsMasteringRelated({ id: 'peer_review', type: 'review', ui_variant: 'peer_review', is_mastering_related: null })).toBe(false)
  })
})
