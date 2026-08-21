import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Notification } from '@/types'
import { notificationApi } from '@/api'
import { buildWsUrl } from '@/utils/url'
import { useReconnectingWebSocket } from '@/composables/useReconnectingWebSocket'
import { useAppStore } from '@/stores/app'

const NOTIFICATION_PAGE_SIZE = 50

export const useNotificationsStore = defineStore('notifications', () => {
  // NOTE: useAppStore() is called lazily inside actions/getters, never at
  // setup scope — the app store delegates to this store, so eager access
  // would recurse during store construction.
  const notifications = ref<Notification[]>([])
  const notificationsHasMore = ref(false)
  const notificationsLoadingMore = ref(false)
  const notificationsError = ref('')

  let _notificationTimer: ReturnType<typeof setInterval> | null = null

  const unreadCount = computed(() => notifications.value.filter(n => !n.is_read).length)

  function currentPageLimit() {
    return Math.max(NOTIFICATION_PAGE_SIZE, notifications.value.length || NOTIFICATION_PAGE_SIZE)
  }

  const socket = useReconnectingWebSocket({
    getUrl: () => {
      const appStore = useAppStore()
      if (!appStore.token || !appStore.currentUser) return null
      return `${buildWsUrl('/ws/notifications')}?token=${appStore.token}`
    },
    onMessage: (event) => {
      try {
        const message = JSON.parse(event.data as string)
        if (message.type === 'notifications_updated') {
          void loadNotifications({ limit: currentPageLimit() })
        }
      } catch {
        // Ignore malformed socket messages.
      }
    },
  })
  const notificationChannelConnected = socket.connected

  async function loadNotifications(params?: { limit?: number; offset?: number; append?: boolean }) {
    if (!useAppStore().isAuthenticated) {
      notifications.value = []
      notificationsHasMore.value = false
      notificationsError.value = ''
      return
    }

    const limit = params?.limit ?? NOTIFICATION_PAGE_SIZE
    const offset = params?.offset ?? 0
    const append = params?.append ?? false

    try {
      notificationsError.value = ''
      const fresh = await notificationApi.list({ limit, offset })
      if (!Array.isArray(fresh)) throw new Error('Invalid notifications response')
      if (append) {
        const seenIds = new Set(notifications.value.map(notification => notification.id))
        notifications.value = [...notifications.value, ...fresh.filter(notification => !seenIds.has(notification.id))]
      } else {
        notifications.value = fresh
      }
      notificationsHasMore.value = fresh.length === limit
    } catch (error: any) {
      if (!append) notificationsHasMore.value = false
      notificationsError.value = error?.message || 'Failed to load notifications'
    }
  }

  async function loadMoreNotifications() {
    if (!notificationsHasMore.value || notificationsLoadingMore.value || !useAppStore().isAuthenticated) return
    notificationsLoadingMore.value = true
    try {
      await loadNotifications({
        limit: NOTIFICATION_PAGE_SIZE,
        offset: notifications.value.length,
        append: true,
      })
    } finally {
      notificationsLoadingMore.value = false
    }
  }

  async function markAllRead() {
    await notificationApi.markAllRead()
    notifications.value.forEach(n => { n.is_read = true })
  }

  async function markNotificationRead(id: number) {
    await notificationApi.markRead(id)
    const n = notifications.value.find(n => n.id === id)
    if (n) n.is_read = true
  }

  function startNotificationPolling() {
    stopNotificationPolling()
    void loadNotifications({ limit: currentPageLimit() })
    _notificationTimer = setInterval(() => {
      void loadNotifications({ limit: currentPageLimit() })
    }, 30000)
  }

  function stopNotificationPolling() {
    if (_notificationTimer) {
      clearInterval(_notificationTimer)
      _notificationTimer = null
    }
  }

  function startNotificationChannel() {
    stopNotificationChannel()
    const appStore = useAppStore()
    if (!appStore.token || !appStore.currentUser) return
    startNotificationPolling()
    socket.start()
  }

  function stopNotificationChannel() {
    stopNotificationPolling()
    socket.stop()
  }

  /** Stop the channel and clear all state (called on logout / auth loss). */
  function reset() {
    stopNotificationChannel()
    notifications.value = []
    notificationsHasMore.value = false
    notificationsLoadingMore.value = false
    notificationsError.value = ''
  }

  return {
    notifications,
    notificationsHasMore,
    notificationsLoadingMore,
    notificationsError,
    notificationChannelConnected,
    unreadCount,
    loadNotifications,
    loadMoreNotifications,
    markAllRead,
    markNotificationRead,
    startNotificationPolling,
    stopNotificationPolling,
    startNotificationChannel,
    stopNotificationChannel,
    reset,
  }
})
