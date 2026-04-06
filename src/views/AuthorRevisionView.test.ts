import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackGetMock: vi.fn(),
  issueUpdateMock: vi.fn(),
  uploadSourceVersionMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '8' } }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  trackApi: { get: mocks.trackGetMock, uploadSourceVersion: mocks.uploadSourceVersionMock },
  issueApi: { update: mocks.issueUpdateMock },
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<div class="status-badge" />' },
}))

import AuthorRevisionView from './AuthorRevisionView.vue'

describe('AuthorRevisionView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.issueUpdateMock.mockReset()
    mocks.uploadSourceVersionMock.mockReset()
    mocks.trackGetMock.mockResolvedValue({
      track: { id: 8, title: 'Track 8', status: 'mastering_revision', workflow_cycle: 3 },
      issues: [
        { id: 1, phase: 'mastering', workflow_cycle: 3, status: 'open', title: 'Issue A', description: 'A', time_start: 1 },
        { id: 2, phase: 'mastering', workflow_cycle: 3, status: 'disagreed', title: 'Issue B', description: 'B', time_start: 2 },
        { id: 3, phase: 'peer', workflow_cycle: 3, status: 'open', title: 'Ignore', description: 'X', time_start: 3 },
      ],
      checklist_items: [],
      events: [],
    })
    mocks.issueUpdateMock.mockResolvedValue({ id: 1, phase: 'mastering', workflow_cycle: 3, status: 'disagreed', title: 'Issue A', description: 'A', time_start: 1 })
    mocks.uploadSourceVersionMock.mockResolvedValue({})
  })

  it('filters issues by current revision phase and updates issue responses', async () => {
    const wrapper = mountWithPlugins(AuthorRevisionView)
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('1')
    await wrapper.find('button.btn-secondary.text-xs').trigger('click')
    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(1, { status: 'disagreed' })
  })

  it('uploads a selected revision file and routes back', async () => {
    const wrapper = mountWithPlugins(AuthorRevisionView)
    await Promise.resolve()
    await Promise.resolve()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'revision.wav', { type: 'audio/wav' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await wrapper.findAll('button').at(-1)!.trigger('click')

    expect(mocks.uploadSourceVersionMock).toHaveBeenCalledWith(8, file)
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/8')
  })
})
