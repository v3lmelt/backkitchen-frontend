import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Invitation, Notification, User } from '@/types'
import { authApi, configApi, invitationApi, notificationApi, userApi, onAuthCleared } from '@/api'
import router from '@/router'
import { buildWsUrl } from '@/utils/url'

const USER_KEY = 'backkitchen_user'
const TOKEN_KEY = 'backkitchen_token'
const NOTIFICATION_PAGE_SIZE = 50

export const useAppStore = defineStore('app', () => {
  const storedUser = localStorage.getItem(USER_KEY)
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const currentUser = ref<User | null>(storedUser ? JSON.parse(storedUser) : null)
  const users = ref<User[]>([])
  const sidebarCollapsed = ref(false)
  const mobileSidebarOpen = ref(false)
  const bootstrapped = ref(false)
  const r2Enabled = ref(false)
  const pendingInvitations = ref<Invitation[]>([])

  const notifications = ref<Notification[]>([])
  const notificationsHasMore = ref(false)
  const notificationsLoadingMore = ref(false)
  const notificationChannelConnected = ref(false)
  let _notificationTimer: ReturnType<typeof setInterval> | null = null
  let _notificationSocket: WebSocket | null = null
  let _notificationSocketReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let _notificationSocketShouldReconnect = false
  let _notificationSocketReconnectDelay = 2000

  const isAuthenticated = computed(() => Boolean(token.value && currentUser.value))
  const unreadCount = computed(() => notifications.value.filter(n => !n.is_read).length)

  async function loadConfig() {
    try {
      const cfg = await configApi.get()
      r2Enabled.value = cfg.r2_enabled
    } catch {
      r2Enabled.value = false
    }
  }

  function stopNotificationSocket() {
    _notificationSocketShouldReconnect = false
    notificationChannelConnected.value = false
    if (_notificationSocketReconnectTimer) {
      clearTimeout(_notificationSocketReconnectTimer)
      _notificationSocketReconnectTimer = null
    }
    if (_notificationSocket) {
      const socket = _notificationSocket
      _notificationSocket = null
      socket.close()
    }
  }

  function scheduleNotificationSocketReconnect() {
    if (!_notificationSocketShouldReconnect || _notificationSocketReconnectTimer) return
    _notificationSocketReconnectTimer = setTimeout(() => {
      _notificationSocketReconnectTimer = null
      _notificationSocketReconnectDelay = Math.min(_notificationSocketReconnectDelay * 1.5, 30000)
      connectNotificationSocket()
    }, _notificationSocketReconnectDelay)
  }

  function connectNotificationSocket() {
    if (!_notificationSocketShouldReconnect || !token.value || !currentUser.value || typeof WebSocket === 'undefined') {
      return
    }

    try {
      const socket = new WebSocket(`${buildWsUrl('/ws/notifications')}?token=${token.value}`)
      _notificationSocket = socket

      socket.onopen = () => {
        notificationChannelConnected.value = true
        _notificationSocketReconnectDelay = 2000
      }

      socket.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string)
          if (message.type === 'notifications_updated') {
            void loadNotifications({
              limit: Math.max(NOTIFICATION_PAGE_SIZE, notifications.value.length || NOTIFICATION_PAGE_SIZE),
            })
          }
        } catch {
          // Ignore malformed socket messages.
        }
      }

      socket.onclose = () => {
        if (_notificationSocket === socket) {
          _notificationSocket = null
        }
        notificationChannelConnected.value = false
        if (_notificationSocketShouldReconnect) scheduleNotificationSocketReconnect()
      }

      socket.onerror = () => {
        socket.close()
      }
    } catch {
      scheduleNotificationSocketReconnect()
    }
  }

  function setAuth(user: User, accessToken: string) {
    currentUser.value = user
    token.value = accessToken
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(TOKEN_KEY, accessToken)
    void loadConfig()
    startNotificationChannel()
    void loadPendingInvitations()
  }

  function clearAuth() {
    stopNotificationChannel()
    currentUser.value = null
    token.value = null
    users.value = []
    notifications.value = []
    notificationsHasMore.value = false
    notificationsLoadingMore.value = false
    pendingInvitations.value = []
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  // When the API layer detects a 401 and wipes localStorage, sync Pinia state
  // so the App.vue watcher can redirect to /login.
  onAuthCleared(() => clearAuth())

  async function bootstrap() {
    if (bootstrapped.value) return
    if (!token.value) {
      bootstrapped.value = true
      return
    }
    try {
      currentUser.value = await authApi.me()
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser.value))
      await loadConfig()
      startNotificationChannel()
    } catch {
      // request() already removes the token from localStorage on 401.
      // Only wipe Pinia state if that happened; network/server errors
      // should not log the user out while their token is still valid.
      if (!localStorage.getItem(TOKEN_KEY)) {
        clearAuth()
      }
    } finally {
      bootstrapped.value = true
    }
  }

  async function loadNotifications(params?: { limit?: number; offset?: number; append?: boolean }) {
    if (!isAuthenticated.value) {
      notifications.value = []
      notificationsHasMore.value = false
      return
    }

    const limit = params?.limit ?? NOTIFICATION_PAGE_SIZE
    const offset = params?.offset ?? 0
    const append = params?.append ?? false

    try {
      const fresh = await notificationApi.list({ limit, offset })
      if (!Array.isArray(fresh)) throw new Error('Invalid notifications response')
      if (append) {
        const seenIds = new Set(notifications.value.map(notification => notification.id))
        notifications.value = [...notifications.value, ...fresh.filter(notification => !seenIds.has(notification.id))]
      } else {
        notifications.value = fresh
      }
      notificationsHasMore.value = fresh.length === limit
    } catch {
      if (!append) notificationsHasMore.value = false
    }
  }

  async function loadMoreNotifications() {
    if (!notificationsHasMore.value || notificationsLoadingMore.value || !isAuthenticated.value) return
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
    void loadNotifications({ limit: Math.max(NOTIFICATION_PAGE_SIZE, notifications.value.length || NOTIFICATION_PAGE_SIZE) })
    _notificationTimer = setInterval(() => {
      void loadNotifications({ limit: Math.max(NOTIFICATION_PAGE_SIZE, notifications.value.length || NOTIFICATION_PAGE_SIZE) })
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
    if (!token.value || !currentUser.value) return
    _notificationSocketShouldReconnect = true
    startNotificationPolling()
    connectNotificationSocket()
  }

  function stopNotificationChannel() {
    stopNotificationPolling()
    stopNotificationSocket()
  }

  async function loadUsers() {
    if (!isAuthenticated.value) {
      users.value = []
      return
    }
    users.value = await userApi.list()
  }

  async function loadPendingInvitations() {
    if (!isAuthenticated.value) {
      pendingInvitations.value = []
      return
    }
    try {
      const pending = await invitationApi.listMine()
      pendingInvitations.value = Array.isArray(pending) ? pending : []
    } catch {
      pendingInvitations.value = []
    }
  }

  async function acceptInvitation(id: number) {
    await invitationApi.accept(id)
    pendingInvitations.value = pendingInvitations.value.filter((inv) => inv.id !== id)
  }

  async function declineInvitation(id: number) {
    await invitationApi.decline(id)
    pendingInvitations.value = pendingInvitations.value.filter((inv) => inv.id !== id)
  }

  function logout() {
    clearAuth()
    router.push('/login')
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function openMobileSidebar() {
    mobileSidebarOpen.value = true
  }

  function closeMobileSidebar() {
    mobileSidebarOpen.value = false
  }

  return {
    token,
    currentUser,
    users,
    sidebarCollapsed,
    mobileSidebarOpen,
    bootstrapped,
    r2Enabled,
    isAuthenticated,
    pendingInvitations,
    notifications,
    notificationsHasMore,
    notificationsLoadingMore,
    notificationChannelConnected,
    unreadCount,
    setAuth,
    clearAuth,
    bootstrap,
    loadUsers,
    loadPendingInvitations,
    acceptInvitation,
    declineInvitation,
    logout,
    toggleSidebar,
    openMobileSidebar,
    closeMobileSidebar,
    loadNotifications,
    loadMoreNotifications,
    markAllRead,
    markNotificationRead,
    startNotificationPolling,
    stopNotificationPolling,
    startNotificationChannel,
    stopNotificationChannel,
  }
})
