<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const { t } = useI18n()

const navItems = computed(() => [
  { label: t('nav.dashboard'), icon: 'grid', path: '/' },
  { label: t('nav.submit'), icon: 'upload', path: '/upload' },
  { label: t('nav.albums'), icon: 'albums', path: '/albums' },
  { label: t('nav.circles'), icon: 'circles', path: '/circles' },
])

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'mastering_engineer') return t('roles.masteringEngineer')
  if (role === 'producer') return t('roles.producer')
  return t('roles.member')
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
        <svg v-else-if="item.icon === 'albums'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <svg v-else-if="item.icon === 'circles'" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <span v-if="!collapsed" class="whitespace-nowrap">{{ item.label }}</span>
      </RouterLink>
      <!-- Admin nav item -->
      <RouterLink
        v-if="appStore.currentUser?.is_admin"
        to="/admin"
        :class="[
          'flex items-center gap-3 px-3 py-2 rounded-full text-sm transition-colors',
          isActive('/admin')
            ? 'bg-[#2a2a30] text-white'
            : 'text-[#fafafa]/70 hover:text-white hover:bg-white/5'
        ]"
      >
        <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span v-if="!collapsed" class="whitespace-nowrap">{{ t('nav.admin') }}</span>
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
