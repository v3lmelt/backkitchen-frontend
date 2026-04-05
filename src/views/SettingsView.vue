<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import { albumApi, checklistApi, invitationApi, userApi, API_ORIGIN } from '@/api'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/composables/useToast'
import type { Album, ChecklistTemplateItem, Invitation, Track, User } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const { t } = useI18n()
const { success: toastSuccess } = useToast()
const appStore = useAppStore()
const users = ref<User[]>([])
const albums = ref<Album[]>([])
const loading = ref(true)
const savingAlbumId = ref<number | null>(null)
const albumInvitations = ref<Record<number, Invitation[]>>({})
const invitingAlbumId = ref<number | null>(null)
const inviteUserId = ref<Record<number, string>>({})
const inviteError = ref<Record<number, string>>({})
const inviteSuccess = ref<Record<number, string>>({})

// Checklist template state
const albumTemplates = ref<Record<number, ChecklistTemplateItem[]>>({})
const albumTemplateIsDefault = ref<Record<number, boolean>>({})
const savingTemplateAlbumId = ref<number | null>(null)
const templateError = ref<Record<number, string>>({})

// Track ordering state
const albumTracks = ref<Record<number, Track[]>>({})
const savingOrderAlbumId = ref<number | null>(null)
const orderSaveMessage = ref<Record<number, { type: 'success' | 'error'; text: string }>>({})

// Deadline state
const albumDeadlines = reactive<Record<number, { deadline: string; peer_review: string; mastering: string; final_review: string }>>({})
const savingDeadlineAlbumId = ref<number | null>(null)

// Webhook state
const albumWebhooks = reactive<Record<number, { url: string; enabled: boolean; events: string[] }>>({})
const savingWebhookAlbumId = ref<number | null>(null)
const testingWebhookAlbumId = ref<number | null>(null)
const webhookTestResult = ref<Record<number, boolean | null>>({})

const WEBHOOK_EVENT_TYPES = [
  'track_status_changed', 'new_issue', 'issue_status_changed', 'new_comment', 'new_discussion',
]

const newAlbum = ref({ title: '', description: '', cover_color: '#A855F7', release_date: '', catalog_number: '', circle_name: '' })
const newAlbumGenreInput = ref('')
const newAlbumGenres = ref<string[]>([])

// Metadata state (per album)
const albumMetadataState = reactive<Record<number, {
  release_date: string
  catalog_number: string
  circle_name: string
  genres: string[]
  genre_input: string
}>>({})
const savingMetadataAlbumId = ref<number | null>(null)
const uploadingCoverAlbumId = ref<number | null>(null)

const teamState = reactive<Record<number, { mastering_engineer_id: number | null; member_ids: number[] }>>({})

onMounted(async () => {
  loading.value = true
  try {
    const [loadedUsers, loadedAlbums] = await Promise.all([userApi.list(), albumApi.list()])
    users.value = loadedUsers
    albums.value = loadedAlbums
    syncTeamState()
    syncDeadlineState(loadedAlbums)
    syncMetadataState(loadedAlbums)
    const producerAlbums = loadedAlbums.filter(album => appStore.currentUser?.id === album.producer_id)
    await Promise.all([
      ...producerAlbums.map(album =>
        invitationApi.listForAlbum(album.id).then(invs => {
          albumInvitations.value[album.id] = invs
        })
      ),
      ...producerAlbums.map(album =>
        checklistApi.getTemplate(album.id).then(template => {
          albumTemplates.value[album.id] = template.items.map(item => ({ ...item }))
          albumTemplateIsDefault.value[album.id] = template.is_default
        }).catch(() => {})
      ),
      loadAlbumTracks(),
      ...producerAlbums.map(album =>
        albumApi.getWebhook(album.id).then(config => {
          albumWebhooks[album.id] = { ...config }
        }).catch(() => {
          albumWebhooks[album.id] = { url: '', enabled: false, events: [] }
        })
      ),
    ])
  } finally {
    loading.value = false
  }
})

function syncTeamState() {
  for (const album of albums.value) {
    teamState[album.id] = {
      mastering_engineer_id: album.mastering_engineer_id,
      member_ids: album.members.map(member => member.user_id),
    }
  }
}

async function createAlbum() {
  if (!newAlbum.value.title) return
  const album = await albumApi.create({
    ...newAlbum.value,
    release_date: newAlbum.value.release_date || null,
    catalog_number: newAlbum.value.catalog_number || null,
    circle_name: newAlbum.value.circle_name || null,
    genres: newAlbumGenres.value.length ? [...newAlbumGenres.value] : null,
  })
  albums.value.push(album)
  syncTeamState()
  syncMetadataState([album])
  newAlbum.value = { title: '', description: '', cover_color: '#A855F7', release_date: '', catalog_number: '', circle_name: '' }
  newAlbumGenres.value = []
  newAlbumGenreInput.value = ''
}

function addNewAlbumGenre() {
  const tag = newAlbumGenreInput.value.trim()
  if (tag && !newAlbumGenres.value.includes(tag)) {
    newAlbumGenres.value.push(tag)
  }
  newAlbumGenreInput.value = ''
}

function removeNewAlbumGenre(genre: string) {
  newAlbumGenres.value = newAlbumGenres.value.filter(g => g !== genre)
}

function toggleMember(albumId: number, userId: number) {
  const state = teamState[albumId]
  if (!state) return
  if (state.member_ids.includes(userId)) {
    state.member_ids = state.member_ids.filter(id => id !== userId)
  } else {
    state.member_ids = [...state.member_ids, userId]
  }
}

async function saveTeam(album: Album) {
  savingAlbumId.value = album.id
  try {
    const updated = await albumApi.updateTeam(album.id, teamState[album.id])
    const idx = albums.value.findIndex(item => item.id === updated.id)
    if (idx !== -1) albums.value[idx] = updated
    syncTeamState()
  } finally {
    savingAlbumId.value = null
  }
}

async function inviteMember(albumId: number) {
  const userId = parseInt(inviteUserId.value[albumId] || '0')
  if (!userId) return
  invitingAlbumId.value = albumId
  inviteError.value[albumId] = ''
  inviteSuccess.value[albumId] = ''
  try {
    const invitation = await invitationApi.create(albumId, userId)
    if (!albumInvitations.value[albumId]) {
      albumInvitations.value[albumId] = []
    }
    albumInvitations.value[albumId].push(invitation)
    inviteSuccess.value[albumId] = t('settings.invitationSent')
    inviteUserId.value[albumId] = ''
  } catch (err: any) {
    const msg = err.message || ''
    if (msg.includes('already a member')) {
      inviteError.value[albumId] = t('settings.inviteErrorAlreadyMember')
    } else if (msg.includes('already a pending')) {
      inviteError.value[albumId] = t('settings.inviteErrorAlreadyInvited')
    } else {
      inviteError.value[albumId] = msg
    }
  } finally {
    invitingAlbumId.value = null
  }
}

async function cancelInvitation(albumId: number, invitationId: number) {
  await invitationApi.cancel(invitationId)
  if (albumInvitations.value[albumId]) {
    albumInvitations.value[albumId] = albumInvitations.value[albumId].filter(inv => inv.id !== invitationId)
  }
}

function getUserDisplayName(userId: number): string {
  const user = users.value.find(u => u.id === userId)
  return user?.display_name || `User #${userId}`
}

// Checklist template functions
function addTemplateItem(albumId: number) {
  if (!albumTemplates.value[albumId]) albumTemplates.value[albumId] = []
  const items = albumTemplates.value[albumId]
  items.push({
    label: '',
    description: null,
    required: true,
    sort_order: items.length,
  })
}

function removeTemplateItem(albumId: number, index: number) {
  const items = albumTemplates.value[albumId]
  if (!items) return
  items.splice(index, 1)
  items.forEach((item, i) => item.sort_order = i)
}

async function saveTemplate(albumId: number) {
  const items = albumTemplates.value[albumId]
  if (!items || items.length === 0) return
  const hasEmpty = items.some(item => !item.label.trim())
  if (hasEmpty) {
    templateError.value[albumId] = t('settings.templateItemLabelRequired', 'Label cannot be empty')
    return
  }
  savingTemplateAlbumId.value = albumId
  templateError.value[albumId] = ''
  try {
    const result = await checklistApi.updateTemplate(albumId, items.map((item, i) => ({
      ...item,
      sort_order: i,
    })))
    albumTemplates.value[albumId] = result.items.map(item => ({ ...item }))
    albumTemplateIsDefault.value[albumId] = false
    toastSuccess(t('settings.templateSaved'))
  } catch (err: any) {
    templateError.value[albumId] = err.message || t('settings.templateSaveFailed')
  } finally {
    savingTemplateAlbumId.value = null
  }
}

async function resetTemplate(albumId: number) {
  savingTemplateAlbumId.value = albumId
  templateError.value[albumId] = ''
  try {
    await checklistApi.resetTemplate(albumId)
    const template = await checklistApi.getTemplate(albumId)
    albumTemplates.value[albumId] = template.items.map(item => ({ ...item }))
    albumTemplateIsDefault.value[albumId] = true
    toastSuccess(t('settings.templateReset'))
  } catch (err: any) {
    templateError.value[albumId] = err.message || t('settings.templateSaveFailed')
  } finally {
    savingTemplateAlbumId.value = null
  }
}

async function loadAlbumTracks() {
  const producerAlbums = albums.value.filter(a => appStore.currentUser?.id === a.producer_id)
  await Promise.all(
    producerAlbums.map(album =>
      albumApi.tracks(album.id).then(tracks => {
        albumTracks.value[album.id] = tracks
      })
    )
  )
}

async function saveTrackOrder(albumId: number) {
  const tracks = albumTracks.value[albumId]
  if (!tracks) return
  savingOrderAlbumId.value = albumId
  orderSaveMessage.value[albumId] = undefined as any
  try {
    const trackIds = tracks.map(t => t.id)
    const updated = await albumApi.reorderTracks(albumId, trackIds)
    albumTracks.value[albumId] = updated
    orderSaveMessage.value[albumId] = { type: 'success', text: t('settings.orderSaved') }
  } catch {
    orderSaveMessage.value[albumId] = { type: 'error', text: t('settings.orderSaveFailed') }
  } finally {
    savingOrderAlbumId.value = null
  }
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function syncDeadlineState(albumList: Album[]) {
  for (const album of albumList) {
    albumDeadlines[album.id] = {
      deadline: toDateInput(album.deadline),
      peer_review: toDateInput(album.phase_deadlines?.peer_review),
      mastering: toDateInput(album.phase_deadlines?.mastering),
      final_review: toDateInput(album.phase_deadlines?.final_review),
    }
  }
}

function syncMetadataState(albumList: Album[]) {
  for (const album of albumList) {
    albumMetadataState[album.id] = {
      release_date: album.release_date ? album.release_date.slice(0, 10) : '',
      catalog_number: album.catalog_number || '',
      circle_name: album.circle_name || '',
      genres: album.genres ? [...album.genres] : [],
      genre_input: '',
    }
  }
}

function addGenreToAlbum(albumId: number) {
  const state = albumMetadataState[albumId]
  if (!state) return
  const tag = state.genre_input.trim()
  if (tag && !state.genres.includes(tag)) {
    state.genres.push(tag)
  }
  state.genre_input = ''
}

function removeGenreFromAlbum(albumId: number, genre: string) {
  const state = albumMetadataState[albumId]
  if (!state) return
  state.genres = state.genres.filter(g => g !== genre)
}

async function saveMetadata(albumId: number) {
  const state = albumMetadataState[albumId]
  if (!state) return
  savingMetadataAlbumId.value = albumId
  try {
    const updated = await albumApi.updateMetadata(albumId, {
      release_date: state.release_date || null,
      catalog_number: state.catalog_number || null,
      circle_name: state.circle_name || null,
      genres: state.genres.length ? [...state.genres] : null,
    })
    const idx = albums.value.findIndex(a => a.id === updated.id)
    if (idx !== -1) albums.value[idx] = updated
    syncMetadataState([updated])
    toastSuccess(t('settings.metadataSaved'))
  } catch {
    // error handled by request layer
  } finally {
    savingMetadataAlbumId.value = null
  }
}

async function handleCoverUpload(albumId: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingCoverAlbumId.value = albumId
  try {
    const updated = await albumApi.uploadCover(albumId, file)
    const idx = albums.value.findIndex(a => a.id === updated.id)
    if (idx !== -1) albums.value[idx] = updated
    toastSuccess(t('settings.coverUploaded'))
  } catch {
    // error handled by request layer
  } finally {
    uploadingCoverAlbumId.value = null
    input.value = ''
  }
}

function toggleWebhookEvent(albumId: number, event: string) {
  const wh = albumWebhooks[albumId]
  if (!wh) return
  const idx = wh.events.indexOf(event)
  if (idx >= 0) wh.events.splice(idx, 1)
  else wh.events.push(event)
}

async function saveWebhook(albumId: number) {
  const wh = albumWebhooks[albumId]
  if (!wh) return
  savingWebhookAlbumId.value = albumId
  try {
    const result = await albumApi.updateWebhook(albumId, wh)
    albumWebhooks[albumId] = { ...result }
    toastSuccess(t('settings.webhookSaved'))
  } finally {
    savingWebhookAlbumId.value = null
  }
}

async function testWebhook(albumId: number) {
  testingWebhookAlbumId.value = albumId
  webhookTestResult.value[albumId] = null
  try {
    const result = await albumApi.testWebhook(albumId)
    webhookTestResult.value[albumId] = result.success
  } catch {
    webhookTestResult.value[albumId] = false
  } finally {
    testingWebhookAlbumId.value = null
  }
}

async function saveDeadlines(albumId: number) {
  const state = albumDeadlines[albumId]
  if (!state) return
  savingDeadlineAlbumId.value = albumId
  try {
    const phaseDeadlines: Record<string, string> = {}
    if (state.peer_review) phaseDeadlines.peer_review = new Date(state.peer_review).toISOString()
    if (state.mastering) phaseDeadlines.mastering = new Date(state.mastering).toISOString()
    if (state.final_review) phaseDeadlines.final_review = new Date(state.final_review).toISOString()
    await albumApi.updateDeadlines(albumId, {
      deadline: state.deadline ? new Date(state.deadline).toISOString() : null,
      phase_deadlines: Object.keys(phaseDeadlines).length ? phaseDeadlines : null,
    })
    toastSuccess(t('settings.deadlinesSaved'))
  } catch {
    // error handled by request layer
  } finally {
    savingDeadlineAlbumId.value = null
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-8">
    <h1 class="text-2xl font-sans font-bold text-foreground">{{ t('settings.heading') }}</h1>

    <section class="card space-y-4">
      <h2 class="text-lg font-sans font-semibold text-foreground">{{ t('settings.createAlbum') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumTitle') }}</label>
          <input v-model="newAlbum.title" class="input-field w-full" :placeholder="t('settings.albumTitlePlaceholder')" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.coverColor') }}</label>
          <input v-model="newAlbum.cover_color" type="color" class="input-field w-full h-10" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.circleName') }}</label>
          <input v-model="newAlbum.circle_name" class="input-field w-full" :placeholder="t('settings.circleNamePlaceholder')" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.catalogNumber') }}</label>
          <input v-model="newAlbum.catalog_number" class="input-field w-full" :placeholder="t('settings.catalogNumberPlaceholder')" />
        </div>
        <div>
          <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.releaseDate') }}</label>
          <input v-model="newAlbum.release_date" type="date" class="input-field w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.description') }}</label>
        <textarea v-model="newAlbum.description" class="textarea-field w-full h-20" :placeholder="t('settings.descriptionPlaceholder')" />
      </div>
      <div>
        <label class="block text-xs text-muted-foreground mb-2">{{ t('settings.genres') }}</label>
        <div class="flex items-center gap-2 mb-2">
          <input
            v-model="newAlbumGenreInput"
            class="input-field flex-1 text-sm"
            :placeholder="t('settings.genrePlaceholder')"
            @keyup.enter="addNewAlbumGenre"
          />
          <button @click="addNewAlbumGenre" class="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
            {{ t('settings.addGenre') }}
          </button>
        </div>
        <div v-if="newAlbumGenres.length" class="flex flex-wrap gap-1">
          <span
            v-for="genre in newAlbumGenres"
            :key="genre"
            class="inline-flex items-center gap-1 text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono"
          >
            {{ genre }}
            <button @click="removeNewAlbumGenre(genre)" class="hover:opacity-70 ml-0.5">×</button>
          </span>
        </div>
      </div>
      <button @click="createAlbum" class="btn-primary text-sm w-full">{{ t('settings.createButton') }}</button>
    </section>

    <section>
      <h2 class="text-lg font-sans font-semibold text-foreground mb-4">{{ t('settings.albumTeams') }}</h2>

      <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
      <div v-else class="space-y-4">
        <div v-for="album in albums" :key="album.id" class="card space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ album.title }}</h3>
              <p class="text-xs text-muted-foreground mt-1">{{ album.description || t('settings.noDescription') }}</p>
            </div>
            <div class="text-xs text-muted-foreground">
              {{ t('settings.producerLabel', { name: album.producer?.display_name || t('settings.unassigned') }) }}
            </div>
          </div>

          <template v-if="appStore.currentUser?.id === album.producer_id">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringEngineerSelect') }}</label>
              <select v-model="teamState[album.id].mastering_engineer_id" class="select-field w-full">
                <option :value="null">{{ t('settings.noneOption') }}</option>
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.display_name }}
                </option>
              </select>
            </div>

            <div>
              <div class="text-xs text-muted-foreground mb-2">{{ t('settings.participants') }}</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label v-for="user in users" :key="user.id" class="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    :checked="teamState[album.id].member_ids.includes(user.id)"
                    @change="toggleMember(album.id, user.id)"
                  />
                  <span>{{ user.display_name }}</span>
                </label>
              </div>
            </div>

            <button
              @click="saveTeam(album)"
              :disabled="savingAlbumId === album.id"
              class="btn-primary text-sm"
            >
              {{ savingAlbumId === album.id ? t('settings.saving') : t('settings.saveTeam') }}
            </button>
          </template>

          <template v-else>
            <div class="text-sm text-muted-foreground">
              {{ t('settings.readOnlyNotice') }}
            </div>
            <div class="text-sm text-foreground">
              {{ t('settings.masteringEngineerInfo', { name: album.mastering_engineer?.display_name || t('settings.unassigned') }) }}
            </div>
            <div class="text-xs text-muted-foreground">
              {{ t('settings.participantsInfo', { list: album.members.map(member => member.user.display_name).join(', ') || t('settings.noneParticipants') }) }}
            </div>
          </template>

          <template v-if="appStore.currentUser?.id === album.producer_id">
            <div class="border-t border-border pt-4 mt-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-muted-foreground">{{ t('settings.inviteByUserId') }}</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  v-model="inviteUserId[album.id]"
                  type="number"
                  class="input-field w-32 text-sm"
                  :placeholder="t('settings.userIdPlaceholder')"
                  @keyup.enter="inviteMember(album.id)"
                />
                <button
                  @click="inviteMember(album.id)"
                  :disabled="invitingAlbumId === album.id || !inviteUserId[album.id]"
                  class="btn-secondary text-xs px-3 py-1.5"
                >
                  {{ invitingAlbumId === album.id ? t('settings.inviting') : t('settings.invite') }}
                </button>
              </div>
              <div v-if="inviteError[album.id]" class="text-xs text-error mt-1">{{ inviteError[album.id] }}</div>
              <div v-if="inviteSuccess[album.id]" class="text-xs text-success mt-1">{{ inviteSuccess[album.id] }}</div>
            </div>

            <div v-if="albumInvitations[album.id]?.length > 0" class="border-t border-border pt-4 mt-4">
              <div class="text-xs text-muted-foreground mb-2">{{ t('settings.pendingInvitations') }}</div>
              <div class="space-y-2">
                <div v-for="inv in albumInvitations[album.id]" :key="inv.id" class="flex items-center justify-between p-2 bg-card rounded border border-border">
                  <div class="text-sm text-foreground">
                    {{ getUserDisplayName(inv.user_id) }}
                    <span class="text-xs text-muted-foreground ml-1">(#{{ inv.user_id }})</span>
                  </div>
                  <button @click="cancelInvitation(album.id, inv.id)" class="text-xs text-error hover:underline">
                    {{ t('settings.cancelInvitation') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Checklist Template Editor -->
            <div v-if="albumTemplates[album.id]" class="border-t border-border pt-4 mt-4">
              <h4 class="text-sm font-mono font-semibold text-foreground mb-3">{{ t('settings.checklistTemplate') }}</h4>
              <div v-if="albumTemplateIsDefault[album.id]" class="text-xs text-muted-foreground mb-3">
                {{ t('settings.usingDefaultTemplate', 'Using default template') }}
              </div>
              <div class="space-y-3">
                <div
                  v-for="(item, index) in albumTemplates[album.id]"
                  :key="index"
                  class="flex items-start gap-3 p-3 border border-border rounded-none bg-background"
                >
                  <div class="flex-1 space-y-2">
                    <input
                      v-model="item.label"
                      class="input-field w-full text-sm"
                      :placeholder="t('settings.itemLabel')"
                    />
                    <input
                      v-model="item.description"
                      class="input-field w-full text-xs"
                      :placeholder="t('settings.itemDescription')"
                    />
                  </div>
                  <div class="flex items-center gap-2 pt-1.5">
                    <label class="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        v-model="item.required"
                        class="rounded border-border bg-card text-primary focus:ring-primary"
                      />
                      <span>{{ item.required ? t('settings.required') : t('settings.optional') }}</span>
                    </label>
                    <button
                      @click="removeTemplateItem(album.id, index)"
                      class="text-xs text-error hover:underline ml-2"
                      :disabled="albumTemplates[album.id].length <= 1"
                    >
                      {{ t('settings.removeItem') }}
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="templateError[album.id]" class="text-xs text-error mt-2">{{ templateError[album.id] }}</div>
              <div class="flex items-center gap-2 mt-3">
                <button @click="addTemplateItem(album.id)" class="btn-secondary text-xs px-3 py-1.5">
                  {{ t('settings.addItem') }}
                </button>
                <button
                  @click="saveTemplate(album.id)"
                  :disabled="savingTemplateAlbumId === album.id"
                  class="btn-primary text-xs px-3 py-1.5"
                >
                  {{ savingTemplateAlbumId === album.id ? t('settings.saving') : t('settings.saveTemplate') }}
                </button>
                <button
                  @click="resetTemplate(album.id)"
                  :disabled="savingTemplateAlbumId === album.id || albumTemplateIsDefault[album.id]"
                  class="btn-secondary text-xs px-3 py-1.5"
                  :class="{ 'opacity-40 cursor-not-allowed': albumTemplateIsDefault[album.id] }"
                >
                  {{ t('settings.resetToDefault') }}
                </button>
              </div>
            </div>

            <!-- Album Metadata & Cover -->
            <div v-if="albumMetadataState[album.id]" class="border-t border-border pt-4 mt-4 space-y-4">
              <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('settings.albumMetadata') }}</h4>

              <!-- Cover image -->
              <div>
                <label class="block text-xs text-muted-foreground mb-2">{{ t('settings.coverImageLabel') }}</label>
                <div class="flex items-center gap-3">
                  <template v-if="album.cover_image">
                    <img :src="`${API_ORIGIN}/uploads/${album.cover_image}`" class="w-16 h-16 object-cover rounded-none border border-border" :alt="album.title" />
                  </template>
                  <label class="btn-secondary text-xs px-3 py-1.5 cursor-pointer">
                    {{ uploadingCoverAlbumId === album.id ? t('common.loading') : t('settings.uploadCover') }}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      class="hidden"
                      :disabled="uploadingCoverAlbumId === album.id"
                      @change="handleCoverUpload(album.id, $event)"
                    />
                  </label>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.circleName') }}</label>
                  <input v-model="albumMetadataState[album.id].circle_name" class="input-field w-full text-sm" :placeholder="t('settings.circleNamePlaceholder')" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.catalogNumber') }}</label>
                  <input v-model="albumMetadataState[album.id].catalog_number" class="input-field w-full text-sm" :placeholder="t('settings.catalogNumberPlaceholder')" />
                </div>
                <div>
                  <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.releaseDate') }}</label>
                  <input v-model="albumMetadataState[album.id].release_date" type="date" class="input-field w-full text-sm" />
                </div>
              </div>

              <div>
                <label class="block text-xs text-muted-foreground mb-2">{{ t('settings.genres') }}</label>
                <div class="flex items-center gap-2 mb-2">
                  <input
                    v-model="albumMetadataState[album.id].genre_input"
                    class="input-field flex-1 text-sm"
                    :placeholder="t('settings.genrePlaceholder')"
                    @keyup.enter="addGenreToAlbum(album.id)"
                  />
                  <button @click="addGenreToAlbum(album.id)" class="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
                    {{ t('settings.addGenre') }}
                  </button>
                </div>
                <div v-if="albumMetadataState[album.id].genres.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="genre in albumMetadataState[album.id].genres"
                    :key="genre"
                    class="inline-flex items-center gap-1 text-xs bg-info-bg text-info px-2 py-0.5 rounded-full font-mono"
                  >
                    {{ genre }}
                    <button @click="removeGenreFromAlbum(album.id, genre)" class="hover:opacity-70 ml-0.5">×</button>
                  </span>
                </div>
              </div>

              <button
                @click="saveMetadata(album.id)"
                :disabled="savingMetadataAlbumId === album.id"
                class="btn-primary text-xs px-4 py-2"
              >
                {{ savingMetadataAlbumId === album.id ? t('settings.saving') : t('settings.saveMetadata') }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </section>
    <!-- Track Order -->
    <section v-if="albums.some(a => appStore.currentUser?.id === a.producer_id)">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-4">{{ t('settings.trackOrder') }}</h2>
      <div class="space-y-4">
        <div
          v-for="album in albums.filter(a => appStore.currentUser?.id === a.producer_id)"
          :key="'order-' + album.id"
          class="bg-card border border-border rounded-none p-6 space-y-4"
        >
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ album.title }}</h3>
          <p class="text-xs text-muted-foreground">{{ t('settings.dragToReorder') }}</p>

          <draggable
            v-if="albumTracks[album.id]?.length"
            v-model="albumTracks[album.id]"
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
              @click="saveTrackOrder(album.id)"
              :disabled="savingOrderAlbumId === album.id || !albumTracks[album.id]?.length"
              class="btn-primary text-sm"
            >
              {{ savingOrderAlbumId === album.id ? t('settings.saving') : t('settings.saveOrder') }}
            </button>
            <span
              v-if="orderSaveMessage[album.id]"
              class="text-xs"
              :class="orderSaveMessage[album.id].type === 'success' ? 'text-success' : 'text-error'"
            >
              {{ orderSaveMessage[album.id].text }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Deadlines -->
    <section v-if="albums.some(a => appStore.currentUser?.id === a.producer_id)">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-4">{{ t('settings.deadlines') }}</h2>
      <div class="space-y-4">
        <div
          v-for="album in albums.filter(a => appStore.currentUser?.id === a.producer_id)"
          :key="'deadline-' + album.id"
          class="bg-card border border-border rounded-none p-6 space-y-4"
        >
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ album.title }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.albumDeadline') }}</label>
              <input v-model="albumDeadlines[album.id].deadline" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.peerReviewDeadline') }}</label>
              <input v-model="albumDeadlines[album.id].peer_review" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.masteringDeadline') }}</label>
              <input v-model="albumDeadlines[album.id].mastering" type="date" class="input-field w-full" />
            </div>
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.finalReviewDeadline') }}</label>
              <input v-model="albumDeadlines[album.id].final_review" type="date" class="input-field w-full" />
            </div>
          </div>
          <button
            @click="saveDeadlines(album.id)"
            :disabled="savingDeadlineAlbumId === album.id"
            class="btn-primary text-sm"
          >
            {{ savingDeadlineAlbumId === album.id ? t('settings.saving') : t('settings.saveDeadlines') }}
          </button>
        </div>
      </div>
    </section>
    <!-- Webhook -->
    <section v-if="albums.some(a => appStore.currentUser?.id === a.producer_id)">
      <h2 class="text-lg font-sans font-semibold text-foreground mb-4">{{ t('settings.webhookTitle') }}</h2>
      <div class="space-y-4">
        <div
          v-for="album in albums.filter(a => appStore.currentUser?.id === a.producer_id)"
          :key="'webhook-' + album.id"
          class="bg-card border border-border rounded-none p-6 space-y-4"
        >
          <h3 class="text-sm font-mono font-semibold text-foreground">{{ album.title }}</h3>
          <div v-if="albumWebhooks[album.id]" class="space-y-4">
            <div>
              <label class="block text-xs text-muted-foreground mb-1">{{ t('settings.webhookUrl') }}</label>
              <input v-model="albumWebhooks[album.id].url" class="input-field w-full text-sm" placeholder="https://..." />
            </div>
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" v-model="albumWebhooks[album.id].enabled" />
              <span>{{ t('settings.webhookEnabled') }}</span>
            </label>
            <div>
              <div class="text-xs text-muted-foreground mb-2">{{ t('settings.webhookEvents') }}</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label v-for="evt in WEBHOOK_EVENT_TYPES" :key="evt" class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="albumWebhooks[album.id].events.includes(evt)"
                    @change="toggleWebhookEvent(album.id, evt)"
                  />
                  <span class="font-mono text-xs">{{ evt }}</span>
                </label>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="saveWebhook(album.id)"
                :disabled="savingWebhookAlbumId === album.id"
                class="btn-primary text-sm"
              >
                {{ savingWebhookAlbumId === album.id ? t('settings.saving') : t('settings.webhookSave') }}
              </button>
              <button
                @click="testWebhook(album.id)"
                :disabled="testingWebhookAlbumId === album.id || !albumWebhooks[album.id].url"
                class="btn-secondary text-sm"
              >
                {{ testingWebhookAlbumId === album.id ? t('common.loading') : t('settings.webhookTest') }}
              </button>
              <span v-if="webhookTestResult[album.id] === true" class="text-xs text-success">✓</span>
              <span v-if="webhookTestResult[album.id] === false" class="text-xs text-error">✗</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
