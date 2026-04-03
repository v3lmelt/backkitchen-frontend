<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const pageTitle = computed(() => {
  const name = route.name as string
  const map: Record<string, string> = {
    'dashboard': 'Dashboard',
    'track-detail': 'Track Detail',
    'peer-review': 'Peer Review',
    'issue-detail': 'Issue Detail',
    'author-revision': 'Author Revision',
    'producer-decision': 'Producer Decision',
    'upload': 'Upload Track',
    'settings': 'Settings',
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

    <!-- User switcher -->
    <div class="flex items-center gap-2">
      <select
        v-if="appStore.users.length > 0"
        :value="appStore.currentUser?.id"
        @change="appStore.setCurrentUser(appStore.users.find(u => u.id === Number(($event.target as HTMLSelectElement).value))!)"
        class="input-field text-sm py-1"
      >
        <option v-for="user in appStore.users" :key="user.id" :value="user.id">
          {{ user.display_name }} ({{ user.role }})
        </option>
      </select>
    </div>
  </header>
</template>
