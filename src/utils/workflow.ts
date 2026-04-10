import type { ComposerTranslation } from 'vue-i18n'

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
