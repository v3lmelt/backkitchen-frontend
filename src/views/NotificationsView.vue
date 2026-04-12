<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Bell, ChevronRight, RefreshCw } from 'lucide-vue-next'

import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import { useAppStore } from '@/stores/app'
import type { Notification } from '@/types'
import { formatRelativeTime } from '@/utils/time'

const PAGE_SIZE = 50

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const { t, te, locale } = useI18n()

const loading = ref(true)
const statusFilter = ref<'all' | 'unread' | 'read'>('all')
const typeFilter = ref('')
const searchQuery = ref('')

const typeOptions = computed(() =>
  [...new Set(appStore.notifications.map(notification => notification.type))].sort(),
)

const actionableCount = computed(() =>
  appStore.notifications.filter(notification => hasTarget(notification)).length,
)

const filteredNotifications = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return appStore.notifications.filter((notification) => {
    if (statusFilter.value === 'unread' && notification.is_read) return false
    if (statusFilter.value === 'read' && !notification.is_read) return false
    if (typeFilter.value && notification.type !== typeFilter.value) return false
    if (!query) return true

    return notification.title.toLowerCase().includes(query) || notification.body.toLowerCase().includes(query)
  })
})

function hasTarget(notification: Notification): boolean {
  return Boolean(notification.related_issue_id || notification.related_track_id || notification.related_album_id)
}

function notificationTypeLabel(type: string): string {
  const key = `notifications.types.${type}`
  if (te(key)) return t(key)
  return type.replaceAll('_', ' ')
}

function notificationTypeClass(type: string): string {
  if (type.includes('rejected') || type.includes('archived')) return 'bg-error-bg text-error'
  if (type.includes('approved') || type.includes('restored') || type.includes('accepted')) return 'bg-success-bg text-success'
  if (type.includes('issue') || type.includes('reviewer') || type.includes('delivery')) return 'bg-warning-bg text-warning'
  return 'bg-info-bg text-info'
}

async function reloadNotifications() {
  loading.value = true
  try {
    await appStore.loadNotifications({ limit: Math.max(PAGE_SIZE, appStore.notifications.length || PAGE_SIZE) })
  } finally {
    loading.value = false
  }
}

async function handleOpen(notification: Notification) {
  if (!notification.is_read) {
    await appStore.markNotificationRead(notification.id)
  }

  if (notification.related_issue_id) {
    router.push({ path: `/issues/${notification.related_issue_id}`, query: { returnTo: route.path } })
    return
  }
  if (notification.related_track_id) {
    router.push({ path: `/tracks/${notification.related_track_id}`, query: { returnTo: route.path } })
    return
  }
  if (notification.related_album_id) {
    router.push(`/albums/${notification.related_album_id}/settings`)
  }
}

onMounted(async () => {
  await reloadNotifications()
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('header.pages.notifications') }}</h1>
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-mono"
            :class="appStore.notificationChannelConnected ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="appStore.notificationChannelConnected ? 'bg-success' : 'bg-warning'"></span>
            {{ appStore.notificationChannelConnected ? t('notifications.liveConnected') : t('notifications.liveDisconnected') }}
          </span>
        </div>
        <p class="text-sm text-muted-foreground">{{ t('notifications.title') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="btn-secondary text-sm"
          :disabled="loading"
          @click="reloadNotifications"
        >
          <span class="inline-flex items-center gap-2">
            <RefreshCw class="w-4 h-4" :stroke-width="2" />
            {{ t('notifications.refresh') }}
          </span>
        </button>
        <button
          v-if="appStore.unreadCount > 0"
          class="btn-primary text-sm"
          @click="appStore.markAllRead()"
        >
          {{ t('notifications.markAllRead') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card">
        <div class="text-2xl font-bold text-foreground">{{ appStore.unreadCount }}</div>
        <div class="mt-1 text-xs text-muted-foreground">{{ t('notifications.summaryUnread') }}</div>
      </div>
      <div class="card">
        <div class="text-2xl font-bold text-foreground">{{ appStore.notifications.length }}</div>
        <div class="mt-1 text-xs text-muted-foreground">{{ t('notifications.summaryLoaded') }}</div>
      </div>
      <div class="card">
        <div class="text-2xl font-bold text-foreground">{{ actionableCount }}</div>
        <div class="mt-1 text-xs text-muted-foreground">{{ t('notifications.summaryActionable') }}</div>
      </div>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-mono transition-colors"
            :class="statusFilter === 'all' ? 'bg-primary text-background' : 'bg-border text-muted-foreground hover:text-foreground'"
            @click="statusFilter = 'all'"
          >
            {{ t('notifications.all') }}
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-mono transition-colors"
            :class="statusFilter === 'unread' ? 'bg-primary text-background' : 'bg-border text-muted-foreground hover:text-foreground'"
            @click="statusFilter = 'unread'"
          >
            {{ t('notifications.unread') }}
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-mono transition-colors"
            :class="statusFilter === 'read' ? 'bg-primary text-background' : 'bg-border text-muted-foreground hover:text-foreground'"
            @click="statusFilter = 'read'"
          >
            {{ t('notifications.read') }}
          </button>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            v-model="searchQuery"
            type="text"
            class="input-field text-sm w-full sm:w-72"
            :placeholder="t('notifications.searchPlaceholder')"
          />
          <select v-model="typeFilter" class="select-field-sm w-full sm:w-48">
            <option value="">{{ t('notifications.filterTypeAll') }}</option>
            <option v-for="type in typeOptions" :key="type" :value="type">{{ notificationTypeLabel(type) }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="loading">
      <SkeletonLoader :rows="6" :card="true" />
    </div>
    <div v-else-if="filteredNotifications.length === 0">
      <EmptyState :icon="Bell" :title="t(appStore.notifications.length === 0 ? 'notifications.empty' : 'notifications.emptyFiltered')" />
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="notification in filteredNotifications"
        :key="notification.id"
        class="card space-y-3 transition-colors"
        :class="notification.is_read ? 'border-border' : 'border-primary/40 bg-primary/5'"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-2 min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-full px-2.5 py-1 text-[11px] font-mono"
                :class="notificationTypeClass(notification.type)"
              >
                {{ notificationTypeLabel(notification.type) }}
              </span>
              <span v-if="!notification.is_read" class="rounded-full bg-primary px-2.5 py-1 text-[11px] font-mono text-background">
                {{ t('notifications.unread') }}
              </span>
            </div>
            <div>
              <h2 class="text-sm font-medium text-foreground">{{ notification.title }}</h2>
              <p class="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{{ notification.body }}</p>
            </div>
          </div>
          <div class="text-xs text-muted-foreground whitespace-nowrap">
            {{ formatRelativeTime(notification.created_at, locale) }}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="!notification.is_read"
            class="btn-secondary text-xs"
            @click="appStore.markNotificationRead(notification.id)"
          >
            {{ t('notifications.markRead') }}
          </button>
          <button
            v-if="hasTarget(notification)"
            class="btn-primary text-xs"
            @click="handleOpen(notification)"
          >
            <span class="inline-flex items-center gap-1.5">
              {{ t('notifications.open') }}
              <ChevronRight class="w-3.5 h-3.5" :stroke-width="2.5" />
            </span>
          </button>
        </div>
      </div>
      <div v-if="appStore.notificationsHasMore" class="flex justify-center">
        <button
          class="btn-secondary text-sm"
          :disabled="appStore.notificationsLoadingMore"
          @click="appStore.loadMoreNotifications()"
        >
          {{ appStore.notificationsLoadingMore ? t('common.loading') : t('notifications.loadMore') }}
        </button>
      </div>
    </div>
  </div>
</template>
