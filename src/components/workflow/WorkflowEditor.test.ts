import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'
import type { WorkflowConfig, WorkflowStepDef } from '@/types'

import WorkflowEditor from './WorkflowEditor.vue'

const memberOptions = [
  { value: 101, label: 'Reviewer A' },
  { value: 102, label: 'Reviewer B' },
  { value: 201, label: 'Mastering Engineer' },
  { value: 301, label: 'Producer' },
]

const existingWorkflow: WorkflowConfig = {
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
        pass: 'mastering',
        needs_revision: 'peer_review_revision',
      },
      assignment_mode: 'auto',
      reviewer_pool: [101, 102],
      required_reviewer_count: 2,
      revision_step: 'peer_review_revision',
    },
    {
      id: 'peer_review_revision',
      label: 'Peer Review Revision',
      type: 'revision',
      assignee_role: 'submitter',
      order: 2,
      transitions: {},
      return_to: 'peer_review',
    },
    {
      id: 'mastering',
      label: 'Mastering',
      type: 'delivery',
      ui_variant: 'mastering',
      assignee_role: 'mastering_engineer',
      order: 3,
      transitions: {
        deliver: 'final_review',
      },
      require_confirmation: true,
      assignee_user_id: 201,
    },
    {
      id: 'final_review',
      label: 'Final Review',
      type: 'approval',
      ui_variant: 'final_review',
      assignee_role: 'producer',
      order: 4,
      transitions: {},
      assignee_user_id: 301,
    },
  ],
}

function findButton(wrapper: ReturnType<typeof mountWithPlugins>, text: string) {
  const button = wrapper.findAll('button').find(node => node.text().includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function findTextInput(wrapper: ReturnType<typeof mountWithPlugins>) {
  const input = wrapper.findAll('input').find(node => {
    const type = node.attributes('type')
    return (type === undefined || type === 'text' || type === 'number') && node.classes().includes('input-field')
  })
  if (!input) throw new Error('Text input not found')
  return input
}

function lastSavedConfig(wrapper: ReturnType<typeof mountWithPlugins>) {
  const events = wrapper.emitted('save')
  if (!events?.length) throw new Error('No save event emitted')
  return events[events.length - 1][0] as WorkflowConfig
}

function lastUpdatedConfig(wrapper: ReturnType<typeof mountWithPlugins>) {
  const events = wrapper.emitted('update:workflowConfig')
  if (!events?.length) throw new Error('No update:workflowConfig event emitted')
  return events[events.length - 1][0] as WorkflowConfig | null
}

function stepById(config: WorkflowConfig, stepId: string) {
  const step = config.steps.find(item => item.id === stepId)
  if (!step) throw new Error(`Step not found: ${stepId}`)
  return step
}

describe('WorkflowEditor', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses an existing config and emits a normalized workflow on save', async () => {
    const wrapper = mountWithPlugins(WorkflowEditor, {
      props: {
        workflowConfig: existingWorkflow,
        memberOptions,
        saveable: true,
      },
    })

    expect(wrapper.text()).toContain('4')
    expect(wrapper.text()).toContain('1')

    await findTextInput(wrapper).setValue('Submission Intake')
    await flushPromises()

    const saveButton = findButton(wrapper, 'Save Workflow')
    expect((saveButton.element as HTMLButtonElement).disabled).toBe(false)
    await saveButton.trigger('click')

    const saved = lastSavedConfig(wrapper)
    const intake = stepById(saved, 'intake')
    const peerReview = stepById(saved, 'peer_review')
    const mastering = stepById(saved, 'mastering')
    const finalReview = stepById(saved, 'final_review')

    expect(saved.version).toBe(2)
    expect(intake.label).toBe('Submission Intake')
    expect(peerReview.reviewer_pool).toEqual([101, 102])
    expect(peerReview.required_reviewer_count).toBe(2)
    expect(peerReview.revision_step).toBe('peer_review_revision')
    expect(stepById(saved, 'peer_review_revision')).toMatchObject({
      type: 'revision',
      return_to: 'peer_review',
    } satisfies Partial<WorkflowStepDef>)
    expect(mastering.require_confirmation).toBe(true)
    expect(mastering.assignee_user_id).toBe(201)
    expect(finalReview.actor_roles).toEqual(['submitter'])
    expect(finalReview.transitions.reject_to_mastering).toBe('mastering')
  })

  it('shows a validation error when final review is no longer the last main stage', async () => {
    const wrapper = mountWithPlugins(WorkflowEditor, {
      props: {
        workflowConfig: null,
        memberOptions,
      },
    })

    await findButton(wrapper, 'Load Default Workflow').trigger('click')
    await findButton(wrapper, 'Add Step').trigger('click')
    await findButton(wrapper, 'Intake').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('must be the last main stage')
  })

  it('emits an updated workflow config immediately when editing a valid workflow in non-saveable mode', async () => {
    const wrapper = mountWithPlugins(WorkflowEditor, {
      props: {
        workflowConfig: existingWorkflow,
        memberOptions,
      },
    })

    await findTextInput(wrapper).setValue('Editorial Intake')
    await flushPromises()

    const updated = lastUpdatedConfig(wrapper)
    expect(updated).not.toBeNull()
    expect(stepById(updated as WorkflowConfig, 'intake').label).toBe('Editorial Intake')
    expect(stepById(updated as WorkflowConfig, 'peer_review').reviewer_pool).toEqual([101, 102])
  })
})
