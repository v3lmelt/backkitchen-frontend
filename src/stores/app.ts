import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '@/types'
import { userApi } from '@/api'
import router from '@/router'

const STORAGE_KEY = 'backkitchen_user'

export const useAppStore = defineStore('app', () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const currentUser = ref<User | null>(stored ? JSON.parse(stored) : null)
  const users = ref<User[]>([])
  const sidebarCollapsed = ref(false)

  async function loadUsers() {
    users.value = await userApi.list()
  }

  function setCurrentUser(user: User) {
    currentUser.value = user
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  }

  function logout() {
    currentUser.value = null
    localStorage.removeItem(STORAGE_KEY)
    router.push('/login')
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { currentUser, users, sidebarCollapsed, loadUsers, setCurrentUser, logout, toggleSidebar }
})
