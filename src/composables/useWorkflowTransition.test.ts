import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { createTestI18n } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  workflowTransitionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  trackApi: {
    workflowTransition: mocks.workflowTransitionMock,
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

import { useWorkflowTransition, type UseWorkflowTransitionOptions } from './useWorkflowTransition'
import type { Track, WorkflowConfig } from '@/types'

type Composable = ReturnType<typeof useWorkflowTransition>

function makeTrack(overrides: Record<string, unknown> = {}): Track {
  return {
    id: 9,
    status: 'mastering',
    workflow_step: {
      id: 'mastering',
      label: 'Mastering',
      type: 'delivery',
      ui_variant: 'mastering',
      assignee_role: 'mastering_engineer',
      order: 0,
      transitions: { deliver: 'final_review' },
    },
    workflow_transitions: [{ decision: 'deliver', label: 'Deliver' }],
    ...overrides,
  } as unknown as Track
}

function mountHarness(options: Partial<UseWorkflowTransitionOptions> = {}) {
  let captured: Composable | null = null
  const track = ref<Track | null>(makeTrack())
  const workflowConfig = ref<WorkflowConfig | null>(null)
  const error = ref('')
  const reload = vi.fn().mockResolvedValue(undefined)
  const navigateToTrackDetail = vi.fn()
  const Comp = defineComponent({
    setup() {
      captured = useWorkflowTransition({
        trackId: ref(9),
        track,
        workflowConfig,
        error,
        reload,
        navigateToTrackDetail,
        ...options,
      })
      return () => null
    },
  })
  setActivePinia(createPinia())
  const wrapper = mount(Comp, {
    global: { plugins: [createTestI18n()] },
  })
  return {
    wrapper,
    composable: captured as unknown as Composable,
    track,
    workflowConfig,
    error,
    reload,
    navigateToTrackDetail,
  }
}

describe('useWorkflowTransition', () => {
  beforeEach(() => {
    mocks.workflowTransitionMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    vi.restoreAllMocks()
  })

  it('navigates to the track detail page when the transition changes status', async () => {
    mocks.workflowTransitionMock.mockResolvedValue({ status: 'final_review' })
    const { composable, navigateToTrackDetail, reload, wrapper } = mountHarness()

    await composable.executeTransition('deliver')
    await flushPromises()

    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'deliver')
    expect(navigateToTrackDetail).toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(composable.acting.value).toBe(false)
    wrapper.unmount()
  })

  it('reloads in place and toasts when the status is unchanged', async () => {
    mocks.workflowTransitionMock.mockResolvedValue({ status: 'mastering' })
    const { composable, navigateToTrackDetail, reload, wrapper } = mountHarness()

    await composable.executeTransition('deliver')
    await flushPromises()

    expect(reload).toHaveBeenCalled()
    expect(mocks.toastSuccessMock).toHaveBeenCalled()
    expect(navigateToTrackDetail).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('writes the error surface when the transition fails', async () => {
    mocks.workflowTransitionMock.mockRejectedValue(new Error('nope'))
    const { composable, error, navigateToTrackDetail, wrapper } = mountHarness()

    await composable.executeTransition('deliver')
    await flushPromises()

    expect(error.value).toBe('nope')
    expect(navigateToTrackDetail).not.toHaveBeenCalled()
    expect(composable.acting.value).toBe(false)
    wrapper.unmount()
  })

  it('intercepts mastering revision decisions to collect the revision type first', async () => {
    const { composable, track, workflowConfig, wrapper } = mountHarness()
    workflowConfig.value = {
      version: 2,
      steps: [
        {
          id: 'mastering',
          label: 'Mastering',
          type: 'delivery',
          ui_variant: 'mastering',
          assignee_role: 'mastering_engineer',
          order: 0,
          transitions: { request_revision: 'mastering_revision' },
        },
        {
          id: 'mastering_revision',
          label: 'Mastering Revision',
          type: 'revision',
          assignee_role: 'submitter',
          order: 1,
          transitions: {},
          return_to: 'mastering',
        },
      ],
    } as unknown as WorkflowConfig
    track.value = makeTrack({
      workflow_step: {
        id: 'mastering',
        label: 'Mastering',
        type: 'delivery',
        ui_variant: 'mastering',
        assignee_role: 'mastering_engineer',
        order: 0,
        transitions: { request_revision: 'mastering_revision' },
      },
    })
    mocks.workflowTransitionMock.mockResolvedValue({ status: 'mastering_revision' })

    await composable.executeTransition('request_revision')
    expect(mocks.workflowTransitionMock).not.toHaveBeenCalled()
    expect(composable.revisionTypeModalOpen.value).toBe(true)
    expect(composable.selectedRevisionType.value).toBe('source_audio')

    composable.selectedRevisionType.value = 'stem_files'
    await composable.confirmRevisionType()
    await flushPromises()

    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'request_revision', 'stem_files')
    expect(composable.revisionTypeModalOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('intercepts revision decisions on custom delivery-type steps (mastering-related via type)', async () => {
    const { composable, track, workflowConfig, wrapper } = mountHarness()
    // Custom workflow: the delivery step has a producer-defined id/label and no
    // 'mastering' ui_variant, but its type still marks it as mastering-related.
    const customDeliveryStep = {
      id: 'mix_delivery',
      label: 'Mix Delivery',
      type: 'delivery',
      ui_variant: 'generic',
      assignee_role: 'mastering_engineer',
      order: 0,
      transitions: { request_revision: 'mix_delivery_revision' },
    }
    workflowConfig.value = {
      version: 2,
      steps: [
        customDeliveryStep,
        {
          id: 'mix_delivery_revision',
          label: 'Mix Delivery Revision',
          type: 'revision',
          assignee_role: 'submitter',
          order: 1,
          transitions: {},
          return_to: 'mix_delivery',
        },
      ],
    } as unknown as WorkflowConfig
    track.value = makeTrack({ workflow_step: customDeliveryStep })

    await composable.executeTransition('request_revision')

    expect(mocks.workflowTransitionMock).not.toHaveBeenCalled()
    expect(composable.revisionTypeModalOpen.value).toBe(true)
    wrapper.unmount()
  })

  it('does not intercept revision decisions on non-mastering steps', async () => {
    mocks.workflowTransitionMock.mockResolvedValue({ status: 'peer_revision' })
    const { composable, track, workflowConfig, wrapper } = mountHarness()
    const reviewStep = {
      id: 'peer_review',
      label: 'Peer Review',
      type: 'review',
      ui_variant: 'peer_review',
      assignee_role: 'peer_reviewer',
      order: 0,
      transitions: { request_revision: 'peer_revision' },
    }
    workflowConfig.value = {
      version: 2,
      steps: [
        reviewStep,
        {
          id: 'peer_revision',
          label: 'Peer Revision',
          type: 'revision',
          assignee_role: 'submitter',
          order: 1,
          transitions: {},
          return_to: 'peer_review',
        },
      ],
    } as unknown as WorkflowConfig
    track.value = makeTrack({
      status: 'peer_review',
      workflow_step: reviewStep,
      workflow_transitions: [{ decision: 'request_revision', label: 'Request revision' }],
    })

    await composable.executeTransition('request_revision')
    await flushPromises()

    expect(composable.revisionTypeModalOpen.value).toBe(false)
    expect(mocks.workflowTransitionMock).toHaveBeenCalledWith(9, 'request_revision')
    wrapper.unmount()
  })

  it('aborts transitions requiring confirmation when the user declines', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { composable, track, wrapper } = mountHarness()
    track.value = makeTrack({
      workflow_transitions: [{ decision: 'reject_final', label: 'Reject' }],
    })

    await composable.executeTransition('reject_final')

    expect(confirmSpy).toHaveBeenCalled()
    expect(mocks.workflowTransitionMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('honors the confirmDecision gate and the beforeTransition hook order', async () => {
    mocks.workflowTransitionMock.mockResolvedValue({ status: 'final_review' })
    const calls: string[] = []
    const { composable, wrapper } = mountHarness({
      beforeTransition: async () => { calls.push('before') },
      confirmDecision: () => { calls.push('confirm'); return true },
    })
    mocks.workflowTransitionMock.mockImplementation(async () => {
      calls.push('api')
      return { status: 'final_review' }
    })

    await composable.executeTransition('deliver')

    expect(calls).toEqual(['confirm', 'before', 'api'])
    wrapper.unmount()
  })

  it('aborts when confirmDecision returns false', async () => {
    const { composable, wrapper } = mountHarness({
      confirmDecision: () => false,
    })

    await composable.executeTransition('deliver')

    expect(mocks.workflowTransitionMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
