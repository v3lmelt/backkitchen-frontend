<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { resolveUploadUrl } from '@/api'
import { LayoutGrid, Upload, Archive, Smile, Lock, X, Bell, Megaphone } from 'lucide-vue-next'
import { CHANGELOG_SEEN_EVENT, CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_VERSION } from '@/data/changelog'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t } = useI18n()

const iconMap = {
  grid: LayoutGrid,
  upload: Upload,
  notifications: Bell,
  albums: Archive,
  circles: Smile,
  admin: Lock,
  changelog: Megaphone,
} as const

const seenChangelogVersion = ref<string | null>(null)

function readSeenVersion() {
  seenChangelogVersion.value = localStorage.getItem(CHANGELOG_SEEN_KEY)
}

const changelogUnseen = computed(() =>
  Boolean(LATEST_CHANGELOG_VERSION) && seenChangelogVersion.value !== LATEST_CHANGELOG_VERSION,
)

onMounted(() => {
  readSeenVersion()
  window.addEventListener(CHANGELOG_SEEN_EVENT, readSeenVersion)
  window.addEventListener('storage', readSeenVersion)
})

onBeforeUnmount(() => {
  window.removeEventListener(CHANGELOG_SEEN_EVENT, readSeenVersion)
  window.removeEventListener('storage', readSeenVersion)
})

const navItems = computed(() => [
  { label: t('nav.dashboard'), icon: 'grid' as const, path: '/' },
  { label: t('nav.submit'), icon: 'upload' as const, path: '/upload' },
  { label: t('nav.notifications'), icon: 'notifications' as const, path: '/notifications' },
  { label: t('nav.albums'), icon: 'albums' as const, path: '/albums' },
  { label: t('nav.circles'), icon: 'circles' as const, path: '/circles' },
  { label: t('nav.changelog'), icon: 'changelog' as const, path: '/changelog' },
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
const avatarUrl = computed(() => resolveUploadUrl(appStore.currentUser?.avatar_image))

function handleNav(path: string) {
  router.push(path)
  if (isMobileDrawer.value) appStore.closeMobileSidebar()
}

const navItemClass = (path: string) => [
  'relative flex w-full items-center overflow-hidden rounded-full text-sm transition-colors gap-3 px-3',
  isActive(path) ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60',
]

const navBadgeClass = (tone: 'error' | 'warning') => [
  'rounded-full border font-mono',
  showLabel.value
    ? 'ml-auto px-2 py-0.5 text-[11px]'
    : 'absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center px-1 py-0 text-[10px] leading-none',
  tone === 'error'
    ? 'border-error/25 bg-error-bg text-error'
    : 'border-warning/25 bg-warning-bg text-warning',
]

const profileLinkClass = computed(() => [
  'flex w-full items-center gap-2 overflow-hidden rounded-full p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
  isActive('/profile') ? 'bg-sidebar-accent text-foreground' : 'text-foreground hover:bg-sidebar-accent/60',
])
</script>

<template>
  <!-- Mobile overlay backdrop -->
  <Transition name="sidebar-backdrop">
    <div
      v-if="isMobileDrawer"
      class="fixed inset-0 bg-overlay/60 z-40 md:hidden"
      @click="appStore.closeMobileSidebar()"
    />
  </Transition>

  <!-- Desktop sidebar -->
  <aside
    :class="[
      'desktop-sidebar bg-sidebar border-r border-border flex flex-col',
      'hidden md:flex',
      collapsed ? 'md:w-16' : 'md:w-60'
    ]"
  >
    <div class="h-14 flex items-center px-4 border-b border-border">
      <div class="flex items-center gap-2 overflow-hidden">
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span class="text-primary-foreground font-bold text-sm">BK</span>
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
        <span v-if="showLabel" class="truncate">{{ item.label }}</span>
        <Transition name="badge-pop">
          <span
            v-if="item.path === '/notifications' && appStore.unreadCount > 0"
            :class="navBadgeClass('error')"
          >
            {{ appStore.unreadCount > 99 ? '99+' : appStore.unreadCount }}
          </span>
          <span
            v-else-if="item.path === '/changelog' && changelogUnseen"
            :class="navBadgeClass('warning')"
          >
            {{ t('changelog.badgeNew') }}
          </span>
        </Transition>
      </RouterLink>
      <RouterLink
        v-if="appStore.currentUser?.is_admin"
        to="/admin"
        :class="[...navItemClass('/admin'), 'py-2']"
      >
        <Lock class="w-5 h-5 flex-shrink-0" :stroke-width="2" />
        <span v-if="showLabel" class="truncate">{{ t('nav.admin') }}</span>
      </RouterLink>
    </nav>

    <div class="border-t border-border p-3">
      <RouterLink
        v-if="appStore.currentUser"
        to="/profile"
        :aria-label="t('header.pages.profile')"
        :class="profileLinkClass"
      >
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          alt="avatar"
          class="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
        <div
          v-else
          class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
          :style="{ backgroundColor: appStore.currentUser.avatar_color }"
        >
          {{ appStore.currentUser.display_name.charAt(0) }}
        </div>
        <div v-if="showLabel" class="min-w-0">
          <div class="text-sm font-medium text-foreground truncate">{{ appStore.currentUser.display_name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ roleLabel }}</div>
        </div>
      </RouterLink>
    </div>
  </aside>

  <!-- Mobile drawer -->
  <Transition name="sidebar-slide">
    <aside
      v-if="isMobileDrawer"
      class="fixed inset-y-0 left-0 w-60 bg-sidebar border-r border-border flex flex-col z-50 md:hidden"
    >
      <div class="h-14 flex items-center justify-between px-4 border-b border-border">
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span class="text-primary-foreground font-bold text-sm">BK</span>
          </div>
          <span class="font-mono font-semibold text-foreground whitespace-nowrap">BACK KITCHEN</span>
        </div>
        <button @click="appStore.closeMobileSidebar()" class="ui-control text-muted-foreground hover:text-foreground p-1">
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
          <Transition name="badge-pop">
            <span
              v-if="item.path === '/notifications' && appStore.unreadCount > 0"
              :class="navBadgeClass('error')"
            >
              {{ appStore.unreadCount > 99 ? '99+' : appStore.unreadCount }}
            </span>
            <span
              v-else-if="item.path === '/changelog' && changelogUnseen"
              :class="navBadgeClass('warning')"
            >
              {{ t('changelog.badgeNew') }}
            </span>
          </Transition>
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

      <div class="border-t border-border p-3">
        <RouterLink
          v-if="appStore.currentUser"
          to="/profile"
          :aria-label="t('header.pages.profile')"
          :class="profileLinkClass"
          @click="appStore.closeMobileSidebar()"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="avatar"
            class="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
          <div
            v-else
            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
            :style="{ backgroundColor: appStore.currentUser.avatar_color }"
          >
            {{ appStore.currentUser.display_name.charAt(0) }}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium text-foreground truncate">{{ appStore.currentUser.display_name }}</div>
            <div class="text-xs text-muted-foreground truncate">{{ roleLabel }}</div>
          </div>
        </RouterLink>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.desktop-sidebar {
  transition: width var(--motion-layout) var(--motion-ease-out);
}
.sidebar-backdrop-enter-active {
  transition: opacity var(--motion-panel-in) var(--motion-ease-out);
}
.sidebar-backdrop-leave-active {
  transition: opacity var(--motion-panel-out) var(--motion-ease-in);
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
  opacity: 0;
}

.sidebar-slide-enter-active {
  transition: transform var(--motion-panel-in) var(--motion-ease-out);
}
.sidebar-slide-leave-active {
  transition: transform var(--motion-panel-out) var(--motion-ease-in);
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}

.badge-pop-enter-active {
  transition: opacity var(--motion-feedback) var(--motion-ease-out);
}
.badge-pop-leave-active {
  transition: opacity var(--motion-popover-out) var(--motion-ease-in);
}
.badge-pop-enter-from,
.badge-pop-leave-to {
  opacity: 0;
}
</style>
