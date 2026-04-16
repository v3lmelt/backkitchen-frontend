<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import { albumApi, trackApi, checklistApi, invitationApi, userApi, circleApi, API_ORIGIN } from '@/api'
import albumPlaceholder from '@/assets/album-placeholder.svg'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/composables/useToast'
import type { Album, ChecklistTemplateItem, Invitation, Track, User, WebhookDelivery, WorkflowConfig, WorkflowEvent } from '@/types'
import { Archive, RotateCcw, Upload } from 'lucide-vue-next'
import { formatRelativeTime } from '@/utils/time'
import { formatWorkflowEvent, workflowEventDotColor } from '@/utils/workflow'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WorkflowEditor from '@/components/workflow/WorkflowEditor.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { success: toastSuccess, error: toastError } = useToast()

const albumId = computed(() => Number(route.params.albumId))
const album = ref<Album | null>(null)
const users = ref<User[]>([])
const userOptions = computed<SelectOption[]>(() =>
  users.value.map((u) => ({ value: u.id, label: u.display_name }))
)
const loading = ref(true)
const activeTab = ref('info')

// Cover image state
const coverInputRef = ref<HTMLInputElement | null>(null)
const coverImageFile = ref<File | null>(null)
const coverPreviewUrl = ref<string | null>(null)
const uploadingCover = ref(false)

// Metadata edit state
const metadataState = reactive<{
  title: string
  description: string
  release_date: string
  catalog_number: string
  circle_name: string
  genres: string[]
  genre_input: string
}>({
  title: '',
  description: '',
  release_date: '',
  catalog_number: '',
  circle_name: '',
  genres: [],
  genre_input: '',
})
const savingMetadata = ref(false)
const metadataError = ref('')

// Team state
const teamState = reactive<{ mastering_engineer_id: number | null; member_ids: number[] }>({
  mastering_engineer_id: null,
  member_ids: [],
})
const savingTeam = ref(false)
const invitations = ref<Invitation[]>([])
const inviteUserId = ref('')
const inviteError = ref('')
const inviteSuccess = ref('')
const invitingUser = ref(false)
const addMemberUserId = ref<number | null>(null)

// Leave album state
const showLeaveConfirm = ref(false)
const leavingAlbum = ref(false)

// Deadline state
const deadlineState = reactive({ deadline: '', peer_review: '', mastering: '', final_review: '' })
const deadlineEnabled = reactive({ peer_review: false, mastering: false, final_review: false })
const savingDeadlines = ref(false)

// Activity state
const activityEvents = ref<WorkflowEvent[]>([])
const loadingActivity = ref(false)
const activityError = ref('')
const activityOffset = ref(0)
const activityHasMore = ref(true)
const ACTIVITY_PAGE_SIZE = 30

// Checklist state
const templateItems = ref<ChecklistTemplateItem[]>([])
const templateIsDefault = ref(false)
const loadingTemplate = ref(false)
const savingTemplate = ref(false)
const templateLoadError = ref('')
const templateError = ref('')
const savedTemplateSnapshot = ref('')
const templateDirty = computed(() => JSON.stringify(templateItems.value) !== savedTemplateSnapshot.value)

// Track order state
const tracks = ref<Track[]>([])
const savingOrder = ref(false)
const orderMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// Archived tracks state
const archivedTracks = ref<Track[]>([])
const loadingArchivedTracks = ref(false)
const archiveLoadError = ref('')
const restoringTrackId = ref<number | null>(null)

// Webhook state
const webhookState = reactive({ url: '', enabled: false, events: [] as string[], type: 'generic', secret: '', app_id: '', app_secret: '', filter_user_ids: [] as number[] })
const WEBHOOK_TYPES = [
  { value: 'generic', label: 'Generic' },
  { value: 'feishu', label: '飞书 / Feishu' },
]
const savingWebhook = ref(false)
const loadingWebhookConfig = ref(false)
const webhookConfigError = ref('')
const testingWebhook = ref(false)
const webhookTestResult = ref<boolean | null>(null)
const webhookDeliveries = ref<WebhookDelivery[]>([])
const loadingDeliveries = ref(false)
const webhookDeliveriesError = ref('')

const WEBHOOK_EVENT_TYPES = [
  'track_submitted', 'track_status_changed', 'reviewer_assigned', 'reviewer_reassigned',
  'new_issue', 'issue_status_changed', 'new_comment', 'new_discussion',
]

// Workflow state
const savingWorkflow = ref(false)
const workflowMigrations = ref<Array<{ track_id: number; track_title: string; from_step: string; to_step: string }>>([])

async function saveWorkflow(config: WorkflowConfig) {
  if (!album.value) return
  savingWorkflow.value = true
  workflowMigrations.value = []
  try {
    const result = await albumApi.updateWorkflow(album.value.id, config)
    if (result.migrations?.length) {
      workflowMigrations.value = result.migrations
    }
    // Refresh album data
    const fresh = await albumApi.get(album.value.id)
    album.value = fresh
    toastSuccess(t('workflowEditor.saved'))
  } catch (e: any) {
    toastError(e.message || 'Failed to save workflow')
  } finally {
    savingWorkflow.value = false
  }
}

const isProducerOfAlbum = computed(() => album.value?.producer_id === appStore.currentUser?.id)
const isMasteringEngineerOfAlbum = computed(() => album.value?.mastering_engineer_id === appStore.currentUser?.id)
const isMemberOfAlbum = computed(() => album.value?.members.some(m => m.user_id === appStore.currentUser?.id) ?? false)

const userRoleInAlbum = computed(() => {
  if (isProducerOfAlbum.value) return t('roles.producer')
  if (isMasteringEngineerOfAlbum.value) return t('roles.masteringEngineer')
  return t('roles.member')
})

const roleBadgeClass = computed(() => {
  if (isProducerOfAlbum.value) return 'bg-warning-bg text-warning'
  if (isMasteringEngineerOfAlbum.value) return 'bg-info-bg text-info'
  return 'bg-border text-foreground'
})

const availableTabs = computed(() => {
  const tabs = [
    { key: 'info', label: t('albumSettings.tabs.info') },
    { key: 'team', label: t('albumSettings.tabs.team') },
    { key: 'deadlines', label: t('albumSettings.tabs.deadlines') },
  ]
  tabs.push({ key: 'activity', label: t('albumSettings.tabs.activity') })
  if (isProducerOfAlbum.value || isMemberOfAlbum.value) {
    tabs.push({ key: 'checklist', label: t('albumSettings.tabs.checklist') })
  }
  if (isProducerOfAlbum.value) {
    tabs.push({ key: 'workflow', label: t('albumSettings.tabs.workflow') })
    tabs.push({ key: 'order', label: t('albumSettings.tabs.order') })
    tabs.push({ key: 'archive', label: t('albumSettings.tabs.archive') })
    tabs.push({ key: 'webhook', label: t('albumSettings.tabs.webhook') })
    tabs.push({ key: 'danger', label: t('albumSettings.tabs.danger') })
  }
  return tabs
})

// Album archive state
const archivingAlbum = ref(false)
const restoringAlbum = ref(false)
const showArchiveConfirm = ref(false)

const archivedRemainingDays = computed(() => {
  if (!album.value?.archived_at) return 0
  const archived = new Date(album.value.archived_at)
  const expiry = new Date(archived.getTime() + 14 * 24 * 60 * 60 * 1000)
  const remaining = Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(0, remaining)
})

async function archiveAlbum() {
  if (!album.value) return
  archivingAlbum.value = true
  try {
    const updated = await albumApi.archive(album.value.id)
    album.value = updated
    showArchiveConfirm.value = false
    toastSuccess(t('albumSettings.danger.archived'))
    router.push('/albums')
  } catch (e: any) {
    toastError(e.message || t('albumSettings.danger.archiveFailed'))
  } finally {
    archivingAlbum.value = false
  }
}

async function restoreAlbum() {
  if (!album.value) return
  restoringAlbum.value = true
  try {
    const updated = await albumApi.restore(album.value.id)
    album.value = updated
    toastSuccess(t('albumSettings.danger.restored'))
  } catch (e: any) {
    toastError(e.message || t('albumSettings.danger.restoreFailed'))
  } finally {
    restoringAlbum.value = false
  }
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return t('albumSettings.deadlines.notSet')
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function syncTeamState() {
  if (!album.value) return
  teamState.mastering_engineer_id = album.value.mastering_engineer_id
  teamState.member_ids = album.value.members.map(m => m.user_id)
}

function syncMetadataState() {
  if (!album.value) return
  metadataState.title = album.value.title
  metadataState.description = album.value.description || ''
  metadataState.release_date = album.value.release_date ? album.value.release_date.slice(0, 10) : ''
  metadataState.catalog_number = album.value.catalog_number || ''
  metadataState.circle_name = album.value.circle_name || ''
  metadataState.genres = album.value.genres ? [...album.value.genres] : []
  metadataState.genre_input = ''
}

function syncDeadlineState() {
  if (!album.value) return
  deadlineState.deadline = toDateInput(album.value.deadline)
  deadlineState.peer_review = toDateInput(album.value.phase_deadlines?.peer_review)
  deadlineState.mastering = toDateInput(album.value.phase_deadlines?.mastering)
  deadlineState.final_review = toDateInput(album.value.phase_deadlines?.final_review)
  deadlineEnabled.peer_review = !!album.value.phase_deadlines?.peer_review
  deadlineEnabled.mastering = !!album.value.phase_deadlines?.mastering
  deadlineEnabled.final_review = !!album.value.phase_deadlines?.final_review
}

function resetWebhookState() {
  webhookState.url = ''
  webhookState.enabled = false
  webhookState.events = []
  webhookState.type = 'generic'
  webhookState.secret = ''
  webhookState.app_id = ''
  webhookState.app_secret = ''
  webhookState.filter_user_ids = []
}

function applyWebhookConfig(config: {
  url: string
  enabled: boolean
  events: string[]
  type?: string
  secret?: string | null
  app_id?: string | null
  app_secret?: string | null
  filter_user_ids?: number[] | null
}) {
  webhookState.url = config.url
  webhookState.enabled = config.enabled
  webhookState.events = [...config.events]
  webhookState.type = config.type || 'generic'
  webhookState.secret = config.secret || ''
  webhookState.app_id = config.app_id || ''
  webhookState.app_secret = config.app_secret || ''
  webhookState.filter_user_ids = config.filter_user_ids || []
}

async function loadAssignableUsers(currentAlbum: Album) {
  try {
    users.value = currentAlbum.circle_id
      ? (await circleApi.get(currentAlbum.circle_id)).members.map(m => m.user)
      : await userApi.list()
  } catch (e: any) {
    users.value = []
    toastError(e.message || t('common.loadFailed'))
  }
}

async function loadInvitations(currentAlbumId: number) {
  try {
    invitations.value = await invitationApi.listForAlbum(currentAlbumId)
  } catch (e: any) {
    invitations.value = []
    toastError(e.message || t('common.loadFailed'))
  }
}

async function loadTrackList(currentAlbumId: number) {
  try {
    tracks.value = await albumApi.tracks(currentAlbumId)
  } catch (e: any) {
    tracks.value = []
    toastError(e.message || t('common.loadFailed'))
  }
}

async function loadChecklistTemplate(currentAlbumId: number) {
  loadingTemplate.value = true
  templateLoadError.value = ''
  try {
    const tpl = await checklistApi.getTemplate(currentAlbumId)
    templateItems.value = tpl.items.map(item => ({ ...item }))
    templateIsDefault.value = tpl.is_default
    savedTemplateSnapshot.value = JSON.stringify(templateItems.value)
  } catch (e: any) {
    templateLoadError.value = e.message || t('common.loadFailed')
    if (templateItems.value.length === 0) {
      templateItems.value = []
      templateIsDefault.value = false
      savedTemplateSnapshot.value = JSON.stringify([])
    }
  } finally {
    loadingTemplate.value = false
  }
}

async function loadArchivedTracks(currentAlbumId: number) {
  loadingArchivedTracks.value = true
  archiveLoadError.value = ''
  try {
    archivedTracks.value = await albumApi.archivedTracks(currentAlbumId)
  } catch (e: any) {
    archiveLoadError.value = e.message || t('common.loadFailed')
    if (archivedTracks.value.length === 0) {
      archivedTracks.value = []
    }
  } finally {
    loadingArchivedTracks.value = false
  }
}

async function loadWebhookConfig(currentAlbumId: number) {
  loadingWebhookConfig.value = true
  webhookConfigError.value = ''
  try {
    applyWebhookConfig(await albumApi.getWebhook(currentAlbumId))
  } catch (e: any) {
    if (!webhookState.url && webhookState.events.length === 0 && !webhookState.enabled) {
      resetWebhookState()
    }
    webhookConfigError.value = e.message || t('common.loadFailed')
  } finally {
    loadingWebhookConfig.value = false
  }
}

async function loadWebhookDeliveries(currentAlbumId: number) {
  loadingDeliveries.value = true
  webhookDeliveriesError.value = ''
  try {
    webhookDeliveries.value = await albumApi.getWebhookDeliveries(currentAlbumId)
  } catch (e: any) {
    webhookDeliveriesError.value = e.message || t('common.loadFailed')
    if (webhookDeliveries.value.length === 0) {
      webhookDeliveries.value = []
    }
  } finally {
    loadingDeliveries.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const albumData = await albumApi.get(albumId.value)
    album.value = albumData

    const userId = appStore.currentUser?.id
    if (!userId) { router.replace('/albums'); return }

    const authorized =
      albumData.producer_id === userId ||
      albumData.mastering_engineer_id === userId ||
      albumData.members.some(m => m.user_id === userId)
    if (!authorized) { router.replace('/albums'); return }

    syncTeamState()
    syncDeadlineState()
    syncMetadataState()
    activeTab.value = 'info'

    const loadTasks: Promise<any>[] = []

    if (albumData.producer_id === userId) {
      loadTasks.push(
        loadAssignableUsers(albumData),
        loadInvitations(albumData.id),
        loadChecklistTemplate(albumData.id),
        loadTrackList(albumData.id),
        loadArchivedTracks(albumData.id),
        loadWebhookConfig(albumData.id),
        loadWebhookDeliveries(albumData.id),
      )
    } else if (albumData.members.some(m => m.user_id === userId)) {
      loadTasks.push(
        loadChecklistTemplate(albumData.id),
      )
    }

    await Promise.all(loadTasks)
  } catch (e: any) {
    toastError(e.message || t('common.loadFailed'))
    router.replace('/albums')
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
})

watch(activeTab, (tab) => {
  if (tab === 'activity' && activityEvents.value.length === 0 && !loadingActivity.value) {
    activityOffset.value = 0
    loadActivity()
  }
})

// Cover image actions
function handleCoverSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  coverImageFile.value = file
  if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
  coverPreviewUrl.value = URL.createObjectURL(file)
}

async function saveCover() {
  if (!album.value || !coverImageFile.value) return
  uploadingCover.value = true
  try {
    const updated = await albumApi.uploadCover(album.value.id, coverImageFile.value)
    album.value = updated
    if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
    coverPreviewUrl.value = null
    coverImageFile.value = null
    toastSuccess(t('albumSettings.info.coverSaved'))
  } catch (e: any) {
    toastError(e.message || t('common.uploadFailed'))
  } finally {
    uploadingCover.value = false
  }
}

// Metadata actions
function addGenre() {
  const tag = metadataState.genre_input.trim()
  if (tag && !metadataState.genres.includes(tag)) {
    metadataState.genres.push(tag)
  }
  metadataState.genre_input = ''
}

function removeGenre(genre: string) {
  metadataState.genres = metadataState.genres.filter(g => g !== genre)
}

async function saveMetadata() {
  if (!album.value) return
  metadataError.value = ''
  if (!metadataState.title.trim()) {
    metadataError.value = t('albumNew.titleRequired')
    return
  }
  savingMetadata.value = true
  try {
    const updated = await albumApi.updateMetadata(album.value.id, {
      title: metadataState.title.trim(),
      description: metadataState.description.trim() || null,
      release_date: metadataState.release_date || null,
      catalog_number: metadataState.catalog_number.trim() || null,
      circle_name: metadataState.circle_name.trim() || null,
      genres: metadataState.genres.length ? [...metadataState.genres] : null,
    })
    album.value = updated
    syncMetadataState()
    toastSuccess(t('settings.metadataSaved'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingMetadata.value = false
  }
}


async function saveTeam() {
  if (!album.value) return
  savingTeam.value = true
  try {
    const updated = await albumApi.updateTeam(album.value.id, teamState)
    album.value = updated
    syncTeamState()
    toastSuccess(t('settings.teamSaved'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingTeam.value = false
  }
}

// Album members (for webhook filter — only show users who belong to this album)
const albumMemberUsers = computed<User[]>(() => {
  if (!album.value) return []
  const memberUsers = album.value.members.map(m => m.user)
  // Include producer if not already in member list
  if (album.value.producer && !memberUsers.some(u => u.id === album.value!.producer_id)) {
    memberUsers.unshift(album.value.producer)
  }
  return memberUsers
})

// Member list actions (inline add/remove)
const availableUserOptions = computed<SelectOption[]>(() =>
  users.value
    .filter(u => !teamState.member_ids.includes(u.id))
    .map(u => ({ value: u.id, label: u.display_name }))
)

async function removeMemberFromAlbum(userId: number) {
  if (!album.value || userId === album.value.producer_id) return
  const next = { ...teamState, member_ids: teamState.member_ids.filter(id => id !== userId) }
  savingTeam.value = true
  try {
    const updated = await albumApi.updateTeam(album.value.id, next)
    album.value = updated
    syncTeamState()
    toastSuccess(t('circleDetail.memberRemoved'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingTeam.value = false
  }
}

async function addMemberToAlbum() {
  if (!album.value || addMemberUserId.value == null) return
  if (teamState.member_ids.includes(addMemberUserId.value)) return
  const next = { ...teamState, member_ids: [...teamState.member_ids, addMemberUserId.value] }
  savingTeam.value = true
  try {
    const updated = await albumApi.updateTeam(album.value.id, next)
    album.value = updated
    syncTeamState()
    addMemberUserId.value = null
    toastSuccess(t('settings.memberAdded'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingTeam.value = false
  }
}

async function inviteMember() {
  if (!album.value) return
  const userId = parseInt(inviteUserId.value || '0')
  if (!userId) return
  invitingUser.value = true
  inviteError.value = ''
  inviteSuccess.value = ''
  try {
    const inv = await invitationApi.create(album.value.id, userId)
    invitations.value.push(inv)
    inviteSuccess.value = t('settings.invitationSent')
    inviteUserId.value = ''
  } catch (err: any) {
    const msg = err.message || ''
    if (msg.includes('already a member')) inviteError.value = t('settings.inviteErrorAlreadyMember')
    else if (msg.includes('already a pending')) inviteError.value = t('settings.inviteErrorAlreadyInvited')
    else inviteError.value = msg
  } finally {
    invitingUser.value = false
  }
}

async function cancelInvitation(invitationId: number) {
  try {
    await invitationApi.cancel(invitationId)
    invitations.value = invitations.value.filter(inv => inv.id !== invitationId)
    toastSuccess(t('settings.invitationCancelled'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  }
}

function getUserDisplayName(userId: number): string {
  const user = users.value.find(u => u.id === userId)
  return user?.display_name || `User #${userId}`
}

async function handleLeaveAlbum() {
  if (!album.value) return
  leavingAlbum.value = true
  try {
    await albumApi.leaveAlbum(album.value.id)
    toastSuccess(t('albumSettings.team.left'))
    router.push('/albums')
  } catch (e: any) {
    toastError(e.message || t('albumSettings.team.leaveFailed'))
  } finally {
    leavingAlbum.value = false
    showLeaveConfirm.value = false
  }
}

// Activity actions
async function loadActivity(options: { append?: boolean; offset?: number } = {}) {
  if (!album.value) return
  const append = options.append ?? false
  const targetOffset = options.offset ?? activityOffset.value
  loadingActivity.value = true
  activityError.value = ''
  try {
    const events = await albumApi.activity(album.value.id, {
      limit: ACTIVITY_PAGE_SIZE,
      offset: targetOffset,
    })
    if (append) {
      activityEvents.value.push(...events)
    } else {
      activityEvents.value = events
    }
    activityOffset.value = targetOffset
    activityHasMore.value = events.length === ACTIVITY_PAGE_SIZE
  } catch (e: any) {
    if (!append) {
      activityEvents.value = []
      activityOffset.value = 0
    }
    activityError.value = e.message || t('common.loadFailed')
  } finally {
    loadingActivity.value = false
  }
}

function loadMoreActivity() {
  loadActivity({ append: true, offset: activityOffset.value + ACTIVITY_PAGE_SIZE })
}

// Deadline actions
async function saveDeadlines() {
  if (!album.value) return
  savingDeadlines.value = true
  try {
    const phaseDeadlines: Record<string, string> = {}
    if (deadlineState.peer_review) phaseDeadlines.peer_review = new Date(deadlineState.peer_review).toISOString()
    if (deadlineState.mastering) phaseDeadlines.mastering = new Date(deadlineState.mastering).toISOString()
    if (deadlineState.final_review) phaseDeadlines.final_review = new Date(deadlineState.final_review).toISOString()
    const updated = await albumApi.updateDeadlines(album.value.id, {
      deadline: deadlineState.deadline ? new Date(deadlineState.deadline).toISOString() : null,
      phase_deadlines: Object.keys(phaseDeadlines).length ? phaseDeadlines : null,
    })
    album.value = updated
    syncDeadlineState()
    toastSuccess(t('settings.deadlinesSaved'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingDeadlines.value = false
  }
}

// Checklist actions
function addTemplateItem() {
  templateItems.value.push({ label: '', description: null, required: true, sort_order: templateItems.value.length })
}

function removeTemplateItem(index: number) {
  templateItems.value.splice(index, 1)
  templateItems.value.forEach((item, i) => { item.sort_order = i })
}

async function saveTemplate() {
  if (!album.value) return
  const hasEmpty = templateItems.value.some(item => !item.label.trim())
  if (hasEmpty) { templateError.value = t('settings.templateItemLabelRequired'); return }
  savingTemplate.value = true
  templateError.value = ''
  templateLoadError.value = ''
  try {
    const result = await checklistApi.updateTemplate(
      album.value.id,
      templateItems.value.map((item, i) => ({ ...item, sort_order: i }))
    )
    templateItems.value = result.items.map(item => ({ ...item }))
    templateIsDefault.value = false
    savedTemplateSnapshot.value = JSON.stringify(templateItems.value)
    toastSuccess(t('settings.templateSaved'))
  } catch (err: any) {
    templateError.value = err.message || t('settings.templateSaveFailed')
  } finally {
    savingTemplate.value = false
  }
}

async function resetTemplate() {
  if (!album.value) return
  savingTemplate.value = true
  templateError.value = ''
  templateLoadError.value = ''
  try {
    await checklistApi.resetTemplate(album.value.id)
    await loadChecklistTemplate(album.value.id)
    toastSuccess(t('settings.templateReset'))
  } catch (err: any) {
    templateError.value = err.message || t('settings.templateSaveFailed')
  } finally {
    savingTemplate.value = false
  }
}

// Track order actions
async function saveTrackOrder() {
  if (!album.value) return
  savingOrder.value = true
  orderMessage.value = null
  try {
    const trackIds = tracks.value.map(tr => tr.id)
    const updated = await albumApi.reorderTracks(album.value.id, trackIds)
    tracks.value = updated
    orderMessage.value = { type: 'success', text: t('settings.orderSaved') }
  } catch {
    orderMessage.value = { type: 'error', text: t('settings.orderSaveFailed') }
  } finally {
    savingOrder.value = false
  }
}

// Archive actions
function archiveRemainingDays(archivedAt: string | null): number {
  if (!archivedAt) return 0
  const archived = new Date(archivedAt)
  const expiry = new Date(archived.getTime() + 14 * 24 * 60 * 60 * 1000)
  const remaining = Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(0, remaining)
}

async function restoreTrack(trackId: number) {
  restoringTrackId.value = trackId
  try {
    const restored = await trackApi.restore(trackId)
    archivedTracks.value = archivedTracks.value.filter(tr => tr.id !== trackId)
    tracks.value.push(restored)
    toastSuccess(t('albumSettings.archive.restored'))
  } catch (e: any) {
    toastError(e.message || t('albumSettings.archive.restoreFailed'))
  } finally {
    restoringTrackId.value = null
  }
}

// Webhook actions
function toggleWebhookEvent(event: string) {
  const idx = webhookState.events.indexOf(event)
  if (idx >= 0) webhookState.events.splice(idx, 1)
  else webhookState.events.push(event)
}

function toggleWebhookFilterUser(userId: number) {
  const idx = webhookState.filter_user_ids.indexOf(userId)
  if (idx >= 0) webhookState.filter_user_ids.splice(idx, 1)
  else webhookState.filter_user_ids.push(userId)
}

async function saveWebhook() {
  if (!album.value) return
  savingWebhook.value = true
  try {
    const result = await albumApi.updateWebhook(album.value.id, webhookState)
    applyWebhookConfig(result)
    webhookConfigError.value = ''
    toastSuccess(t('settings.webhookSaved'))
  } catch (e: any) {
    toastError(e.message || t('common.requestFailed'))
  } finally {
    savingWebhook.value = false
  }
}

async function testWebhook() {
  if (!album.value) return
  testingWebhook.value = true
  webhookTestResult.value = null
  try {
    const result = await albumApi.testWebhook(album.value.id)
    webhookTestResult.value = result.success
  } catch {
    webhookTestResult.value = false
  } finally {
    testingWebhook.value = false
    // Refresh delivery history after test
    void loadWebhookDeliveries(album.value.id)
  }
}

async function refreshDeliveries() {
  if (!album.value) return
  await loadWebhookDeliveries(album.value.id)
}
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>

  <div v-else-if="album" class="max-w-4xl mx-auto space-y-6">
    <!-- Album header -->
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 flex-shrink-0 overflow-hidden border border-border">
        <img :src="album.cover_image ? `${API_ORIGIN}/uploads/${album.cover_image}` : albumPlaceholder" class="w-full h-full object-cover" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-xl font-mono font-bold text-foreground">{{ album.title }}</h1>
          <span class="text-xs font-mono px-2 py-0.5 rounded-full" :class="roleBadgeClass">
            {{ userRoleInAlbum }}
          </span>
          <span v-if="album.archived_at" class="text-xs font-mono px-2 py-0.5 rounded-full bg-error-bg text-error">
            {{ t('albums.archivedBadge') }}
          </span>
        </div>
        <p v-if="album.description" class="text-xs text-muted-foreground mt-0.5 truncate">{{ album.description }}</p>
      </div>
    </div>

    <!-- Archived banner -->
    <div v-if="album.archived_at" class="card border-error/30 bg-error-bg/30">
      <p class="text-xs font-mono text-error">
        {{ t('albumSettings.danger.archivedBanner', { date: formatDate(album.archived_at), days: archivedRemainingDays }) }}
      </p>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-0 border-b border-border overflow-x-auto scrollbar-hide">
      <button
        v-for="tab in availableTabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0"
        :class="activeTab === tab.key
          ? 'text-foreground border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div>

      <!-- Info tab -->
      <div v-if="activeTab === 'info'" class="card space-y-5">
        <div class="flex flex-col sm:flex-row items-start gap-5">
          <!-- Cover image -->
          <div class="flex-shrink-0 space-y-2">
            <div
              class="relative w-32 h-32 overflow-hidden border border-border"
              :class="isProducerOfAlbum ? 'cursor-pointer group' : ''"
              @click="isProducerOfAlbum && coverInputRef?.click()"
            >
              <img
                :src="coverPreviewUrl || (album.cover_image ? `${API_ORIGIN}/uploads/${album.cover_image}` : albumPlaceholder)"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <div
                v-if="isProducerOfAlbum"
                class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Upload class="w-6 h-6 text-white" :stroke-width="2" />
              </div>
            </div>
            <input ref="coverInputRef" type="file" accept="image/*" class="hidden" @change="handleCoverSelect" />
            <button
              v-if="isProducerOfAlbum && coverImageFile"
              @click="saveCover"
              :disabled="uploadingCover"
              class="btn-primary text-xs px-3 py-1.5 w-32"
            >
              {{ uploadingCover ? t('albumSettings.info.uploading') : t('albumSettings.info.saveCover') }}
            </button>
            <p v-else-if="isProducerOfAlbum" class="text-xs text-muted-foreground text-center w-32">
              {{ t('albumSettings.info.coverHint') }}
            </p>
          </div>

          <!-- Album metadata — editable for producer, read-only otherwise -->
          <div class="flex-1 min-w-0 space-y-4">
            <template v-if="isProducerOfAlbum">
              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.albumTitle') }}</label>
                <input
                  v-model="metadataState.title"
                  class="input-field w-full text-sm"
                  :placeholder="t('albumNew.albumTitlePlaceholder')"
                />
              </div>
              <div>
                <label class="block text-xs text-muted-foreground mb-1">{{ t('albumNew.description') }}</label>
                <textarea
                  v-model="metadataState.description"
                  class="textarea-field w-full h-20 text-sm"
                  :placeholder="t('albumNew.descriptionPlaceholder')"
                />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div v-if="!album.circle_id">
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.circleName') }}</label>
                  <input v-model="metadataState.circle_name" class="input-field w-full text-sm" :placeholder="t('settings.circleNamePlaceholder')" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.catalogNumber') }}</label>
                  <input v-model="metadataState.catalog_number" class="input-field w-full text-sm" :placeholder="t('settings.catalogNumberPlaceholder')" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.releaseDate') }}</label>
                  <input v-model="metadataState.release_date" type="date" class="input-field w-full text-sm" />
                </div>
              </div>
              <div>
                <label class="block text-xs text-muted-foreground mb-2">{{ t('settings.genres') }}</label>
                <div class="flex items-center gap-2 mb-2">
                  <input
                    v-model="metadataState.genre_input"
                    class="input-field flex-1 text-sm"
                    :placeholder="t('settings.genrePlaceholder')"
                    @keyup.enter="addGenre"
                  />
                  <button @click="addGenre" class="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
                    {{ t('settings.addGenre') }}
                  </button>
                </div>
                <div v-if="metadataState.genres.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="genre in metadataState.genres"
                    :key="genre"
                    class="inline-flex items-center gap-1 text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono"
                  >
                    {{ genre }}
                    <button @click="removeGenre(genre)" class="hover:opacity-70 ml-0.5">×</button>
                  </span>
                </div>
              </div>
              <p v-if="metadataError" class="text-xs text-error">{{ metadataError }}</p>
              <button
                @click="saveMetadata"
                :disabled="savingMetadata"
                class="btn-primary text-sm"
              >
                {{ savingMetadata ? t('settings.saving') : t('settings.saveMetadata') }}
              </button>
            </template>
            <template v-else>
              <div>
                <div class="text-xs text-muted-foreground mb-1">{{ t('albumNew.albumTitle') }}</div>
                <div class="text-base font-mono font-semibold text-foreground">{{ album.title }}</div>
              </div>
              <div v-if="album.description">
                <div class="text-xs text-muted-foreground mb-1">{{ t('albumNew.description') }}</div>
                <div class="text-sm text-foreground">{{ album.description }}</div>
              </div>
              <div v-if="album.circle_name || album.catalog_number || album.release_date" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-if="album.circle_name">
                  <div class="text-xs text-muted-foreground mb-1">{{ t('settings.circleName') }}</div>
                  <div class="text-sm text-foreground">{{ album.circle_name }}</div>
                </div>
                <div v-if="album.catalog_number">
                  <div class="text-xs text-muted-foreground mb-1">{{ t('settings.catalogNumber') }}</div>
                  <div class="text-sm text-foreground font-mono">{{ album.catalog_number }}</div>
                </div>
                <div v-if="album.release_date">
                  <div class="text-xs text-muted-foreground mb-1">{{ t('settings.releaseDate') }}</div>
                  <div class="text-sm text-foreground font-mono">{{ album.release_date.slice(0, 10) }}</div>
                </div>
              </div>
              <div v-if="album.genres?.length">
                <div class="text-xs text-muted-foreground mb-1">{{ t('settings.genres') }}</div>
                <div class="flex flex-wrap gap-1">
                  <span v-for="genre in album.genres" :key="genre" class="text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono">
                    {{ genre }}
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Team tab -->
      <div v-if="activeTab === 'team'" class="space-y-4">
        <template v-if="isProducerOfAlbum">
          <!-- Mastering engineer selector -->
          <div class="card space-y-3">
            <label class="block text-xs text-muted-foreground">{{ t('settings.masteringEngineerSelect') }}</label>
            <div class="flex items-center gap-2">
              <CustomSelect
                v-model="teamState.mastering_engineer_id"
                :options="userOptions"
                :placeholder="t('settings.noneOption')"
                class="flex-1"
              />
              <button @click="saveTeam" :disabled="savingTeam" class="btn-primary text-xs px-3 py-1.5 shrink-0">
                {{ savingTeam ? t('settings.saving') : t('common.save') }}
              </button>
            </div>
          </div>

          <!-- Members list (aligned with CircleDetailView style) -->
          <div class="card space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('albumSettings.team.members') }}</h3>
              <span class="text-xs text-muted-foreground">{{ teamState.member_ids.length }}</span>
            </div>
            <div v-if="teamState.member_ids.length === 0" class="text-sm text-muted-foreground">
              {{ t('albumSettings.team.noMembers') }}
            </div>
            <div v-else class="space-y-1">
              <div
                v-for="userId in teamState.member_ids"
                :key="userId"
                class="flex items-center gap-3 px-3 py-2 border border-border bg-background"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-mono text-foreground truncate">
                    {{ getUserDisplayName(userId) }}
                    <span v-if="userId === album.producer_id" class="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-warning-bg text-warning">
                      {{ t('albumSettings.team.producer') }}
                    </span>
                    <span v-else-if="userId === album.mastering_engineer_id" class="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-info-bg text-info">
                      {{ t('albumSettings.team.masteringEngineer') }}
                    </span>
                  </p>
                </div>
                <button
                  v-if="userId !== album.producer_id"
                  @click="removeMemberFromAlbum(userId)"
                  class="text-error text-xs hover:underline shrink-0"
                >
                  {{ t('circleDetail.remove') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Add member -->
          <div class="card space-y-3">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('albumSettings.team.addMember') }}</h3>
            <div v-if="availableUserOptions.length === 0" class="text-xs text-muted-foreground">
              {{ t('albumSettings.team.allAdded') }}
            </div>
            <div v-else class="flex items-center gap-2">
              <CustomSelect
                v-model="addMemberUserId"
                :options="availableUserOptions"
                :placeholder="t('albumSettings.team.selectUserPlaceholder')"
                class="flex-1"
              />
              <button
                @click="addMemberToAlbum"
                :disabled="!addMemberUserId || savingTeam"
                class="btn-secondary text-xs px-3 py-1.5 shrink-0"
              >
                {{ t('common.confirm') }}
              </button>
            </div>
          </div>

          <div class="card space-y-3">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('settings.inviteByUserId') }}</h3>
            <div class="flex items-center gap-2">
              <input
                v-model="inviteUserId"
                type="number"
                class="input-field w-32 text-sm"
                :placeholder="t('settings.userIdPlaceholder')"
                @keyup.enter="inviteMember"
              />
              <button
                @click="inviteMember"
                :disabled="invitingUser || !inviteUserId"
                class="btn-secondary text-xs px-3 py-1.5"
              >
                {{ invitingUser ? t('settings.inviting') : t('settings.invite') }}
              </button>
            </div>
            <p v-if="inviteError" class="text-xs text-error">{{ inviteError }}</p>
            <p v-if="inviteSuccess" class="text-xs text-success">{{ inviteSuccess }}</p>
          </div>

          <div v-if="invitations.length > 0" class="card space-y-3">
            <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('settings.pendingInvitations') }}</h3>
            <div class="space-y-2">
              <div
                v-for="inv in invitations"
                :key="inv.id"
                class="flex items-center justify-between p-3 bg-background border border-border"
              >
                <div class="text-sm text-foreground">
                  {{ getUserDisplayName(inv.user_id) }}
                  <span class="text-xs text-muted-foreground ml-1">(#{{ inv.user_id }})</span>
                </div>
                <button @click="cancelInvitation(inv.id)" class="text-xs text-error hover:underline">
                  {{ t('settings.cancelInvitation') }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="card space-y-5">
            <p class="text-xs text-muted-foreground">{{ t('albumSettings.team.readOnlyNotice') }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div class="text-xs text-muted-foreground mb-1">{{ t('albumSettings.team.producer') }}</div>
                <div class="text-sm text-foreground">{{ album.producer?.display_name || t('albumSettings.team.unassigned') }}</div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">{{ t('albumSettings.team.masteringEngineer') }}</div>
                <div class="text-sm text-foreground">{{ album.mastering_engineer?.display_name || t('albumSettings.team.unassigned') }}</div>
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-2">{{ t('albumSettings.team.members') }}</div>
              <div v-if="album.members.length === 0" class="text-sm text-muted-foreground">{{ t('albumSettings.team.noMembers') }}</div>
              <div v-else class="flex flex-wrap gap-2">
                <span
                  v-for="member in album.members"
                  :key="member.id"
                  class="text-xs font-mono px-2 py-0.5 rounded-full bg-border text-foreground"
                >
                  {{ member.user.display_name }}
                </span>
              </div>
            </div>
            <!-- Leave album -->
            <div class="border-t border-border pt-4">
              <div v-if="!showLeaveConfirm">
                <button class="btn-secondary text-sm font-mono" @click="showLeaveConfirm = true">
                  {{ t('albumSettings.team.leaveAlbum') }}
                </button>
                <p class="text-xs text-muted-foreground mt-1">{{ t('albumSettings.team.leaveAlbumDesc') }}</p>
              </div>
              <div v-else class="space-y-2">
                <p class="text-sm text-foreground">{{ t('albumSettings.team.leaveConfirm', { title: album.title }) }}</p>
                <div class="flex gap-2">
                  <button class="btn-primary text-sm font-mono" :disabled="leavingAlbum" @click="handleLeaveAlbum">
                    {{ leavingAlbum ? '...' : t('albumSettings.team.leaveAlbum') }}
                  </button>
                  <button class="btn-secondary text-sm font-mono" @click="showLeaveConfirm = false">
                    {{ t('common.cancel') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Activity tab -->
      <div v-else-if="activeTab === 'activity'">
        <div class="card space-y-4">
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('albumSettings.activity.title') }}</h3>
          <div v-if="activityError" class="border border-error/30 bg-error-bg/30 p-3 flex items-center justify-between gap-3">
            <p class="text-sm text-error">{{ activityError }}</p>
            <button @click="loadActivity({ offset: 0 })" class="btn-secondary text-xs flex-shrink-0">
              {{ t('common.retry') }}
            </button>
          </div>
          <div v-if="loadingActivity && activityEvents.length === 0" class="text-sm text-muted-foreground py-4 text-center">...</div>
          <div v-else-if="!activityError && activityEvents.length === 0" class="text-sm text-muted-foreground py-4 text-center">
            {{ t('albumSettings.activity.empty') }}
          </div>
          <div v-else class="space-y-0">
            <div
              v-for="event in activityEvents"
              :key="event.id"
              class="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0"
            >
              <div class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" :class="workflowEventDotColor(event.event_type)"></div>
              <div class="flex-1 min-w-0">
                <span class="text-sm text-foreground">{{ formatWorkflowEvent(event, t) }}</span>
              </div>
              <span class="text-xs text-muted-foreground flex-shrink-0">{{ formatRelativeTime(event.created_at, locale) }}</span>
            </div>
          </div>
          <button
            v-if="activityHasMore && activityEvents.length > 0"
            class="btn-secondary text-sm font-mono w-full"
            :disabled="loadingActivity"
            @click="loadMoreActivity"
          >
            {{ loadingActivity ? '...' : t('albumSettings.activity.loadMore') }}
          </button>
        </div>
      </div>

      <!-- Deadlines tab -->
      <div v-else-if="activeTab === 'deadlines'">
        <div v-if="isProducerOfAlbum" class="card space-y-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumDeadline') }}</label>
              <input v-model="deadlineState.deadline" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
                <input type="checkbox" class="checkbox" v-model="deadlineEnabled.peer_review"
                  @change="!deadlineEnabled.peer_review && (deadlineState.peer_review = '')" />
                {{ t('settings.peerReviewDeadline') }}
              </label>
              <input v-if="deadlineEnabled.peer_review" v-model="deadlineState.peer_review" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
                <input type="checkbox" class="checkbox" v-model="deadlineEnabled.mastering"
                  @change="!deadlineEnabled.mastering && (deadlineState.mastering = '')" />
                {{ t('settings.masteringDeadline') }}
              </label>
              <input v-if="deadlineEnabled.mastering" v-model="deadlineState.mastering" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="flex items-center gap-2 text-xs text-muted-foreground mb-1 cursor-pointer">
                <input type="checkbox" class="checkbox" v-model="deadlineEnabled.final_review"
                  @change="!deadlineEnabled.final_review && (deadlineState.final_review = '')" />
                {{ t('settings.finalReviewDeadline') }}
              </label>
              <input v-if="deadlineEnabled.final_review" v-model="deadlineState.final_review" type="date" class="input-field w-full" />
            </div>
          </div>
          <button @click="saveDeadlines" :disabled="savingDeadlines" class="btn-primary text-sm">
            {{ savingDeadlines ? t('settings.saving') : t('settings.saveDeadlines') }}
          </button>
        </div>

        <div v-else class="card space-y-5">
          <p class="text-xs text-muted-foreground">{{ t('albumSettings.deadlines.readOnlyNotice') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div class="text-xs text-muted-foreground mb-1">{{ t('settings.albumDeadline') }}</div>
              <div class="text-sm text-foreground font-mono">{{ formatDate(album.deadline) }}</div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">{{ t('settings.peerReviewDeadline') }}</div>
              <div class="text-sm text-foreground font-mono">{{ formatDate(album.phase_deadlines?.peer_review) }}</div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">{{ t('settings.masteringDeadline') }}</div>
              <div class="text-sm text-foreground font-mono">{{ formatDate(album.phase_deadlines?.mastering) }}</div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">{{ t('settings.finalReviewDeadline') }}</div>
              <div class="text-sm text-foreground font-mono">{{ formatDate(album.phase_deadlines?.final_review) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Checklist tab -->
      <div v-else-if="activeTab === 'checklist'">
        <div v-if="loadingTemplate" class="card">
          <p class="text-sm text-muted-foreground py-4 text-center">{{ t('common.loading') }}</p>
        </div>

        <div v-else-if="templateLoadError" class="card space-y-3">
          <p class="text-sm text-error">{{ templateLoadError }}</p>
          <div>
            <button @click="album && loadChecklistTemplate(album.id)" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
          </div>
        </div>

        <div v-else-if="isProducerOfAlbum" class="card space-y-4">
          <div v-if="templateIsDefault" class="text-xs text-muted-foreground">{{ t('settings.usingDefaultTemplate') }}</div>
          <div class="space-y-3">
            <div
              v-for="(item, index) in templateItems"
              :key="index"
              class="flex flex-col sm:flex-row sm:items-start gap-3 p-3 border border-border bg-background"
            >
              <div class="flex-1 space-y-2">
                <input v-model="item.label" class="input-field w-full text-sm" :placeholder="t('settings.itemLabel')" />
                <input v-model="item.description" class="input-field w-full text-xs" :placeholder="t('settings.itemDescription')" />
              </div>
              <div class="flex items-center gap-2 sm:pt-1.5">
                <label class="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" class="checkbox" v-model="item.required" />
                  <span>{{ item.required ? t('settings.required') : t('settings.optional') }}</span>
                </label>
                <button
                  @click="removeTemplateItem(index)"
                  class="text-xs text-error hover:underline ml-2"
                  :disabled="templateItems.length <= 1"
                >
                  {{ t('settings.removeItem') }}
                </button>
              </div>
            </div>
          </div>
          <p v-if="templateError" class="text-xs text-error">{{ templateError }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <button @click="addTemplateItem" class="btn-secondary text-xs px-3 py-1.5">{{ t('settings.addItem') }}</button>
            <button @click="saveTemplate" :disabled="savingTemplate" class="btn-primary text-xs px-3 py-1.5">
              {{ savingTemplate ? t('settings.saving') : t('settings.saveTemplate') }}
            </button>
            <span v-if="templateDirty" class="text-xs text-warning font-mono">{{ t('settings.unsavedChanges') }}</span>
            <button
              @click="resetTemplate"
              :disabled="savingTemplate || templateIsDefault"
              class="btn-secondary text-xs px-3 py-1.5"
              :class="{ 'opacity-40 cursor-not-allowed': templateIsDefault }"
            >
              {{ t('settings.resetToDefault') }}
            </button>
          </div>
        </div>

        <div v-else class="card space-y-4">
          <p class="text-xs text-muted-foreground">{{ t('albumSettings.checklist.readOnlyNotice') }}</p>
          <div v-if="templateIsDefault" class="text-xs text-muted-foreground">{{ t('settings.usingDefaultTemplate') }}</div>
          <div v-if="templateItems.length === 0" class="text-sm text-muted-foreground py-4 text-center">
            {{ t('albumSettings.checklist.noItems') }}
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(item, index) in templateItems"
              :key="index"
              class="flex items-start gap-3 p-3 border border-border bg-background"
            >
              <span class="text-xs text-muted-foreground font-mono w-5 flex-shrink-0 mt-0.5">{{ index + 1 }}.</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-foreground font-medium">{{ item.label }}</div>
                <div v-if="item.description" class="text-xs text-muted-foreground mt-0.5">{{ item.description }}</div>
              </div>
              <span
                class="flex-shrink-0 text-xs font-mono px-2 py-0.5 rounded-full"
                :class="item.required ? 'bg-warning-bg text-warning' : 'bg-border text-muted-foreground'"
              >
                {{ item.required ? t('settings.required') : t('settings.optional') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Track order tab (producer only) -->
      <div v-else-if="activeTab === 'order'" class="card space-y-4">
        <p class="text-xs text-muted-foreground">{{ t('settings.dragToReorder') }}</p>
        <draggable
          v-if="tracks.length > 0"
          v-model="tracks"
          item-key="id"
          handle=".drag-handle"
          ghost-class="opacity-30"
          class="space-y-1"
        >
          <template #item="{ element, index }">
            <div class="flex items-center gap-3 px-3 py-2 border border-border bg-background hover:bg-white/5 transition-colors cursor-move drag-handle">
              <span class="text-xs text-muted-foreground font-mono w-6 text-right flex-shrink-0">{{ index + 1 }}</span>
              <span class="text-sm font-medium text-foreground flex-1 truncate">{{ element.title }}</span>
              <span class="text-xs text-muted-foreground truncate max-w-[120px]">{{ element.artist }}</span>
               <StatusBadge
                 :status="element.status"
                 type="track"
                 :variant="element.workflow_variant"
                 :label="element.workflow_step?.label ?? null"
               />
            </div>
          </template>
        </draggable>
        <div v-else class="text-sm text-muted-foreground py-4 text-center">{{ t('dashboard.noTracks') }}</div>
        <div class="flex items-center gap-3">
          <button
            @click="saveTrackOrder"
            :disabled="savingOrder || tracks.length === 0"
            class="btn-primary text-sm"
          >
            {{ savingOrder ? t('settings.saving') : t('settings.saveOrder') }}
          </button>
          <span
            v-if="orderMessage"
            class="text-xs"
            :class="orderMessage.type === 'success' ? 'text-success' : 'text-error'"
          >
            {{ orderMessage.text }}
          </span>
        </div>
      </div>

      <!-- Workflow editor -->
      <div v-else-if="activeTab === 'workflow'" class="card space-y-5">
        <div v-if="!isProducerOfAlbum" class="text-sm text-muted-foreground">
          {{ t('albumSettings.workflow.viewOnly') }}
        </div>
        <div v-if="workflowMigrations.length" class="bg-warning-bg border border-warning/20 rounded-none p-3 space-y-1">
          <p class="text-xs font-mono text-warning">{{ t('workflowEditor.migrationWarning') }}</p>
          <div v-for="m in workflowMigrations" :key="m.track_id" class="text-xs text-muted-foreground">
            {{ m.track_title }}: {{ m.from_step }} → {{ m.to_step }}
          </div>
        </div>
        <WorkflowEditor
          :workflow-config="album?.workflow_config ?? null"
          :member-options="userOptions"
          :saving="savingWorkflow"
          :saveable="true"
          @save="saveWorkflow"
        />
      </div>

      <div v-else-if="activeTab === 'archive'" class="space-y-4">
        <div class="card space-y-3">
          <h3 class="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
            <Archive class="w-4 h-4" />
            {{ t('albumSettings.archive.title') }}
          </h3>
          <p class="text-xs text-muted-foreground">{{ t('albumSettings.archive.description') }}</p>
        </div>

        <div v-if="archiveLoadError" class="card space-y-3">
          <p class="text-sm text-error">{{ archiveLoadError }}</p>
          <div>
            <button @click="album && loadArchivedTracks(album.id)" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
          </div>
        </div>

        <div v-if="loadingArchivedTracks && archivedTracks.length === 0" class="card">
          <p class="text-sm text-muted-foreground text-center py-4">{{ t('common.loading') }}</p>
        </div>

        <div v-else-if="!archiveLoadError && archivedTracks.length === 0" class="card">
          <p class="text-sm text-muted-foreground text-center py-4">{{ t('albumSettings.archive.empty') }}</p>
        </div>

        <div v-for="aTrack in archivedTracks" :key="aTrack.id" class="card flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-mono text-foreground truncate">
              <span v-if="aTrack.track_number" class="text-muted-foreground">#{{ aTrack.track_number }}</span>
              {{ aTrack.title }}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">
              {{ aTrack.artist }}
              <span class="mx-1">·</span>
              <StatusBadge
                :status="aTrack.status"
                type="track"
                :variant="aTrack.workflow_variant"
                :label="aTrack.workflow_step?.label ?? null"
              />
              <span class="mx-1">·</span>
              <span class="text-warning">{{ t('albumSettings.archive.remainingDays', { days: archiveRemainingDays(aTrack.archived_at) }) }}</span>
            </div>
          </div>
          <button
            @click="restoreTrack(aTrack.id)"
            :disabled="restoringTrackId === aTrack.id"
            class="btn-secondary text-xs flex items-center gap-1.5 shrink-0"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            {{ restoringTrackId === aTrack.id ? t('common.loading') : t('albumSettings.archive.restore') }}
          </button>
        </div>
      </div>

      <div v-else-if="activeTab === 'webhook'" class="card space-y-5">
        <div v-if="webhookConfigError" class="border border-error/30 bg-error-bg/30 p-3 space-y-3">
          <p class="text-sm text-error">{{ webhookConfigError }}</p>
          <div>
            <button @click="album && loadWebhookConfig(album.id)" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
          </div>
        </div>

        <template v-else>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.webhookType') }}</label>
          <select v-model="webhookState.type" class="select-field w-full text-sm">
            <option v-for="wt in WEBHOOK_TYPES" :key="wt.value" :value="wt.value">{{ wt.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.webhookUrl') }}</label>
          <input v-model="webhookState.url" class="input-field w-full text-sm" :placeholder="webhookState.type === 'feishu' ? 'https://open.feishu.cn/open-apis/bot/v2/hook/...' : 'https://...'" />
        </div>
        <div v-if="webhookState.type === 'feishu'">
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.webhookSecret') }}</label>
          <input v-model="webhookState.secret" type="password" class="input-field w-full text-sm" :placeholder="t('settings.webhookSecretPlaceholder')" />
        </div>
        <div v-if="webhookState.type === 'feishu'" class="space-y-4 p-4 bg-background border border-border rounded-none">
          <div class="text-xs text-muted-foreground">{{ t('settings.feishuMentionTitle') }}</div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.feishuAppId') }}</label>
            <input v-model="webhookState.app_id" class="input-field w-full text-sm" placeholder="cli_xxxxxxxx" />
          </div>
          <div>
            <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.feishuAppSecret') }}</label>
            <input v-model="webhookState.app_secret" type="password" class="input-field w-full text-sm" />
          </div>
          <p class="text-[11px] text-muted-foreground">{{ t('settings.feishuMentionHint') }}</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" class="checkbox" v-model="webhookState.enabled" />
          <span>{{ t('settings.webhookEnabled') }}</span>
        </label>
        <div>
          <div class="text-xs text-muted-foreground mb-2">{{ t('settings.webhookEvents') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label v-for="evt in WEBHOOK_EVENT_TYPES" :key="evt" class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                class="checkbox"
                :checked="webhookState.events.includes(evt)"
                @change="toggleWebhookEvent(evt)"
              />
              <span class="font-mono text-xs">{{ evt }}</span>
            </label>
          </div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground mb-2">{{ t('settings.webhookFilterUsers') }}</div>
          <p class="text-[11px] text-muted-foreground mb-2">{{ t('settings.webhookFilterUsersHint') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label v-for="u in albumMemberUsers" :key="u.id" class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                class="checkbox"
                :checked="webhookState.filter_user_ids.includes(u.id)"
                @change="toggleWebhookFilterUser(u.id)"
              />
              <span class="text-xs">{{ u.display_name }}</span>
              <span class="text-[11px] text-muted-foreground">@{{ u.username }}</span>
            </label>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="saveWebhook" :disabled="savingWebhook || loadingWebhookConfig" class="btn-primary text-sm">
            {{ savingWebhook ? t('settings.saving') : t('settings.webhookSave') }}
          </button>
          <button
            @click="testWebhook"
            :disabled="testingWebhook || !webhookState.url || loadingWebhookConfig"
            class="btn-secondary text-sm"
          >
            {{ testingWebhook ? t('common.loading') : t('settings.webhookTest') }}
          </button>
          <span v-if="webhookTestResult === true" class="text-xs text-success">✓</span>
          <span v-if="webhookTestResult === false" class="text-xs text-error">✗</span>
        </div>

        </template>

        <!-- Delivery history -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-mono font-semibold text-foreground">{{ t('settings.webhookDeliveries') }}</span>
            <button @click="refreshDeliveries" :disabled="loadingDeliveries" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {{ loadingDeliveries ? t('common.loading') : t('common.refresh') }}
            </button>
          </div>
          <div v-if="webhookDeliveriesError" class="border border-error/30 bg-error-bg/30 p-3 flex items-center justify-between gap-3">
            <p class="text-sm text-error">{{ webhookDeliveriesError }}</p>
            <button @click="album && loadWebhookDeliveries(album.id)" class="btn-secondary text-xs flex-shrink-0">
              {{ t('common.retry') }}
            </button>
          </div>
          <div v-else-if="loadingDeliveries && webhookDeliveries.length === 0" class="text-xs text-muted-foreground py-3 text-center">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="webhookDeliveries.length === 0" class="text-xs text-muted-foreground py-3 text-center">
            {{ t('settings.webhookNoDeliveries') }}
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="d in webhookDeliveries"
              :key="d.id"
              class="flex items-start gap-3 text-xs py-2 px-3 bg-background border border-border rounded-none"
            >
              <span
                class="shrink-0 font-mono px-2 py-0.5 rounded-full text-[11px]"
                :class="d.success ? 'bg-success-bg text-success' : 'bg-error-bg text-error'"
              >
                {{ d.success ? (d.status_code ?? 'OK') : (d.status_code ?? t('common.error')) }}
              </span>
              <span class="font-mono text-muted-foreground shrink-0">{{ d.event_type }}</span>
              <span v-if="d.error_detail" class="text-error truncate flex-1" :title="d.error_detail">{{ d.error_detail }}</span>
              <span class="text-muted-foreground ml-auto shrink-0">{{ new Date(d.created_at).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Danger zone tab (producer only) -->
      <div v-else-if="activeTab === 'danger'" class="space-y-4">
        <div class="card space-y-4 border-error/40">
          <h3 class="text-sm font-mono font-semibold text-error">{{ t('albumSettings.danger.title') }}</h3>

          <template v-if="!album.archived_at">
            <div class="space-y-2">
              <p class="text-sm font-mono font-semibold text-foreground">{{ t('albumSettings.danger.archiveTitle') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('albumSettings.danger.archiveDesc') }}</p>
            </div>
            <button
              v-if="!showArchiveConfirm"
              @click="showArchiveConfirm = true"
              class="text-sm font-mono px-4 h-10 rounded-full bg-error hover:opacity-90 text-white transition-opacity"
            >
              {{ t('albumSettings.danger.archiveButton') }}
            </button>
            <div v-else class="space-y-2">
              <p class="text-xs text-error">
                {{ t('albumSettings.danger.archiveConfirm', { title: album.title }) }}
              </p>
              <div class="flex gap-2">
                <button
                  @click="archiveAlbum"
                  :disabled="archivingAlbum"
                  class="text-sm font-mono px-4 h-10 rounded-full bg-error hover:opacity-90 text-white transition-opacity disabled:opacity-50"
                >
                  {{ archivingAlbum ? t('common.loading') : t('common.confirm') }}
                </button>
                <button
                  @click="showArchiveConfirm = false"
                  :disabled="archivingAlbum"
                  class="btn-secondary text-sm"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="space-y-2">
              <p class="text-sm font-mono font-semibold text-foreground">{{ t('albumSettings.danger.restoreTitle') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('albumSettings.danger.restoreDesc') }}</p>
              <p class="text-xs text-warning">
                {{ t('albumSettings.danger.archivedBanner', { date: formatDate(album.archived_at), days: archivedRemainingDays }) }}
              </p>
            </div>
            <button
              @click="restoreAlbum"
              :disabled="restoringAlbum"
              class="btn-primary text-sm"
            >
              {{ restoringAlbum ? t('common.loading') : t('albumSettings.danger.restoreButton') }}
            </button>
          </template>
        </div>
      </div>

    </div>
  </div>
</template>
