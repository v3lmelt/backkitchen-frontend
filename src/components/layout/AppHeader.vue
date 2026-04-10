<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import type { Notification } from '@/types'
import { formatRelativeTime } from '@/utils/time'
import { Menu, Bell } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { t, locale } = useI18n()

const LOCALE_KEY = 'backkitchen_locale'
const showNotifications = ref(false)

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  localStorage.setItem(LOCALE_KEY, locale.value)
}

function handleOutsideClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('[data-notification-panel]')) {
    showNotifications.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))

async function handleNotificationClick(notif: Notification) {
  await appStore.markNotificationRead(notif.id)
  showNotifications.value = false
  if (notif.related_issue_id) {
    router.push(`/issues/${notif.related_issue_id}`)
  } else if (notif.related_track_id) {
    router.push(`/tracks/${notif.related_track_id}`)
  }
}

const pageTitle = computed(() => {
  const name = route.name as string
  const map: Record<string, string> = {
    dashboard: t('header.pages.dashboard'),
    'track-detail': t('header.pages.trackDetail'),
    'peer-review': t('header.pages.peerReview'),
    'issue-detail': t('header.pages.issueDetail'),
    'author-revision': t('header.pages.authorRevision'),
    'producer-decision': t('header.pages.producerDecision'),
    'mastering-review': t('header.pages.masteringReview'),
    'final-review': t('header.pages.finalReview'),
    upload: t('header.pages.upload'),
    settings: t('header.pages.albums'),
    albums: t('header.pages.albums'),
    'album-new': t('header.pages.albumNew'),
    'album-settings': t('header.pages.albums'),
    circles: t('header.pages.circles'),
    'circle-new': t('header.pages.circleNew'),
    'circle-detail': t('header.pages.circles'),
    profile: t('header.pages.profile'),
  }
  return map[name] || t('header.pages.default')
})

const breadcrumbs = computed(() => {
  const crumbs = [{ label: t('header.home'), path: '/' }]
  if (route.name === 'dashboard') return crumbs
  if (route.name === 'album-new') {
    crumbs.push({ label: t('header.pages.albums'), path: '/albums' })
    crumbs.push({ label: t('header.pages.albumNew'), path: '/albums/new' })
  } else if (route.name === 'album-settings') {
    crumbs.push({ label: t('header.pages.albums'), path: '/albums' })
  } else if (route.name === 'circle-new') {
    crumbs.push({ label: t('header.pages.circles'), path: '/circles' })
    crumbs.push({ label: t('header.pages.circleNew'), path: '/circles/new' })
  } else if (route.name === 'circle-detail') {
    crumbs.push({ label: t('header.pages.circles'), path: '/circles' })
  } else if (route.name === 'track-detail') {
    crumbs.push({ label: `Track #${route.params.id}`, path: route.path })
  } else if (route.name === 'workflow-step') {
    crumbs.push({ label: `Track #${route.params.id}`, path: `/tracks/${route.params.id}` })
    crumbs.push({ label: pageTitle.value, path: route.path })
  } else if (route.name === 'issue-detail') {
    crumbs.push({ label: `Issue #${route.params.id}`, path: route.path })
  } else {
    crumbs.push({ label: pageTitle.value, path: route.path })
  }
  return crumbs
})

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'producer') return t('roles.producer')
  return t('roles.member')
})

const isMobile = () => globalThis.matchMedia?.('(max-width: 767.98px)').matches ?? false

function handleMenuToggle() {
  if (isMobile()) {
    appStore.openMobileSidebar()
  } else {
    appStore.toggleSidebar()
  }
}
</script>

<template>
  <header class="h-14 bg-background border-b border-border flex items-center justify-between px-4 md:px-6">
    <div class="flex items-center gap-3 md:gap-4 min-w-0">
      <!-- Mobile: open drawer; Desktop: toggle collapse -->
      <button
        @click="handleMenuToggle"
        class="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <Menu class="w-5 h-5" :stroke-width="2" />
      </button>
      <nav class="flex items-center gap-2 text-sm min-w-0 overflow-hidden">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" class="text-muted-foreground flex-shrink-0">/</span>
          <RouterLink
            :to="crumb.path"
            class="truncate"
            :class="i === breadcrumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          >
            {{ crumb.label }}
          </RouterLink>
        </template>
      </nav>
    </div>

    <div class="flex items-center gap-3">
      <button
        @click="toggleLocale"
        class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-primary/50"
      >
        {{ locale === 'zh-CN' ? 'EN' : '中文' }}
      </button>

      <!-- 通知铃铛 -->
      <div v-if="appStore.currentUser" class="relative" data-notification-panel>
        <button @click.stop="showNotifications = !showNotifications" class="relative p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground">
          <Bell class="h-5 w-5" :stroke-width="2" />
          <span v-if="appStore.unreadCount > 0"
            class="absolute -top-1 -right-1 bg-error text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-mono font-bold">
            {{ appStore.unreadCount > 9 ? '9+' : appStore.unreadCount }}
          </span>
        </button>

        <!-- 通知下拉面板 -->
        <div v-if="showNotifications"
          class="fixed left-4 right-4 top-14 mt-1 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-card border border-border rounded-none shadow-[0_1px_1.75px_rgba(0,0,0,0.05)] z-50 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <span class="font-mono font-semibold text-sm text-foreground">{{ t('notifications.title') }}</span>
            <button v-if="appStore.unreadCount > 0"
              @click="appStore.markAllRead()"
              class="text-xs text-primary hover:text-primary-hover transition-colors">
              {{ t('notifications.markAllRead') }}
            </button>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <div v-if="appStore.notifications.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
              {{ t('notifications.empty') }}
            </div>
            <button
              v-for="notif in appStore.notifications"
              :key="notif.id"
              @click="handleNotificationClick(notif)"
              class="w-full text-left px-4 py-3 border-b border-border hover:bg-background transition-colors"
              :class="{ 'bg-warning-bg': !notif.is_read }">
              <div class="flex items-start gap-2">
                <span class="mt-1.5 h-2 w-2 rounded-full flex-shrink-0" :class="notif.is_read ? '' : 'bg-primary'"></span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-foreground truncate">{{ notif.title }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ notif.body }}</p>
                  <p class="text-xs text-muted-foreground/60 mt-1">{{ formatRelativeTime(notif.created_at, locale) }}</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <template v-if="appStore.currentUser">
        <RouterLink to="/profile" class="text-right hidden sm:block hover:opacity-80 transition-opacity">
          <div class="text-sm text-foreground font-medium">{{ appStore.currentUser.display_name }}</div>
          <div class="text-xs text-muted-foreground">{{ roleLabel }}</div>
        </RouterLink>
        <button @click="appStore.logout()" class="btn-secondary text-xs px-3 py-1.5">
          {{ t('header.logout') }}
        </button>
      </template>
    </div>
  </header>
</template>
