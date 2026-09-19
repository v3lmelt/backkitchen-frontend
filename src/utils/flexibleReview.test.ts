import { describe, expect, it } from 'vitest'
import type { StageAssignment, WorkflowStepDef } from '@/types'
import { previewFlexibleReview } from './flexibleReview'

const step: WorkflowStepDef = { id: 'peer_review', label: 'Peer Review', type: 'review', assignee_role: 'peer_reviewer', order: 1, transitions: { pass: 'gate', needs_revision: 'revision' } }
const assignments = [
  { user_id: 1, status: 'completed', decision: 'pass' },
  { user_id: 2, status: 'completed', decision: 'needs_revision' },
  { user_id: 3, status: 'pending' },
] as StageAssignment[]
describe('flexible review outcome preview', () => {
  it('waits for pending and newly added reviewers', () => {
    expect(previewFlexibleReview([1, 2, 3], assignments, step).target).toBeUndefined()
    expect(previewFlexibleReview([1, 4], assignments, step).target).toBeUndefined()
    expect(previewFlexibleReview([], assignments, step).target).toBeUndefined()
  })
  it('prioritizes revision only among retained reviewers', () => {
    expect(previewFlexibleReview([1, 2], assignments, step).target).toBe('revision')
    expect(previewFlexibleReview([1], assignments, step).target).toBe('gate')
  })
})
