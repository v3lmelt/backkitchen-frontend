import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  meMock: vi.fn(),
  listMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  authApi: { me: mocks.meMock },
  userApi: { list: mocks.listMock },
}))

vi.mock('@/router', () => ({
  default: { push: mocks.pushMock },
}))

import { useAppStore } from './app'

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mocks.meMock.mockReset()
    mocks.listMock.mockReset()
    mocks.pushMock.mockReset()
  })

  it('persists auth changes', () => {
    const store = useAppStore()
    const user = { id: 1, username: 'nova', display_name: 'Nova', role: 'member', avatar_color: '#123456', created_at: '2024-01-01' }

    store.setAuth(user as any, 'token-1')
    expect(localStorage.getItem('backkitchen_token')).toBe('token-1')
    expect(JSON.parse(localStorage.getItem('backkitchen_user') || '{}').id).toBe(1)

    store.clearAuth()
    expect(localStorage.getItem('backkitchen_token')).toBeNull()
    expect(localStorage.getItem('backkitchen_user')).toBeNull()
  })

  it('bootstraps current user from auth api', async () => {
    localStorage.setItem('backkitchen_token', 'token-1')
    mocks.meMock.mockResolvedValue({ id: 2, username: 'echo', display_name: 'Echo', role: 'mastering_engineer', avatar_color: '#222222', created_at: '2024-01-01' })
    const store = useAppStore()

    await store.bootstrap()

    expect(mocks.meMock).toHaveBeenCalledTimes(1)
    expect(store.currentUser?.id).toBe(2)
    expect(store.bootstrapped).toBe(true)
  })

  it('clears auth when bootstrap fails', async () => {
    localStorage.setItem('backkitchen_token', 'token-1')
    localStorage.setItem('backkitchen_user', '{"id":9}')
    mocks.meMock.mockRejectedValue(new Error('unauthorized'))
    const store = useAppStore()

    await store.bootstrap()

    expect(store.currentUser).toBeNull()
    expect(store.token).toBeNull()
  })

  it('loads users only when authenticated', async () => {
    const store = useAppStore()
    await store.loadUsers()
    expect(mocks.listMock).not.toHaveBeenCalled()

    store.setAuth({ id: 1, username: 'nova', display_name: 'Nova', role: 'member', avatar_color: '#123456', created_at: '2024-01-01' } as any, 'token-1')
    mocks.listMock.mockResolvedValue([{ id: 2 }])
    await store.loadUsers()
    expect(mocks.listMock).toHaveBeenCalledTimes(1)
    expect(store.users).toEqual([{ id: 2 }])
  })

  it('logout clears auth and routes to login', () => {
    const store = useAppStore()
    store.setAuth({ id: 1, username: 'nova', display_name: 'Nova', role: 'member', avatar_color: '#123456', created_at: '2024-01-01' } as any, 'token-1')

    store.logout()

    expect(store.currentUser).toBeNull()
    expect(mocks.pushMock).toHaveBeenCalledWith('/login')
  })
})
