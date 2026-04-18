import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  userListMock: vi.fn(),
  circleListMock: vi.fn(),
  circleGetMock: vi.fn(),
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
    get: mocks.circleGetMock,
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
    emits: ['update:modelValue'],
    template: `
      <div class="custom-select-stub">
        <div class="custom-select-placeholder">{{ placeholder }}</div>
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="custom-select-option"
          @click="$emit('update:modelValue', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    `,
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
    mocks.circleGetMock.mockReset()
    mocks.createMock.mockReset()
    mocks.uploadCoverMock.mockReset()
    mocks.updateTeamMock.mockReset()
    mocks.updateDeadlinesMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.toastWarningMock.mockReset()

    mocks.userListMock.mockResolvedValue([
      { id: 1, display_name: 'Producer' },
      { id: 2, display_name: 'Engineer' },
      { id: 3, display_name: 'Member' },
      { id: 4, display_name: 'Outsider' },
    ])
    mocks.circleListMock.mockResolvedValue([])
    mocks.circleGetMock.mockResolvedValue({
      id: 9,
      default_checklist_enabled: true,
      members: [
        { id: 1, user_id: 1, role: 'owner', joined_at: '2024-01-01T00:00:00Z', user: { id: 1, display_name: 'Producer' } },
        { id: 2, user_id: 3, role: 'member', joined_at: '2024-01-01T00:00:00Z', user: { id: 3, display_name: 'Member' } },
      ],
    })
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
      mastering_engineer_id: null,
      member_ids: [],
      deadline: null,
      phase_deadlines: null,
      checklist_enabled: false,
    })
    expect(wrapper.text()).toContain('Create failed')
    expect(mocks.toastErrorMock).toHaveBeenCalledWith('Create failed')
    expect(mocks.pushMock).not.toHaveBeenCalled()
  })

  it('rejects oversized cover files before submission', async () => {
    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'cover.png', { type: 'image/png' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })

    await fileInput.trigger('change')

    expect(mocks.toastErrorMock).toHaveBeenCalledWith('File too large, maximum allowed is 20 MB')
  })

  it('shows a localized warning when the album is created but cover upload fails', async () => {
    mocks.createMock.mockResolvedValue({ id: 12 })
    mocks.uploadCoverMock.mockRejectedValue(new Error('File too large. Maximum size is 20 MB.'))

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('Album With Cover')
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['cover'], 'cover.png', { type: 'image/png' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.findAll('button').find(button => button.text().includes('Create Album'))!.trigger('click')
    await flushPromises()

    expect(mocks.uploadCoverMock).toHaveBeenCalledWith(12, expect.any(File))
    expect(mocks.toastWarningMock).toHaveBeenCalledWith(
      'The album was created, but the cover upload failed: File too large, maximum allowed is 20 MB. Please re-upload it in album settings.',
    )
    expect(mocks.pushMock).toHaveBeenCalledWith('/albums/12/settings')
  })

  it('filters team members to the selected circle and removes invalid picks before save', async () => {
    mocks.circleListMock.mockResolvedValue([
      { id: 9, name: 'Back Kitchen', description: null, logo_url: null, created_by: 1, member_count: 2 },
    ])
    mocks.createMock.mockResolvedValue({ id: 12 })

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    const memberLabel = wrapper.findAll('label').find(label => label.text().includes('Member'))
    const outsiderLabel = wrapper.findAll('label').find(label => label.text().includes('Outsider'))
    await memberLabel!.find('input.checkbox').setValue(true)
    await outsiderLabel!.find('input.checkbox').setValue(true)

    expect(wrapper.text()).toContain('Outsider')

    await wrapper.findAll('button.custom-select-option').find(button => button.text() === 'Back Kitchen')!.trigger('click')
    await flushPromises()

    expect(mocks.circleGetMock).toHaveBeenCalledWith(9)
    expect(wrapper.text()).not.toContain('Outsider')

    await wrapper.find('input.input-field').setValue('Circle Album')
    await wrapper.findAll('button').find(button => button.text().includes('Create Album'))!.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledWith({
      title: 'Circle Album',
      description: '',
      circle_id: 9,
      mastering_engineer_id: null,
      member_ids: [3],
      deadline: null,
      phase_deadlines: null,
      checklist_enabled: null,
    })
    expect(mocks.updateTeamMock).not.toHaveBeenCalled()
    expect(mocks.updateDeadlinesMock).not.toHaveBeenCalled()
  })

  it('submits deadline fields with album creation instead of a follow-up request', async () => {
    mocks.createMock.mockResolvedValue({ id: 12 })

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    await wrapper.find('input.input-field').setValue('Timed Album')
    await wrapper.find('input[type="date"]').setValue('2025-01-10')

    const peerReviewLabel = wrapper.findAll('label').find(label => label.text().includes('Peer Review Deadline'))
    await peerReviewLabel!.find('input.checkbox').setValue(true)
    await flushPromises()

    const peerReviewDateInputs = wrapper.findAll('input[type="date"]')
    await peerReviewDateInputs[1].setValue('2025-01-05')

    await wrapper.findAll('button').find(button => button.text().includes('Create Album'))!.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledWith({
      title: 'Timed Album',
      description: '',
      mastering_engineer_id: null,
      member_ids: [],
      deadline: '2025-01-10T00:00:00.000Z',
      phase_deadlines: {
        peer_review: '2025-01-05T00:00:00.000Z',
      },
      checklist_enabled: false,
    })
    expect(mocks.updateDeadlinesMock).not.toHaveBeenCalled()
  })

  it('lets producers change the default reviewer assignment and checklist policy before creation', async () => {
    mocks.circleListMock.mockResolvedValue([
      { id: 9, name: 'Back Kitchen', description: null, logo_url: null, created_by: 1, member_count: 2 },
    ])
    mocks.circleGetMock.mockResolvedValue({
      id: 9,
      default_checklist_enabled: false,
      members: [
        { id: 1, user_id: 1, role: 'owner', joined_at: '2024-01-01T00:00:00Z', user: { id: 1, display_name: 'Producer' } },
      ],
    })
    mocks.createMock.mockResolvedValue({ id: 22 })

    const wrapper = mountWithPlugins(AlbumNewView)
    await flushPromises()

    await wrapper.findAll('button.custom-select-option').find(button => button.text() === 'Back Kitchen')!.trigger('click')
    await flushPromises()

    await wrapper.find('input.input-field').setValue('Workflow Album')
    await wrapper.findAll('button').find(button => button.text().includes('Manual'))!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().trim() === 'Enabled')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('Create Album'))!.trigger('click')
    await flushPromises()

    expect(mocks.createMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Workflow Album',
      circle_id: 9,
      checklist_enabled: true,
      workflow_config: expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({ id: 'peer_review', assignment_mode: 'manual' }),
        ]),
      }),
    }))
  })
})
