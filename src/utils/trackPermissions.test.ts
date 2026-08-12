import { describe, expect, it } from 'vitest'

import type { MasterDelivery, Track, User, WorkflowStepDef } from '@/types'

import {
  canUserApproveFinal,
  canViewerSeeMastering,
  isFinalReviewStep,
  requiredReviewerCount,
  resolveStepAssigneeUserId,
  reviewAllowsInternalIssueVisibility,
  viewerCanManageTrackAlbum,
  viewerIsStepAssignee,
} from './trackPermissions'

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    title: 'Track',
    artist: 'Artist',
    album_id: 1,
    submitter_id: 10,
    producer_id: 20,
    mastering_engineer_id: 30,
    peer_reviewer_id: 40,
    file_path: '/audio.wav',
    version: 1,
    workflow_cycle: 1,
    status: 'final_review',
    allowed_actions: [],
    workflow_transitions: [],
    workflow_step: null,
    current_source_version: null,
    current_master_delivery: null,
    ...overrides,
  } as Track
}

function makeUser(id: number): User {
  return { id, username: `u${id}`, display_name: `User ${id}` } as User
}

function makeStep(overrides: Partial<WorkflowStepDef> = {}): WorkflowStepDef {
  return {
    id: 'step',
    label: 'Step',
    type: 'review',
    assignee_role: 'submitter',
    order: 1,
    transitions: {},
    ...overrides,
  } as WorkflowStepDef
}

function makeDelivery(overrides: Partial<MasterDelivery> = {}): MasterDelivery {
  return {
    id: 1,
    workflow_cycle: 1,
    delivery_number: 1,
    file_path: '/master.wav',
    confirmed_at: '2026-01-01T00:00:00Z',
    producer_approved_at: null,
    submitter_approved_at: null,
    ...overrides,
  } as MasterDelivery
}

describe('viewerCanManageTrackAlbum', () => {
  it('is false without a track or user', () => {
    expect(viewerCanManageTrackAlbum(null, makeUser(20))).toBe(false)
    expect(viewerCanManageTrackAlbum(makeTrack(), null)).toBe(false)
  })

  it('is true for the album producer and flagged managers', () => {
    expect(viewerCanManageTrackAlbum(makeTrack(), makeUser(20))).toBe(true)
    expect(viewerCanManageTrackAlbum(makeTrack({ viewer_is_album_manager: true } as Partial<Track>), makeUser(99))).toBe(true)
    expect(viewerCanManageTrackAlbum(makeTrack(), makeUser(99))).toBe(false)
  })
})

describe('canViewerSeeMastering', () => {
  it('allows composer actor, album manager and mastering engineer', () => {
    const track = makeTrack()
    expect(canViewerSeeMastering(track, 10, false)).toBe(true) // submitter fallback composer actor
    expect(canViewerSeeMastering(track, 99, true)).toBe(true) // album manager
    expect(canViewerSeeMastering(track, 30, false)).toBe(true) // mastering engineer
    expect(canViewerSeeMastering(track, 42, false)).toBe(false)
    expect(canViewerSeeMastering(track, null, true)).toBe(false)
    expect(canViewerSeeMastering(null, 10, false)).toBe(false)
  })

  it('prefers the server-computed participant flag over local derivation', () => {
    // Local derivation would say false for user 42, true for the engineer 30.
    expect(canViewerSeeMastering(makeTrack({ viewer_is_mastering_participant: true }), 42, false)).toBe(true)
    expect(canViewerSeeMastering(makeTrack({ viewer_is_mastering_participant: false }), 30, false)).toBe(false)
  })
})

describe('resolveStepAssigneeUserId', () => {
  it('prefers the assignee_user_id override', () => {
    expect(resolveStepAssigneeUserId(makeTrack(), makeStep({ assignee_user_id: 77 }))).toBe(77)
  })

  it('maps roles to track-level user ids', () => {
    const track = makeTrack()
    expect(resolveStepAssigneeUserId(track, makeStep({ assignee_role: 'submitter' }))).toBe(10)
    expect(resolveStepAssigneeUserId(track, makeStep({ assignee_role: 'producer' }))).toBe(20)
    expect(resolveStepAssigneeUserId(track, makeStep({ assignee_role: 'mastering_engineer' }))).toBe(30)
    expect(resolveStepAssigneeUserId(track, makeStep({ assignee_role: 'peer_reviewer' }))).toBe(40)
  })

  it('parses literal member:<id> role specs', () => {
    expect(resolveStepAssigneeUserId(makeTrack(), makeStep({ assignee_role: 'member:55' }))).toBe(55)
    expect(resolveStepAssigneeUserId(makeTrack(), makeStep({ assignee_role: 'member:abc' }))).toBe(null)
  })

  it('returns null for unknown roles or missing data', () => {
    expect(resolveStepAssigneeUserId(makeTrack(), makeStep({ assignee_role: 'other' }))).toBe(null)
    expect(resolveStepAssigneeUserId(null, makeStep())).toBe(null)
    expect(resolveStepAssigneeUserId(makeTrack(), null)).toBe(null)
  })
})

describe('viewerIsStepAssignee', () => {
  it('submitter steps accept any composer actor unless overridden', () => {
    const track = makeTrack()
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'submitter' }), 10, false)).toBe(true)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'submitter' }), 11, false)).toBe(false)
    // Override beats the role special case.
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'submitter', assignee_user_id: 11 }), 11, false)).toBe(true)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'submitter', assignee_user_id: 11 }), 10, false)).toBe(false)
  })

  it('producer steps accept any album manager unless overridden', () => {
    const track = makeTrack()
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'producer' }), 99, true)).toBe(true)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'producer' }), 20, false)).toBe(false)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'producer', assignee_user_id: 20 }), 20, false)).toBe(true)
  })

  it('other roles compare the resolved user id', () => {
    const track = makeTrack()
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'mastering_engineer' }), 30, false)).toBe(true)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'mastering_engineer' }), 31, false)).toBe(false)
    expect(viewerIsStepAssignee(track, makeStep({ assignee_role: 'other' }), 31, false)).toBe(false)
  })

  it('prefers the server flag when it describes the same current step', () => {
    const step = makeStep({ id: 'peer_review', assignee_role: 'peer_reviewer' })
    // Local derivation would say false for user 11 / true for user 40.
    const yesTrack = makeTrack({ workflow_step: step, viewer_is_step_assignee: true })
    expect(viewerIsStepAssignee(yesTrack, step, 11, false)).toBe(true)
    const noTrack = makeTrack({ workflow_step: step, viewer_is_step_assignee: false })
    expect(viewerIsStepAssignee(noTrack, step, 40, false)).toBe(false)
  })

  it('ignores the server flag when asking about a different step', () => {
    const current = makeStep({ id: 'peer_review', assignee_role: 'peer_reviewer' })
    const other = makeStep({ id: 'mastering', assignee_role: 'mastering_engineer' })
    const track = makeTrack({ workflow_step: current, viewer_is_step_assignee: false })
    expect(viewerIsStepAssignee(track, other, 30, false)).toBe(true)
  })
})

describe('requiredReviewerCount', () => {
  it('fixed assignment mode derives the quorum from the assignment count', () => {
    const step = makeStep({ assignment_mode: 'fixed', required_reviewer_count: 5 })
    expect(requiredReviewerCount(step, 3)).toBe(3)
    expect(requiredReviewerCount(step, 0)).toBe(1)
  })

  it('otherwise uses the configured count with a floor of 1', () => {
    expect(requiredReviewerCount(makeStep({ required_reviewer_count: 3 }), 1)).toBe(3)
    expect(requiredReviewerCount(makeStep({ required_reviewer_count: null }), 4)).toBe(1)
    expect(requiredReviewerCount(null, 4)).toBe(1)
  })

  it('fallbackToAssignmentCount preserves the track-detail display semantics', () => {
    expect(requiredReviewerCount(makeStep({ assignment_mode: 'fixed' }), 2, { fallbackToAssignmentCount: true })).toBe(2)
    expect(requiredReviewerCount(makeStep({ required_reviewer_count: 3 }), 2, { fallbackToAssignmentCount: true })).toBe(3)
    expect(requiredReviewerCount(makeStep({ required_reviewer_count: null }), 2, { fallbackToAssignmentCount: true })).toBe(2)
  })
})

describe('reviewAllowsInternalIssueVisibility', () => {
  it('requires a review step with more than one reviewer in scope', () => {
    expect(reviewAllowsInternalIssueVisibility(makeStep({ type: 'review', required_reviewer_count: 2 }), 0)).toBe(true)
    expect(reviewAllowsInternalIssueVisibility(makeStep({ type: 'review', required_reviewer_count: 1 }), 2)).toBe(true)
    expect(reviewAllowsInternalIssueVisibility(makeStep({ type: 'review', required_reviewer_count: 1 }), 1)).toBe(false)
    expect(reviewAllowsInternalIssueVisibility(makeStep({ type: 'delivery' }), 5)).toBe(false)
    expect(reviewAllowsInternalIssueVisibility(null, 5)).toBe(false)
  })

  it('fixed mode counts assignments (canonical WorkflowStepView semantics)', () => {
    const step = makeStep({ type: 'review', assignment_mode: 'fixed', required_reviewer_count: null })
    expect(reviewAllowsInternalIssueVisibility(step, 2)).toBe(true)
    expect(reviewAllowsInternalIssueVisibility(step, 1)).toBe(false)
  })
})

describe('isFinalReviewStep', () => {
  it('matches approval steps with the final_review variant or id', () => {
    expect(isFinalReviewStep(makeStep({ type: 'approval', ui_variant: 'final_review' }))).toBe(true)
    expect(isFinalReviewStep(makeStep({ type: 'approval', id: 'final_review' }))).toBe(true)
    expect(isFinalReviewStep(makeStep({ type: 'review', ui_variant: 'final_review' }))).toBe(false)
    expect(isFinalReviewStep(null)).toBe(false)
  })
})

describe('canUserApproveFinal', () => {
  const finalStep = makeStep({ type: 'approval', ui_variant: 'final_review' })

  it('requires a confirmed delivery on the final-review step', () => {
    const track = makeTrack({ workflow_step: finalStep, current_master_delivery: makeDelivery() })
    expect(canUserApproveFinal(track, 20, true)).toBe(true)
    expect(canUserApproveFinal(makeTrack({ workflow_step: finalStep, current_master_delivery: makeDelivery({ confirmed_at: null }) }), 20, true)).toBe(false)
    expect(canUserApproveFinal(makeTrack({ workflow_step: makeStep({ type: 'review' }), current_master_delivery: makeDelivery() }), 20, true)).toBe(false)
    expect(canUserApproveFinal(makeTrack({ workflow_step: finalStep }), 20, true)).toBe(false)
  })

  it('producer and composer actor each approve their own side once', () => {
    const base = { workflow_step: finalStep }
    expect(canUserApproveFinal(makeTrack({ ...base, current_master_delivery: makeDelivery() }), 10, false)).toBe(true)
    expect(canUserApproveFinal(makeTrack({ ...base, current_master_delivery: makeDelivery({ producer_approved_at: '2026-01-02T00:00:00Z' }) }), 20, true)).toBe(false)
    expect(canUserApproveFinal(makeTrack({ ...base, current_master_delivery: makeDelivery({ submitter_approved_at: '2026-01-02T00:00:00Z' }) }), 10, false)).toBe(false)
    expect(canUserApproveFinal(makeTrack({ ...base, current_master_delivery: makeDelivery() }), 42, false)).toBe(false)
    expect(canUserApproveFinal(makeTrack({ ...base, current_master_delivery: makeDelivery() }), null, true)).toBe(false)
  })
})
