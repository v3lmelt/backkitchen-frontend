import type { WorkflowConfig } from '@/types'

type ReviewAssignmentMode = 'manual' | 'auto'
type WorkflowLabelTranslator = (key: string, fallback: string) => string

const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  version: 2,
  steps: [
    {
      id: 'intake',
      label: 'Intake',
      type: 'approval',
      ui_variant: 'intake',
      assignee_role: 'producer',
      order: 0,
      transitions: {
        accept: 'peer_review',
        accept_producer_direct: 'producer_gate',
        reject_final: '__rejected',
        reject_resubmittable: '__rejected_resubmittable',
      },
      allow_permanent_reject: true,
    },
    {
      id: 'peer_review',
      label: 'Peer Review',
      type: 'review',
      ui_variant: 'peer_review',
      assignee_role: 'peer_reviewer',
      order: 1,
      transitions: {
        pass: 'producer_gate',
        needs_revision: 'peer_revision',
      },
      revision_step: 'peer_revision',
      assignment_mode: 'auto',
      required_reviewer_count: 1,
    },
    {
      id: 'peer_revision',
      label: 'Peer Revision',
      type: 'revision',
      assignee_role: 'submitter',
      order: 2,
      return_to: 'peer_review',
      transitions: {},
    },
    {
      id: 'producer_gate',
      label: 'Producer Review',
      type: 'approval',
      ui_variant: 'producer_gate',
      assignee_role: 'producer',
      order: 3,
      transitions: {
        approve: 'mastering',
        reject: 'producer_revision',
        reject_to_peer_review: 'peer_review',
      },
      allow_permanent_reject: false,
    },
    {
      id: 'producer_revision',
      label: 'Producer Revision',
      type: 'revision',
      assignee_role: 'submitter',
      order: 4,
      return_to: 'producer_gate',
      transitions: {},
    },
    {
      id: 'mastering',
      label: 'Mastering',
      type: 'delivery',
      ui_variant: 'mastering',
      assignee_role: 'mastering_engineer',
      order: 5,
      transitions: {
        deliver: 'final_review',
        request_revision: 'mastering_revision',
      },
      revision_step: 'mastering_revision',
      require_confirmation: true,
    },
    {
      id: 'mastering_revision',
      label: 'Mastering Revision',
      type: 'revision',
      assignee_role: 'submitter',
      order: 6,
      return_to: 'mastering',
      transitions: {},
    },
    {
      id: 'final_review',
      label: 'Final Review',
      type: 'approval',
      ui_variant: 'final_review',
      assignee_role: 'producer',
      actor_roles: ['submitter'],
      order: 7,
      transitions: {
        reject_to_mastering: 'mastering',
      },
      allow_permanent_reject: false,
    },
  ],
}

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

export function buildDefaultWorkflowConfig(translate?: WorkflowLabelTranslator): WorkflowConfig {
  return localizeWorkflowConfigLabels(cloneWorkflowConfig(DEFAULT_WORKFLOW_CONFIG), translate)
}

export function getFirstPeerReviewAssignmentMode(config: WorkflowConfig | null | undefined): ReviewAssignmentMode {
  const step = (config ?? DEFAULT_WORKFLOW_CONFIG).steps.find(step => step.ui_variant === 'peer_review' || step.id === 'peer_review')
  return step?.assignment_mode === 'manual' ? 'manual' : 'auto'
}

export function setFirstPeerReviewAssignmentMode(
  config: WorkflowConfig | null | undefined,
  mode: ReviewAssignmentMode,
): WorkflowConfig {
  const next = cloneWorkflowConfig(config ?? DEFAULT_WORKFLOW_CONFIG)
  const step = next.steps.find(candidate => candidate.ui_variant === 'peer_review' || candidate.id === 'peer_review')

  if (!step) return next

  step.assignment_mode = mode
  if (mode === 'manual') {
    step.reviewer_pool = null
  }
  return next
}
