<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const { t, locale } = useI18n()

const LOCALE_KEY = 'backkitchen_locale'

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  localStorage.setItem(LOCALE_KEY, locale.value)
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
    settings: t('header.pages.settings'),
  }
  return map[name] || t('header.pages.default')
})

const breadcrumbs = computed(() => {
  const crumbs = [{ label: t('header.home'), path: '/' }]
  if (route.name !== 'dashboard') {
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
      <template v-if="appStore.currentUser">
        <div class="text-right hidden sm:block">
          <div class="text-sm text-foreground font-medium">{{ appStore.currentUser.display_name }}</div>
          <div class="text-xs text-muted-foreground">{{ roleLabel }}</div>
        </div>
        <button @click="appStore.logout()" class="btn-secondary text-xs px-3 py-1.5">
          {{ t('header.logout') }}
        </button>
      </template>
    </div>
  </header>
</template>
