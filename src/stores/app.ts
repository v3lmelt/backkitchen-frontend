import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Invitation, Notification, User } from '@/types'
import { authApi, configApi, invitationApi, notificationApi, userApi } from '@/api'
import router from '@/router'

const USER_KEY = 'backkitchen_user'
const TOKEN_KEY = 'backkitchen_token'

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
  let _notificationTimer: ReturnType<typeof setInterval> | null = null

  const isAuthenticated = computed(() => Boolean(token.value && currentUser.value))
  const unreadCount = computed(() => notifications.value.filter(n => !n.is_read).length)

  function setAuth(user: User, accessToken: string) {
    currentUser.value = user
    token.value = accessToken
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(TOKEN_KEY, accessToken)
  }

  function clearAuth() {
    currentUser.value = null
    token.value = null
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  async function bootstrap() {
    if (bootstrapped.value) return
    if (!token.value) {
      bootstrapped.value = true
      return
    }
    try {
      currentUser.value = await authApi.me()
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser.value))
      try {
        const cfg = await configApi.get()
        r2Enabled.value = cfg.r2_enabled
      } catch { /* ignore — default false */ }
      startNotificationPolling()
    } catch {
      clearAuth()
    } finally {
      bootstrapped.value = true
    }
  }

  async function loadNotifications() {
    try {
      const fresh = await notificationApi.list()
      const changed =
        fresh.length !== notifications.value.length ||
        fresh.some((n, i) => n.id !== notifications.value[i]?.id || n.is_read !== notifications.value[i]?.is_read)
      if (changed) notifications.value = fresh
    } catch {}
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
    if (_notificationTimer) return
    loadNotifications()
    _notificationTimer = setInterval(() => loadNotifications(), 30000)
  }

  function stopNotificationPolling() {
    if (_notificationTimer) {
      clearInterval(_notificationTimer)
      _notificationTimer = null
    }
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
      pendingInvitations.value = await invitationApi.listMine()
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
    stopNotificationPolling()
    clearAuth()
    notifications.value = []
    pendingInvitations.value = []
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
    markAllRead,
    markNotificationRead,
    startNotificationPolling,
    stopNotificationPolling,
  }
})
