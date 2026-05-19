import { describe, expect, it } from 'vitest'

import type { Issue, StageAssignment, Track } from '@/types'

import { activeAssignmentsForStep, canUserChangeIssueStatus, canUserSubmitIssueStatus } from './reviewAssignments'

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
    duration: 120,
    bpm: 174,
    key: null,
    notes: null,
    mastering_notes: null,
    version: 1,
    workflow_cycle: 1,
    status: 'final_review',
    rejection_mode: 'resubmittable',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    current_source_version: null,
    current_master_delivery: null,
    source_versions: [],
    master_deliveries: [],
    issues: [],
    checklist_items: [],
    allowed_actions: [],
    workflow_transitions: [],
    workflow_step: null,
    workflow_config: null,
    workflow_variant: 'final_review',
    reopen_request: null,
    ...overrides,
  } as Track
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    track_id: 1,
    author_id: 20,
    phase: 'final_review',
    workflow_cycle: 1,
    source_version_id: null,
    master_delivery_id: 1,
    title: 'Issue',
    description: 'Issue description',
    severity: 'major',
    status: 'open',
    markers: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Issue
}

function makeAssignment(overrides: Partial<StageAssignment> = {}): StageAssignment {
  return {
    id: 1,
    track_id: 1,
    stage_id: 'peer_review',
    user_id: 40,
    status: 'pending',
    decision: null,
    cancellation_reason: null,
    assigned_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  }
}

describe('reviewAssignments', () => {
  it('dedupes stale same-reviewer rows and prefers pending active assignments', () => {
    const assignments: StageAssignment[] = [
      makeAssignment({
        id: 1,
        user_id: 40,
        status: 'completed',
        decision: 'pass',
        completed_at: '2026-01-01T00:30:00Z',
      }),
      makeAssignment({
        id: 2,
        user_id: 41,
        status: 'completed',
        decision: 'pass',
        completed_at: '2026-01-01T00:30:00Z',
      }),
      makeAssignment({
        id: 3,
        user_id: 40,
        status: 'pending',
        assigned_at: '2026-01-02T00:00:00Z',
      }),
      makeAssignment({
        id: 4,
        user_id: 41,
        status: 'pending',
        assigned_at: '2026-01-02T00:00:00Z',
      }),
      makeAssignment({
        id: 5,
        stage_id: 'producer_gate',
        user_id: 42,
      }),
      makeAssignment({
        id: 6,
        user_id: 43,
        status: 'cancelled',
      }),
    ]

    const active = activeAssignmentsForStep(assignments, 'peer_review')

    expect(active.map(assignment => assignment.id)).toEqual([3, 4])
    expect(active.every(assignment => assignment.status === 'pending')).toBe(true)
  })

  it('allows only the mastering engineer to change final review issue status', () => {
    const track = makeTrack()
    const issue = makeIssue()

    expect(canUserChangeIssueStatus(30, track, issue)).toBe(true)
    expect(canUserChangeIssueStatus(20, track, issue)).toBe(false)
    expect(canUserSubmitIssueStatus(10, track, issue)).toBe(false)
  })

  it('keeps non-final-review author status permissions unchanged', () => {
    const track = makeTrack({ status: 'peer_review' })
    const issue = makeIssue({ phase: 'peer', author_id: 40, source_version_id: 5, master_delivery_id: null })
    const assignments: StageAssignment[] = []

    expect(canUserChangeIssueStatus(40, track, issue, assignments)).toBe(true)
    expect(canUserSubmitIssueStatus(10, track, issue)).toBe(true)
  })

  it('keeps revision-request-cancelled reviewers on internal issue status permissions', () => {
    const track = makeTrack({ status: 'peer_revision', peer_reviewer_id: null })
    const issue = makeIssue({
      phase: 'peer',
      author_id: 40,
      status: 'pending_discussion',
      source_version_id: 5,
      master_delivery_id: null,
    })
    const assignments: StageAssignment[] = [
      makeAssignment({
        user_id: 41,
        status: 'cancelled',
        cancellation_reason: 'revision_requested',
      }),
    ]

    expect(canUserChangeIssueStatus(41, track, issue, assignments)).toBe(true)
  })

  it('allows any assigned peer reviewer to publish hidden peer-review issues', () => {
    const track = makeTrack({ status: 'peer_review', peer_reviewer_id: null })
    const issue = makeIssue({
      phase: 'peer',
      author_id: 40,
      status: 'internal_resolved',
      source_version_id: 5,
      master_delivery_id: null,
    })
    const assignments: StageAssignment[] = [
      makeAssignment({ user_id: 40, status: 'pending' }),
      makeAssignment({ user_id: 41, status: 'pending' }),
    ]

    expect(canUserChangeIssueStatus(41, track, issue, assignments)).toBe(true)
  })
})
