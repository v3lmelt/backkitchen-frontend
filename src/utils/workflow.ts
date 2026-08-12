import type { ComposerTranslation } from 'vue-i18n'
import type { Track, WorkflowConfig, WorkflowEvent, WorkflowStepDef, WorkflowTransitionOption } from '@/types'

/**
 * Step IDs that ship with the default workflow config and have matching
 * i18n entries under the `workflowSteps.*` namespace. Custom step IDs
 * defined by producers in the workflow builder won't match and fall back
 * to the raw label stored in the config.
 */
const DEFAULT_STEP_IDS = new Set([
  'intake',
  'peer_review',
  'peer_review_revision',
  'peer_revision',
  'producer_gate',
  'producer_gate_revision',
  'producer_revision',
  'mastering',
  'mastering_revision',
  'final_review',
  'final_revision',
  'source_followup_pending',
])

interface StepLike {
  id: string
  label: string
}

export function findWorkflowStepById(
  workflowConfig: WorkflowConfig | null | undefined,
  stepId: string | null | undefined,
): WorkflowStepDef | null {
  if (!workflowConfig || !stepId) return null
  return workflowConfig.steps.find(step => step.id === stepId) ?? null
}

type MasteringStepLike = Pick<WorkflowStepDef, 'id' | 'type' | 'ui_variant' | 'is_mastering_related'>

/**
 * Whether a step belongs to the mastering flow. Prefers the backend-computed
 * `is_mastering_related` flag (present on current payloads); falls back to a
 * heuristic for older payloads.
 *
 * The fallback mirrors the id/ui_variant part of the backend heuristic
 * (`workflow_engine.target_is_mastering_related`) but intentionally omits the
 * `type === 'delivery'` match: not every delivery step belongs to the mastering
 * flow, and a custom delivery step in a non-mastering workflow must not route
 * into the mastering workspace or be labelled mastering-related.
 */
export function stepIsMasteringRelated(step: MasteringStepLike | null | undefined): boolean {
  if (!step) return false
  if (step.is_mastering_related != null) return step.is_mastering_related
  return step.ui_variant === 'mastering'
    || step.id.includes('master')
}

interface TrackWorkspaceRouteOptions {
  returnTo?: string | null
  issueId?: number | null
}

type TrackWorkspaceLike = Pick<Track, 'id' | 'status' | 'workflow_step'>

function buildTrackWorkspaceQuery(options: TrackWorkspaceRouteOptions): Record<string, string> | undefined {
  const query: Record<string, string> = {}
  if (options.returnTo) query.returnTo = options.returnTo
  if (options.issueId != null) query.issue = String(options.issueId)
  return Object.keys(query).length > 0 ? query : undefined
}

function resolveTrackWorkspaceStepId(track: TrackWorkspaceLike): string | null {
  if (track.workflow_step?.id) return track.workflow_step.id
  if (track.status === 'completed' || track.status === 'rejected' || track.status === 'source_followup_pending') return null
  return track.status
}

export function buildTrackWorkspaceRouteById(
  trackId: number,
  step: Pick<WorkflowStepDef, 'id'> | null | undefined,
  options: TrackWorkspaceRouteOptions = {},
) {
  const path = step?.id
    ? `/tracks/${trackId}/step/${step.id}`
    : `/tracks/${trackId}`
  const query = buildTrackWorkspaceQuery(options)
  return query ? { path, query } : { path }
}

export function buildTrackWorkspaceRoute(
  track: TrackWorkspaceLike,
  options: TrackWorkspaceRouteOptions = {},
) {
  const stepId = resolveTrackWorkspaceStepId(track)
  return buildTrackWorkspaceRouteById(
    track.id,
    stepId ? { id: stepId } : null,
    options,
  )
}

/**
 * Translate a workflow step's label using the `workflowSteps.<id>` i18n key
 * when the step id is one of the known defaults; otherwise return the raw
 * `step.label` so that user-defined custom steps still render correctly.
 */
export function translateStepLabel(
  step: StepLike | null | undefined,
  t: ComposerTranslation,
): string {
  if (!step) return ''
  if (DEFAULT_STEP_IDS.has(step.id)) {
    return t(`workflowSteps.${step.id}`, step.label)
  }
  return step.label
}

export function translateWorkflowStatusLabel(
  status: string | null | undefined,
  workflowConfig: WorkflowConfig | null | undefined,
  t: ComposerTranslation,
  te?: (key: string) => boolean,
): string {
  if (!status) return ''

  const workflowStep = findWorkflowStepById(workflowConfig, status)
  if (workflowStep) {
    return translateStepLabel(workflowStep, t)
  }

  const workflowKey = `workflowSteps.${status}`
  if (!te || te(workflowKey)) {
    return t(workflowKey, status)
  }

  const statusKey = `status.${status}`
  if (!te || te(statusKey)) {
    return t(statusKey, status)
  }

  return status.replaceAll('_', ' ')
}

export function formatWorkflowEvent(
  event: WorkflowEvent,
  t: ComposerTranslation,
): string {
  const name = event.actor?.display_name ?? '?'
  const key = `dashboard.events.${event.event_type}`
  const translated = t(key, { name })
  if (translated !== key) return translated
  return event.actor
    ? `${name}: ${event.event_type.replaceAll('_', ' ')}`
    : event.event_type.replaceAll('_', ' ')
}

export function workflowEventDotColor(eventType: string): string {
  if (eventType.includes('reject')) return 'bg-error'
  if (eventType.includes('completed') || eventType.includes('approved')) return 'bg-success'
  if (eventType.includes('issue')) return 'bg-warning'
  if (eventType.includes('revision') || eventType.includes('returned')) return 'bg-warning'
  if (eventType.includes('source_followup')) return 'bg-warning'
  if (eventType.includes('force_status')) return 'bg-info'
  if (eventType.includes('upload') || eventType.includes('deliver')) return 'bg-info'
  return 'bg-muted-foreground'
}

// ---------------------------------------------------------------------------
// Transition decisions
// ---------------------------------------------------------------------------

type TransitionLike = Pick<WorkflowTransitionOption, 'decision' | 'kind'>

/**
 * Heuristic classification used when the backend does not send `kind` yet
 * (older deployments). Mirrors the historic string sniffing.
 */
function heuristicTransitionKind(decision: string): NonNullable<WorkflowTransitionOption['kind']> {
  if (decision === 'reject_final') return 'reject'
  if (decision.includes('reject') || decision.includes('revision') || decision === 'return') return 'revision'
  return 'approve'
}

/** Semantic kind of a transition, preferring the backend-provided `kind`. */
export function transitionKind(transition: TransitionLike): NonNullable<WorkflowTransitionOption['kind']> {
  return transition.kind ?? heuristicTransitionKind(transition.decision)
}

/** Approve-like transition (pass/approve), preferring the backend `kind`. */
export function transitionIsApprove(transition: TransitionLike): boolean {
  if (transition.kind != null) return transition.kind === 'approve'
  return transition.decision === 'pass' || transition.decision === 'approve'
}

/** Revision/return-like transition, preferring the backend `kind`. */
export function transitionIsRevision(transition: TransitionLike): boolean {
  if (transition.kind != null) return transition.kind === 'revision' || transition.kind === 'reject'
  return transition.decision.includes('revision') || transition.decision.includes('reject')
}

/** Button styling type for a transition. */
export function actionTypeForTransition(transition: TransitionLike): 'advance' | 'return' | 'reject' {
  const kind = transitionKind(transition)
  if (kind === 'reject') return 'reject'
  if (kind === 'revision') return 'return'
  return 'advance'
}

/**
 * Final-review transitions rendered as dedicated buttons (approve / final
 * reject) rather than in the generic action list.
 */
export function isFinalReviewDedicatedTransition(transition: TransitionLike): boolean {
  if (transition.kind != null) return transition.kind === 'approve' || transition.kind === 'reject'
  return transition.decision === 'approve'
    || transition.decision === 'reject_final'
    || transition.decision === 'reject_resubmittable'
}

/** Whether executing this decision needs a confirmation dialog. */
export function transitionRequiresConfirmation(
  transition: Pick<WorkflowTransitionOption, 'requires_confirmation'> | undefined,
  decision: string,
): boolean {
  return transition?.requires_confirmation ?? decision === 'reject_final'
}

/** Parse a transition decision; `reject_to_<stepId>` carries a target step. */
export function parseDecision(decision: string): { targetStepId: string | null } {
  if (decision.startsWith('reject_to_')) {
    return { targetStepId: decision.slice('reject_to_'.length) }
  }
  return { targetStepId: null }
}

/**
 * Human-readable label for a transition decision. `reject_to_<stepId>`
 * decisions resolve the target step through the album workflow config;
 * anything else goes through the `trackDetail.actions.*` i18n namespace.
 */
export function translateWorkflowDecision(
  decision: string,
  workflowConfig: WorkflowConfig | null | undefined,
  t: ComposerTranslation,
  te?: (key: string) => boolean,
  fallbackLabel?: string,
): string {
  const { targetStepId } = parseDecision(decision)
  if (targetStepId) {
    return t('workflowStep.rejectToStep', {
      step: translateWorkflowStatusLabel(targetStepId, workflowConfig, t, te),
    })
  }
  const actionKey = `trackDetail.actions.${decision}`
  if (!te || te(actionKey)) return t(actionKey, fallbackLabel ?? decision.replaceAll('_', ' '))
  return fallbackLabel ?? decision.replaceAll('_', ' ')
}
