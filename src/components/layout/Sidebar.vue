<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { LayoutGrid, Upload, Archive, Smile, Lock, X } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t } = useI18n()

const iconMap = { grid: LayoutGrid, upload: Upload, albums: Archive, circles: Smile, admin: Lock } as const

const navItems = computed(() => [
  { label: t('nav.dashboard'), icon: 'grid' as const, path: '/' },
  { label: t('nav.submit'), icon: 'upload' as const, path: '/upload' },
  { label: t('nav.albums'), icon: 'albums' as const, path: '/albums' },
  { label: t('nav.circles'), icon: 'circles' as const, path: '/circles' },
])

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'producer') return t('roles.producer')
  return t('roles.member')
})

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const collapsed = computed(() => appStore.sidebarCollapsed)
const isMobileDrawer = computed(() => appStore.mobileSidebarOpen)
const showLabel = computed(() => isMobileDrawer.value || !collapsed.value)

function handleNav(path: string) {
  router.push(path)
  if (isMobileDrawer.value) appStore.closeMobileSidebar()
}

const navItemClass = (path: string) => [
  'flex items-center gap-3 px-3 rounded-full text-sm transition-colors',
  isActive(path) ? 'bg-[#2a2a30] text-white' : 'text-[#fafafa]/70 hover:text-white hover:bg-white/5',
]
</script>

<template>
  <!-- Mobile overlay backdrop -->
  <Transition name="sidebar-backdrop">
    <div
      v-if="isMobileDrawer"
      class="fixed inset-0 bg-black/60 z-40 md:hidden"
      @click="appStore.closeMobileSidebar()"
    />
  </Transition>

  <!-- Desktop sidebar -->
  <aside
    :class="[
      'bg-sidebar border-r border-[rgba(255,255,255,0.1)] flex flex-col transition-all duration-200',
      'hidden md:flex',
      collapsed ? 'md:w-16' : 'md:w-60'
    ]"
  >
    <div class="h-14 flex items-center px-4 border-b border-[rgba(255,255,255,0.1)]">
      <div class="flex items-center gap-2 overflow-hidden">
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span class="text-black font-bold text-sm">BK</span>
        </div>
        <span v-if="showLabel" class="font-mono font-semibold text-foreground whitespace-nowrap">BACK KITCHEN</span>
      </div>
    </div>

    <nav class="flex-1 py-4 px-2 space-y-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[...navItemClass(item.path), 'py-2']"
      >
        <component :is="iconMap[item.icon]" class="w-5 h-5 flex-shrink-0" :stroke-width="2" />
        <span v-if="showLabel" class="whitespace-nowrap">{{ item.label }}</span>
      </RouterLink>
      <RouterLink
        v-if="appStore.currentUser?.is_admin"
        to="/admin"
        :class="[...navItemClass('/admin'), 'py-2']"
      >
        <Lock class="w-5 h-5 flex-shrink-0" :stroke-width="2" />
        <span v-if="showLabel" class="whitespace-nowrap">{{ t('nav.admin') }}</span>
      </RouterLink>
    </nav>

    <div class="border-t border-[rgba(255,255,255,0.1)] p-3">
      <div v-if="appStore.currentUser" class="flex items-center gap-2 overflow-hidden">
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          :style="{ backgroundColor: appStore.currentUser.avatar_color }"
        >
          {{ appStore.currentUser.display_name.charAt(0) }}
        </div>
        <div v-if="showLabel" class="min-w-0">
          <div class="text-sm font-medium text-foreground truncate">{{ appStore.currentUser.display_name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ roleLabel }}</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile drawer -->
  <Transition name="sidebar-slide">
    <aside
      v-if="isMobileDrawer"
      class="fixed inset-y-0 left-0 w-60 bg-sidebar border-r border-[rgba(255,255,255,0.1)] flex flex-col z-50 md:hidden"
    >
      <div class="h-14 flex items-center justify-between px-4 border-b border-[rgba(255,255,255,0.1)]">
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span class="text-black font-bold text-sm">BK</span>
          </div>
          <span class="font-mono font-semibold text-foreground whitespace-nowrap">BACK KITCHEN</span>
        </div>
        <button @click="appStore.closeMobileSidebar()" class="text-muted-foreground hover:text-foreground p-1">
          <X class="w-5 h-5" :stroke-width="2" />
        </button>
      </div>

      <nav class="flex-1 py-4 px-2 space-y-1">
        <button
          v-for="item in navItems"
          :key="item.path"
          @click="handleNav(item.path)"
          :class="['w-full', ...navItemClass(item.path), 'py-2.5']"
        >
          <component :is="iconMap[item.icon]" class="w-5 h-5 flex-shrink-0" :stroke-width="2" />
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </button>
        <button
          v-if="appStore.currentUser?.is_admin"
          @click="handleNav('/admin')"
          :class="['w-full', ...navItemClass('/admin'), 'py-2.5']"
        >
          <Lock class="w-5 h-5 flex-shrink-0" :stroke-width="2" />
          <span class="whitespace-nowrap">{{ t('nav.admin') }}</span>
        </button>
      </nav>

      <div class="border-t border-[rgba(255,255,255,0.1)] p-3">
        <div v-if="appStore.currentUser" class="flex items-center gap-2 overflow-hidden">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
            :style="{ backgroundColor: appStore.currentUser.avatar_color }"
          >
            {{ appStore.currentUser.display_name.charAt(0) }}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium text-foreground truncate">{{ appStore.currentUser.display_name }}</div>
            <div class="text-xs text-muted-foreground truncate">{{ roleLabel }}</div>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
  opacity: 0;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.2s ease;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}
</style>
