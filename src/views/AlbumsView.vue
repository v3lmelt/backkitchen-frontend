<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album } from '@/types'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { Music, Archive } from 'lucide-vue-next'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const albums = ref<Album[]>([])
const loading = ref(true)
const activeTab = ref<'active' | 'archived'>('active')

async function load() {
  loading.value = true
  try {
    albums.value = await albumApi.list(
      activeTab.value === 'archived' ? { archived_only: true } : undefined,
    )
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(activeTab, load)

const myAlbums = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId) return []
  return albums.value.filter(album =>
    album.producer_id === userId ||
    album.mastering_engineer_id === userId ||
    album.members.some(m => m.user_id === userId)
  )
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
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('albums.heading') }}</h1>
      <RouterLink v-if="isProducer" to="/albums/new" class="btn-primary text-sm">
        {{ t('albums.newAlbum') }}
      </RouterLink>
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

    <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

    <div v-else-if="myAlbums.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 bg-card border border-border flex items-center justify-center mb-4">
        <component :is="activeTab === 'archived' ? Archive : Music" class="w-8 h-8 text-muted-foreground" :stroke-width="1.5" />
      </div>
      <p class="text-base font-mono font-semibold text-foreground">
        {{ activeTab === 'archived' ? t('albums.archivedEmpty') : t('albums.noAlbums') }}
      </p>
      <p v-if="activeTab === 'active'" class="text-sm text-muted-foreground mt-1">{{ t('albums.noAlbumsHint') }}</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="album in myAlbums"
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
            <p class="text-xs text-muted-foreground font-mono">
              {{ t('albums.trackCount', { n: album.track_count }) }}
            </p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
