import type { ComposerTranslation } from 'vue-i18n'
import type { Track, WorkflowConfig, WorkflowEvent, WorkflowStepDef } from '@/types'

/**
 * Step IDs that ship with the default workflow config and have matching
 * i18n entries under the `workflowSteps.*` namespace. Custom step IDs
 * defined by producers in the workflow builder won't match and fall back
 * to the raw label stored in the config.
 */
const DEFAULT_STEP_IDS = new Set([
  'intake',
  'peer_review',
  'peer_revision',
  'producer_gate',
  'producer_revision',
  'mastering',
  'mastering_revision',
  'final_review',
  'final_revision',
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
  if (track.status === 'completed' || track.status === 'rejected') return null
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
  if (eventType.includes('upload') || eventType.includes('deliver')) return 'bg-info'
  return 'bg-muted-foreground'
}
