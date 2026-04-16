<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { adminApi, albumApi } from '@/api'
import { useToast } from '@/composables/useToast'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import type {
  AdminActivityLogEntry,
  AdminAuditLogEntry,
  AdminDashboardStats,
  AdminReopenRequestEntry,
  AdminRole,
  Album,
  CircleSummary,
  Track,
  User,
  UserRole,
} from '@/types'

type TabKey = 'dashboard' | 'users' | 'albums' | 'circles' | 'activity' | 'audits' | 'workflow'
type WorkflowAction = 'force' | 'reassign' | 'reopen' | 'archive' | 'restore' | 'delete'

const router = useRouter()
const appStore = useAppStore()
const toast = useToast()

const tabs: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'albums', label: 'Albums' },
  { key: 'circles', label: 'Circles' },
  { key: 'activity', label: 'Workflow Activity' },
  { key: 'audits', label: 'Admin Audits' },
  { key: 'workflow', label: 'Track Rescue' },
]

const workflowActions: WorkflowAction[] = ['force', 'reassign', 'reopen', 'archive', 'restore', 'delete']
const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'producer', label: 'Producer' },
]
const adminRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'none', label: 'No Admin' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'operator', label: 'Operator' },
  { value: 'superadmin', label: 'Superadmin' },
]

const activeTab = ref<TabKey>('dashboard')

const dashboardStats = ref<AdminDashboardStats | null>(null)
const dashboardLoading = ref(false)

const users = ref<User[]>([])
const usersLoading = ref(false)
const transferUserId = ref<number | null>(null)
const transferTargetUserId = ref<number | null>(null)
const deleteUserTarget = ref<User | null>(null)

const albums = ref<Album[]>([])
const albumsLoading = ref(false)
const albumSearch = ref('')
const expandedAlbumId = ref<number | null>(null)
const albumTracks = ref<Record<number, Track[]>>({})
const albumTracksLoading = ref<number | null>(null)

const circles = ref<CircleSummary[]>([])
const circlesLoading = ref(false)
const circleSearch = ref('')

const activityLog = ref<AdminActivityLogEntry[]>([])
const activityLoading = ref(false)
const activityEventType = ref('')
const activityAlbumId = ref<number | null>(null)
const activityActorId = ref<number | null>(null)
const activityFrom = ref('')
const activityTo = ref('')

const auditLog = ref<AdminAuditLogEntry[]>([])
const auditLoading = ref(false)
const auditAction = ref('')
const auditEntityType = ref('')
const auditActorId = ref<number | null>(null)
const auditTargetUserId = ref<number | null>(null)
const auditFrom = ref('')
const auditTo = ref('')

const workflowAlbumId = ref<number | null>(null)
const workflowTracks = ref<Track[]>([])
const workflowTracksLoading = ref(false)
const workflowTrack = ref<Track | null>(null)
const workflowAction = ref<WorkflowAction>('force')
const workflowNewStatus = ref('')
const workflowReason = ref('')
const workflowTargetUserIds = ref<number[]>([])
const workflowReopenStageId = ref('')
const workflowSubmitting = ref(false)

const reopenRequests = ref<AdminReopenRequestEntry[]>([])
const reopenRequestsLoading = ref(false)
const reopenDecisionReason = ref('Reviewed in admin console')

const workflowAlbum = computed(() => albums.value.find(album => album.id === workflowAlbumId.value) ?? null)
const workflowAlbumMembers = computed(() => workflowAlbum.value?.members.map(member => member.user) ?? [])
const workflowStatusOptions = computed(() => {
  const steps = workflowAlbum.value?.workflow_config?.steps ?? []
  const options = steps.map(step => ({ value: step.id, label: `${step.label} (${step.id})` }))
  if (!options.some(option => option.value === 'completed')) options.push({ value: 'completed', label: 'Completed' })
  if (!options.some(option => option.value === 'rejected')) options.push({ value: 'rejected', label: 'Rejected' })
  return options
})
const workflowReopenOptions = computed(() =>
  (workflowAlbum.value?.workflow_config?.steps ?? []).map(step => ({
    value: step.id,
    label: `${step.label} (${step.id})`,
  })),
)
const userSelectOptions = computed(() =>
  users.value
    .filter(user => user.deleted_at == null)
    .map(user => ({ value: user.id, label: `${user.display_name} (@${user.username})` })),
)

function fmtTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function readSelectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function readNullableNumber(event: Event): number | null {
  const value = Number(readSelectValue(event))
  return Number.isFinite(value) && value > 0 ? value : null
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escapeValue = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = [headers, ...rows].map(row => row.map(escapeValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function loadDashboard() {
  dashboardLoading.value = true
  try {
    dashboardStats.value = await adminApi.dashboard()
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    dashboardLoading.value = false
  }
}

async function loadUsers() {
  usersLoading.value = true
  try {
    users.value = await adminApi.listUsers({ include_deleted: true })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    usersLoading.value = false
  }
}

async function loadAlbums() {
  albumsLoading.value = true
  try {
    albums.value = await adminApi.listAlbums({
      include_archived: true,
      search: albumSearch.value || undefined,
    })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    albumsLoading.value = false
  }
}

async function loadCircles() {
  circlesLoading.value = true
  try {
    circles.value = await adminApi.listCircles({ search: circleSearch.value || undefined })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    circlesLoading.value = false
  }
}

async function loadActivity() {
  activityLoading.value = true
  try {
    activityLog.value = await adminApi.activityLog({
      event_type: activityEventType.value || undefined,
      album_id: activityAlbumId.value || undefined,
      actor_user_id: activityActorId.value || undefined,
      from_time: activityFrom.value ? new Date(activityFrom.value).toISOString() : undefined,
      to_time: activityTo.value ? new Date(`${activityTo.value}T23:59:59`).toISOString() : undefined,
      limit: 100,
    })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    activityLoading.value = false
  }
}

async function loadAudits() {
  auditLoading.value = true
  try {
    auditLog.value = await adminApi.auditLog({
      action: auditAction.value || undefined,
      entity_type: auditEntityType.value || undefined,
      actor_user_id: auditActorId.value || undefined,
      target_user_id: auditTargetUserId.value || undefined,
      from_time: auditFrom.value ? new Date(auditFrom.value).toISOString() : undefined,
      to_time: auditTo.value ? new Date(`${auditTo.value}T23:59:59`).toISOString() : undefined,
      limit: 100,
    })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    auditLoading.value = false
  }
}

async function loadWorkflowTracks() {
  if (!workflowAlbumId.value) {
    workflowTracks.value = []
    workflowTrack.value = null
    reopenRequests.value = []
    return
  }

  workflowTracksLoading.value = true
  reopenRequestsLoading.value = true
  workflowTrack.value = null

  try {
    const [tracks, requests] = await Promise.all([
      adminApi.listAlbumTracks(workflowAlbumId.value, { include_archived: true }),
      adminApi.listReopenRequests({ album_id: workflowAlbumId.value, status: 'pending', limit: 100 }),
    ])
    workflowTracks.value = tracks
    reopenRequests.value = requests
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    workflowTracksLoading.value = false
    reopenRequestsLoading.value = false
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
    albumTracks.value[albumId] = await adminApi.listAlbumTracks(albumId, { include_archived: true })
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    albumTracksLoading.value = null
  }
}

async function onRoleChange(user: User, role: UserRole) {
  try {
    const updated = await adminApi.updateUser(user.id, { role })
    Object.assign(user, updated)
    toast.success('User updated')
  } catch (error: any) {
    toast.error(error.message)
  }
}

function onRoleSelect(user: User, event: Event) {
  void onRoleChange(user, readSelectValue(event) as UserRole)
}

async function onAdminRoleChange(user: User, adminRole: AdminRole) {
  try {
    const updated = await adminApi.updateUser(user.id, { admin_role: adminRole })
    Object.assign(user, updated)
    toast.success('Admin access updated')
  } catch (error: any) {
    toast.error(error.message)
  }
}

function onAdminRoleSelect(user: User, event: Event) {
  void onAdminRoleChange(user, readSelectValue(event) as AdminRole)
}

async function onVerifiedToggle(user: User) {
  try {
    const updated = await adminApi.updateUser(user.id, { email_verified: !user.email_verified })
    Object.assign(user, updated)
    toast.success('Verification updated')
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function suspendUser(user: User) {
  try {
    const updated = await adminApi.suspendUser(user.id, 'Suspended from admin console')
    Object.assign(user, updated)
    toast.success('User suspended')
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function restoreUser(user: User) {
  try {
    const updated = await adminApi.restoreUser(user.id, 'Restored from admin console')
    Object.assign(user, updated)
    toast.success('User restored')
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function revokeSessions(user: User) {
  try {
    const updated = await adminApi.revokeUserSessions(user.id, 'Session invalidated from admin console')
    Object.assign(user, updated)
    toast.success('Sessions revoked')
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function confirmDeleteUser() {
  const user = deleteUserTarget.value
  if (!user) return

  try {
    await adminApi.deleteUser(user.id, 'Soft deleted from admin console')
    user.deleted_at = new Date().toISOString()
    user.suspended_at = user.deleted_at
    toast.success('User deactivated')
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    deleteUserTarget.value = null
  }
}

async function confirmTransfer(user: User) {
  if (!transferTargetUserId.value) return

  try {
    await adminApi.transferOwnership(user.id, {
      target_user_id: transferTargetUserId.value,
      reason: 'Transferred from admin console',
    })
    toast.success('Ownership transferred')
    transferUserId.value = null
    transferTargetUserId.value = null
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function toggleAlbumArchive(album: Album) {
  const wasArchived = Boolean(album.archived_at)
  try {
    const updated = wasArchived ? await albumApi.restore(album.id) : await albumApi.archive(album.id)
    Object.assign(album, updated)
    toast.success(wasArchived ? 'Album restored' : 'Album archived')
  } catch (error: any) {
    toast.error(error.message)
  }
}

async function runWorkflowAction() {
  if (!workflowTrack.value) return

  workflowSubmitting.value = true
  try {
    if (workflowAction.value === 'force') {
      await adminApi.forceStatus(workflowTrack.value.id, {
        new_status: workflowNewStatus.value,
        reason: workflowReason.value || 'Forced from admin console',
      })
    } else if (workflowAction.value === 'reassign') {
      await adminApi.reassign(workflowTrack.value.id, {
        user_ids: workflowTargetUserIds.value,
        reason: workflowReason.value || 'Reassigned from admin console',
      })
    } else if (workflowAction.value === 'reopen') {
      await adminApi.reopenTrack(workflowTrack.value.id, {
        target_stage_id: workflowReopenStageId.value,
        reason: workflowReason.value || 'Reopened from admin console',
      })
    } else if (workflowAction.value === 'archive') {
      await adminApi.archiveTrack(workflowTrack.value.id, workflowReason.value || 'Archived from admin console')
    } else if (workflowAction.value === 'restore') {
      await adminApi.restoreTrack(workflowTrack.value.id, workflowReason.value || 'Restored from admin console')
    } else if (workflowAction.value === 'delete') {
      await adminApi.deleteTrack(workflowTrack.value.id, workflowReason.value || 'Deleted from admin console')
    }

    workflowReason.value = ''
    workflowTargetUserIds.value = []
    workflowNewStatus.value = ''
    workflowReopenStageId.value = ''
    await loadWorkflowTracks()
    toast.success('Track action completed')
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    workflowSubmitting.value = false
  }
}

async function decideReopenRequest(entry: AdminReopenRequestEntry, decision: 'approve' | 'reject') {
  try {
    await adminApi.decideReopenRequest(entry.id, {
      decision,
      reason: reopenDecisionReason.value || 'Reviewed from admin console',
    })
    await loadWorkflowTracks()
    toast.success(`Reopen request ${decision}d`)
  } catch (error: any) {
    toast.error(error.message)
  }
}

function goToTrack(trackId: number) {
  router.push(`/tracks/${trackId}`)
}

function goToAlbumSettings(albumId: number) {
  router.push(`/albums/${albumId}/settings`)
}

function goToCircle(circleId: number) {
  router.push(`/circles/${circleId}`)
}

function switchTab(tab: TabKey) {
  activeTab.value = tab
  if (tab === 'dashboard') void loadDashboard()
  if (tab === 'users') void loadUsers()
  if (tab === 'albums') void loadAlbums()
  if (tab === 'circles') void loadCircles()
  if (tab === 'activity') {
    void loadAlbums()
    void loadUsers()
    void loadActivity()
  }
  if (tab === 'audits') {
    void loadUsers()
    void loadAudits()
  }
  if (tab === 'workflow') {
    void loadAlbums()
    void loadUsers()
  }
}

watch(workflowAlbumId, () => {
  void loadWorkflowTracks()
})

onMounted(() => {
  if (!appStore.currentUser?.is_admin) {
    router.replace('/')
    return
  }
  void loadDashboard()
})
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="space-y-2">
      <h1 class="text-2xl font-mono font-bold text-foreground">Admin Console</h1>
      <p class="text-sm text-muted-foreground">Governance, audit, and recovery tools for users, albums, circles, and tracks.</p>
    </div>

    <div class="flex gap-2 border-b border-border overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="px-4 py-2 text-sm font-mono whitespace-nowrap border-b-2 transition-colors"
        :class="activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <template v-if="activeTab === 'dashboard'">
      <div v-if="dashboardLoading"><SkeletonLoader :rows="5" :card="true" /></div>
      <template v-else-if="dashboardStats">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="card">
            <p class="text-xs text-muted-foreground">Users</p>
            <p class="text-2xl font-mono font-bold">{{ dashboardStats.total_users }}</p>
            <p class="text-xs text-muted-foreground mt-2">Unverified: {{ dashboardStats.unverified_users }}</p>
            <p class="text-xs text-muted-foreground">Suspended: {{ dashboardStats.suspended_users }}</p>
          </div>
          <div class="card">
            <p class="text-xs text-muted-foreground">Albums</p>
            <p class="text-2xl font-mono font-bold">{{ dashboardStats.active_albums }}</p>
            <p class="text-xs text-muted-foreground mt-2">Archived: {{ dashboardStats.archived_albums }}</p>
            <p class="text-xs text-muted-foreground">Total: {{ dashboardStats.total_albums }}</p>
          </div>
          <div class="card">
            <p class="text-xs text-muted-foreground">Tracks</p>
            <p class="text-2xl font-mono font-bold">{{ dashboardStats.total_tracks }}</p>
            <p class="text-xs text-muted-foreground mt-2">Archived: {{ dashboardStats.archived_tracks }}</p>
            <p class="text-xs text-muted-foreground">Stalled: {{ dashboardStats.stalled_tracks }}</p>
          </div>
          <div class="card">
            <p class="text-xs text-muted-foreground">Operations</p>
            <p class="text-2xl font-mono font-bold">{{ dashboardStats.open_issues }}</p>
            <p class="text-xs text-muted-foreground mt-2">Pending reopen: {{ dashboardStats.pending_reopen_requests }}</p>
            <p class="text-xs text-muted-foreground">Webhook failures: {{ dashboardStats.failed_webhook_deliveries }}</p>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
          <div class="card space-y-3">
            <h2 class="text-sm font-mono font-semibold">Tracks by Status</h2>
            <div
              v-for="(count, status) in dashboardStats.tracks_by_status"
              :key="status"
              class="flex items-center justify-between"
            >
              <StatusBadge :status="String(status)" type="track" />
              <span class="text-sm font-mono">{{ count }}</span>
            </div>
          </div>
          <div class="card space-y-3">
            <h2 class="text-sm font-mono font-semibold">Users by Role</h2>
            <div
              v-for="(count, role) in dashboardStats.users_by_role"
              :key="role"
              class="flex items-center justify-between"
            >
              <span class="text-sm">{{ role }}</span>
              <span class="text-sm font-mono">{{ count }}</span>
            </div>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
          <div class="card space-y-3">
            <h2 class="text-sm font-mono font-semibold">Recent Workflow Events</h2>
            <div v-if="dashboardStats.recent_events.length === 0" class="text-sm text-muted-foreground">No recent workflow events.</div>
            <div
              v-for="entry in dashboardStats.recent_events"
              :key="entry.id"
              class="border-b border-border last:border-0 py-2 text-sm"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="font-mono">{{ entry.event_type }}</span>
                <span class="text-xs text-muted-foreground">{{ fmtTime(entry.created_at) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ entry.actor?.display_name || 'System' }}</p>
            </div>
          </div>
          <div class="card space-y-3">
            <h2 class="text-sm font-mono font-semibold">Recent Admin Audits</h2>
            <div v-if="dashboardStats.recent_audits.length === 0" class="text-sm text-muted-foreground">No recent admin actions.</div>
            <div
              v-for="entry in dashboardStats.recent_audits"
              :key="entry.id"
              class="border-b border-border last:border-0 py-2 text-sm"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="font-mono">{{ entry.action }}</span>
                <span class="text-xs text-muted-foreground">{{ fmtTime(entry.created_at) }}</span>
              </div>
              <p class="text-xs text-muted-foreground">{{ entry.summary || `${entry.entity_type} #${entry.entity_id ?? '-'}` }}</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <template v-if="activeTab === 'users'">
      <div v-if="usersLoading"><SkeletonLoader :rows="5" :card="true" /></div>
      <div v-else class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border text-xs text-muted-foreground">
              <th class="py-3 pr-4">User</th>
              <th class="py-3 pr-4">Role</th>
              <th class="py-3 pr-4">Admin Access</th>
              <th class="py-3 pr-4">State</th>
              <th class="py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="user in users" :key="user.id">
              <tr class="border-b border-border align-top">
                <td class="py-3 pr-4">
                  <div class="font-medium">{{ user.display_name }}</div>
                  <div class="text-xs text-muted-foreground">@{{ user.username }}</div>
                  <div class="text-xs text-muted-foreground">{{ user.email || '-' }}</div>
                </td>
                <td class="py-3 pr-4">
                  <select class="input-field min-w-[120px]" :value="user.role" @change="onRoleSelect(user, $event)">
                    <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </td>
                <td class="py-3 pr-4">
                  <select class="input-field min-w-[140px]" :value="user.admin_role || 'none'" @change="onAdminRoleSelect(user, $event)">
                    <option v-for="option in adminRoleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </td>
                <td class="py-3 pr-4 text-xs space-y-1">
                  <div>{{ user.email_verified ? 'Verified' : 'Unverified' }}</div>
                  <div v-if="user.deleted_at" class="text-error">Deleted</div>
                  <div v-else-if="user.suspended_at" class="text-warning">Suspended</div>
                  <div v-else class="text-success">Active</div>
                </td>
                <td class="py-3 space-y-2">
                  <div class="flex flex-wrap gap-2">
                    <button class="btn-secondary text-xs" @click="onVerifiedToggle(user)">
                      {{ user.email_verified ? 'Mark Unverified' : 'Mark Verified' }}
                    </button>
                    <button v-if="!user.suspended_at" class="btn-secondary text-xs" @click="suspendUser(user)">Suspend</button>
                    <button v-else class="btn-secondary text-xs" @click="restoreUser(user)">Restore</button>
                    <button class="btn-secondary text-xs" @click="revokeSessions(user)">Revoke Sessions</button>
                    <button class="btn-secondary text-xs" @click="transferUserId = transferUserId === user.id ? null : user.id">Transfer Assets</button>
                    <button class="btn-destructive text-xs" :disabled="user.id === appStore.currentUser?.id" @click="deleteUserTarget = user">Soft Delete</button>
                  </div>
                </td>
              </tr>
              <tr v-if="transferUserId === user.id" class="border-b border-border bg-background/40">
                <td colspan="5" class="py-3">
                  <div class="flex flex-wrap items-center gap-3">
                    <label class="text-xs text-muted-foreground">Transfer assets to</label>
                    <select class="input-field min-w-[240px]" :value="transferTargetUserId ?? ''" @change="transferTargetUserId = readNullableNumber($event)">
                      <option value="">Select a user</option>
                      <option v-for="option in userSelectOptions.filter(option => option.value !== user.id)" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                    <button class="btn-primary text-xs" :disabled="!transferTargetUserId" @click="confirmTransfer(user)">Confirm Transfer</button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="activeTab === 'albums'">
      <div class="flex gap-3">
        <input v-model="albumSearch" class="input-field flex-1" placeholder="Search albums" @keyup.enter="loadAlbums" />
        <button class="btn-secondary" @click="loadAlbums">Search</button>
      </div>
      <div v-if="albumsLoading"><SkeletonLoader :rows="5" :card="true" /></div>
      <div v-else class="space-y-3">
        <div v-for="album in albums" :key="album.id" class="card !p-0">
          <div class="flex items-center gap-4 p-4">
            <button class="btn-secondary text-xs" @click="toggleAlbumTracks(album.id)">
              {{ expandedAlbumId === album.id ? 'Hide Tracks' : 'Show Tracks' }}
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-mono font-semibold">{{ album.title }}</span>
                <span v-if="album.archived_at" class="text-xs text-warning">Archived</span>
              </div>
              <p class="text-xs text-muted-foreground">
                Producer: {{ album.producer?.display_name || '-' }} | Tracks: {{ album.track_count }}
              </p>
            </div>
            <button class="btn-secondary text-xs" @click="goToAlbumSettings(album.id)">Open Settings</button>
            <button class="btn-secondary text-xs" @click="toggleAlbumArchive(album)">
              {{ album.archived_at ? 'Restore' : 'Archive' }}
            </button>
          </div>
          <div v-if="expandedAlbumId === album.id" class="border-t border-border px-4 py-3">
            <div v-if="albumTracksLoading === album.id"><SkeletonLoader :rows="3" /></div>
            <div v-else-if="!albumTracks[album.id]?.length" class="text-sm text-muted-foreground">No tracks.</div>
            <div v-else class="space-y-2">
              <div
                v-for="track in albumTracks[album.id]"
                :key="track.id"
                class="flex items-center gap-3 border border-border px-3 py-2"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm">{{ track.title }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ track.artist || '-' }}
                    <span v-if="track.archived_at"> | archived</span>
                  </div>
                </div>
                <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" />
                <button class="btn-secondary text-xs" @click="goToTrack(track.id)">Open</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-if="activeTab === 'circles'">
      <div class="flex gap-3">
        <input v-model="circleSearch" class="input-field flex-1" placeholder="Search circles" @keyup.enter="loadCircles" />
        <button class="btn-secondary" @click="loadCircles">Search</button>
      </div>
      <div v-if="circlesLoading"><SkeletonLoader :rows="4" :card="true" /></div>
      <div v-else class="space-y-3">
        <div v-for="circle in circles" :key="circle.id" class="card flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <div class="font-mono font-semibold">{{ circle.name }}</div>
            <div class="text-xs text-muted-foreground">Members: {{ circle.member_count }}</div>
          </div>
          <button class="btn-secondary text-xs" @click="goToCircle(circle.id)">Open Circle</button>
        </div>
      </div>
    </template>

    <template v-if="activeTab === 'activity'">
      <div class="card space-y-4">
        <div class="grid md:grid-cols-5 gap-3">
          <input v-model="activityEventType" class="input-field" placeholder="Event type" />
          <select class="input-field" :value="activityAlbumId ?? ''" @change="activityAlbumId = readNullableNumber($event)">
            <option value="">All albums</option>
            <option v-for="album in albums" :key="album.id" :value="album.id">{{ album.title }}</option>
          </select>
          <select class="input-field" :value="activityActorId ?? ''" @change="activityActorId = readNullableNumber($event)">
            <option value="">All actors</option>
            <option v-for="option in userSelectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <input v-model="activityFrom" type="date" class="input-field" />
          <input v-model="activityTo" type="date" class="input-field" />
        </div>
        <div class="flex gap-3">
          <button class="btn-secondary" @click="loadActivity">Apply Filters</button>
          <button
            class="btn-secondary"
            @click="exportCsv(
              'workflow-activity.csv',
              ['Type', 'Actor', 'Track', 'Album', 'From', 'To', 'Time'],
              activityLog.map(entry => [entry.event_type, entry.actor?.display_name, entry.track_title, entry.album_title, entry.from_status, entry.to_status, fmtTime(entry.created_at)]),
            )"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div v-if="activityLoading"><SkeletonLoader :rows="6" :card="true" /></div>
      <div v-else class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border text-xs text-muted-foreground">
              <th class="py-3 pr-4">Type</th>
              <th class="py-3 pr-4">Actor</th>
              <th class="py-3 pr-4">Track</th>
              <th class="py-3 pr-4">Album</th>
              <th class="py-3 pr-4">From</th>
              <th class="py-3 pr-4">To</th>
              <th class="py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in activityLog" :key="entry.id" class="border-b border-border">
              <td class="py-3 pr-4 font-mono">{{ entry.event_type }}</td>
              <td class="py-3 pr-4">{{ entry.actor?.display_name || 'System' }}</td>
              <td class="py-3 pr-4">{{ entry.track_title || '-' }}</td>
              <td class="py-3 pr-4">{{ entry.album_title || '-' }}</td>
              <td class="py-3 pr-4">{{ entry.from_status || '-' }}</td>
              <td class="py-3 pr-4">{{ entry.to_status || '-' }}</td>
              <td class="py-3">{{ fmtTime(entry.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="activeTab === 'audits'">
      <div class="card space-y-4">
        <div class="grid md:grid-cols-6 gap-3">
          <input v-model="auditAction" class="input-field" placeholder="Action" />
          <input v-model="auditEntityType" class="input-field" placeholder="Entity type" />
          <select class="input-field" :value="auditActorId ?? ''" @change="auditActorId = readNullableNumber($event)">
            <option value="">All actors</option>
            <option v-for="option in userSelectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <select class="input-field" :value="auditTargetUserId ?? ''" @change="auditTargetUserId = readNullableNumber($event)">
            <option value="">All targets</option>
            <option v-for="option in userSelectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <input v-model="auditFrom" type="date" class="input-field" />
          <input v-model="auditTo" type="date" class="input-field" />
        </div>
        <div class="flex gap-3">
          <button class="btn-secondary" @click="loadAudits">Apply Filters</button>
          <button
            class="btn-secondary"
            @click="exportCsv(
              'admin-audits.csv',
              ['Action', 'Entity', 'Summary', 'Actor', 'Target', 'Reason', 'Time'],
              auditLog.map(entry => [entry.action, entry.entity_type, entry.summary, entry.actor?.display_name, entry.target_user?.display_name, entry.reason, fmtTime(entry.created_at)]),
            )"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div v-if="auditLoading"><SkeletonLoader :rows="6" :card="true" /></div>
      <div v-else class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border text-xs text-muted-foreground">
              <th class="py-3 pr-4">Action</th>
              <th class="py-3 pr-4">Entity</th>
              <th class="py-3 pr-4">Summary</th>
              <th class="py-3 pr-4">Actor</th>
              <th class="py-3 pr-4">Target</th>
              <th class="py-3 pr-4">Reason</th>
              <th class="py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in auditLog" :key="entry.id" class="border-b border-border">
              <td class="py-3 pr-4 font-mono">{{ entry.action }}</td>
              <td class="py-3 pr-4">{{ entry.entity_type }} #{{ entry.entity_id ?? '-' }}</td>
              <td class="py-3 pr-4">{{ entry.summary || '-' }}</td>
              <td class="py-3 pr-4">{{ entry.actor?.display_name || 'System' }}</td>
              <td class="py-3 pr-4">{{ entry.target_user?.display_name || '-' }}</td>
              <td class="py-3 pr-4">{{ entry.reason || '-' }}</td>
              <td class="py-3">{{ fmtTime(entry.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="activeTab === 'workflow'">
      <div class="grid lg:grid-cols-[320px_1fr] gap-6">
        <div class="card space-y-4">
          <div class="space-y-2">
            <label class="text-xs text-muted-foreground">Album</label>
            <select class="input-field w-full" :value="workflowAlbumId ?? ''" @change="workflowAlbumId = readNullableNumber($event)">
              <option value="">Select an album</option>
              <option v-for="album in albums" :key="album.id" :value="album.id">{{ album.title }}</option>
            </select>
          </div>
          <div v-if="workflowTracksLoading"><SkeletonLoader :rows="5" /></div>
          <div v-else class="space-y-2 max-h-[500px] overflow-y-auto">
            <button
              v-for="track in workflowTracks"
              :key="track.id"
              class="w-full border px-3 py-2 text-left"
              :class="workflowTrack?.id === track.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-background/40'"
              @click="workflowTrack = track"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm">{{ track.title }}</span>
                <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" />
              </div>
              <p class="text-xs text-muted-foreground mt-1">
                {{ track.artist || '-' }}
                <span v-if="track.archived_at"> | archived</span>
              </p>
            </button>
          </div>
        </div>

        <div class="space-y-6">
          <div v-if="workflowTrack" class="card space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-mono font-semibold">{{ workflowTrack.title }}</h2>
                <p class="text-sm text-muted-foreground">Current status: {{ workflowTrack.status }}</p>
              </div>
              <button class="btn-secondary text-xs" @click="goToTrack(workflowTrack.id)">Open Track</button>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="action in workflowActions"
                :key="action"
                class="px-3 py-1.5 text-xs rounded-full border transition-colors"
                :class="workflowAction === action ? 'bg-primary text-black border-primary' : 'border-border'"
                @click="workflowAction = action"
              >
                {{ action }}
              </button>
            </div>

            <div v-if="workflowAction === 'force'" class="space-y-3">
              <label class="text-xs text-muted-foreground">New status</label>
              <select class="input-field w-full" :value="workflowNewStatus" @change="workflowNewStatus = readSelectValue($event)">
                <option value="">Select a status</option>
                <option v-for="option in workflowStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>

            <div v-if="workflowAction === 'reassign'" class="space-y-2">
              <label class="text-xs text-muted-foreground">Assign to album members</label>
              <label
                v-for="member in workflowAlbumMembers"
                :key="member.id"
                class="flex items-center gap-2 text-sm"
              >
                <input v-model="workflowTargetUserIds" type="checkbox" :value="member.id" class="accent-primary" />
                <span>{{ member.display_name }}</span>
              </label>
            </div>

            <div v-if="workflowAction === 'reopen'" class="space-y-3">
              <label class="text-xs text-muted-foreground">Target stage</label>
              <select class="input-field w-full" :value="workflowReopenStageId" @change="workflowReopenStageId = readSelectValue($event)">
                <option value="">Select a stage</option>
                <option v-for="option in workflowReopenOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-xs text-muted-foreground">Reason</label>
              <textarea v-model="workflowReason" class="textarea-field w-full" rows="3" placeholder="Record why this action is needed." />
            </div>

            <button
              class="btn-primary"
              :disabled="workflowSubmitting || (workflowAction === 'force' && !workflowNewStatus) || (workflowAction === 'reassign' && workflowTargetUserIds.length === 0) || (workflowAction === 'reopen' && !workflowReopenStageId)"
              @click="runWorkflowAction"
            >
              {{ workflowSubmitting ? 'Working...' : 'Run Action' }}
            </button>
          </div>

          <div class="card space-y-4">
            <div class="flex items-center justify-between gap-4">
              <h2 class="text-sm font-mono font-semibold">Pending Reopen Requests</h2>
              <input v-model="reopenDecisionReason" class="input-field max-w-xs" placeholder="Decision reason" />
            </div>
            <div v-if="reopenRequestsLoading"><SkeletonLoader :rows="4" /></div>
            <div v-else-if="reopenRequests.length === 0" class="text-sm text-muted-foreground">No pending reopen requests for this album.</div>
            <div v-else class="space-y-3">
              <div v-for="entry in reopenRequests" :key="entry.id" class="border border-border p-3 space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium">{{ entry.track_title || `Track #${entry.track_id}` }}</div>
                    <div class="text-xs text-muted-foreground">
                      Requested by {{ entry.requested_by?.display_name || entry.requested_by_id }} | {{ fmtTime(entry.created_at) }}
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button class="btn-secondary text-xs" @click="decideReopenRequest(entry, 'approve')">Approve</button>
                    <button class="btn-destructive text-xs" @click="decideReopenRequest(entry, 'reject')">Reject</button>
                  </div>
                </div>
                <p class="text-sm">{{ entry.reason }}</p>
                <p class="text-xs text-muted-foreground">Target stage: {{ entry.target_stage_id }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConfirmModal
      v-if="deleteUserTarget"
      title="Soft delete this user?"
      :message="`This will deactivate ${deleteUserTarget.display_name} without hard deleting their records.`"
      confirm-text="Soft Delete"
      :destructive="true"
      @confirm="confirmDeleteUser"
      @cancel="deleteUserTarget = null"
    />
  </div>
</template>
