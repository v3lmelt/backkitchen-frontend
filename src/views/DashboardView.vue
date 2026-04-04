<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Track, Album, TrackStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const router = useRouter()
const { t } = useI18n()
const appStore = useAppStore()
const tracks = ref<Track[]>([])
const albums = ref<Album[]>([])
const loading = ref(true)
const filterStatus = ref<TrackStatus | ''>('')

onMounted(async () => {
  try {
    const [loadedTracks, loadedAlbums] = await Promise.all([trackApi.list(), albumApi.list()])
    tracks.value = loadedTracks
    albums.value = loadedAlbums
    await appStore.loadPendingInvitations()
  } finally {
    loading.value = false
  }
})

const filteredTracks = computed(() => {
  if (!filterStatus.value) return tracks.value
  return tracks.value.filter(track => track.status === filterStatus.value)
})

const stats = computed(() => ({
  total: tracks.value.length,
  submitted: tracks.value.filter(track => track.status === 'submitted').length,
  peer_review: tracks.value.filter(track => ['peer_review', 'peer_revision'].includes(track.status)).length,
  mastering: tracks.value.filter(track => ['mastering', 'mastering_revision', 'final_review'].includes(track.status)).length,
  completed: tracks.value.filter(track => track.status === 'completed').length,
  rejected: tracks.value.filter(track => track.status === 'rejected').length,
}))

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function handleAccept(invitationId: number) {
  await appStore.acceptInvitation(invitationId)
  const [loadedTracks, loadedAlbums] = await Promise.all([trackApi.list(), albumApi.list()])
  tracks.value = loadedTracks
  albums.value = loadedAlbums
}

async function handleDecline(invitationId: number) {
  await appStore.declineInvitation(invitationId)
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="appStore.pendingInvitations.length > 0" class="card border-primary/30 bg-primary/5">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-3">{{ t('invitations.title') }}</h2>
      <div class="space-y-3">
        <div v-for="inv in appStore.pendingInvitations" :key="inv.id" class="flex items-center justify-between gap-4 p-3 bg-card rounded-lg border border-border">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              :style="{ backgroundColor: inv.album?.cover_color || '#8b5cf6' }"
            >
              {{ inv.album?.title?.charAt(0) || '?' }}
            </div>
            <div>
              <div class="text-sm font-medium text-foreground">{{ inv.album?.title }}</div>
              <div class="text-xs text-muted-foreground">
                {{ t('invitations.from', { name: inv.invited_by_user?.display_name || 'Unknown' }) }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="handleAccept(inv.id)" class="btn-primary text-xs px-3 py-1.5">
              {{ t('invitations.accept') }}
            </button>
            <button @click="handleDecline(inv.id)" class="btn-secondary text-xs px-3 py-1.5">
              {{ t('invitations.decline') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = ''">
        <div class="text-2xl font-bold text-foreground">{{ stats.total }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.total') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'submitted'">
        <div class="text-2xl font-bold text-info">{{ stats.submitted }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.submitted') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'peer_review'">
        <div class="text-2xl font-bold text-warning">{{ stats.peer_review }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.peerFlow') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'mastering'">
        <div class="text-2xl font-bold text-warning">{{ stats.mastering }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.masteringFlow') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'completed'">
        <div class="text-2xl font-bold text-success">{{ stats.completed }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.completed') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'rejected'">
        <div class="text-2xl font-bold text-error">{{ stats.rejected }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.rejected') }}</div>
      </div>
    </div>

    <div v-if="albums.length > 0">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-3">{{ t('dashboard.albums') }}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="album in albums" :key="album.id" class="card">
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
              :style="{ backgroundColor: album.cover_color }"
            >
              {{ album.title.charAt(0) }}
            </div>
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ album.title }}</h3>
              <p class="text-xs text-muted-foreground">{{ t('dashboard.tracksCount', { n: album.track_count }) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-sans font-semibold text-foreground">
          {{ t('dashboard.tracksHeading') }}
          <span v-if="filterStatus" class="text-sm font-normal text-muted-foreground ml-2">
            ({{ t('dashboard.filtered', { status: filterStatus }) }})
            <button @click="filterStatus = ''" class="text-primary hover:underline ml-1">{{ t('dashboard.clearFilter') }}</button>
          </span>
        </h2>
        <button @click="router.push('/upload')" class="btn-primary text-sm">
          {{ t('dashboard.submitTrack') }}
        </button>
      </div>

      <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
      <div v-else-if="filteredTracks.length === 0" class="text-center text-muted-foreground py-12">
        {{ t('dashboard.noTracks') }}
      </div>
      <div v-else class="bg-card border border-border rounded-none overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">
              <th class="px-4 py-3">{{ t('dashboard.colTitle') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colArtist') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colDuration') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colStatus') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colOpenIssues') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colVersion') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="track in filteredTracks"
              :key="track.id"
              @click="router.push(`/tracks/${track.id}`)"
              class="border-b border-border last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td class="px-4 py-3 text-sm font-medium text-foreground">{{ track.title }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ track.artist }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{{ formatDuration(track.duration) }}</td>
              <td class="px-4 py-3"><StatusBadge :status="track.status" type="track" /></td>
              <td class="px-4 py-3 text-sm text-muted-foreground">
                <span v-if="track.open_issue_count" class="text-error">{{ t('dashboard.openCount', { count: track.open_issue_count }) }}</span>
                <span v-else>--</span>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">v{{ track.version }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
