import type { Issue, StageAssignment, Track } from '@/types'
import { isTrackComposer } from '@/utils/trackComposers'

const REVISION_REQUESTED_CANCEL_REASON = 'revision_requested'

function phaseAliases(phase: string): Set<string> {
  if (phase === 'peer' || phase === 'peer_review') return new Set(['peer', 'peer_review'])
  if (phase === 'producer' || phase === 'producer_gate') return new Set(['producer', 'producer_gate'])
  if (phase === 'mastering') return new Set(['mastering'])
  if (phase === 'final_review') return new Set(['final_review'])
  return new Set([phase])
}

function assignmentTime(assignment: StageAssignment): number {
  const parsed = Date.parse(assignment.assigned_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

function shouldPreferAssignment(candidate: StageAssignment, current: StageAssignment): boolean {
  if (candidate.status === 'pending' && current.status !== 'pending') return true
  if (candidate.status !== 'pending' && current.status === 'pending') return false

  const candidateTime = assignmentTime(candidate)
  const currentTime = assignmentTime(current)
  if (candidateTime !== currentTime) return candidateTime > currentTime

  return candidate.id > current.id
}

export function activeAssignmentsForStep(assignments: StageAssignment[], stageId: string | null | undefined): StageAssignment[] {
  if (!stageId) return []
  const activeByUser = new Map<number, StageAssignment>()
  for (const assignment of assignments) {
    if (assignment.stage_id !== stageId || assignment.status === 'cancelled') continue
    const current = activeByUser.get(assignment.user_id)
    if (!current || shouldPreferAssignment(assignment, current)) {
      activeByUser.set(assignment.user_id, assignment)
    }
  }
  return Array.from(activeByUser.values())
}

export function reviewerIdsForPhase(
  track: Track | null | undefined,
  phase: string,
  assignments: StageAssignment[] = [],
): number[] {
  if (!track) return []

  const aliases = phaseAliases(phase)
  const assignmentReviewerIds = Array.from(new Set(
    assignments
      .filter(assignment =>
        aliases.has(assignment.stage_id)
        && (
          assignment.status !== 'cancelled'
          || assignment.cancellation_reason === REVISION_REQUESTED_CANCEL_REASON
        ),
      )
      .map(assignment => assignment.user_id),
  ))
  if (assignmentReviewerIds.length > 0) return assignmentReviewerIds

  switch (phase) {
    case 'peer':
    case 'peer_review':
      return track.peer_reviewer_id != null ? [track.peer_reviewer_id] : []
    case 'producer':
    case 'producer_gate':
    case 'final_review':
      return track.producer_id != null ? [track.producer_id] : []
    case 'mastering':
      return track.mastering_engineer_id != null ? [track.mastering_engineer_id] : []
    default:
      return []
  }
}

export function reviewerIdsForIssue(
  track: Track | null | undefined,
  issue: Issue,
  assignments: StageAssignment[] = [],
): number[] {
  return reviewerIdsForPhase(track, issue.phase, assignments)
}

export function statusHandlerIdsForIssue(
  track: Track | null | undefined,
  issue: Issue,
  assignments: StageAssignment[] = [],
): number[] {
  if (!track) return []
  if (issue.phase === 'final_review') {
    return track.mastering_engineer_id != null ? [track.mastering_engineer_id] : []
  }
  return reviewerIdsForIssue(track, issue, assignments)
}

export function canUserReviewIssue(
  userId: number | null | undefined,
  track: Track | null | undefined,
  issue: Issue,
  assignments: StageAssignment[] = [],
): boolean {
  if (!userId || !track) return false
  if (userId === issue.author_id) return true
  return reviewerIdsForIssue(track, issue, assignments).includes(userId)
}

export function canUserChangeIssueStatus(
  userId: number | null | undefined,
  track: Track | null | undefined,
  issue: Issue,
  assignments: StageAssignment[] = [],
): boolean {
  if (!userId || !track) return false
  if (issue.phase !== 'final_review' && userId === issue.author_id) return true
  return statusHandlerIdsForIssue(track, issue, assignments).includes(userId)
}

export function canUserSubmitIssueStatus(
  userId: number | null | undefined,
  track: Track | null | undefined,
  issue: Issue,
): boolean {
  if (!userId || !track) return false
  return issue.phase !== 'final_review' && isTrackComposer(track, userId)
}
