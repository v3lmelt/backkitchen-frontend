import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  dashboardMock: vi.fn(),
  listUsersMock: vi.fn(),
  updateUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  currentUser: { id: 1, is_admin: true },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replaceMock }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/api', () => ({
  adminApi: {
    dashboard: mocks.dashboardMock,
    listUsers: mocks.listUsersMock,
    updateUser: mocks.updateUserMock,
    deleteUser: mocks.deleteUserMock,
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: mocks.toastSuccessMock, error: mocks.toastErrorMock }),
}))

vi.mock('@/components/common/ConfirmModal.vue', () => ({
  default: {
    emits: ['confirm', 'cancel'],
    template: '<div class="confirm-modal"><button class="confirm-delete" @click="$emit(\'confirm\')">confirm</button></div>',
  },
}))

vi.mock('@/components/common/CustomSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: `
      <select class="custom-select" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    `,
  },
}))

import AdminView from './AdminView.vue'

async function openUsersTab(wrapper: ReturnType<typeof mountWithPlugins>) {
  const tab = wrapper.findAll('button').find(button => button.text().includes('User Management'))
  if (!tab) throw new Error('User Management tab not found')
  await tab.trigger('click')
  await flushPromises()
}

describe('AdminView', () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset()
    mocks.dashboardMock.mockReset()
    mocks.listUsersMock.mockReset()
    mocks.updateUserMock.mockReset()
    mocks.deleteUserMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.currentUser = { id: 1, is_admin: true }
    mocks.dashboardMock.mockResolvedValue({
      total_users: 2,
      active_albums: 1,
      total_albums: 1,
      total_tracks: 1,
      open_issues: 0,
      overdue_tracks: 0,
      tracks_by_status: {},
      users_by_role: { producer: 1, member: 1 },
      recent_events: [],
      recent_activity: [],
    })
    mocks.listUsersMock.mockResolvedValue([
      {
        id: 1,
        username: 'admin',
        display_name: 'Admin',
        email: 'admin@example.com',
        role: 'producer',
        is_admin: true,
        email_verified: true,
        avatar_color: '#111111',
      },
      {
        id: 2,
        username: 'member',
        display_name: 'Member',
        email: 'member@example.com',
        role: 'member',
        is_admin: false,
        email_verified: false,
        avatar_color: '#222222',
      },
    ])
    mocks.updateUserMock.mockImplementation(async (id: number, payload: Record<string, unknown>) => ({
      id,
      username: id === 1 ? 'admin' : 'member',
      display_name: id === 1 ? 'Admin' : 'Member',
      email: id === 1 ? 'admin@example.com' : 'member@example.com',
      role: payload.role ?? 'member',
      is_admin: payload.is_admin ?? false,
      email_verified: payload.email_verified ?? false,
      avatar_color: '#222222',
    }))
    mocks.deleteUserMock.mockResolvedValue(undefined)
  })

  it('redirects non-admin users away from the page', async () => {
    mocks.currentUser = { id: 9, is_admin: false }

    mountWithPlugins(AdminView)
    await flushPromises()

    expect(mocks.replaceMock).toHaveBeenCalledWith('/')
    expect(mocks.listUsersMock).not.toHaveBeenCalled()
  })

  it('loads users for admins', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()
    await openUsersTab(wrapper)

    expect(mocks.listUsersMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('Member')
  })

  it('updates role, admin flag, and verification flag', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()
    await openUsersTab(wrapper)

    const selects = wrapper.findAll('select.custom-select')
    await selects[1].setValue('producer')

    const memberRowButtons = wrapper.findAll('tbody tr')[1].findAll('button')
    await memberRowButtons[0].trigger('click')
    await memberRowButtons[1].trigger('click')
    await flushPromises()

    expect(mocks.updateUserMock).toHaveBeenCalledWith(2, { role: 'producer' })
    expect(mocks.updateUserMock).toHaveBeenCalledWith(2, { is_admin: true })
    expect(mocks.updateUserMock).toHaveBeenCalledWith(2, { email_verified: true })
  })

  it('deletes a user after confirmation', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()
    await openUsersTab(wrapper)

    await wrapper.findAll('button').find(button => button.text() === 'Delete')!.trigger('click')
    await wrapper.find('button.confirm-delete').trigger('click')
    await flushPromises()

    expect(mocks.deleteUserMock).toHaveBeenCalledWith(2)
    expect(wrapper.text()).not.toContain('member@example.com')
  })
})
