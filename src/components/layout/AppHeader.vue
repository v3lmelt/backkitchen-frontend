<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const pageTitle = computed(() => {
  const name = route.name as string
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    'track-detail': 'Track Detail',
    'peer-review': 'Peer Review',
    'issue-detail': 'Issue Detail',
    'author-revision': 'Source Revision',
    'producer-decision': 'Producer Workspace',
    'mastering-review': 'Mastering Review',
    'final-review': 'Final Review',
    upload: 'Submit Track',
    settings: 'Album Settings',
  }
  return map[name] || 'BACK KITCHEN'
})

const breadcrumbs = computed(() => {
  const crumbs = [{ label: 'Home', path: '/' }]
  if (route.name !== 'dashboard') {
    crumbs.push({ label: pageTitle.value, path: route.path })
  }
  return crumbs
})

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'mastering_engineer') return 'Mastering Engineer'
  if (role === 'producer') return 'Producer'
  return 'Member'
})
</script>

<template>
  <header class="h-14 bg-background border-b border-border flex items-center justify-between px-6">
    <div class="flex items-center gap-4">
      <button
        @click="appStore.toggleSidebar()"
        class="text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <nav class="flex items-center gap-2 text-sm">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" class="text-muted-foreground">/</span>
          <RouterLink
            :to="crumb.path"
            :class="i === breadcrumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            {{ crumb.label }}
          </RouterLink>
        </template>
      </nav>
    </div>

    <div v-if="appStore.currentUser" class="flex items-center gap-3">
      <div class="text-right hidden sm:block">
        <div class="text-sm text-foreground font-medium">{{ appStore.currentUser.display_name }}</div>
        <div class="text-xs text-muted-foreground">{{ roleLabel }}</div>
      </div>
      <button @click="appStore.logout()" class="btn-secondary text-xs px-3 py-1.5">
        Logout
      </button>
    </div>
  </header>
</template>
