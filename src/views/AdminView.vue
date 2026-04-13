<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { adminApi } from '@/api'
import { useToast } from '@/composables/useToast'
import {
  Check, ChevronRight, Music, Search, Users, BarChart3, Activity, Wrench, Disc3,
  AlertCircle, CircleCheckBig,
} from 'lucide-vue-next'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { Album, Track, User, UserRole, AdminDashboardStats, AdminActivityLogEntry } from '@/types'
import { formatRelativeTime } from '@/utils/time'

const { t, locale } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const toast = useToast()

// --- Tab state ---
type TabKey = 'dashboard' | 'users' | 'albums' | 'activity' | 'workflow'
const activeTab = ref<TabKey>('dashboard')

const tabs: { key: TabKey; labelKey: string; icon: any }[] = [
  { key: 'dashboard', labelKey: 'admin.dashboard', icon: BarChart3 },
  { key: 'users', labelKey: 'admin.userManagement', icon: Users },
  { key: 'albums', labelKey: 'admin.albumManagement', icon: Disc3 },
  { key: 'activity', labelKey: 'admin.activityLog', icon: Activity },
  { key: 'workflow', labelKey: 'admin.workflow', icon: Wrench },
]

// ─── Dashboard ───────────────────────────────────────────────────────────────
const dashboardStats = ref<AdminDashboardStats | null>(null)
const dashboardLoading = ref(true)
const dashboardLoaded = ref(false)

async function loadDashboard() {
  if (dashboardLoaded.value) return
  dashboardLoading.value = true
  try {
    dashboardStats.value = await adminApi.dashboard()
    dashboardLoaded.value = true
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    dashboardLoading.value = false
  }
}

// ─── Users ───────────────────────────────────────────────────────────────────
const users = ref<User[]>([])
const usersLoading = ref(false)
const usersLoaded = ref(false)
const deletingId = ref<number | null>(null)
const confirmDeleteUser = ref<User | null>(null)

async function loadUsers() {
  if (usersLoaded.value) return
  usersLoading.value = true
  try {
    users.value = await adminApi.listUsers()
    usersLoaded.value = true
  } finally {
    usersLoading.value = false
  }
}

async function onRoleChange(user: User, newRole: UserRole) {
  try {
    const updated = await adminApi.updateUser(user.id, { role: newRole })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function onAdminToggle(user: User) {
  try {
    const updated = await adminApi.updateUser(user.id, { is_admin: !user.is_admin })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function onVerifiedToggle(user: User) {
  try {
    const updated = await adminApi.updateUser(user.id, { email_verified: !user.email_verified })
    Object.assign(user, updated)
    toast.success(t('admin.updateSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  }
}

function onDelete(user: User) {
  confirmDeleteUser.value = user
}

async function doDelete() {
  const user = confirmDeleteUser.value
  if (!user) return
  confirmDeleteUser.value = null
  deletingId.value = user.id
  try {
    await adminApi.deleteUser(user.id)
    users.value = users.value.filter(u => u.id !== user.id)
    toast.success(t('admin.deleteSuccess'))
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    deletingId.value = null
  }
}

const isSelf = (user: User) => user.id === appStore.currentUser?.id

const roleOptions: { value: UserRole; labelKey: string }[] = [
  { value: 'member', labelKey: 'roles.member' },
  { value: 'producer', labelKey: 'roles.producer' },
]

const roleSelectOptions = computed(() =>
  roleOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))
)

// ─── Albums ──────────────────────────────────────────────────────────────────
const albums = ref<Album[]>([])
const albumsLoading = ref(false)
const albumsLoaded = ref(false)
const albumSearch = ref('')
const expandedAlbumId = ref<number | null>(null)
const albumTracks = ref<Record<number, Track[]>>({})
const albumTracksLoading = ref<number | null>(null)

async function loadAlbums(force = false) {
  if (!force && albumsLoaded.value) return
  albumsLoading.value = true
  expandedAlbumId.value = null
  try {
    albums.value = await adminApi.listAlbums({
      include_archived: true,
      search: albumSearch.value || undefined,
    })
    albumsLoaded.value = true
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    albumsLoading.value = false
  }
}

async function toggleAlbumTracks(albumId: number) {
  if (expandedAlbumId.value === albumId) {
    expandedAlbumId.value = null
    return
  }
  expandedAlbumId.value = albumId
  if (albumTracks.value[albumId]) return
  albumTracksLoading.value = albumId
  try {
    albumTracks.value[albumId] = await adminApi.listAlbumTracks(albumId)
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    albumTracksLoading.value = null
  }
}

function goToTrack(_albumId: number, trackId: number) {
  router.push(`/tracks/${trackId}`)
}

// ─── Activity Log ────────────────────────────────────────────────────────────
const activityLog = ref<AdminActivityLogEntry[]>([])
const activityLoading = ref(false)
const activityLoaded = ref(false)
const activityHasMore = ref(true)
const activityFilterType = ref('')
const activityFilterAlbumId = ref<number | null>(null)

async function loadActivity(append = false) {
  activityLoading.value = true
  try {
    const params: { limit: number; offset?: number; event_type?: string; album_id?: number } = { limit: 50 }
    if (append) params.offset = activityLog.value.length
    if (activityFilterType.value) params.event_type = activityFilterType.value
    if (activityFilterAlbumId.value) params.album_id = activityFilterAlbumId.value
    const results = await adminApi.activityLog(params)
    if (append) {
      activityLog.value.push(...results)
    } else {
      activityLog.value = results
    }
    activityHasMore.value = results.length >= 50
    activityLoaded.value = true
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    activityLoading.value = false
  }
}

watch([activityFilterType, activityFilterAlbumId], () => {
  if (activeTab.value === 'activity') loadActivity()
})

// ─── Workflow Intervention ───────────────────────────────────────────────────
const wfSelectedAlbumId = ref<number | null>(null)
const wfTracks = ref<Track[]>([])
const wfTracksLoading = ref(false)
const wfSelectedTrack = ref<Track | null>(null)
const wfAction = ref<'force' | 'reassign'>('force')
const wfNewStatus = ref('')
const wfReason = ref('')
const wfTargetUserIds = ref<number[]>([])
const wfSubmitting = ref(false)

async function loadWfTracks() {
  if (!wfSelectedAlbumId.value) return
  wfTracksLoading.value = true
  wfSelectedTrack.value = null
  try {
    wfTracks.value = await adminApi.listAlbumTracks(wfSelectedAlbumId.value)
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    wfTracksLoading.value = false
  }
}

watch(wfSelectedAlbumId, () => loadWfTracks())

const wfAlbumOptions = computed(() =>
  albums.value.map(a => ({ value: String(a.id), label: a.title }))
)

const LEGACY_STATUSES = [
  'submitted', 'peer_review', 'peer_revision', 'producer_mastering_gate',
  'mastering', 'mastering_revision', 'final_review', 'completed', 'rejected',
]

const wfStatusOptions = computed(() => {
  const album = albums.value.find(a => a.id === wfSelectedAlbumId.value)
  if (album?.workflow_config?.steps?.length) {
    return album.workflow_config.steps.map(s => ({ value: s.id, label: `${s.label} (${s.id})` }))
  }
  return LEGACY_STATUSES.map(s => ({ value: s, label: s }))
})

async function submitForceStatus() {
  if (!wfSelectedTrack.value || !wfNewStatus.value || !wfReason.value) return
  wfSubmitting.value = true
  try {
    await adminApi.forceStatus(wfSelectedTrack.value.id, {
      new_status: wfNewStatus.value,
      reason: wfReason.value,
    })
    toast.success(t('admin.forceStatusSuccess'))
    wfReason.value = ''
    wfNewStatus.value = ''
    await loadWfTracks()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    wfSubmitting.value = false
  }
}

async function submitReassign() {
  if (!wfSelectedTrack.value || wfTargetUserIds.value.length === 0 || !wfReason.value) return
  wfSubmitting.value = true
  try {
    await adminApi.reassign(wfSelectedTrack.value.id, {
      user_ids: wfTargetUserIds.value,
      reason: wfReason.value,
    })
    toast.success(t('admin.reassignSuccess'))
    wfReason.value = ''
    wfTargetUserIds.value = []
    await loadWfTracks()
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    wfSubmitting.value = false
  }
}

// ─── Tab switching logic ─────────────────────────────────────────────────────
function switchTab(tab: TabKey) {
  activeTab.value = tab
  if (tab === 'dashboard') loadDashboard()
  if (tab === 'users') loadUsers()
  if (tab === 'albums') loadAlbums()
  if (tab === 'activity') { if (!activityLoaded.value) loadActivity() }
  if (tab === 'workflow') { loadAlbums(); if (!usersLoaded.value) loadUsers() }
}

// ─── Init ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!appStore.currentUser?.is_admin) {
    router.replace('/')
    return
  }
  loadDashboard()
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('admin.title') }}</h1>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-border overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex items-center gap-1.5 px-4 py-2 text-sm font-mono font-medium transition-colors whitespace-nowrap"
        :class="activeTab === tab.key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="switchTab(tab.key)"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ t(tab.labelKey) }}
      </button>
    </div>

    <!-- ═══════════ Dashboard Tab ═══════════ -->
    <template v-if="activeTab === 'dashboard'">
      <div v-if="dashboardLoading"><SkeletonLoader :rows="4" :card="true" /></div>
      <template v-else-if="dashboardStats">
        <!-- KPI cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="card text-center">
            <p class="text-xs text-muted-foreground mb-1">{{ t('admin.totalUsers') }}</p>
            <p class="text-2xl font-mono font-bold text-foreground">{{ dashboardStats.total_users }}</p>
          </div>
          <div class="card text-center">
            <p class="text-xs text-muted-foreground mb-1">{{ t('admin.activeAlbums') }}</p>
            <p class="text-2xl font-mono font-bold text-foreground">{{ dashboardStats.active_albums }}</p>
          </div>
          <div class="card text-center">
            <p class="text-xs text-muted-foreground mb-1">{{ t('admin.totalTracks') }}</p>
            <p class="text-2xl font-mono font-bold text-foreground">{{ dashboardStats.total_tracks }}</p>
          </div>
          <div class="card text-center">
            <p class="text-xs text-muted-foreground mb-1">{{ t('admin.openIssues') }}</p>
            <p class="text-2xl font-mono font-bold text-primary">{{ dashboardStats.open_issues }}</p>
          </div>
          <div class="card text-center col-span-2 md:col-span-1">
            <p class="text-xs text-muted-foreground mb-1">{{ t('admin.totalAlbums') }}</p>
            <p class="text-2xl font-mono font-bold text-foreground">{{ dashboardStats.total_albums }}</p>
          </div>
        </div>

        <!-- Status distribution -->
        <div class="grid md:grid-cols-2 gap-6">
          <div class="card">
            <h2 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('admin.tracksByStatus') }}</h2>
            <div class="space-y-2">
              <div
                v-for="(count, st) in dashboardStats.tracks_by_status"
                :key="st"
                class="flex items-center justify-between"
              >
                <StatusBadge :status="String(st)" type="track" />
                <span class="text-sm font-mono text-foreground">{{ count }}</span>
              </div>
              <p v-if="Object.keys(dashboardStats.tracks_by_status).length === 0" class="text-sm text-muted-foreground">—</p>
            </div>
          </div>
          <div class="card">
            <h2 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('admin.usersByRole') }}</h2>
            <div class="space-y-2">
              <div
                v-for="(count, role) in dashboardStats.users_by_role"
                :key="role"
                class="flex items-center justify-between"
              >
                <span class="text-sm text-muted-foreground">{{ t(`roles.${role}`, String(role)) }}</span>
                <span class="text-sm font-mono text-foreground">{{ count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent events -->
        <div class="card">
          <h2 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('admin.recentEvents') }}</h2>
          <div v-if="dashboardStats.recent_events.length === 0" class="text-sm text-muted-foreground py-4 text-center">
            {{ t('admin.noEvents') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="event in dashboardStats.recent_events"
              :key="event.id"
              class="flex items-center gap-3 py-2 border-b border-border last:border-0 text-sm"
            >
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-mono bg-border text-foreground flex-shrink-0">
                {{ event.event_type }}
              </span>
              <span v-if="event.actor" class="text-muted-foreground truncate flex-shrink-0">
                {{ event.actor.display_name }}
              </span>
              <span v-if="event.from_status || event.to_status" class="text-muted-foreground flex-shrink-0">
                {{ event.from_status || '—' }} → {{ event.to_status || '—' }}
              </span>
              <span class="ml-auto text-xs text-muted-foreground flex-shrink-0">
                {{ formatRelativeTime(event.created_at, locale) }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════════ Users Tab ═══════════ -->
    <template v-if="activeTab === 'users'">
    <div v-if="usersLoading"><SkeletonLoader :rows="5" :card="true" /></div>

    <div v-else class="card">
      <h2 class="text-sm font-mono font-semibold text-foreground mb-4">{{ t('admin.userManagement') }}</h2>

      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-muted-foreground">
              <th class="pb-3 pr-4">{{ t('admin.displayName') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.username') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.email') }}</th>
              <th class="pb-3 pr-4">{{ t('admin.role') }}</th>
              <th class="pb-3 pr-4 text-center">{{ t('admin.adminFlag') }}</th>
              <th class="pb-3 pr-4 text-center">{{ t('admin.verified') }}</th>
              <th class="pb-3">{{ t('admin.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-border last:border-0"
            >
              <td class="py-3 pr-4">
                <div class="flex items-center gap-2">
                  <div
                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    :style="{ backgroundColor: user.avatar_color }"
                  >
                    {{ user.display_name.charAt(0) }}
                  </div>
                  <span class="text-foreground">{{ user.display_name }}</span>
                </div>
              </td>
              <td class="py-3 pr-4 text-muted-foreground">{{ user.username }}</td>
              <td class="py-3 pr-4 text-muted-foreground">{{ user.email || '—' }}</td>
              <td class="py-3 pr-4">
                <CustomSelect
                  :model-value="user.role"
                  :options="roleSelectOptions"
                  size="sm"
                  @update:model-value="(v: any) => onRoleChange(user, v as UserRole)"
                />
              </td>
              <td class="py-3 pr-4 text-center">
                <button
                  class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                  :class="user.is_admin ? 'bg-primary border-primary' : 'bg-background'"
                  :disabled="isSelf(user)"
                  :title="isSelf(user) ? '' : t('admin.adminFlag')"
                  @click="!isSelf(user) && onAdminToggle(user)"
                >
                  <Check v-if="user.is_admin" class="w-3 h-3 text-black" :stroke-width="3" />
                </button>
              </td>
              <td class="py-3 pr-4 text-center">
                <button
                  class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                  :class="user.email_verified ? 'bg-primary border-primary' : 'bg-background'"
                  @click="onVerifiedToggle(user)"
                >
                  <Check v-if="user.email_verified" class="w-3 h-3 text-black" :stroke-width="3" />
                </button>
              </td>
              <td class="py-3">
                <button
                  v-if="!isSelf(user)"
                  class="text-xs text-error hover:text-error/80 transition-colors font-mono"
                  :disabled="deletingId === user.id"
                  @click="onDelete(user)"
                >
                  {{ t('admin.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="md:hidden space-y-3">
        <div
          v-for="user in users"
          :key="'m-' + user.id"
          class="border border-border bg-background p-4 space-y-3"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              :style="{ backgroundColor: user.avatar_color }"
            >
              {{ user.display_name.charAt(0) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground truncate">{{ user.display_name }}</p>
              <p class="text-xs text-muted-foreground truncate">@{{ user.username }}</p>
            </div>
          </div>
          <div class="text-xs text-muted-foreground truncate">{{ user.email || '—' }}</div>
          <div class="flex items-center gap-3 flex-wrap">
            <CustomSelect
              :model-value="user.role"
              :options="roleSelectOptions"
              size="sm"
              @update:model-value="(v: any) => onRoleChange(user, v as UserRole)"
            />
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <button
                class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                :class="user.is_admin ? 'bg-primary border-primary' : 'bg-background'"
                :disabled="isSelf(user)"
                @click="!isSelf(user) && onAdminToggle(user)"
              >
                <Check v-if="user.is_admin" class="w-3 h-3 text-black" :stroke-width="3" />
              </button>
              {{ t('admin.adminFlag') }}
            </label>
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <button
                class="w-4 h-4 rounded border border-border inline-flex items-center justify-center transition-colors"
                :class="user.email_verified ? 'bg-primary border-primary' : 'bg-background'"
                @click="onVerifiedToggle(user)"
              >
                <Check v-if="user.email_verified" class="w-3 h-3 text-black" :stroke-width="3" />
              </button>
              {{ t('admin.verified') }}
            </label>
          </div>
          <button
            v-if="!isSelf(user)"
            class="text-xs text-error hover:text-error/80 transition-colors font-mono"
            :disabled="deletingId === user.id"
            @click="onDelete(user)"
          >
            {{ t('admin.delete') }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      v-if="confirmDeleteUser"
      :title="t('admin.confirmDelete', { name: confirmDeleteUser.display_name })"
      :destructive="true"
      :confirm-text="t('admin.delete')"
      @confirm="doDelete"
      @cancel="confirmDeleteUser = null"
    />
    </template>

    <!-- ═══════════ Albums Tab ═══════════ -->
    <template v-if="activeTab === 'albums'">
      <div v-if="albumsLoading && !albumsLoaded"><SkeletonLoader :rows="5" :card="true" /></div>

      <template v-else>
        <!-- Search -->
        <div class="flex gap-3">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              v-model="albumSearch"
              class="input-field pl-9"
              :placeholder="t('admin.searchAlbums')"
              @keyup.enter="loadAlbums(true)"
            />
          </div>
          <button class="btn-secondary font-mono text-sm" @click="loadAlbums(true)">
            {{ t('admin.search') }}
          </button>
        </div>

        <div v-if="albums.length === 0" class="card text-center text-muted-foreground text-sm py-8">
          {{ t('admin.noAlbums') }}
        </div>

        <!-- Album list -->
        <div v-else class="space-y-3">
          <div v-for="album in albums" :key="album.id" class="card !p-0">
            <!-- Album header row -->
            <button
              class="w-full flex items-center gap-4 p-4 text-left hover:bg-background/50 transition-colors"
              @click="toggleAlbumTracks(album.id)"
            >
              <ChevronRight
                class="w-4 h-4 text-muted-foreground transition-transform flex-shrink-0"
                :class="{ 'rotate-90': expandedAlbumId === album.id }"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-mono font-semibold text-foreground truncate">{{ album.title }}</span>
                  <span v-if="album.archived_at" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-border text-muted-foreground">
                    {{ t('albums.archivedBadge') }}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                  <span v-if="album.producer">{{ t('roles.producer') }}: {{ album.producer.display_name }}</span>
                  <span>{{ t('albums.trackCount', { n: album.track_count }) }}</span>
                  <span v-if="album.circle_name">{{ album.circle_name }}</span>
                </div>
              </div>
              <span class="text-xs text-muted-foreground flex-shrink-0">
                {{ new Date(album.created_at).toLocaleDateString() }}
              </span>
            </button>

            <!-- Expanded tracks -->
            <div v-if="expandedAlbumId === album.id" class="border-t border-border">
              <div v-if="albumTracksLoading === album.id" class="p-4">
                <SkeletonLoader :rows="3" />
              </div>
              <div v-else-if="!albumTracks[album.id]?.length" class="p-4 text-sm text-muted-foreground text-center">
                {{ t('admin.noTracks') }}
              </div>
              <div v-else>
                <div
                  v-for="track in albumTracks[album.id]"
                  :key="track.id"
                  class="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-background/50 transition-colors cursor-pointer"
                  @click="goToTrack(album.id, track.id)"
                >
                  <Music class="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span v-if="track.track_number" class="text-xs text-muted-foreground w-6 text-right flex-shrink-0">
                    {{ String(track.track_number).padStart(2, '0') }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-foreground truncate">{{ track.title }}</p>
                    <p class="text-xs text-muted-foreground truncate">{{ track.artist }}</p>
                  </div>
                  <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" />
                  <span v-if="track.submitter" class="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {{ track.submitter.display_name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════════ Activity Log Tab ═══════════ -->
    <template v-if="activeTab === 'activity'">
      <!-- Filters -->
      <div class="flex flex-wrap gap-3">
        <input
          v-model="activityFilterType"
          class="input-field w-48"
          :placeholder="t('admin.filterByType')"
        />
        <CustomSelect
          :model-value="activityFilterAlbumId ? String(activityFilterAlbumId) : ''"
          :options="[{ value: '', label: t('admin.allAlbums') }, ...wfAlbumOptions]"
          size="sm"
          @update:model-value="(v: any) => activityFilterAlbumId = v ? Number(v) : null"
        />
      </div>

      <div v-if="activityLoading && !activityLoaded"><SkeletonLoader :rows="8" :card="true" /></div>

      <div v-else-if="activityLog.length === 0" class="card text-center text-muted-foreground text-sm py-8">
        {{ t('admin.noEvents') }}
      </div>

      <template v-else>
        <div class="card !p-0">
          <!-- Desktop table -->
          <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-left text-xs text-muted-foreground">
                  <th class="p-3">{{ t('admin.eventType') }}</th>
                  <th class="p-3">{{ t('admin.eventActor') }}</th>
                  <th class="p-3">{{ t('admin.eventTrack') }}</th>
                  <th class="p-3">{{ t('admin.eventAlbum') }}</th>
                  <th class="p-3">{{ t('admin.eventFrom') }}</th>
                  <th class="p-3">{{ t('admin.eventTo') }}</th>
                  <th class="p-3">{{ t('admin.eventTime') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in activityLog"
                  :key="entry.id"
                  class="border-b border-border last:border-0 hover:bg-background/50"
                >
                  <td class="p-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-mono bg-border text-foreground">
                      {{ entry.event_type }}
                    </span>
                  </td>
                  <td class="p-3 text-muted-foreground">{{ entry.actor?.display_name || '—' }}</td>
                  <td class="p-3">
                    <button
                      v-if="entry.track_title && entry.album_id && entry.track_id"
                      class="text-primary hover:underline truncate max-w-[160px] block text-left"
                      @click="goToTrack(entry.album_id!, entry.track_id!)"
                    >
                      {{ entry.track_title }}
                    </button>
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="p-3 text-muted-foreground truncate max-w-[140px]">{{ entry.album_title || '—' }}</td>
                  <td class="p-3">
                    <StatusBadge v-if="entry.from_status" :status="entry.from_status" type="track" />
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="p-3">
                    <StatusBadge v-if="entry.to_status" :status="entry.to_status" type="track" />
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                  <td class="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {{ formatRelativeTime(entry.created_at, locale) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="md:hidden divide-y divide-border">
            <div v-for="entry in activityLog" :key="'m-' + entry.id" class="p-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-mono bg-border text-foreground">
                  {{ entry.event_type }}
                </span>
                <span class="text-xs text-muted-foreground">{{ formatRelativeTime(entry.created_at, locale) }}</span>
              </div>
              <p v-if="entry.track_title" class="text-sm text-foreground">{{ entry.track_title }}</p>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span v-if="entry.actor">{{ entry.actor.display_name }}</span>
                <template v-if="entry.from_status || entry.to_status">
                  <span>{{ entry.from_status || '?' }} → {{ entry.to_status || '?' }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="activityHasMore"
          class="btn-secondary font-mono text-sm w-full"
          :disabled="activityLoading"
          @click="loadActivity(true)"
        >
          {{ t('admin.loadMore') }}
        </button>
      </template>
    </template>

    <!-- ═══════════ Workflow Tab ═══════════ -->
    <template v-if="activeTab === 'workflow'">
      <!-- Album & track selection -->
      <div class="card space-y-4">
        <h2 class="text-sm font-mono font-semibold text-foreground">{{ t('admin.selectTrack') }}</h2>

        <div class="flex flex-wrap gap-3">
          <CustomSelect
            :model-value="wfSelectedAlbumId ? String(wfSelectedAlbumId) : ''"
            :options="[{ value: '', label: t('admin.allAlbums') }, ...wfAlbumOptions]"
            @update:model-value="(v: any) => wfSelectedAlbumId = v ? Number(v) : null"
          />
        </div>

        <div v-if="wfTracksLoading"><SkeletonLoader :rows="3" /></div>
        <div v-else-if="wfTracks.length === 0 && wfSelectedAlbumId" class="text-sm text-muted-foreground py-2">
          {{ t('admin.noTracks') }}
        </div>
        <div v-else-if="wfTracks.length > 0" class="space-y-1 max-h-64 overflow-y-auto">
          <button
            v-for="track in wfTracks"
            :key="track.id"
            class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
            :class="wfSelectedTrack?.id === track.id ? 'bg-primary/10 border border-primary' : 'hover:bg-background/50 border border-transparent'"
            @click="wfSelectedTrack = track"
          >
            <Music class="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm text-foreground truncate">{{ track.title }}</p>
              <p class="text-xs text-muted-foreground truncate">{{ track.artist }}</p>
            </div>
            <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" />
          </button>
        </div>
      </div>

      <!-- Action panel -->
      <div v-if="wfSelectedTrack" class="card space-y-4">
        <div class="flex items-center gap-3 mb-2">
          <Music class="w-5 h-5 text-primary" />
          <div>
            <p class="text-sm font-mono font-semibold text-foreground">{{ wfSelectedTrack.title }}</p>
            <p class="text-xs text-muted-foreground">
              {{ t('admin.currentStatus') }}:
              <StatusBadge :status="wfSelectedTrack.status" type="track" :variant="wfSelectedTrack.workflow_variant" class="ml-1 inline-flex" />
            </p>
          </div>
        </div>

        <!-- Action toggle -->
        <div class="flex gap-2">
          <button
            class="px-3 py-1.5 text-xs font-mono rounded-full transition-colors"
            :class="wfAction === 'force' ? 'bg-primary text-[#111111]' : 'bg-card border border-border text-foreground'"
            @click="wfAction = 'force'"
          >
            <AlertCircle class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {{ t('admin.forceStatus') }}
          </button>
          <button
            class="px-3 py-1.5 text-xs font-mono rounded-full transition-colors"
            :class="wfAction === 'reassign' ? 'bg-primary text-[#111111]' : 'bg-card border border-border text-foreground'"
            @click="wfAction = 'reassign'"
          >
            <Users class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            {{ t('admin.reassign') }}
          </button>
        </div>

        <!-- Force status form -->
        <template v-if="wfAction === 'force'">
          <div class="space-y-3">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('admin.newStatus') }}</label>
              <CustomSelect
                :model-value="wfNewStatus"
                :options="wfStatusOptions"
                :placeholder="t('admin.selectStatus')"
                @update:model-value="(v: any) => wfNewStatus = v ?? ''"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('admin.reason') }}</label>
              <textarea
                v-model="wfReason"
                class="textarea-field"
                rows="2"
                :placeholder="t('admin.reason')"
              />
            </div>
            <button
              class="btn-primary font-mono text-sm"
              :disabled="!wfNewStatus || !wfReason || wfSubmitting"
              @click="submitForceStatus"
            >
              <CircleCheckBig class="w-4 h-4 inline -mt-0.5 mr-1" />
              {{ t('admin.confirm') }}
            </button>
          </div>
        </template>

        <!-- Reassign form -->
        <template v-if="wfAction === 'reassign'">
          <div class="space-y-3">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('admin.targetUser') }}</label>
              <div class="border border-border bg-background max-h-48 overflow-y-auto">
                <label
                  v-for="user in users"
                  :key="user.id"
                  class="flex items-center gap-3 px-3 py-2 hover:bg-card transition-colors cursor-pointer border-b border-border last:border-0"
                >
                  <input
                    type="checkbox"
                    :value="user.id"
                    v-model="wfTargetUserIds"
                    class="accent-primary w-4 h-4 flex-shrink-0"
                  />
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    :style="{ backgroundColor: user.avatar_color }"
                  >
                    {{ user.display_name.charAt(0) }}
                  </div>
                  <span class="text-sm text-foreground truncate">{{ user.display_name }}</span>
                  <span class="text-xs text-muted-foreground ml-auto">@{{ user.username }}</span>
                </label>
              </div>
              <p v-if="wfTargetUserIds.length > 0" class="text-xs text-muted-foreground mt-1">
                {{ t('admin.selectedCount', { n: wfTargetUserIds.length }) }}
              </p>
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{{ t('admin.reason') }}</label>
              <textarea
                v-model="wfReason"
                class="textarea-field"
                rows="2"
                :placeholder="t('admin.reason')"
              />
            </div>
            <button
              class="btn-primary font-mono text-sm"
              :disabled="wfTargetUserIds.length === 0 || !wfReason || wfSubmitting"
              @click="submitReassign"
            >
              <CircleCheckBig class="w-4 h-4 inline -mt-0.5 mr-1" />
              {{ t('admin.confirm') }}
            </button>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
