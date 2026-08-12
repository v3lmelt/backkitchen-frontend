import type { WorkflowConfig } from '@/types'
import { workflowApi } from '@/api'

export type ReviewAssignmentMode = 'manual' | 'auto' | 'fixed'
type WorkflowLabelTranslator = (key: string, fallback: string) => string

// Module-level cache for the backend-served default workflow config
// (`GET /api/workflow/default-config`). Fetched lazily; the raw payload is
// cached and labels are localized per call.
let cachedDefaultWorkflowConfig: WorkflowConfig | null = null
let pendingDefaultWorkflowConfig: Promise<WorkflowConfig> | null = null

export function cloneWorkflowConfig(config: WorkflowConfig): WorkflowConfig {
  return JSON.parse(JSON.stringify(config)) as WorkflowConfig
}

function localizeWorkflowConfigLabels(
  config: WorkflowConfig,
  translate?: WorkflowLabelTranslator,
): WorkflowConfig {
  if (!translate) return config

  for (const step of config.steps) {
    step.label = translate(`workflowSteps.${step.id}`, step.label)
  }

  return config
}

/**
 * Fetch (and cache) the backend's default workflow config for new albums.
 * Concurrent callers share one request; a failure clears the pending promise
 * so the next call retries.
 */
export function loadDefaultWorkflowConfig(translate?: WorkflowLabelTranslator): Promise<WorkflowConfig> {
  if (cachedDefaultWorkflowConfig) {
    return Promise.resolve(localizeWorkflowConfigLabels(cloneWorkflowConfig(cachedDefaultWorkflowConfig), translate))
  }
  pendingDefaultWorkflowConfig ??= workflowApi.getDefaultConfig()
    .then((config) => {
      cachedDefaultWorkflowConfig = cloneWorkflowConfig(config)
      return cachedDefaultWorkflowConfig
    })
    .catch((error) => {
      pendingDefaultWorkflowConfig = null
      throw error
    })
  return pendingDefaultWorkflowConfig.then(config =>
    localizeWorkflowConfigLabels(cloneWorkflowConfig(config), translate),
  )
}

/** The cached default workflow config, or null when it has not loaded yet. */
export function getCachedDefaultWorkflowConfig(translate?: WorkflowLabelTranslator): WorkflowConfig | null {
  if (!cachedDefaultWorkflowConfig) return null
  return localizeWorkflowConfigLabels(cloneWorkflowConfig(cachedDefaultWorkflowConfig), translate)
}

/** Test hook: drop the cached config so the next load re-fetches. */
export function resetDefaultWorkflowConfigCache() {
  cachedDefaultWorkflowConfig = null
  pendingDefaultWorkflowConfig = null
}

export function getFirstPeerReviewAssignmentMode(config: WorkflowConfig | null | undefined): ReviewAssignmentMode {
  const step = config?.steps.find(step => step.ui_variant === 'peer_review' || step.id === 'peer_review')
  if (step?.assignment_mode === 'manual' || step?.assignment_mode === 'fixed') {
    return step.assignment_mode
  }
  return 'auto'
}

export function setFirstPeerReviewAssignmentMode(
  config: WorkflowConfig,
  mode: ReviewAssignmentMode,
): WorkflowConfig {
  const next = cloneWorkflowConfig(config)
  const step = next.steps.find(candidate => candidate.ui_variant === 'peer_review' || candidate.id === 'peer_review')

  if (!step) return next

  step.assignment_mode = mode
  if (mode === 'manual') {
    step.reviewer_pool = null
  } else if (mode === 'fixed' && !step.reviewer_pool) {
    step.reviewer_pool = []
  }
  return next
}

export function sanitizeWorkflowUserReferences(
  config: WorkflowConfig,
  allowedUserIds: Iterable<number>,
): WorkflowConfig {
  const allowed = new Set(allowedUserIds)
  const next = cloneWorkflowConfig(config)

  for (const step of next.steps) {
    if (step.assignee_user_id != null && !allowed.has(step.assignee_user_id)) {
      step.assignee_user_id = null
    }
    if (step.reviewer_pool) {
      step.reviewer_pool = step.reviewer_pool.filter(userId => allowed.has(userId))
    }
  }

  return next
}
