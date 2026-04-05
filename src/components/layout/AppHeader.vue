<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import type { Notification } from '@/types'
import { formatRelativeTime } from '@/utils/time'

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
  } else {
    crumbs.push({ label: pageTitle.value, path: route.path })
  }
  return crumbs
})

const roleLabel = computed(() => {
  const role = appStore.currentUser?.role
  if (role === 'mastering_engineer') return t('roles.masteringEngineer')
  if (role === 'producer') return t('roles.producer')
  return t('roles.member')
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
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span v-if="appStore.unreadCount > 0"
            class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold">
            {{ appStore.unreadCount > 9 ? '9+' : appStore.unreadCount }}
          </span>
        </button>

        <!-- 通知下拉面板 -->
        <div v-if="showNotifications"
          class="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span class="font-semibold text-sm">{{ t('notifications.title') }}</span>
            <button v-if="appStore.unreadCount > 0"
              @click="appStore.markAllRead()"
              class="text-xs text-blue-400 hover:text-blue-300">
              {{ t('notifications.markAllRead') }}
            </button>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <div v-if="appStore.notifications.length === 0" class="px-4 py-8 text-center text-sm text-gray-500">
              {{ t('notifications.empty') }}
            </div>
            <button
              v-for="notif in appStore.notifications"
              :key="notif.id"
              @click="handleNotificationClick(notif)"
              class="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors"
              :class="{ 'bg-blue-500/10': !notif.is_read }">
              <div class="flex items-start gap-2">
                <span class="mt-1.5 h-2 w-2 rounded-full flex-shrink-0" :class="notif.is_read ? '' : 'bg-blue-400'"></span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ notif.title }}</p>
                  <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ notif.body }}</p>
                  <p class="text-xs text-gray-600 mt-1">{{ formatRelativeTime(notif.created_at, locale) }}</p>
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
