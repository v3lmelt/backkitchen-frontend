import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

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
  API_ORIGIN: '',
  trackApi: { get: mocks.trackGetMock },
  issueApi: { update: mocks.issueUpdateMock },
  uploadWithProgress: mocks.uploadSourceVersionMock,
  r2Api: {},
  uploadToR2: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ r2Enabled: false }),
}))

vi.mock('@/components/workflow/StatusBadge.vue', () => ({
  default: { template: '<div class="status-badge" />' },
}))

vi.mock('@/components/workflow/WorkflowActionBar.vue', () => ({
  default: {
    props: ['actions'],
    template: '<div class="workflow-actions"><button v-for="action in actions" :key="action.label" class="workflow-action" :disabled="action.disabled" @click="action.handler()">{{ action.label }}</button></div>',
  },
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
    await flushPromises()

    expect(wrapper.text()).toContain('1')
    await wrapper.find('button.btn-secondary.text-xs').trigger('click')
    expect(mocks.issueUpdateMock).toHaveBeenCalledWith(1, { status: 'disagreed' })
  })

  it('uploads a selected revision file and routes back', async () => {
    const wrapper = mountWithPlugins(AuthorRevisionView)
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'revision.wav', { type: 'audio/wav' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await wrapper.find('button.workflow-action').trigger('click')
    await flushPromises()

    expect(mocks.uploadSourceVersionMock).toHaveBeenCalledWith('/tracks/8/source-versions', expect.any(FormData), expect.any(Function))
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/8')
  })
})
