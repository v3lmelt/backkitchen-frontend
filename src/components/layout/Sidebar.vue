<script setup lang="ts">
import { computed, h, defineComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
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
const isMobileDrawer = computed(() => appStore.mobileSidebarOpen)
const showLabel = computed(() => isMobileDrawer.value || !collapsed.value)

function handleNav(path: string) {
  router.push(path)
  if (isMobileDrawer.value) appStore.closeMobileSidebar()
}

// Shared icon component — eliminates SVG duplication between desktop and mobile
const iconPaths: Record<string, () => ReturnType<typeof h>[]> = {
  grid: () => [
    h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
    h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
    h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
    h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }),
  ],
  upload: () => [
    h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' }),
    h('polyline', { points: '17 8 12 3 7 8' }),
    h('line', { x1: 12, y1: 3, x2: 12, y2: 15 }),
  ],
  albums: () => [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' }),
  ],
  circles: () => [
    h('circle', { cx: 12, cy: 12, r: 10 }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M8 14s1.5 2 4 2 4-2 4-2' }),
    h('line', { x1: 9, y1: 9, x2: 9.01, y2: 9 }),
    h('line', { x1: 15, y1: 9, x2: 15.01, y2: 9 }),
  ],
  admin: () => [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' }),
  ],
}

const NavIcon = defineComponent({
  props: { icon: { type: String, required: true } },
  setup(props) {
    return () => h('svg', {
      class: 'w-5 h-5 flex-shrink-0',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      'stroke-width': 2,
    }, iconPaths[props.icon]?.() ?? [])
  },
})

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
        <NavIcon :icon="item.icon" />
        <span v-if="showLabel" class="whitespace-nowrap">{{ item.label }}</span>
      </RouterLink>
      <RouterLink
        v-if="appStore.currentUser?.is_admin"
        to="/admin"
        :class="[...navItemClass('/admin'), 'py-2']"
      >
        <NavIcon icon="admin" />
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
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <nav class="flex-1 py-4 px-2 space-y-1">
        <button
          v-for="item in navItems"
          :key="item.path"
          @click="handleNav(item.path)"
          :class="['w-full', ...navItemClass(item.path), 'py-2.5']"
        >
          <NavIcon :icon="item.icon" />
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </button>
        <button
          v-if="appStore.currentUser?.is_admin"
          @click="handleNav('/admin')"
          :class="['w-full', ...navItemClass('/admin'), 'py-2.5']"
        >
          <NavIcon icon="admin" />
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
