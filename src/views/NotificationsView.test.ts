import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  loadNotificationsMock: vi.fn(),
  loadMoreNotificationsMock: vi.fn(),
  markNotificationReadMock: vi.fn(),
  trackGetMock: vi.fn(),
  markAllReadMock: vi.fn(),
  trackStore: {
    currentTrack: null as any,
    setCurrentTrack: vi.fn(),
  },
  store: {
    notifications: [] as any[],
    notificationsHasMore: false,
    notificationsLoadingMore: false,
    notificationsError: '',
    notificationChannelConnected: true,
    unreadCount: 0,
    loadNotifications: vi.fn(),
    loadMoreNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/notifications', fullPath: '/notifications' }),
  useRouter: () => ({ push: mocks.pushMock }),
}))


vi.mock('@/api', () => ({
  trackApi: {
    get: mocks.trackGetMock,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => mocks.store,
}))

vi.mock('@/stores/tracks', () => ({
  useTrackStore: () => mocks.trackStore,
}))

vi.mock('@/components/common/EmptyState.vue', () => ({
  default: { template: '<div class="empty-state"><slot /></div>', props: ['title'] },
}))

vi.mock('@/components/common/SkeletonLoader.vue', () => ({
  default: { template: '<div class="skeleton-loader" />' },
}))

import NotificationsView from './NotificationsView.vue'

function trackFixture(id: number, status = 'peer_review') {
  return {
    id,
    status,
    workflow_step: { id: status, label: status },
  }
}

function openButtonFor(wrapper: ReturnType<typeof mountWithPlugins>, title: string) {
  const card = wrapper.findAll('.card').find(node => {
    const heading = node.find('h2')
    return heading.exists() && heading.text() === title
  })
  return card!.findAll('button').find(button => button.text().includes('Open'))!
}


describe('NotificationsView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.store.loadNotifications = mocks.loadNotificationsMock
    mocks.store.loadMoreNotifications = mocks.loadMoreNotificationsMock
    mocks.store.markNotificationRead = mocks.markNotificationReadMock
    mocks.store.markAllRead = mocks.markAllReadMock
    mocks.loadNotificationsMock.mockReset()
    mocks.trackGetMock.mockReset()
    mocks.trackStore.setCurrentTrack.mockReset()
    mocks.trackStore.currentTrack = null
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
        related_issue_id: 20,
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
    mocks.store.notificationsError = ''
    mocks.loadNotificationsMock.mockResolvedValue(undefined)
    mocks.trackGetMock.mockResolvedValue({ track: trackFixture(10) })
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

  it('opens track notifications in the workflow workspace and supports loading more', async () => {
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    await openButtonFor(wrapper, 'Issue created').trigger('click')
    await flushPromises()

    expect(mocks.markNotificationReadMock).toHaveBeenCalledWith(1)
    expect(mocks.trackGetMock).toHaveBeenCalledWith(10)
    expect(mocks.trackStore.setCurrentTrack).toHaveBeenCalledWith(trackFixture(10))
    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/10/step/peer_review',
      query: { returnTo: '/notifications', issue: '20' },
    })

    await wrapper.findAll('button').find(button => button.text() === 'Load more')!.trigger('click')
    expect(mocks.loadMoreNotificationsMock).toHaveBeenCalledTimes(1)
  })

  it('uses the cached current track when opening a track notification', async () => {
    mocks.trackStore.currentTrack = trackFixture(10, 'final_review')
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    await openButtonFor(wrapper, 'Issue created').trigger('click')
    await flushPromises()

    expect(mocks.trackGetMock).not.toHaveBeenCalled()
    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/10/step/final_review',
      query: { returnTo: '/notifications', issue: '20' },
    })
  })

  it('falls back to a track detail route when workflow lookup fails', async () => {
    mocks.trackGetMock.mockRejectedValueOnce(new Error('not found'))
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    await openButtonFor(wrapper, 'Issue created').trigger('click')
    await flushPromises()

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/tracks/10',
      query: { returnTo: '/notifications', issue: '20' },
    })
  })

  it('opens issue-only notifications on the issue detail page', async () => {
    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    await openButtonFor(wrapper, 'New comment').trigger('click')

    expect(mocks.pushMock).toHaveBeenCalledWith({
      path: '/issues/20',
      query: { returnTo: '/notifications' },
    })
  })

  it('shows a retryable error when notifications fail to load', async () => {
    mocks.store.notifications = []
    mocks.store.notificationsError = 'Notifications unavailable'

    const wrapper = mountWithPlugins(NotificationsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Notifications unavailable')
    expect(wrapper.text()).toContain('Retry')
  })
})
