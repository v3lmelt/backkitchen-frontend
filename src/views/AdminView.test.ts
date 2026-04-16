import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  dashboardMock: vi.fn(),
  listUsersMock: vi.fn(),
  updateUserMock: vi.fn(),
  suspendUserMock: vi.fn(),
  restoreUserMock: vi.fn(),
  revokeUserSessionsMock: vi.fn(),
  deleteUserMock: vi.fn(),
  transferOwnershipMock: vi.fn(),
  listAlbumsMock: vi.fn(),
  listAlbumTracksMock: vi.fn(),
  listCirclesMock: vi.fn(),
  activityLogMock: vi.fn(),
  auditLogMock: vi.fn(),
  listReopenRequestsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  currentUser: { id: 1, is_admin: true, admin_role: 'superadmin' },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replaceMock, push: mocks.pushMock }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ currentUser: mocks.currentUser }),
}))

vi.mock('@/api', () => ({
  adminApi: {
    dashboard: mocks.dashboardMock,
    listUsers: mocks.listUsersMock,
    updateUser: mocks.updateUserMock,
    suspendUser: mocks.suspendUserMock,
    restoreUser: mocks.restoreUserMock,
    revokeUserSessions: mocks.revokeUserSessionsMock,
    deleteUser: mocks.deleteUserMock,
    transferOwnership: mocks.transferOwnershipMock,
    listAlbums: mocks.listAlbumsMock,
    listAlbumTracks: mocks.listAlbumTracksMock,
    listCircles: mocks.listCirclesMock,
    activityLog: mocks.activityLogMock,
    auditLog: mocks.auditLogMock,
    listReopenRequests: mocks.listReopenRequestsMock,
  },
  albumApi: {
    archive: vi.fn(),
    restore: vi.fn(),
  },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: mocks.toastSuccessMock, error: mocks.toastErrorMock }),
}))

vi.mock('@/components/common/ConfirmModal.vue', () => ({
  default: {
    props: ['title'],
    emits: ['confirm', 'cancel'],
    template: '<div class="confirm-modal"><button class="confirm-delete" @click="$emit(\'confirm\')">confirm</button></div>',
  },
}))

import AdminView from './AdminView.vue'

async function openTab(wrapper: ReturnType<typeof mountWithPlugins>, label: string) {
  const tab = wrapper.findAll('button').find(button => button.text() === label)
  if (!tab) throw new Error(`Tab ${label} not found`)
  await tab.trigger('click')
  await flushPromises()
}

describe('AdminView', () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset()
    mocks.pushMock.mockReset()
    mocks.dashboardMock.mockReset()
    mocks.listUsersMock.mockReset()
    mocks.updateUserMock.mockReset()
    mocks.suspendUserMock.mockReset()
    mocks.restoreUserMock.mockReset()
    mocks.revokeUserSessionsMock.mockReset()
    mocks.deleteUserMock.mockReset()
    mocks.transferOwnershipMock.mockReset()
    mocks.listAlbumsMock.mockReset()
    mocks.listAlbumTracksMock.mockReset()
    mocks.listCirclesMock.mockReset()
    mocks.activityLogMock.mockReset()
    mocks.auditLogMock.mockReset()
    mocks.listReopenRequestsMock.mockReset()
    mocks.toastSuccessMock.mockReset()
    mocks.toastErrorMock.mockReset()
    mocks.currentUser = { id: 1, is_admin: true, admin_role: 'superadmin' }

    mocks.dashboardMock.mockResolvedValue({
      total_users: 2,
      users_by_role: { producer: 1, member: 1 },
      total_albums: 1,
      active_albums: 1,
      archived_albums: 0,
      total_tracks: 1,
      tracks_by_status: { intake: 1 },
      archived_tracks: 0,
      open_issues: 0,
      pending_reopen_requests: 0,
      failed_webhook_deliveries: 0,
      unverified_users: 1,
      suspended_users: 0,
      stalled_tracks: 0,
      recent_events: [],
      recent_audits: [],
    })
    mocks.listUsersMock.mockResolvedValue([
      {
        id: 1,
        username: 'admin',
        display_name: 'Admin',
        email: 'admin@example.com',
        role: 'producer',
        is_admin: true,
        admin_role: 'superadmin',
        email_verified: true,
        avatar_color: '#111111',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        username: 'member',
        display_name: 'Member',
        email: 'member@example.com',
        role: 'member',
        is_admin: false,
        admin_role: 'none',
        email_verified: false,
        avatar_color: '#222222',
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
    mocks.updateUserMock.mockImplementation(async (id: number, payload: Record<string, unknown>) => ({
      id,
      username: id === 1 ? 'admin' : 'member',
      display_name: id === 1 ? 'Admin' : 'Member',
      email: id === 1 ? 'admin@example.com' : 'member@example.com',
      role: (payload.role as string | undefined) ?? 'member',
      is_admin: payload.admin_role ? payload.admin_role !== 'none' : false,
      admin_role: (payload.admin_role as string | undefined) ?? 'none',
      email_verified: (payload.email_verified as boolean | undefined) ?? false,
      avatar_color: '#222222',
      created_at: '2026-01-01T00:00:00Z',
    }))
    mocks.suspendUserMock.mockResolvedValue({
      id: 2,
      username: 'member',
      display_name: 'Member',
      email: 'member@example.com',
      role: 'member',
      is_admin: false,
      admin_role: 'none',
      email_verified: false,
      avatar_color: '#222222',
      suspended_at: '2026-02-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    })
    mocks.restoreUserMock.mockResolvedValue({
      id: 2,
      username: 'member',
      display_name: 'Member',
      email: 'member@example.com',
      role: 'member',
      is_admin: false,
      admin_role: 'none',
      email_verified: false,
      avatar_color: '#222222',
      suspended_at: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    mocks.revokeUserSessionsMock.mockResolvedValue({})
    mocks.deleteUserMock.mockResolvedValue(undefined)
    mocks.transferOwnershipMock.mockResolvedValue({ albums: 1 })
    mocks.listAlbumsMock.mockResolvedValue([])
    mocks.listAlbumTracksMock.mockResolvedValue([])
    mocks.listCirclesMock.mockResolvedValue([])
    mocks.activityLogMock.mockResolvedValue([])
    mocks.auditLogMock.mockResolvedValue([])
    mocks.listReopenRequestsMock.mockResolvedValue([])
  })

  it('redirects non-admin users away from the page', async () => {
    mocks.currentUser = { id: 9, is_admin: false, admin_role: 'none' }

    mountWithPlugins(AdminView)
    await flushPromises()

    expect(mocks.replaceMock).toHaveBeenCalledWith('/')
  })

  it('loads dashboard for admins', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()

    expect(mocks.dashboardMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Admin Console')
    expect(wrapper.text()).toContain('Users')
  })

  it('updates user role and admin access', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()
    await openTab(wrapper, 'Users')

    const selects = wrapper.findAll('select')
    await selects[0].setValue('producer')
    await selects[1].setValue('superadmin')
    await flushPromises()

    expect(mocks.updateUserMock).toHaveBeenCalledWith(1, { role: 'producer' })
    expect(mocks.updateUserMock).toHaveBeenCalledWith(1, { admin_role: 'superadmin' })
  })

  it('suspends a user and deletes through confirmation', async () => {
    const wrapper = mountWithPlugins(AdminView)
    await flushPromises()
    await openTab(wrapper, 'Users')

    const memberRow = wrapper.findAll('tr').find(row => row.text().includes('Member') && row.text().includes('@member'))
    if (!memberRow) throw new Error('Member row not found')

    const suspendButton = memberRow.findAll('button').find(button => button.text() === 'Suspend')
    await suspendButton!.trigger('click')
    await flushPromises()

    expect(mocks.suspendUserMock).toHaveBeenCalledWith(2, 'Suspended from admin console')

    const deleteButton = memberRow.findAll('button').find(button => button.text() === 'Soft Delete')
    await deleteButton!.trigger('click')
    await wrapper.find('button.confirm-delete').trigger('click')
    await flushPromises()

    expect(mocks.deleteUserMock).toHaveBeenCalledWith(2, 'Soft deleted from admin console')
  })
})
