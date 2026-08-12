import { defineStore } from 'pinia'
import { computed, ref, toRef } from 'vue'
import type { User } from '@/types'
import { authApi, configApi, userApi, onAuthCleared, AUTH_TOKEN_KEY, AUTH_USER_KEY, getAuthToken } from '@/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useInvitationsStore } from '@/stores/invitations'

export const useAppStore = defineStore('app', () => {
  const storedUser = localStorage.getItem(AUTH_USER_KEY)
  const token = ref<string | null>(getAuthToken())
  const currentUser = ref<User | null>(storedUser ? JSON.parse(storedUser) : null)
  const users = ref<User[]>([])
  const sidebarCollapsed = ref(false)
  const mobileSidebarOpen = ref(false)
  const bootstrapped = ref(false)
  const r2Enabled = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value && currentUser.value))

  function notifyAuthChanged() {
    window.dispatchEvent(new Event('backkitchen:auth-changed'))
  }

  async function loadConfig() {
    try {
      const cfg = await configApi.get()
      r2Enabled.value = cfg.r2_enabled
    } catch {
      r2Enabled.value = false
    }
  }

  function setAuth(user: User, accessToken: string) {
    currentUser.value = user
    token.value = accessToken
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken)
    notifyAuthChanged()
    void loadConfig()
    useNotificationsStore().startNotificationChannel()
    void useInvitationsStore().loadPendingInvitations()
  }

  function clearAuth() {
    useNotificationsStore().reset()
    useInvitationsStore().reset()
    currentUser.value = null
    token.value = null
    users.value = []
    localStorage.removeItem(AUTH_USER_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    notifyAuthChanged()
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
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser.value))
      await loadConfig()
      useNotificationsStore().startNotificationChannel()
    } catch {
      // request() already removes the token from localStorage on 401.
      // Only wipe Pinia state if that happened; network/server errors
      // should not log the user out while their token is still valid.
      if (!getAuthToken()) {
        clearAuth()
      }
    } finally {
      bootstrapped.value = true
    }
  }

  async function loadUsers() {
    if (!isAuthenticated.value) {
      users.value = []
      return
    }
    users.value = await userApi.list()
  }

  // Navigation after logout is the caller's job (or handled by the
  // isAuthenticated watcher in App.vue) — the store stays router-free.
  function logout() {
    clearAuth()
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

  // ---------------------------------------------------------------------------
  // Compatibility layer: notifications and invitations live in their own
  // stores now. These delegating refs/actions keep existing `useAppStore()`
  // consumers working unchanged — prefer `useNotificationsStore()` /
  // `useInvitationsStore()` in new code.
  // ---------------------------------------------------------------------------
  const notificationsStore = useNotificationsStore()
  const invitationsStore = useInvitationsStore()

  return {
    token,
    currentUser,
    users,
    sidebarCollapsed,
    mobileSidebarOpen,
    bootstrapped,
    r2Enabled,
    isAuthenticated,
    setAuth,
    clearAuth,
    bootstrap,
    loadUsers,
    logout,
    toggleSidebar,
    openMobileSidebar,
    closeMobileSidebar,
    // Compatibility layer (see note above)
    pendingInvitations: toRef(invitationsStore, 'pendingInvitations'),
    notifications: toRef(notificationsStore, 'notifications'),
    notificationsHasMore: toRef(notificationsStore, 'notificationsHasMore'),
    notificationsLoadingMore: toRef(notificationsStore, 'notificationsLoadingMore'),
    notificationsError: toRef(notificationsStore, 'notificationsError'),
    notificationChannelConnected: toRef(notificationsStore, 'notificationChannelConnected'),
    unreadCount: toRef(notificationsStore, 'unreadCount'),
    loadPendingInvitations: invitationsStore.loadPendingInvitations,
    acceptInvitation: invitationsStore.acceptInvitation,
    declineInvitation: invitationsStore.declineInvitation,
    loadNotifications: notificationsStore.loadNotifications,
    loadMoreNotifications: notificationsStore.loadMoreNotifications,
    markAllRead: notificationsStore.markAllRead,
    markNotificationRead: notificationsStore.markNotificationRead,
    startNotificationPolling: notificationsStore.startNotificationPolling,
    stopNotificationPolling: notificationsStore.stopNotificationPolling,
    startNotificationChannel: notificationsStore.startNotificationChannel,
    stopNotificationChannel: notificationsStore.stopNotificationChannel,
  }
})
