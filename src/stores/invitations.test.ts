import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listMineMock: vi.fn(),
  acceptMock: vi.fn(),
  declineMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  AUTH_TOKEN_KEY: 'backkitchen_token',
  AUTH_USER_KEY: 'backkitchen_user',
  getAuthToken: () => localStorage.getItem('backkitchen_token'),
  authApi: { me: vi.fn() },
  configApi: { get: vi.fn().mockResolvedValue({ r2_enabled: false }) },
  invitationApi: {
    listMine: mocks.listMineMock,
    accept: mocks.acceptMock,
    decline: mocks.declineMock,
  },
  notificationApi: { list: vi.fn().mockResolvedValue([]), markAllRead: vi.fn(), markRead: vi.fn() },
  userApi: { list: vi.fn() },
  onAuthCleared: vi.fn(),
}))

import { useAppStore } from './app'
import { useInvitationsStore } from './invitations'

function authenticate() {
  useAppStore().setAuth({
    id: 1,
    username: 'nova',
    display_name: 'Nova',
    role: 'member',
    avatar_color: '#123456',
    created_at: '2024-01-01',
  } as any, 'token-1')
}

describe('invitations store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mocks.listMineMock.mockReset()
    mocks.acceptMock.mockReset()
    mocks.declineMock.mockReset()
    mocks.listMineMock.mockResolvedValue([])
  })

  it('does not call the api when unauthenticated', async () => {
    const store = useInvitationsStore()

    await store.loadPendingInvitations()

    expect(mocks.listMineMock).not.toHaveBeenCalled()
    expect(store.pendingInvitations).toEqual([])
  })

  it('loads pending invitations when authenticated', async () => {
    authenticate()
    mocks.listMineMock.mockResolvedValue([{ id: 1 }, { id: 2 }])
    const store = useInvitationsStore()

    await store.loadPendingInvitations()

    expect(store.pendingInvitations).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('falls back to an empty list on api errors and malformed payloads', async () => {
    authenticate()
    const store = useInvitationsStore()

    mocks.listMineMock.mockResolvedValueOnce({ not: 'an array' })
    await store.loadPendingInvitations()
    expect(store.pendingInvitations).toEqual([])

    mocks.listMineMock.mockRejectedValueOnce(new Error('boom'))
    await store.loadPendingInvitations()
    expect(store.pendingInvitations).toEqual([])
  })

  it('accept and decline remove the invitation from the list', async () => {
    authenticate()
    await flushPromises()
    const store = useInvitationsStore()
    store.pendingInvitations = [{ id: 1 } as any, { id: 2 } as any]

    await store.acceptInvitation(1)
    expect(mocks.acceptMock).toHaveBeenCalledWith(1)
    expect(store.pendingInvitations.map(i => i.id)).toEqual([2])

    await store.declineInvitation(2)
    expect(mocks.declineMock).toHaveBeenCalledWith(2)
    expect(store.pendingInvitations).toEqual([])
  })

  it('reset clears the list', () => {
    const store = useInvitationsStore()
    store.pendingInvitations = [{ id: 1 } as any]

    store.reset()

    expect(store.pendingInvitations).toEqual([])
  })
})
