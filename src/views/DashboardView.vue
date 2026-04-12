<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, albumApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Album, AlbumStats, Track, TrackStatus, WorkflowEvent } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatRelativeTime, parseUTC } from '@/utils/time'
import { hashId } from '@/utils/hash'
import { TRACK_STATUS_COLORS } from '@/utils/status'
import { translateStepLabel } from '@/utils/workflow'
import { useDashboardPins } from '@/composables/useDashboardPins'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { Music, Search } from 'lucide-vue-next'

const ALBUM_STATS_TTL = 5 * 60 * 1000
const TRACK_PAGE_SIZE = 100
const albumStatsCache = new Map<number, { stats: AlbumStats; ts: number }>()

async function fetchAlbumStats(albumId: number): Promise<AlbumStats> {
  const cached = albumStatsCache.get(albumId)
  if (cached && Date.now() - cached.ts < ALBUM_STATS_TTL) return cached.stats
  const stats = await albumApi.stats(albumId)
  albumStatsCache.set(albumId, { stats, ts: Date.now() })
  return stats
}

const router = useRouter()
const route = useRoute()
const { t, te, locale } = useI18n()
const appStore = useAppStore()
const tracks = ref<Track[]>([])
const albums = ref<Album[]>([])
const albumStatsMap = ref<Record<number, AlbumStats>>({})
const loading = ref(true)
const loadError = ref(false)
const filterStatus = ref<TrackStatus | ''>('')
const searchQuery = ref('')
const exportingAlbum = ref<number | null>(null)
const showPinnedOnly = ref(false)
const { hasAnyPins, isPinned, togglePin } = useDashboardPins(() => appStore.currentUser?.id ?? null)

function statusColor(status: string): string {
  return TRACK_STATUS_COLORS[status as TrackStatus] ?? '#6b7280'
}

function nonZeroStatuses(byStatus: Partial<Record<TrackStatus, number>>): [TrackStatus, number][] {
  return Object.entries(byStatus).filter(([, count]) => (count ?? 0) > 0) as [TrackStatus, number][]
}

function statusLabel(status: string, album: Album): string {
  const step = album.workflow_config?.steps.find(candidate => candidate.id === status)
  if (step) return translateStepLabel(step, t)
  return t(`status.${status}`, status)
}

const albumNonZeroStatuses = computed(() => {
  const result: Record<number, [TrackStatus, number][]> = {}
  for (const [id, stats] of Object.entries(albumStatsMap.value)) {
    result[Number(id)] = nonZeroStatuses(stats.by_status)
  }
  return result
})

const searchAlbumResults = ref<Album[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadDashboard() {
  loading.value = true
  loadError.value = false
  try {
    const query = searchQuery.value.trim() || undefined
    const [loadedTracks, loadedAlbums] = await Promise.all([
      loadAllTracks({ search: query }),
      albumApi.list({ search: query }),
    ])
    tracks.value = loadedTracks
    albums.value = loadedAlbums
    searchAlbumResults.value = query ? loadedAlbums : []
    if (!query) await appStore.loadPendingInvitations()

    const statsResults = await Promise.allSettled(
      loadedAlbums.map(album => fetchAlbumStats(album.id).then(stats => ({ id: album.id, stats })))
    )
    for (const result of statsResults) {
      if (result.status === 'fulfilled') {
        albumStatsMap.value[result.value.id] = result.value.stats
      }
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadDashboard(), 300)
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

const filteredTracks = computed(() => {
  let result = tracks.value
  if (filterStatus.value) {
    result = result.filter(track => track.status === filterStatus.value)
  }
  return result
})

async function loadAllTracks(params?: { status?: TrackStatus; album_id?: number; search?: string }) {
  const allTracks: Track[] = []
  let offset = 0

  while (true) {
    const page = await trackApi.list({ ...params, limit: TRACK_PAGE_SIZE, offset })
    allTracks.push(...page)
    if (page.length < TRACK_PAGE_SIZE) break
    offset += page.length
  }

  return allTracks
}

const trackStats = computed(() => {
  let submitted = 0, peer_review = 0, mastering = 0, completed = 0, rejected = 0
  for (const track of tracks.value) {
    const s = track.status
    if (s === 'submitted') submitted++
    else if (s === 'peer_review' || s === 'peer_revision') peer_review++
    else if (s === 'mastering' || s === 'mastering_revision' || s === 'final_review') mastering++
    else if (s === 'completed') completed++
    else if (s === 'rejected') rejected++
  }
  return { total: tracks.value.length, submitted, peer_review, mastering, completed, rejected }
})

// Group tracks by album, preserving order of first appearance
const albumMap = computed(() => new Map(albums.value.map(a => [a.id, a])))

const displayedAlbums = computed(() => {
  const visibleAlbums = showPinnedOnly.value && hasAnyPins.value
    ? albums.value.filter(album => isPinned(album.id))
    : [...albums.value]

  return visibleAlbums.sort((left, right) => {
    const leftPinned = isPinned(left.id) ? 1 : 0
    const rightPinned = isPinned(right.id) ? 1 : 0
    if (leftPinned !== rightPinned) return rightPinned - leftPinned
    return left.id - right.id
  })
})

const actionableTracks = computed(() =>
  [...tracks.value]
    .filter(track => (track.allowed_actions?.length ?? 0) > 0)
    .sort((left, right) => {
      const issueDelta = (right.open_issue_count ?? 0) - (left.open_issue_count ?? 0)
      if (issueDelta !== 0) return issueDelta
      return Date.parse(right.updated_at) - Date.parse(left.updated_at)
    })
    .slice(0, 5),
)

const attentionTracks = computed(() =>
  [...tracks.value]
    .filter(track => (track.open_issue_count ?? 0) > 0)
    .sort((left, right) => {
      const issueDelta = (right.open_issue_count ?? 0) - (left.open_issue_count ?? 0)
      if (issueDelta !== 0) return issueDelta
      return Date.parse(right.updated_at) - Date.parse(left.updated_at)
    })
    .slice(0, 5),
)

const recentTracks = computed(() =>
  [...tracks.value]
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, 5),
)

const attentionAlbums = computed(() =>
  displayedAlbums.value
    .filter((album) => {
      const stats = albumStatsMap.value[album.id]
      return Boolean(stats && ((stats.overdue_track_count ?? 0) > 0 || stats.open_issues > 0 || deadlineInfo(album.id)?.overdue))
    })
    .sort((left, right) => {
      const leftStats = albumStatsMap.value[left.id]
      const rightStats = albumStatsMap.value[right.id]
      const leftScore = (leftStats?.overdue_track_count ?? 0) * 10 + (leftStats?.open_issues ?? 0)
      const rightScore = (rightStats?.overdue_track_count ?? 0) * 10 + (rightStats?.open_issues ?? 0)
      return rightScore - leftScore
    })
    .slice(0, 5),
)

const groupedTracks = computed(() => {
  const groups = new Map<number, Track[]>()
  for (const track of filteredTracks.value) {
    if (!groups.has(track.album_id)) groups.set(track.album_id, [])
    groups.get(track.album_id)!.push(track)
  }
  const result: { albumId: number; albumTitle: string; tracks: Track[] }[] = []
  const seen = new Set<number>()
  for (const track of filteredTracks.value) {
    if (!seen.has(track.album_id)) {
      seen.add(track.album_id)
      result.push({
        albumId: track.album_id,
        albumTitle: albumMap.value.get(track.album_id)?.title ?? `Album #${track.album_id}`,
        tracks: groups.get(track.album_id)!,
      })
    }
  }
  return result
})

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function originalMetaParts(track: Track): string[] {
  const parts: string[] = []
  if (track.original_title) parts.push(`${t('upload.originalTitle')}: ${track.original_title}`)
  if (track.original_artist) parts.push(`${t('upload.originalArtist')}: ${track.original_artist}`)
  return parts
}

function formatEventDescription(event: WorkflowEvent): string {
  const name = event.actor?.display_name ?? '?'
  const key = `dashboard.events.${event.event_type}`
  if (te(key)) return t(key, { name })
  return event.actor ? `${name}: ${event.event_type.replaceAll('_', ' ')}` : event.event_type.replaceAll('_', ' ')
}

async function handleAccept(invitationId: number) {
  await appStore.acceptInvitation(invitationId)
  await loadDashboard()
}

async function handleDecline(invitationId: number) {
  await appStore.declineInvitation(invitationId)
}

function completedCount(albumId: number): number {
  return albumStatsMap.value[albumId]?.by_status?.completed ?? 0
}

function deadlineInfo(albumId: number): { text: string; overdue: boolean } | null {
  const stats = albumStatsMap.value[albumId]
  if (!stats?.deadline) return null
  const dl = parseUTC(stats.deadline)
  const now = new Date()
  const diffMs = dl.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: t('dashboard.deadlineOverdue', { days: Math.abs(diffDays) }), overdue: true }
  if (diffDays === 0) return { text: t('dashboard.deadlineToday'), overdue: true }
  return { text: t('dashboard.deadlineDaysLeft', { days: diffDays }), overdue: false }
}

async function handleExport(albumId: number) {
  exportingAlbum.value = albumId
  try {
    const blob = await albumApi.export(albumId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${albums.value.find(al => al.id === albumId)?.title ?? 'album'}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    // error is shown by the request layer
  } finally {
    exportingAlbum.value = null
  }
}

function openAlbumSettings(albumId: number) {
  router.push(`/albums/${albumId}/settings`)
}

function openTrack(trackId: number) {
  router.push({ path: `/tracks/${trackId}`, query: { returnTo: route.path } })
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="loadError" class="card flex items-center justify-between gap-4">
      <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
      <button @click="loadDashboard" class="btn-secondary text-sm flex-shrink-0">{{ t('common.retry') }}</button>
    </div>
    <div v-if="appStore.pendingInvitations.length > 0" class="card border-primary/30 bg-primary/5">
      <h2 class="text-lg font-mono font-semibold text-foreground mb-3">{{ t('invitations.title') }}</h2>
      <div class="space-y-3">
        <div v-for="inv in appStore.pendingInvitations" :key="inv.id" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 bg-card rounded-none border border-border">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 overflow-hidden rounded-none border border-border flex-shrink-0">
              <img
                :src="inv.album?.cover_image ? `${API_ORIGIN}/uploads/${inv.album.cover_image}` : albumPlaceholder"
                :alt="inv.album?.title || ''"
                class="w-full h-full object-cover"
              />
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

    <div class="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
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

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('dashboard.waitingForMe') }}</h2>
          <span class="text-xs text-muted-foreground">{{ actionableTracks.length }}</span>
        </div>
        <div v-if="actionableTracks.length" class="space-y-2">
          <button
            v-for="track in actionableTracks"
            :key="`queue-${track.id}`"
            class="w-full border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50"
            @click="openTrack(track.id)"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="truncate text-sm text-foreground">{{ track.title }}</div>
                <div class="text-xs text-muted-foreground">{{ formatRelativeTime(track.updated_at, locale) }}</div>
              </div>
              <StatusBadge
                :status="track.status"
                type="track"
                :variant="track.workflow_variant"
                :label="track.workflow_step?.label ?? null"
              />
            </div>
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ t('dashboard.noPendingActions') }}</p>
      </div>

      <div class="card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('dashboard.attentionTracks') }}</h2>
          <span class="text-xs text-muted-foreground">{{ attentionTracks.length }}</span>
        </div>
        <div v-if="attentionTracks.length" class="space-y-2">
          <button
            v-for="track in attentionTracks"
            :key="`attention-${track.id}`"
            class="w-full border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50"
            @click="openTrack(track.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="truncate text-sm text-foreground">{{ track.title }}</div>
                <div class="text-xs text-error">{{ t('dashboard.openCount', { count: track.open_issue_count ?? 0 }) }}</div>
              </div>
              <StatusBadge
                :status="track.status"
                type="track"
                :variant="track.workflow_variant"
                :label="track.workflow_step?.label ?? null"
              />
            </div>
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ t('dashboard.noAttentionTracks') }}</p>
      </div>

      <div class="card space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('dashboard.recentUpdates') }}</h2>
          <span class="text-xs text-muted-foreground">{{ recentTracks.length }}</span>
        </div>
        <div v-if="recentTracks.length" class="space-y-2">
          <button
            v-for="track in recentTracks"
            :key="`recent-${track.id}`"
            class="w-full border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50"
            @click="openTrack(track.id)"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="truncate text-sm text-foreground">{{ track.title }}</div>
                <div class="text-xs text-muted-foreground">{{ formatRelativeTime(track.updated_at, locale) }}</div>
              </div>
              <span class="text-xs font-mono text-muted-foreground">v{{ track.version }}</span>
            </div>
          </button>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ t('dashboard.noRecentUpdates') }}</p>
      </div>
    </div>

    <!-- 专辑进度看板 -->
    <div v-if="albums.length > 0">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-mono font-semibold text-foreground">{{ t('dashboard.albums') }}</h2>
          <button
            v-if="hasAnyPins"
            class="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
            :class="showPinnedOnly ? 'border-primary text-primary' : ''"
            @click="showPinnedOnly = !showPinnedOnly"
          >
            {{ t('dashboard.pinnedOnly') }}
          </button>
        </div>
        <RouterLink to="/albums" class="text-xs text-muted-foreground hover:text-primary transition-colors">
          {{ t('dashboard.manageAlbums') }}
        </RouterLink>
      </div>

      <div v-if="attentionAlbums.length > 0 && !showPinnedOnly" class="card space-y-3 mb-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('dashboard.attentionAlbums') }}</h3>
          <span class="text-xs text-muted-foreground">{{ attentionAlbums.length }}</span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <button
            v-for="album in attentionAlbums"
            :key="`attention-album-${album.id}`"
            class="w-full border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/50"
            @click="openAlbumSettings(album.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="truncate text-sm font-medium text-foreground">{{ album.title }}</div>
                <div class="text-xs text-muted-foreground">{{ album.circle_name || album.catalog_number || t('dashboard.tracksCount', { n: album.track_count }) }}</div>
              </div>
              <div class="flex flex-wrap justify-end gap-1">
                <span v-if="deadlineInfo(album.id)" class="text-[11px] px-2 py-0.5 rounded-full" :class="deadlineInfo(album.id)!.overdue ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning'">
                  {{ deadlineInfo(album.id)!.text }}
                </span>
                <span v-if="albumStatsMap[album.id]?.open_issues" class="text-[11px] bg-error-bg text-error px-2 py-0.5 rounded-full">
                  {{ t('dashboard.openIssues', { count: albumStatsMap[album.id].open_issues }) }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          v-for="album in displayedAlbums"
          :key="album.id"
          class="rounded-none border border-border bg-card overflow-hidden cursor-pointer transition-colors hover:border-primary/50"
          @click="openAlbumSettings(album.id)"
        >
          <!-- Cover image or placeholder — no color bar -->
          <div class="w-full h-28 overflow-hidden">
            <img
              :src="album.cover_image ? `${API_ORIGIN}/uploads/${album.cover_image}` : albumPlaceholder"
              :alt="album.title"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="p-5">
            <div class="flex items-start justify-between mb-3">
              <div class="min-w-0 flex-1 mr-3">
                <h3 class="font-mono font-bold text-base text-foreground truncate">{{ album.title }}</h3>
                <div v-if="album.circle_name" class="text-xs text-muted-foreground mt-0.5 truncate">{{ album.circle_name }}</div>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                <button
                  class="text-[11px] rounded-full border border-border px-2.5 py-1 font-mono text-muted-foreground transition-colors hover:text-foreground"
                  :class="isPinned(album.id) ? 'border-primary text-primary' : ''"
                  @click.stop="togglePin(album.id)"
                >
                  {{ isPinned(album.id) ? t('albums.unpinDashboard') : t('albums.pinDashboard') }}
                </button>
                <span v-if="album.catalog_number" class="text-xs font-mono text-muted-foreground">{{ album.catalog_number }}</span>
                <div class="flex items-center gap-1 flex-wrap justify-end">
                  <span v-if="deadlineInfo(album.id)" class="text-xs px-2 py-0.5 rounded-full" :class="deadlineInfo(album.id)!.overdue ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning'">
                    {{ deadlineInfo(album.id)!.text }}
                  </span>
                  <span v-if="albumStatsMap[album.id]?.overdue_track_count" class="text-xs bg-error-bg text-error px-2 py-0.5 rounded-full">
                    {{ t('dashboard.overdueCount', { count: albumStatsMap[album.id].overdue_track_count }) }}
                  </span>
                  <span v-if="albumStatsMap[album.id]?.open_issues > 0" class="text-xs bg-error-bg text-error px-2 py-0.5 rounded-full">
                    {{ t('dashboard.openIssues', { count: albumStatsMap[album.id].open_issues }) }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="album.genres?.length" class="flex flex-wrap gap-1 mb-3">
              <span v-for="genre in album.genres" :key="genre" class="text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono">{{ genre }}</span>
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
                  {{ statusLabel(statusKey, album) }} ({{ count }})
                </span>
              </div>
              <div class="flex items-center justify-between mb-4">
                <p class="text-xs text-muted-foreground">{{ albumStatsMap[album.id].total_tracks }} {{ t('dashboard.tracks') }}</p>
                <button
                  v-if="album.producer_id === appStore.currentUser?.id && completedCount(album.id) > 0"
                  @click.stop="handleExport(album.id)"
                  :disabled="exportingAlbum === album.id"
                  class="btn-secondary text-xs px-3 py-1"
                >
                  <template v-if="exportingAlbum === album.id">{{ t('common.loading') }}</template>
                  <template v-else>{{ t('dashboard.exportAlbum') }} ({{ completedCount(album.id) }}/{{ albumStatsMap[album.id].total_tracks }})</template>
                </button>
              </div>
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
      <div v-if="showPinnedOnly && displayedAlbums.length === 0" class="card text-sm text-muted-foreground">
        {{ t('dashboard.noPinnedAlbums') }}
      </div>
    </div>

    <!-- 曲目列表（按专辑分组） -->
    <div>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h2 class="text-base sm:text-lg font-mono font-semibold text-foreground">
          {{ t('dashboard.tracksHeading') }}
          <span v-if="filterStatus" class="text-sm font-normal text-muted-foreground ml-2">
            ({{ t('dashboard.filtered', { status: filterStatus }) }})
            <button @click="filterStatus = ''" class="text-primary hover:underline ml-1">{{ t('dashboard.clearFilter') }}</button>
          </span>
        </h2>
        <div class="flex items-center gap-2 self-start sm:self-auto">
          <div class="relative">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" :stroke-width="2" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('dashboard.searchPlaceholder')"
              class="input-field pl-9 pr-3 py-2 text-sm w-48 sm:w-56"
            />
          </div>
          <button @click="router.push('/upload')" class="btn-primary text-sm flex-shrink-0">
            {{ t('dashboard.submitTrack') }}
          </button>
        </div>
      </div>

      <!-- Album search results -->
      <div v-if="searchAlbumResults.length > 0 && searchQuery.trim()" class="space-y-2 mb-4">
        <h3 class="text-sm font-mono font-semibold text-muted-foreground">{{ t('dashboard.matchingAlbums') }}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="alb in searchAlbumResults"
            :key="alb.id"
            class="card cursor-pointer hover:border-primary transition-colors"
            @click="router.push(`/albums/${alb.id}/settings`)"
          >
            <div class="text-sm font-mono font-semibold text-foreground truncate">{{ alb.title }}</div>
            <div v-if="alb.description" class="text-xs text-muted-foreground mt-1 line-clamp-1">{{ alb.description }}</div>
          </div>
        </div>
      </div>

      <div v-if="loading">
        <SkeletonLoader :rows="5" :card="true" />
      </div>
      <div v-else-if="filteredTracks.length === 0 && !searchAlbumResults.length">
        <EmptyState :icon="Music" :title="t('dashboard.noTracks')" />
      </div>
      <!-- Desktop unified table -->
      <div v-else class="bg-card border border-border rounded-none overflow-hidden hidden md:block">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              <th class="px-4 py-3 w-16">{{ t('dashboard.colNumber') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colTitle') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colArtist') }}</th>
              <th class="px-4 py-3 w-20">{{ t('dashboard.colDuration') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colStatus') }}</th>
              <th class="px-4 py-3">{{ t('dashboard.colOpenIssues') }}</th>
              <th class="px-4 py-3 w-16">{{ t('dashboard.colVersion') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groupedTracks" :key="group.albumId">
              <!-- Album separator row -->
              <tr class="bg-background">
                <td colspan="7" class="px-4 py-2">
                  <div class="flex items-center gap-3">
                    <span class="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">{{ group.albumTitle }}</span>
                    <div class="flex-1 h-px bg-border"></div>
                  </div>
                </td>
              </tr>
              <!-- Track rows -->
              <tr
                v-for="track in group.tracks"
                :key="track.id"
                @click="router.push({ path: `/tracks/${track.id}`, query: { returnTo: route.path } })"
                class="border-b border-border last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{{ track.track_number || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="text-sm font-medium text-foreground">{{ track.title }}</div>
                  <div v-if="originalMetaParts(track).length" class="mt-0.5 text-xs text-muted-foreground truncate">
                    {{ originalMetaParts(track).join(' · ') }}
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-muted-foreground" :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</td>
                <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{{ formatDuration(track.duration) }}</td>
                <td class="px-4 py-3">
                  <StatusBadge
                    :status="track.status"
                    type="track"
                    :variant="track.workflow_variant"
                    :label="track.workflow_step?.label ?? null"
                  />
                </td>
                <td class="px-4 py-3 text-sm text-muted-foreground">
                  <button
                    v-if="track.open_issue_count"
                    @click.stop="router.push({ path: `/tracks/${track.id}`, hash: '#issues', query: { returnTo: route.path } })"
                    class="text-error hover:underline cursor-pointer"
                  >{{ t('dashboard.openCount', { count: track.open_issue_count }) }}</button>
                  <span v-else>--</span>
                </td>
                <td class="px-4 py-3 text-sm text-muted-foreground">v{{ track.version }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <!-- Mobile card list -->
      <div v-if="!loading && filteredTracks.length > 0" class="space-y-5 md:hidden">
        <div v-for="group in groupedTracks" :key="group.albumId">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">{{ group.albumTitle }}</span>
            <div class="flex-1 h-px bg-border"></div>
          </div>
          <div class="space-y-2">
            <div
              v-for="track in group.tracks"
              :key="track.id"
               @click="router.push({ path: `/tracks/${track.id}`, query: { returnTo: route.path } })"
              class="bg-card border border-border p-3 cursor-pointer active:bg-white/5 transition-colors"
            >
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2 min-w-0">
                  <span v-if="track.track_number" class="text-xs text-muted-foreground font-mono flex-shrink-0">#{{ track.track_number }}</span>
                  <span class="text-sm font-medium text-foreground truncate">{{ track.title }}</span>
                </div>
                <StatusBadge
                  :status="track.status"
                  type="track"
                  :variant="track.workflow_variant"
                  :label="track.workflow_step?.label ?? null"
                />
              </div>
              <div v-if="originalMetaParts(track).length" class="mb-1.5 text-xs text-muted-foreground truncate">
                {{ originalMetaParts(track).join(' · ') }}
              </div>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span :class="{ 'font-mono': !track.artist && track.submitter_id }">{{ track.artist ?? (track.submitter_id ? '#' + hashId(track.submitter_id) : '--') }}</span>
                <span class="font-mono">{{ formatDuration(track.duration) }}</span>
                <span class="font-mono">v{{ track.version }}</span>
                <span v-if="track.open_issue_count" class="text-error">{{ t('dashboard.openCount', { count: track.open_issue_count }) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>
