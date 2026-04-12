import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  loadNotificationsMock: vi.fn(),
  loadMoreNotificationsMock: vi.fn(),
  markNotificationReadMock: vi.fn(),
  markAllReadMock: vi.fn(),
  store: {
    notifications: [] as any[],
    notificationsHasMore: false,
    notificationsLoadingMore: false,
    notificationChannelConnected: true,
    unreadCount: 0,
    loadNotifications: vi.fn(),
    loadMoreNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/notifications' }),
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => mocks.store,
}))

vi.mock('@/components/common/EmptyState.vue', () => ({
  default: { template: '<div class="empty-state"><slot /></div>', props: ['title'] },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: { template: '<div class="skeleton-loader" />' },
}))

import NotificationsView from './NotificationsView.vue'

describe('NotificationsView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.store.loadNotifications = mocks.loadNotificationsMock
    mocks.store.loadMoreNotifications = mocks.loadMoreNotificationsMock
    mocks.store.markNotificationRead = mocks.markNotificationReadMock
    mocks.store.markAllRead = mocks.markAllReadMock
    mocks.loadNotificationsMock.mockReset()
    mocks.loadMoreNotificationsMock.mockReset()
    mocks.markNotificationReadMock.mockReset()
    mocks.markAllReadMock.mockReset()
    mocks.store.notifications = [
      {
        id: 1,
        type: 'new_issue',
        title: 'Issue created',
        body: 'Track A has a new issue',
        is_read: false,
        created_at: '2024-01-01T00:00:00Z',
        related_track_id: 10,
      },
      {
        id: 2,
        type: 'new_comment',
        title: 'New comment',
        body: 'A new comment was added',
        is_read: true,
        created_at: '2024-01-02T00:00:00Z',
        related_issue_id: 20,
      },
    ]
    mocks.store.unreadCount = 1
    mocks.store.notificationsHasMore = true
    mocks.store.notificationsLoadingMore = false
    mocks.loadNotificationsMock.mockResolvedValue(undefined)
    mocks.loadMoreNotificationsMock.mockResolvedValue(undefined)
    mocks.markNotificationReadMock.mockResolvedValue(undefined)
    mocks.markAllReadMock.mockResolvedValue(undefined)
  })

  it('loads notifications and filters unread items', async () => {
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    expect(mocks.loadNotificationsMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Issue created')
    expect(wrapper.text()).toContain('New comment')

    await wrapper.findAll('button').find(button => button.text() === 'Unread')!.trigger('click')
    const cards = wrapper.findAll('.card').map(node => node.text())
    expect(cards.some(text => text.includes('Issue created'))).toBe(true)
    expect(cards.some(text => text.includes('New commentA new comment was added'))).toBe(false)
  })

  it('opens notification targets and supports loading more', async () => {
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text() === 'Open')!.trigger('click')
    expect(mocks.markNotificationReadMock).toHaveBeenCalledWith(1)
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/10', query: { returnTo: '/notifications' } })

    await wrapper.findAll('button').find(button => button.text() === 'Load more')!.trigger('click')
    expect(mocks.loadMoreNotificationsMock).toHaveBeenCalledTimes(1)
  })
})
