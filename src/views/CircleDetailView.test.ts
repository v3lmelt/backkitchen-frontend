import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  route: { params: { circleId: '9' } },
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  circleGetMock: vi.fn(),
  listInviteCodesMock: vi.fn(),
  updateMemberRoleMock: vi.fn(),
  currentUser: { id: 1 },
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.pushMock, replace: mocks.replaceMock }),
  RouterLink: { template: '<a><slot /></a>' },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  }),
}))

vi.mock('@/api', () => ({
  API_ORIGIN: '',
  circleApi: {
    get: mocks.circleGetMock,
    listInviteCodes: mocks.listInviteCodesMock,
    update: vi.fn(),
    uploadLogo: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: mocks.updateMemberRoleMock,
    createInviteCode: vi.fn(),
    revokeInviteCode: vi.fn(),
    listWorkflowTemplates: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    leave: vi.fn(),
  },
}))

vi.mock('lucide-vue-next', () => ({
  Smile: { template: '<svg class="icon-smile" />' },
  Upload: { template: '<svg class="icon-upload" />' },
  Plus: { template: '<svg class="icon-plus" />' },
  Pencil: { template: '<svg class="icon-pencil" />' },
  Trash2: { template: '<svg class="icon-trash" />' },
  X: { template: '<svg class="icon-close" />' },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: { template: '<div class="skeleton-loader-stub" />' },
}))

vi.mock('@/components/common/ConfirmModal.vue', () => ({
  default: { template: '<div class="confirm-modal-stub" />' },
}))

vi.mock('@/components/workflow/WorkflowEditor.vue', () => ({
  default: { template: '<div class="workflow-editor-stub" />' },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    props: ['options'],
    template: '<select class="custom-select-stub"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}))

import CircleDetailView from './CircleDetailView.vue'

describe('CircleDetailView', () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset()
    mocks.pushMock.mockReset()
    mocks.circleGetMock.mockReset()
    mocks.listInviteCodesMock.mockReset()
    mocks.updateMemberRoleMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.currentUser = { id: 1 }
    mocks.circleGetMock.mockResolvedValue({
      id: 9,
      name: 'Back Kitchen',
      description: 'Circle description',
      website: null,
      logo_url: null,
      default_checklist_enabled: true,
      created_by: 1,
      created_at: '2024-01-01T00:00:00Z',
      members: [
        {
          id: 1,
          circle_id: 9,
          user_id: 1,
          role: 'owner',
          joined_at: '2024-01-01T00:00:00Z',
          user: {
            id: 1,
            username: 'producer',
            display_name: 'Producer',
            role: 'producer',
            avatar_color: '#123456',
            created_at: '2024-01-01T00:00:00Z',
            is_admin: false,
          },
        },
      ],
    })
    mocks.listInviteCodesMock.mockResolvedValue([])
    mocks.updateMemberRoleMock.mockResolvedValue({
      id: 2,
      circle_id: 9,
      user_id: 2,
      role: 'co_producer',
      joined_at: '2024-01-01T00:00:00Z',
      user: {
        id: 2,
        username: 'member',
        display_name: 'Member',
        role: 'member',
        avatar_color: '#654321',
        created_at: '2024-01-01T00:00:00Z',
        is_admin: false,
      },
    })
  })

  it('allows invite codes to last up to 365 days', async () => {
    const wrapper = mountWithPlugins(CircleDetailView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().trim() === 'Invite Codes')!.trigger('click')
    await flushPromises()

    const dayInput = wrapper.find('input[type="number"]')
    expect(dayInput.attributes('max')).toBe('365')
  })

  it('allows owners to promote members to co-producer from the member list', async () => {
    mocks.circleGetMock.mockResolvedValue({
      id: 9,
      name: 'Back Kitchen',
      description: 'Circle description',
      website: null,
      logo_url: null,
      default_checklist_enabled: true,
      created_by: 1,
      created_at: '2024-01-01T00:00:00Z',
      members: [
        {
          id: 1,
          circle_id: 9,
          user_id: 1,
          role: 'owner',
          joined_at: '2024-01-01T00:00:00Z',
          user: {
            id: 1,
            username: 'producer',
            display_name: 'Producer',
            role: 'producer',
            avatar_color: '#123456',
            created_at: '2024-01-01T00:00:00Z',
            is_admin: false,
          },
        },
        {
          id: 2,
          circle_id: 9,
          user_id: 2,
          role: 'member',
          joined_at: '2024-01-01T00:00:00Z',
          user: {
            id: 2,
            username: 'member',
            display_name: 'Member',
            role: 'member',
            avatar_color: '#654321',
            created_at: '2024-01-01T00:00:00Z',
            is_admin: false,
          },
        },
      ],
    })
    const wrapper = mountWithPlugins(CircleDetailView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().trim() === 'Members')!.trigger('click')
    await flushPromises()
    await wrapper.find('.select-field-sm').setValue('co_producer')
    await flushPromises()

    expect(mocks.updateMemberRoleMock).toHaveBeenCalledWith(9, 2, { role: 'co_producer' })
    expect(mocks.toastSuccessMock).toHaveBeenCalled()
  })
})
