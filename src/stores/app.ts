import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '@/types'
import { userApi } from '@/api'

export const useAppStore = defineStore('app', () => {
  const currentUser = ref<User | null>(null)
  const users = ref<User[]>([])
  const sidebarCollapsed = ref(false)

  async function loadUsers() {
    users.value = await userApi.list()
    if (!currentUser.value && users.value.length > 0) {
      currentUser.value = users.value[0]
    }
  }

  function setCurrentUser(user: User) {
    currentUser.value = user
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { currentUser, users, sidebarCollapsed, loadUsers, setCurrentUser, toggleSidebar }
})
