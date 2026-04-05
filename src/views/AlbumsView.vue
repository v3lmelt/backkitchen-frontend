<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album } from '@/types'
import albumPlaceholder from '@/assets/album-placeholder.svg'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const albums = ref<Album[]>([])
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    albums.value = await albumApi.list()
  } finally {
    loading.value = false
  }
})

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

    <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

    <div v-else-if="myAlbums.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 bg-card border border-border flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <p class="text-base font-mono font-semibold text-foreground">{{ t('albums.noAlbums') }}</p>
      <p class="text-sm text-muted-foreground mt-1">{{ t('albums.noAlbumsHint') }}</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <button
        v-for="album in myAlbums"
        :key="album.id"
        @click="router.push(`/albums/${album.id}/settings`)"
        class="bg-card border border-border rounded-none overflow-hidden shadow-[0_1px_1.75px_rgba(0,0,0,0.05)] text-left hover:border-primary/50 transition-colors group cursor-pointer"
      >
        <!-- Cover image or default placeholder -->
        <div class="w-full h-32 overflow-hidden">
          <img
            :src="album.cover_image ? `/uploads/${album.cover_image}` : albumPlaceholder"
            :alt="album.title"
            class="w-full h-full object-cover"
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
            <span class="flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded-full" :class="roleBadgeClass(album)">
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
</template>
