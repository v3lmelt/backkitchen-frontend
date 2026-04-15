import { describe, expect, it } from 'vitest'

import type { Issue, StageAssignment, Track } from '@/types'

import { canUserChangeIssueStatus, canUserSubmitIssueStatus } from './reviewAssignments'

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

describe('reviewAssignments', () => {
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
})
