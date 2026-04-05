<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import { albumApi, checklistApi, invitationApi, userApi } from '@/api'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/composables/useToast'
import type { Album, ChecklistTemplateItem, Invitation, Track, User } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { success: toastSuccess } = useToast()

const albumId = computed(() => Number(route.params.albumId))
const album = ref<Album | null>(null)
const users = ref<User[]>([])
const loading = ref(true)
const activeTab = ref('team')

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

// Deadline state
const deadlineState = reactive({ deadline: '', peer_review: '', mastering: '', final_review: '' })
const savingDeadlines = ref(false)

// Checklist state
const templateItems = ref<ChecklistTemplateItem[]>([])
const templateIsDefault = ref(false)
const savingTemplate = ref(false)
const templateError = ref('')

// Track order state
const tracks = ref<Track[]>([])
const savingOrder = ref(false)
const orderMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// Webhook state
const webhookState = reactive({ url: '', enabled: false, events: [] as string[] })
const savingWebhook = ref(false)
const testingWebhook = ref(false)
const webhookTestResult = ref<boolean | null>(null)

const WEBHOOK_EVENT_TYPES = [
  'track_status_changed', 'new_issue', 'issue_status_changed', 'new_comment', 'new_discussion',
]

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
    { key: 'team', label: t('albumSettings.tabs.team') },
    { key: 'deadlines', label: t('albumSettings.tabs.deadlines') },
  ]
  if (isProducerOfAlbum.value || isMemberOfAlbum.value) {
    tabs.push({ key: 'checklist', label: t('albumSettings.tabs.checklist') })
  }
  if (isProducerOfAlbum.value) {
    tabs.push({ key: 'order', label: t('albumSettings.tabs.order') })
    tabs.push({ key: 'webhook', label: t('albumSettings.tabs.webhook') })
  }
  return tabs
})

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

function syncDeadlineState() {
  if (!album.value) return
  deadlineState.deadline = toDateInput(album.value.deadline)
  deadlineState.peer_review = toDateInput(album.value.phase_deadlines?.peer_review)
  deadlineState.mastering = toDateInput(album.value.phase_deadlines?.mastering)
  deadlineState.final_review = toDateInput(album.value.phase_deadlines?.final_review)
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

    const loadTasks: Promise<any>[] = []

    if (albumData.producer_id === userId) {
      loadTasks.push(
        userApi.list().then(u => { users.value = u }),
        invitationApi.listForAlbum(albumData.id).then(invs => { invitations.value = invs }),
        checklistApi.getTemplate(albumData.id).then(tpl => {
          templateItems.value = tpl.items.map(item => ({ ...item }))
          templateIsDefault.value = tpl.is_default
        }).catch(() => {}),
        albumApi.tracks(albumData.id).then(ts => { tracks.value = ts }),
        albumApi.getWebhook(albumData.id).then(cfg => {
          webhookState.url = cfg.url
          webhookState.enabled = cfg.enabled
          webhookState.events = [...cfg.events]
        }).catch(() => {
          webhookState.url = ''
          webhookState.enabled = false
          webhookState.events = []
        }),
      )
    } else if (albumData.members.some(m => m.user_id === userId)) {
      loadTasks.push(
        checklistApi.getTemplate(albumData.id).then(tpl => {
          templateItems.value = tpl.items.map(item => ({ ...item }))
          templateIsDefault.value = tpl.is_default
        }).catch(() => {}),
      )
    }

    await Promise.all(loadTasks)
  } catch {
    router.replace('/albums')
  } finally {
    loading.value = false
  }
})

// Team actions
function toggleMember(userId: number) {
  if (teamState.member_ids.includes(userId)) {
    teamState.member_ids = teamState.member_ids.filter(id => id !== userId)
  } else {
    teamState.member_ids = [...teamState.member_ids, userId]
  }
}

async function saveTeam() {
  if (!album.value) return
  savingTeam.value = true
  try {
    const updated = await albumApi.updateTeam(album.value.id, teamState)
    album.value = updated
    syncTeamState()
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
  await invitationApi.cancel(invitationId)
  invitations.value = invitations.value.filter(inv => inv.id !== invitationId)
}

function getUserDisplayName(userId: number): string {
  const user = users.value.find(u => u.id === userId)
  return user?.display_name || `User #${userId}`
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
    await albumApi.updateDeadlines(album.value.id, {
      deadline: deadlineState.deadline ? new Date(deadlineState.deadline).toISOString() : null,
      phase_deadlines: Object.keys(phaseDeadlines).length ? phaseDeadlines : null,
    })
    toastSuccess(t('settings.deadlinesSaved'))
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
  try {
    const result = await checklistApi.updateTemplate(
      album.value.id,
      templateItems.value.map((item, i) => ({ ...item, sort_order: i }))
    )
    templateItems.value = result.items.map(item => ({ ...item }))
    templateIsDefault.value = false
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
  try {
    await checklistApi.resetTemplate(album.value.id)
    const tpl = await checklistApi.getTemplate(album.value.id)
    templateItems.value = tpl.items.map(item => ({ ...item }))
    templateIsDefault.value = true
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

// Webhook actions
function toggleWebhookEvent(event: string) {
  const idx = webhookState.events.indexOf(event)
  if (idx >= 0) webhookState.events.splice(idx, 1)
  else webhookState.events.push(event)
}

async function saveWebhook() {
  if (!album.value) return
  savingWebhook.value = true
  try {
    const result = await albumApi.updateWebhook(album.value.id, webhookState)
    webhookState.url = result.url
    webhookState.enabled = result.enabled
    webhookState.events = [...result.events]
    toastSuccess(t('settings.webhookSaved'))
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
  }
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>

  <div v-else-if="album" class="max-w-4xl mx-auto space-y-6">
    <!-- Album header -->
    <div class="flex items-center gap-4">
      <div class="w-1 h-10 flex-shrink-0" :style="{ backgroundColor: album.cover_color }"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-xl font-mono font-bold text-foreground">{{ album.title }}</h1>
          <span class="text-xs font-mono px-2 py-0.5 rounded-full" :class="roleBadgeClass">
            {{ userRoleInAlbum }}
          </span>
        </div>
        <p v-if="album.description" class="text-xs text-muted-foreground mt-0.5 truncate">{{ album.description }}</p>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-0 border-b border-border overflow-x-auto">
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

      <!-- Team tab -->
      <div v-if="activeTab === 'team'" class="space-y-4">
        <template v-if="isProducerOfAlbum">
          <div class="card space-y-5">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringEngineerSelect') }}</label>
              <select v-model="teamState.mastering_engineer_id" class="select-field w-full">
                <option :value="null">{{ t('settings.noneOption') }}</option>
                <option v-for="user in users" :key="user.id" :value="user.id">{{ user.display_name }}</option>
              </select>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-2">{{ t('settings.participants') }}</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label v-for="user in users" :key="user.id" class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" :checked="teamState.member_ids.includes(user.id)" @change="toggleMember(user.id)" />
                  <span>{{ user.display_name }}</span>
                </label>
              </div>
            </div>
            <button @click="saveTeam" :disabled="savingTeam" class="btn-primary text-sm">
              {{ savingTeam ? t('settings.saving') : t('settings.saveTeam') }}
            </button>
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
          </div>
        </template>
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
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.peerReviewDeadline') }}</label>
              <input v-model="deadlineState.peer_review" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringDeadline') }}</label>
              <input v-model="deadlineState.mastering" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.finalReviewDeadline') }}</label>
              <input v-model="deadlineState.final_review" type="date" class="input-field w-full" />
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
        <div v-if="isProducerOfAlbum" class="card space-y-4">
          <div v-if="templateIsDefault" class="text-xs text-muted-foreground">{{ t('settings.usingDefaultTemplate') }}</div>
          <div class="space-y-3">
            <div
              v-for="(item, index) in templateItems"
              :key="index"
              class="flex items-start gap-3 p-3 border border-border bg-background"
            >
              <div class="flex-1 space-y-2">
                <input v-model="item.label" class="input-field w-full text-sm" :placeholder="t('settings.itemLabel')" />
                <input v-model="item.description" class="input-field w-full text-xs" :placeholder="t('settings.itemDescription')" />
              </div>
              <div class="flex items-center gap-2 pt-1.5">
                <label class="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" v-model="item.required" />
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
          <div class="flex items-center gap-2">
            <button @click="addTemplateItem" class="btn-secondary text-xs px-3 py-1.5">{{ t('settings.addItem') }}</button>
            <button @click="saveTemplate" :disabled="savingTemplate" class="btn-primary text-xs px-3 py-1.5">
              {{ savingTemplate ? t('settings.saving') : t('settings.saveTemplate') }}
            </button>
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
              <StatusBadge :status="element.status" type="track" />
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

      <!-- Webhook tab (producer only) -->
      <div v-else-if="activeTab === 'webhook'" class="card space-y-5">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.webhookUrl') }}</label>
          <input v-model="webhookState.url" class="input-field w-full text-sm" placeholder="https://..." />
        </div>
        <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" v-model="webhookState.enabled" />
          <span>{{ t('settings.webhookEnabled') }}</span>
        </label>
        <div>
          <div class="text-xs text-muted-foreground mb-2">{{ t('settings.webhookEvents') }}</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label v-for="evt in WEBHOOK_EVENT_TYPES" :key="evt" class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                :checked="webhookState.events.includes(evt)"
                @change="toggleWebhookEvent(evt)"
              />
              <span class="font-mono text-xs">{{ evt }}</span>
            </label>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="saveWebhook" :disabled="savingWebhook" class="btn-primary text-sm">
            {{ savingWebhook ? t('settings.saving') : t('settings.webhookSave') }}
          </button>
          <button
            @click="testWebhook"
            :disabled="testingWebhook || !webhookState.url"
            class="btn-secondary text-sm"
          >
            {{ testingWebhook ? t('common.loading') : t('settings.webhookTest') }}
          </button>
          <span v-if="webhookTestResult === true" class="text-xs text-success">✓</span>
          <span v-if="webhookTestResult === false" class="text-xs text-error">✗</span>
        </div>
      </div>

    </div>
  </div>
</template>
