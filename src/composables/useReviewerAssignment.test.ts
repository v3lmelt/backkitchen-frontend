import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { createTestI18n } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  listReviewerCandidatesMock: vi.fn(),
  assignReviewerMock: vi.fn(),
  reassignReviewerMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  trackApi: {
    listReviewerCandidates: mocks.listReviewerCandidatesMock,
    assignReviewer: mocks.assignReviewerMock,
    reassignReviewer: mocks.reassignReviewerMock,
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

import { useReviewerAssignment } from './useReviewerAssignment'
import type { StageAssignment, Track, WorkflowStepDef } from '@/types'

type Composable = ReturnType<typeof useReviewerAssignment>

function reviewStep(overrides: Record<string, unknown> = {}): WorkflowStepDef {
  return {
    id: 'peer_review',
    label: 'Peer Review',
    type: 'review',
    assignee_role: 'peer_reviewer',
    assignment_mode: 'manual',
    required_reviewer_count: 1,
    order: 1,
    transitions: {},
    ...overrides,
  } as unknown as WorkflowStepDef
}

function mountHarness(options: {
  step?: WorkflowStepDef | null
  assignments?: StageAssignment[]
  canManage?: boolean
} = {}) {
  let captured: Composable | null = null
  const error = ref('')
  const reload = vi.fn().mockResolvedValue(undefined)
  const step = ref<WorkflowStepDef | null>(options.step === undefined ? reviewStep() : options.step)
  const Comp = defineComponent({
    setup() {
      captured = useReviewerAssignment({
        track: ref({ id: 9 } as unknown as Track) as Ref<Track | null>,
        currentStep: step as Ref<WorkflowStepDef | null>,
        currentStepAssignments: ref(options.assignments ?? []) as Ref<StageAssignment[]>,
        canManage: computed(() => options.canManage ?? true),
        error,
        reload,
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
    error,
    reload,
  }
}

describe('useReviewerAssignment', () => {
  beforeEach(() => {
    mocks.listReviewerCandidatesMock.mockReset()
    mocks.assignReviewerMock.mockReset()
    mocks.reassignReviewerMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.listReviewerCandidatesMock.mockResolvedValue([
      { user_id: 2, user: { id: 2, display_name: 'Nova' } },
      { user_id: 3, user: { id: 3, display_name: 'Echo' } },
    ])
    mocks.assignReviewerMock.mockResolvedValue({})
    mocks.reassignReviewerMock.mockResolvedValue({ peer_reviewer_id: 2 })
  })

  it('opens the modal with candidates for manual assignment', async () => {
    const { composable, wrapper } = mountHarness()

    await composable.open()
    await flushPromises()

    expect(composable.modalOpen.value).toBe(true)
    expect(composable.members.value).toHaveLength(2)
    expect(composable.confirmDisabled.value).toBe(true)
    wrapper.unmount()
  })

  it('skips the modal and reassigns immediately for automatic modes', async () => {
    const { composable, reload, wrapper } = mountHarness({
      step: reviewStep({ assignment_mode: 'auto' }),
    })

    await composable.open()
    await flushPromises()

    expect(composable.modalOpen.value).toBe(false)
    expect(mocks.listReviewerCandidatesMock).not.toHaveBeenCalled()
    expect(mocks.reassignReviewerMock).toHaveBeenCalledWith(9)
    expect(reload).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does nothing when the viewer cannot manage assignments', async () => {
    const { composable, wrapper } = mountHarness({ canManage: false })

    await composable.open()

    expect(composable.modalOpen.value).toBe(false)
    expect(mocks.listReviewerCandidatesMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('enforces the reviewer limit when toggling members', async () => {
    const { composable, wrapper } = mountHarness()
    await composable.open()
    await flushPromises()

    composable.toggleMember(2)
    expect(composable.selectedUserIds.value).toEqual([2])
    expect(composable.isMemberDisabled(3)).toBe(true)

    composable.toggleMember(3)
    expect(composable.selectedUserIds.value).toEqual([2])

    composable.toggleMember(2)
    expect(composable.selectedUserIds.value).toEqual([])
    wrapper.unmount()
  })

  it('assigns reviewers, closes the modal and reloads', async () => {
    const { composable, reload, wrapper } = mountHarness()
    await composable.open()
    await flushPromises()

    composable.toggleMember(2)
    await composable.submit()
    await flushPromises()

    expect(mocks.assignReviewerMock).toHaveBeenCalledWith(9, [2])
    expect(composable.modalOpen.value).toBe(false)
    expect(composable.selectedUserIds.value).toEqual([])
    expect(reload).toHaveBeenCalled()
    expect(mocks.toastSuccessMock).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reassigns with the selected members when assignments already exist', async () => {
    const { composable, wrapper } = mountHarness({
      assignments: [
        {
          id: 1,
          track_id: 9,
          stage_id: 'peer_review',
          user_id: 3,
          status: 'pending',
          decision: null,
          cancellation_reason: null,
          assigned_at: '2024-01-01T00:00:00Z',
          completed_at: null,
        } as unknown as StageAssignment,
      ],
    })

    await composable.open()
    await flushPromises()

    expect(composable.selectedUserIds.value).toEqual([3])
    await composable.submit()
    await flushPromises()

    expect(mocks.reassignReviewerMock).toHaveBeenCalledWith(9, [3])
    wrapper.unmount()
  })

  it('prefills the selection from pending assignments within the limit', async () => {
    const { composable, wrapper } = mountHarness({
      step: reviewStep({ required_reviewer_count: 2 }),
      assignments: [
        { id: 1, user_id: 3, status: 'pending' } as unknown as StageAssignment,
        { id: 2, user_id: 4, status: 'pending' } as unknown as StageAssignment,
        { id: 3, user_id: 5, status: 'pending' } as unknown as StageAssignment,
      ],
    })

    await composable.open()
    await flushPromises()

    expect(composable.selectedUserIds.value).toEqual([3, 4])
    wrapper.unmount()
  })

  it('resets state when the track changes', async () => {
    const { composable, wrapper } = mountHarness()
    await composable.open()
    await flushPromises()

    composable.reset()

    expect(composable.modalOpen.value).toBe(false)
    expect(composable.members.value).toEqual([])
    expect(composable.selectedUserIds.value).toEqual([])
    wrapper.unmount()
  })
})
