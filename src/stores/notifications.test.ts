import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  notificationListMock: vi.fn(),
  markAllReadMock: vi.fn(),
  markReadMock: vi.fn(),
}))

vi.mock('@/api', () => ({
  AUTH_TOKEN_KEY: 'backkitchen_token',
  AUTH_USER_KEY: 'backkitchen_user',
  getAuthToken: () => localStorage.getItem('backkitchen_token'),
  authApi: { me: vi.fn() },
  configApi: { get: vi.fn().mockResolvedValue({ r2_enabled: false }) },
  invitationApi: { listMine: vi.fn().mockResolvedValue([]), accept: vi.fn(), decline: vi.fn() },
  notificationApi: {
    list: mocks.notificationListMock,
    markAllRead: mocks.markAllReadMock,
    markRead: mocks.markReadMock,
  },
  userApi: { list: vi.fn() },
  onAuthCleared: vi.fn(),
}))

import { useAppStore } from './app'
import { useNotificationsStore } from './notifications'

class TestWebSocket {
  static instances: TestWebSocket[] = []

  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  close = vi.fn()

  url: string

  constructor(url: string) {
    this.url = url
    TestWebSocket.instances.push(this)
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent)
  }

  emitClose() {
    this.onclose?.({} as CloseEvent)
  }
}

function authenticate() {
  const appStore = useAppStore()
  appStore.setAuth({
    id: 1,
    username: 'nova',
    display_name: 'Nova',
    role: 'member',
    avatar_color: '#123456',
    created_at: '2024-01-01',
  } as any, 'token-1')
  return appStore
}

describe('notifications store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('WebSocket', TestWebSocket as unknown as typeof WebSocket)
    TestWebSocket.instances = []
    mocks.notificationListMock.mockReset()
    mocks.markAllReadMock.mockReset()
    mocks.markReadMock.mockReset()
    mocks.notificationListMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('clears state instead of calling the api when unauthenticated', async () => {
    const store = useNotificationsStore()
    store.notifications = [{ id: 1 } as any]

    await store.loadNotifications()

    expect(mocks.notificationListMock).not.toHaveBeenCalled()
    expect(store.notifications).toEqual([])
  })

  it('loads notifications and derives hasMore/unreadCount', async () => {
    const store = useNotificationsStore()
    authenticate()
    mocks.notificationListMock.mockResolvedValue([
      { id: 1, is_read: false },
      { id: 2, is_read: true },
    ])

    await store.loadNotifications({ limit: 2 })

    expect(store.notifications.map(n => n.id)).toEqual([1, 2])
    expect(store.notificationsHasMore).toBe(true)
    expect(store.unreadCount).toBe(1)
  })

  it('appends without duplicates when loading more', async () => {
    const store = useNotificationsStore()
    authenticate()
    mocks.notificationListMock
      .mockResolvedValueOnce([{ id: 1, is_read: true }, { id: 2, is_read: true }])
      .mockResolvedValueOnce([{ id: 2, is_read: true }, { id: 3, is_read: true }])

    await store.loadNotifications({ limit: 2 })
    await store.loadMoreNotifications()

    expect(store.notifications.map(n => n.id)).toEqual([1, 2, 3])
    expect(store.notificationsLoadingMore).toBe(false)
  })

  it('marks single and all notifications read', async () => {
    const store = useNotificationsStore()
    authenticate()
    await flushPromises()
    store.notifications = [{ id: 1, is_read: false } as any, { id: 2, is_read: false } as any]

    await store.markNotificationRead(1)
    expect(mocks.markReadMock).toHaveBeenCalledWith(1)
    expect(store.unreadCount).toBe(1)

    await store.markAllRead()
    expect(mocks.markAllReadMock).toHaveBeenCalled()
    expect(store.unreadCount).toBe(0)
  })

  it('opens the notification socket with the auth token and reloads on updates', async () => {
    authenticate()

    expect(TestWebSocket.instances).toHaveLength(1)
    expect(TestWebSocket.instances[0].url).toContain('/ws/notifications?token=token-1')

    TestWebSocket.instances[0].emitOpen()
    await flushPromises()
    expect(useNotificationsStore().notificationChannelConnected).toBe(true)

    mocks.notificationListMock.mockClear()
    TestWebSocket.instances[0].emitMessage({ type: 'notifications_updated' })
    await flushPromises()
    expect(mocks.notificationListMock).toHaveBeenCalledTimes(1)

    TestWebSocket.instances[0].emitMessage('not-json')
    await flushPromises()
    expect(mocks.notificationListMock).toHaveBeenCalledTimes(1)
  })

  it('does not open the socket without auth', () => {
    const store = useNotificationsStore()
    store.startNotificationChannel()

    expect(TestWebSocket.instances).toHaveLength(0)
  })

  it('reconnects with backoff after close and stops on reset', async () => {
    vi.useFakeTimers()
    authenticate()
    const store = useNotificationsStore()
    const first = TestWebSocket.instances[0]

    first.emitClose()
    expect(store.notificationChannelConnected).toBe(false)

    vi.advanceTimersByTime(1999)
    expect(TestWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(TestWebSocket.instances).toHaveLength(2)

    store.reset()
    const second = TestWebSocket.instances[1]
    vi.advanceTimersByTime(30000)
    expect(TestWebSocket.instances).toHaveLength(2)
    expect(second.close).toHaveBeenCalledTimes(1)
    expect(store.notifications).toEqual([])
  })

  it('polls every 30 seconds while the channel is running', async () => {
    vi.useFakeTimers()
    authenticate()
    await flushPromises()
    const initialCalls = mocks.notificationListMock.mock.calls.length

    vi.advanceTimersByTime(30000)
    expect(mocks.notificationListMock.mock.calls.length).toBe(initialCalls + 1)

    useNotificationsStore().stopNotificationChannel()
    vi.advanceTimersByTime(60000)
    expect(mocks.notificationListMock.mock.calls.length).toBe(initialCalls + 1)
  })
})
