import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Invitation } from '@/types'
import { invitationApi } from '@/api'
import { useAppStore } from '@/stores/app'

export const useInvitationsStore = defineStore('invitations', () => {
  // NOTE: useAppStore() is called lazily inside actions, never at setup
  // scope — the app store delegates to this store, so eager access would
  // recurse during store construction.
  const pendingInvitations = ref<Invitation[]>([])

  async function loadPendingInvitations() {
    if (!useAppStore().isAuthenticated) {
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

  /** Clear all state (called on logout / auth loss). */
  function reset() {
    pendingInvitations.value = []
  }

  return {
    pendingInvitations,
    loadPendingInvitations,
    acceptInvitation,
    declineInvitation,
    reset,
  }
})
