import type { Issue, StageAssignment, Track } from '@/types'

function phaseAliases(phase: string): Set<string> {
  if (phase === 'peer' || phase === 'peer_review') return new Set(['peer', 'peer_review'])
  if (phase === 'producer' || phase === 'producer_gate') return new Set(['producer', 'producer_gate'])
  if (phase === 'mastering') return new Set(['mastering'])
  if (phase === 'final_review') return new Set(['final_review'])
  return new Set([phase])
}

export function activeAssignmentsForStep(assignments: StageAssignment[], stageId: string | null | undefined): StageAssignment[] {
  if (!stageId) return []
  return assignments.filter(assignment => assignment.stage_id === stageId && assignment.status !== 'cancelled')
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
      .filter(assignment => assignment.status !== 'cancelled' && aliases.has(assignment.stage_id))
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
  return issue.phase !== 'final_review' && userId === track.submitter_id
}
