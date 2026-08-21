import type { Track, User, WorkflowStepDef } from '@/types'
import { viewerCanManageAlbum } from '@/utils/albumPermissions'
import { isComposerActor } from '@/utils/trackComposers'

/** Whether the viewer may manage the album this track belongs to. */
export function viewerCanManageTrackAlbum(
  track: Track | null | undefined,
  user: User | null | undefined,
): boolean {
  return track ? viewerCanManageAlbum(track, user) : false
}

/**
 * Whether the viewer participates in the mastering workspace: composer
 * actor, album manager, or the assigned mastering engineer.
 */
export function canViewerSeeMastering(
  track: Track | null | undefined,
  userId: number | null | undefined,
  viewerCanManage: boolean,
): boolean {
  if (!userId || !track) return false
  // Server-computed flag is authoritative when present; the local derivation
  // below is the fallback for payloads that predate it.
  if (track.viewer_is_mastering_participant != null) return track.viewer_is_mastering_participant
  return isComposerActor(track, userId)
    || viewerCanManage
    || userId === track.mastering_engineer_id
}

type StepAssigneeLike = Pick<WorkflowStepDef, 'id' | 'assignee_user_id' | 'assignee_role'>
type TrackAssigneesLike = Pick<
  Track,
  'submitter_id' | 'producer_id' | 'peer_reviewer_id' | 'mastering_engineer_id'
>

/**
 * Map a step's assignee spec to a concrete user id. Mirrors the backend's
 * `resolve_assignee` (`app/workflow_engine.py`): explicit `assignee_user_id`
 * override first, then the role mapping, including literal `member:<id>`.
 */
export function resolveStepAssigneeUserId(
  track: TrackAssigneesLike | null | undefined,
  step: StepAssigneeLike | null | undefined,
): number | null {
  if (!track || !step) return null
  if (step.assignee_user_id != null) return step.assignee_user_id
  const role = step.assignee_role
  switch (role) {
    case 'submitter':
      return track.submitter_id ?? null
    case 'producer':
      return track.producer_id ?? null
    case 'peer_reviewer':
      return track.peer_reviewer_id ?? null
    case 'mastering_engineer':
      return track.mastering_engineer_id ?? null
    default: {
      if (role?.startsWith('member:')) {
        const id = Number(role.slice('member:'.length))
        return Number.isFinite(id) ? id : null
      }
      return null
    }
  }
}

/**
 * Whether the viewer may act as the step's assignee. Without an explicit
 * `assignee_user_id` override, `submitter` steps accept any composer actor
 * and `producer` steps accept any album manager (matching the backend's
 * role-spec matching); everything else compares the resolved user id.
 */
export function viewerIsStepAssignee(
  track: Track | null | undefined,
  step: StepAssigneeLike | null | undefined,
  userId: number | null | undefined,
  viewerCanManage: boolean,
): boolean {
  if (!track || !step || !userId) return false
  // The server-computed flag describes the track's *current* step; only trust
  // it when the caller asks about that same step, otherwise derive locally.
  if (
    track.viewer_is_step_assignee != null
    && track.workflow_step
    && step.id === track.workflow_step.id
  ) {
    return track.viewer_is_step_assignee
  }
  if (step.assignee_user_id == null && step.assignee_role === 'submitter') {
    return isComposerActor(track, userId)
  }
  if (step.assignee_user_id == null && step.assignee_role === 'producer') {
    return viewerCanManage
  }
  const assigneeId = resolveStepAssigneeUserId(track, step)
  return assigneeId != null && assigneeId === userId
}

type StepQuorumLike = Pick<WorkflowStepDef, 'assignment_mode' | 'required_reviewer_count'>

/**
 * How many completed reviews the step requires. In `fixed` assignment mode
 * the assigned reviewers themselves define the quorum.
 */
export function requiredReviewerCount(
  step: StepQuorumLike | null | undefined,
  assignmentCount: number,
  options?: { fallbackToAssignmentCount?: boolean },
): number {
  if (step?.assignment_mode === 'fixed') {
    return Math.max(1, assignmentCount)
  }
  if (options?.fallbackToAssignmentCount) {
    const configured = step?.required_reviewer_count
    return configured != null && configured > 0 ? configured : assignmentCount
  }
  return Math.max(1, step?.required_reviewer_count ?? 1)
}

/** Internal (composer-invisible) issues only make sense with multiple reviewers in scope. */
export function reviewAllowsInternalIssueVisibility(
  step: Pick<WorkflowStepDef, 'type' | 'assignment_mode' | 'required_reviewer_count'> | null | undefined,
  assignmentCount: number,
): boolean {
  if (step?.type !== 'review') return false
  return Math.max(requiredReviewerCount(step, assignmentCount), assignmentCount) > 1
}

/** Whether the step is the final-review approval step. */
export function isFinalReviewStep(step: Pick<WorkflowStepDef, 'id' | 'type' | 'ui_variant'> | null | undefined): boolean {
  if (!step || step.type !== 'approval') return false
  return step.ui_variant === 'final_review' || step.id === 'final_review'
}

/**
 * Whether the viewer may approve the master in final review. Requires a
 * confirmed delivery on the final-review step; producer and composer actor
 * each approve their own side exactly once (mirrors the backend rule in
 * `app/routers/tracks.py` `approve_final_review`).
 */
export function canUserApproveFinal(
  track: Track | null | undefined,
  userId: number | null | undefined,
  viewerCanManage: boolean,
): boolean {
  const delivery = track?.current_master_delivery
  if (!delivery?.confirmed_at || !isFinalReviewStep(track?.workflow_step)) return false
  if (!userId) return false
  if (viewerCanManage) return !delivery.producer_approved_at
  if (isComposerActor(track, userId)) return !delivery.submitter_approved_at
  return false
}
