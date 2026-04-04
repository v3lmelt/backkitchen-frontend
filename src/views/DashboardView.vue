<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album, AlbumStats, Track, TrackStatus, WorkflowEvent } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import { formatRelativeTime } from '@/utils/time'
import { TRACK_STATUS_COLORS } from '@/utils/status'

const router = useRouter()
const { t, te, locale } = useI18n()
const appStore = useAppStore()
const tracks = ref<Track[]>([])
const albums = ref<Album[]>([])
const albumStatsMap = ref<Record<number, AlbumStats>>({})
const loading = ref(true)
const filterStatus = ref<TrackStatus | ''>('')

function statusColor(status: string): string {
  return TRACK_STATUS_COLORS[status as TrackStatus] ?? '#6b7280'
}

function nonZeroStatuses(byStatus: Partial<Record<TrackStatus, number>>): [TrackStatus, number][] {
  return Object.entries(byStatus).filter(([, count]) => (count ?? 0) > 0) as [TrackStatus, number][]
}

const albumNonZeroStatuses = computed(() => {
  const result: Record<number, [TrackStatus, number][]> = {}
  for (const [id, stats] of Object.entries(albumStatsMap.value)) {
    result[Number(id)] = nonZeroStatuses(stats.by_status)
  }
  return result
})

onMounted(async () => {
  try {
    const [loadedTracks, loadedAlbums] = await Promise.all([trackApi.list(), albumApi.list()])
    tracks.value = loadedTracks
    albums.value = loadedAlbums
    await appStore.loadPendingInvitations()

    const statsResults = await Promise.allSettled(
      loadedAlbums.map(album => albumApi.stats(album.id).then(stats => ({ id: album.id, stats })))
    )
    for (const result of statsResults) {
      if (result.status === 'fulfilled') {
        albumStatsMap.value[result.value.id] = result.value.stats
      }
    }
  } finally {
    loading.value = false
  }
})

const filteredTracks = computed(() => {
  if (!filterStatus.value) return tracks.value
  return tracks.value.filter(track => track.status === filterStatus.value)
})

const trackStats = computed(() => ({
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

function formatEventDescription(event: WorkflowEvent): string {
  const name = event.actor?.display_name ?? '?'
  const key = `dashboard.events.${event.event_type}`
  if (te(key)) return t(key, { name })
  return event.actor ? `${name}: ${event.event_type.replaceAll('_', ' ')}` : event.event_type.replaceAll('_', ' ')
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
        <div class="text-2xl font-bold text-foreground">{{ trackStats.total }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.total') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'submitted'">
        <div class="text-2xl font-bold text-info">{{ trackStats.submitted }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.submitted') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'peer_review'">
        <div class="text-2xl font-bold text-warning">{{ trackStats.peer_review }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.peerFlow') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'mastering'">
        <div class="text-2xl font-bold text-warning">{{ trackStats.mastering }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.masteringFlow') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'completed'">
        <div class="text-2xl font-bold text-success">{{ trackStats.completed }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.completed') }}</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'rejected'">
        <div class="text-2xl font-bold text-error">{{ trackStats.rejected }}</div>
        <div class="text-xs text-muted-foreground mt-1">{{ t('dashboard.rejected') }}</div>
      </div>
    </div>

    <!-- 专辑进度看板 -->
    <div v-if="albums.length > 0">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-3">{{ t('dashboard.albums') }}</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div v-for="album in albums" :key="album.id" class="rounded-none border border-border bg-card overflow-hidden">
          <div class="h-1" :style="{ backgroundColor: album.cover_color || '#FF8400' }"></div>
          <div class="p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-mono font-bold text-base text-foreground">{{ album.title }}</h3>
              <span v-if="albumStatsMap[album.id]?.open_issues > 0" class="text-xs bg-error-bg text-error px-2 py-0.5 rounded-full">
                {{ t('dashboard.openIssues', { count: albumStatsMap[album.id].open_issues }) }}
              </span>
            </div>

            <template v-if="albumStatsMap[album.id]">
              <div class="flex h-1.5 overflow-hidden gap-px mb-2">
                <div
                  v-for="[statusKey, count] in albumNonZeroStatuses[album.id]"
                  :key="statusKey"
                  :style="{ width: (count / albumStatsMap[album.id].total_tracks * 100) + '%', backgroundColor: statusColor(statusKey) }"
                  :title="`${statusKey}: ${count}`"
                ></div>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-4">
                <span v-for="[statusKey, count] in albumNonZeroStatuses[album.id]" :key="statusKey" class="flex items-center gap-1">
                  <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: statusColor(statusKey) }"></span>
                  {{ t(`status.${statusKey}`, statusKey) }} ({{ count }})
                </span>
              </div>
              <p class="text-xs text-muted-foreground mb-4">{{ albumStatsMap[album.id].total_tracks }} {{ t('dashboard.tracks') }}</p>
              <div v-if="albumStatsMap[album.id].recent_events.length > 0" class="space-y-1">
                <p class="text-xs font-mono font-medium text-muted-foreground mb-2">{{ t('dashboard.recentActivity') }}</p>
                <div v-for="event in albumStatsMap[album.id].recent_events.slice(0, 3)" :key="event.id"
                  class="flex items-center gap-2 text-xs text-muted-foreground">
                  <span class="h-1.5 w-1.5 rounded-full bg-border flex-shrink-0"></span>
                  <span class="flex-1 truncate">{{ formatEventDescription(event) }}</span>
                  <span class="flex-shrink-0">{{ formatRelativeTime(event.created_at, locale) }}</span>
                </div>
              </div>
            </template>
            <template v-else>
              <p class="text-xs text-muted-foreground">{{ t('dashboard.tracksCount', { n: album.track_count }) }}</p>
            </template>
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
