import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  userListMock: vi.fn(),
  circleListMock: vi.fn(),
  createMock: vi.fn(),
  uploadCoverMock: vi.fn(),
  updateTeamMock: vi.fn(),
  updateDeadlinesMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
  currentUser: { id: 1, role: 'producer', display_name: 'Producer' },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    replace: mocks.replaceMock,
    back: mocks.backMock,
  }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/api', () => ({
  albumApi: {
    create: mocks.createMock,
    uploadCover: mocks.uploadCoverMock,
    updateTeam: mocks.updateTeamMock,
    updateDeadlines: mocks.updateDeadlinesMock,
  },
  circleApi: {
    list: mocks.circleListMock,
    listWorkflowTemplates: vi.fn(),
    createWorkflowTemplate: vi.fn(),
  },
  userApi: {
    list: mocks.userListMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    currentUser: mocks.currentUser,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: mocks.toastErrorMock,
    warning: mocks.toastWarningMock,
  }),
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options', 'placeholder'],
    template: '<div class="custom-select-stub">{{ placeholder }}</div>',
  },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: {
    props: ['rows', 'card'],
    template: '<div class="skeleton-loader" />',
  },
}))

vi.mock('@/components/workflow/WorkflowEditor.vue', () => ({
  default: {
    props: ['workflowConfig', 'memberOptions'],
    template: '<div class="workflow-editor-stub" />',
  },
}))

import AlbumNewView from './AlbumNewView.vue'

describe('AlbumNewView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.backMock.mockReset()
    mocks.userListMock.mockReset()
    mocks.circleListMock.mockReset()
    mocks.createMock.mockReset()
    mocks.uploadCoverMock.mockReset()
    mocks.updateTeamMock.mockReset()
    mocks.updateDeadlinesMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.toastWarningMock.mockReset()

    mocks.userListMock.mockResolvedValue([
      { id: 2, display_name: 'Engineer' },
      { id: 3, display_name: 'Member' },
    ])
    mocks.circleListMock.mockResolvedValue([])
  })

  it('shows a retryable error state when initial options fail to load', async () => {
    mocks.userListMock
      .mockRejectedValueOnce(new Error('Initial options failed'))
      .mockResolvedValueOnce([{ id: 2, display_name: 'Engineer' }])

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    expect(mocks.userListMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Initial options failed')
    expect(wrapper.text()).toContain('Retry')

    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()

    expect(mocks.userListMock).toHaveBeenCalledTimes(2)
    expect(mocks.circleListMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Initial options failed')
    expect(wrapper.text()).toContain('New Album')
  })

  it('shows the create error inline and via toast when album creation fails', async () => {
    mocks.createMock.mockRejectedValue(new Error('Create failed'))

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('Test Album')
    await wrapper.findAll('button').find(button => button.text().includes('Create Album'))!.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledWith({
      title: 'Test Album',
      description: '',
    })
    expect(wrapper.text()).toContain('Create failed')
    expect(mocks.toastErrorMock).toHaveBeenCalledWith('Create failed')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })
})
