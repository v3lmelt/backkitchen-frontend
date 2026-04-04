import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Invitation, User } from '@/types'
import { authApi, invitationApi, userApi } from '@/api'
import router from '@/router'

const USER_KEY = 'backkitchen_user'
const TOKEN_KEY = 'backkitchen_token'

export const useAppStore = defineStore('app', () => {
  const storedUser = localStorage.getItem(USER_KEY)
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const currentUser = ref<User | null>(storedUser ? JSON.parse(storedUser) : null)
  const users = ref<User[]>([])
  const sidebarCollapsed = ref(false)
  const bootstrapped = ref(false)
  const pendingInvitations = ref<Invitation[]>([])

  const isAuthenticated = computed(() => Boolean(token.value && currentUser.value))

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
    } catch {
      clearAuth()
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
    clearAuth()
    pendingInvitations.value = []
    router.push('/login')
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    token,
    currentUser,
    users,
    sidebarCollapsed,
    bootstrapped,
    isAuthenticated,
    pendingInvitations,
    setAuth,
    clearAuth,
    bootstrap,
    loadUsers,
    loadPendingInvitations,
    acceptInvitation,
    declineInvitation,
    logout,
    toggleSidebar,
  }
})
