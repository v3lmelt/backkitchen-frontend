<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const navItems = [
  { label: 'Dashboard', icon: 'grid', path: '/' },
  { label: 'Submit', icon: 'upload', path: '/upload' },
  { label: 'Settings', icon: 'settings', path: '/settings' },
]

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'mastering_engineer') return 'Mastering Engineer'
  if (role === 'producer') return 'Producer'
  return 'Member'
})

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const collapsed = computed(() => appStore.sidebarCollapsed)
</script>

<template>
  <aside
    :class="[
      'bg-sidebar border-r border-[rgba(255,255,255,0.1)] flex flex-col transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    ]"
  >
    <!-- Logo -->
    <div class="h-14 flex items-center px-4 border-b border-[rgba(255,255,255,0.1)]">
      <div class="flex items-center gap-2 overflow-hidden">
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span class="text-black font-bold text-sm">BK</span>
        </div>
        <span v-if="!collapsed" class="font-mono font-semibold text-foreground whitespace-nowrap">BACK KITCHEN</span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 px-2 space-y-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex items-center gap-3 px-3 py-2 rounded-full text-sm transition-colors',
          isActive(item.path)
            ? 'bg-[#2a2a30] text-white'
            : 'text-[#fafafa]/70 hover:text-white hover:bg-white/5'
        ]"
      >
        <!-- Icons -->
        <svg v-if="item.icon === 'grid'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <svg v-else-if="item.icon === 'upload'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <svg v-else-if="item.icon === 'settings'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        <span v-if="!collapsed" class="whitespace-nowrap">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <!-- User -->
    <div class="border-t border-[rgba(255,255,255,0.1)] p-3">
      <div v-if="appStore.currentUser" class="flex items-center gap-2 overflow-hidden">
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          :style="{ backgroundColor: appStore.currentUser.avatar_color }"
        >
          {{ appStore.currentUser.display_name.charAt(0) }}
        </div>
        <div v-if="!collapsed" class="min-w-0">
          <div class="text-sm font-medium text-foreground truncate">{{ appStore.currentUser.display_name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ roleLabel }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>
