<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album } from '@/types'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { Music, Archive, Search } from 'lucide-vue-next'
import EmptyState from '@/components/common/EmptyState.vue'
import { parseUTC } from '@/utils/time'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const albums = ref<Album[]>([])
const loading = ref(true)
const loadError = ref('')
const activeTab = ref<'active' | 'archived'>('active')
const searchQuery = ref('')
const sortMode = ref<'attention' | 'recent' | 'title'>('attention')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const loadedAlbums = await albumApi.list(
      activeTab.value === 'archived'
        ? { archived_only: true, search: searchQuery.value.trim() || undefined }
        : { search: searchQuery.value.trim() || undefined },
    )
    albums.value = loadedAlbums
  } catch (error: any) {
    albums.value = []
    loadError.value = error?.message || t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(activeTab, load)
watch(searchQuery, load)

const myAlbums = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId) return []
  return albums.value.filter(album =>
    album.producer_id === userId ||
    album.mastering_engineer_id === userId ||
    album.members.some(m => m.user_id === userId)
  )
})

function deadlineInfo(album: Album): { text: string; overdue: boolean } | null {
  if (!album.deadline) return null
  const deadline = parseUTC(album.deadline)
  const diffDays = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: t('dashboard.deadlineOverdue', { days: Math.abs(diffDays) }), overdue: true }
  if (diffDays === 0) return { text: t('dashboard.deadlineToday'), overdue: true }
  return { text: t('dashboard.deadlineDaysLeft', { days: diffDays }), overdue: false }
}

function attentionScore(album: Album): number {
  return (album.overdue_track_count ?? 0) * 100 + (deadlineInfo(album)?.overdue ? 25 : 0) + (album.open_issues ?? 0)
}

const displayedAlbums = computed(() => {
  const next = [...myAlbums.value]
  return next.sort((left, right) => {
    if (sortMode.value === 'title') {
      return left.title.localeCompare(right.title)
    }
    if (sortMode.value === 'recent') {
      return Date.parse(right.updated_at) - Date.parse(left.updated_at)
    }

    const scoreDelta = attentionScore(right) - attentionScore(left)
    if (scoreDelta !== 0) return scoreDelta
    return Date.parse(right.updated_at) - Date.parse(left.updated_at)
  })
})

const isProducer = computed(() => appStore.currentUser?.role === 'producer')

function userRoleInAlbum(album: Album): string {
  const userId = appStore.currentUser?.id
  if (!userId) return ''
  if (album.producer_id === userId) return t('roles.producer')
  if (album.mastering_engineer_id === userId) return t('roles.masteringEngineer')
  return t('roles.member')
}

function roleBadgeClass(album: Album): string {
  const userId = appStore.currentUser?.id
  if (album.producer_id === userId) return 'bg-warning-bg text-warning'
  if (album.mastering_engineer_id === userId) return 'bg-info-bg text-info'
  return 'bg-border text-foreground'
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('albums.heading') }}</h1>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="relative sm:w-64">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" :stroke-width="2" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('admin.searchAlbums')"
            class="input-field w-full pl-9 text-sm"
          />
        </div>
        <select v-model="sortMode" class="select-field min-w-[10rem] text-sm">
          <option value="attention">{{ t('dashboard.attentionAlbums') }}</option>
          <option value="recent">{{ t('dashboard.recentUpdates') }}</option>
          <option value="title">{{ t('albumNew.albumTitle') }}</option>
        </select>
        <RouterLink v-if="isProducer" to="/albums/new" class="btn-primary text-sm">
          {{ t('albums.newAlbum') }}
        </RouterLink>
      </div>
    </div>

    <!-- Tab switcher -->
    <div class="flex gap-0 border-b border-border">
      <button
        @click="activeTab = 'active'"
        class="px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px"
        :class="activeTab === 'active'
          ? 'text-foreground border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'"
      >
        {{ t('albums.tabActive') }}
      </button>
      <button
        @click="activeTab = 'archived'"
        class="px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px flex items-center gap-1.5"
        :class="activeTab === 'archived'
          ? 'text-foreground border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'"
      >
        <Archive class="w-3.5 h-3.5" :stroke-width="2" />
        {{ t('albums.tabArchived') }}
      </button>
    </div>

    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="card space-y-3">
        <div class="h-32 bg-border animate-pulse rounded-none -mx-4 -mt-4 mb-2"></div>
        <div class="h-4 bg-border rounded animate-pulse w-3/4"></div>
        <div class="h-3 bg-border rounded animate-pulse w-1/2"></div>
      </div>
    </div>

    <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
      <p class="text-sm text-error">{{ loadError }}</p>
      <button @click="load" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
    </div>

    <EmptyState
      v-else-if="displayedAlbums.length === 0"
      :icon="activeTab === 'archived' ? Archive : Music"
      :title="searchQuery.trim() ? t('admin.noAlbums') : (activeTab === 'archived' ? t('albums.archivedEmpty') : t('albums.noAlbums'))"
      :hint="searchQuery.trim() ? undefined : (activeTab === 'active' ? t('albums.noAlbumsHint') : undefined)"
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="album in displayedAlbums"
        :key="album.id"
        class="relative bg-card border border-border rounded-none overflow-hidden shadow-[0_1px_1.75px_rgba(0,0,0,0.05)] group"
      >
        <button
          @click="router.push(`/albums/${album.id}/settings`)"
          class="w-full text-left cursor-pointer hover:border-primary/50 transition-colors"
        >
          <!-- Cover image or default placeholder -->
          <div class="w-full h-32 overflow-hidden">
            <img
              :src="album.cover_image ? `${API_ORIGIN}/uploads/${album.cover_image}` : albumPlaceholder"
              :alt="album.title"
              class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
              :class="{ 'opacity-60 grayscale': album.archived_at }"
            />
          </div>
          <div class="p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="text-sm font-mono font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                  {{ album.title }}
                </h3>
                <p v-if="album.circle_name" class="text-xs text-muted-foreground mt-0.5">{{ album.circle_name }}</p>
              </div>
              <span v-if="album.archived_at" class="flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded-full bg-error-bg text-error">
                {{ t('albums.archivedBadge') }}
              </span>
              <span v-else class="flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded-full" :class="roleBadgeClass(album)">
                {{ userRoleInAlbum(album) }}
              </span>
            </div>
            <div v-if="album.catalog_number || album.release_date" class="flex items-center gap-2">
              <span v-if="album.catalog_number" class="text-xs font-mono text-muted-foreground">{{ album.catalog_number }}</span>
              <span v-if="album.catalog_number && album.release_date" class="text-muted-foreground">·</span>
              <span v-if="album.release_date" class="text-xs text-muted-foreground">{{ album.release_date.slice(0, 10) }}</span>
            </div>
            <div v-if="album.genres?.length" class="flex flex-wrap gap-1">
              <span v-for="genre in album.genres" :key="genre" class="text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono">{{ genre }}</span>
            </div>
            <p class="text-xs text-muted-foreground line-clamp-2">
              {{ album.description || t('settings.noDescription') }}
            </p>
            <div v-if="activeTab === 'active'" class="flex flex-wrap gap-1">
              <span
                v-if="deadlineInfo(album)"
                class="text-xs font-mono px-2 py-0.5 rounded-full"
                :class="deadlineInfo(album)!.overdue ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning'"
              >
                {{ deadlineInfo(album)!.text }}
              </span>
              <span
                v-if="(album.open_issues ?? 0) > 0"
                class="text-xs font-mono px-2 py-0.5 rounded-full bg-error-bg text-error"
              >
                {{ t('dashboard.openIssues', { count: album.open_issues }) }}
              </span>
              <span
                v-if="(album.overdue_track_count ?? 0) > 0"
                class="text-xs font-mono px-2 py-0.5 rounded-full bg-error-bg text-error"
              >
                {{ t('dashboard.overdueCount', { count: album.overdue_track_count }) }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground font-mono">
              {{ t('albums.trackCount', { n: album.track_count }) }}
            </p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
