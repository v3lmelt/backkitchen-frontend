import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import { createTestI18n } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  issueUpdateMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  issueApi: {
    update: mocks.issueUpdateMock,
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

import { useIssueMutations } from './useIssueMutations'
import type { Issue } from '@/types'

type Composable = ReturnType<typeof useIssueMutations>

function makeIssue(overrides: Record<string, unknown> = {}): Issue {
  return {
    id: 1,
    title: 'Issue 1',
    status: 'open',
    ...overrides,
  } as unknown as Issue
}

function mountHarness(initialIssues: Issue[] = [makeIssue({ id: 1 }), makeIssue({ id: 2, title: 'Issue 2' })]) {
  let captured: Composable | null = null
  const issues = ref<Issue[]>(initialIssues)
  const selectedIssue = ref<Issue | null>(null)
  const Comp = defineComponent({
    setup() {
      captured = useIssueMutations({ issues, selectedIssue })
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
    issues,
    selectedIssue,
  }
}

describe('useIssueMutations', () => {
  beforeEach(() => {
    mocks.issueUpdateMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
  })

  it('replaces the updated issue in the list and syncs the open selection', () => {
    const { composable, issues, selectedIssue, wrapper } = mountHarness()
    selectedIssue.value = issues.value[0]

    composable.onIssueUpdated(makeIssue({ id: 1, status: 'resolved' }))

    expect(issues.value[0].status).toBe('resolved')
    expect(issues.value[1].title).toBe('Issue 2')
    expect(selectedIssue.value?.status).toBe('resolved')
    wrapper.unmount()
  })

  it('leaves the open selection alone when another issue is updated', () => {
    const { composable, issues, selectedIssue, wrapper } = mountHarness()
    selectedIssue.value = issues.value[0]

    composable.onIssueUpdated(makeIssue({ id: 2, status: 'resolved' }))

    expect(selectedIssue.value?.id).toBe(1)
    expect(selectedIssue.value?.status).toBe('open')
    wrapper.unmount()
  })

  it('applies quick status changes optimistically and confirms with the server issue', async () => {
    mocks.issueUpdateMock.mockResolvedValue(makeIssue({ id: 1, status: 'resolved', title: 'From server' }))
    const { composable, issues, wrapper } = mountHarness()

    const promise = composable.onQuickIssueStatusChange({ issue: issues.value[0], status: 'resolved' })
    expect(issues.value[0].status).toBe('resolved')
    await promise
    await flushPromises()

    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(1, { status: 'resolved' })
    expect(issues.value[0].title).toBe('From server')
    expect(mocks.toastErrorMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rolls back and toasts when the quick status change fails', async () => {
    mocks.issueUpdateMock.mockRejectedValue(new Error('No permission'))
    const { composable, issues, wrapper } = mountHarness()

    await composable.onQuickIssueStatusChange({ issue: issues.value[0], status: 'resolved' })
    await flushPromises()

    expect(issues.value[0].status).toBe('open')
    expect(mocks.toastErrorMock).toHaveBeenCalledWith('No permission')
    wrapper.unmount()
  })
})
