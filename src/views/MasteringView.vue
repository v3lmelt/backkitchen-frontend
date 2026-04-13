<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { trackApi, discussionApi, r2Api, uploadToR2, API_ORIGIN, resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import { useTrackStore } from '@/stores/tracks'
import type { Track, Discussion, EditHistory, MasterDelivery, WorkflowConfig } from '@/types'
import { formatLocaleDate } from '@/utils/time'
import { extractAudioDuration } from '@/utils/audio'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import SkeletonLoader from '@/components/common/SkeletonLoader.vue'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import CommentInput from '@/components/common/CommentInput.vue'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'
import { useAudioDownload } from '@/composables/useAudioDownload'
import { useToast } from '@/composables/useToast'
import { useTrackWebSocket } from '@/composables/useTrackWebSocket'
import { ChevronLeft, Upload, Pencil, Trash2, Check, Play } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const trackStore = useTrackStore()
const { t, locale } = useI18n()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const { success: toastSuccess, error: toastError } = useToast()

const MAX_AUDIO_SIZE = 200 * 1024 * 1024

const trackId = computed(() => Number(route.params.id))
const track = ref<Track | null>(null)
const masterDeliveries = ref<MasterDelivery[]>([])
const discussions = ref<Discussion[]>([])
const workflowConfig = ref<WorkflowConfig | null>(null)
const loading = ref(true)
const loadError = ref(false)

// Mastering notes editing
const editingMasteringNotes = ref(false)
const masteringNotesForm = ref('')
const savingMasteringNotes = ref(false)

// Discussions
const postingDiscussion = ref(false)
const postingDiscussionProgress = ref(0)
const discussionInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const editingDiscussionId = ref<number | null>(null)
const editingDiscussionContent = ref('')
const discussionHistoryItems = ref<EditHistory[]>([])
const showHistoryForDiscussionId = ref<number | null>(null)

// Delivery upload
const uploadFile = ref<File | null>(null)
const localDeliveryPreviewUrl = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')

// Master delivery comparison
const showMasterCompare = ref(false)
const selectedCompareMasterDeliveryId = ref<number | null>(null)

// Computed
const isSubmitter = computed(() => track.value?.submitter_id === appStore.currentUser?.id)
const isMasteringEngineer = computed(() => track.value?.mastering_engineer_id === appStore.currentUser?.id)
const canSeeMasteringDiscussion = computed(() => {
  const userId = appStore.currentUser?.id
  if (!userId || !track.value) return false
  return userId === track.value.submitter_id
    || userId === track.value.producer_id
    || userId === track.value.mastering_engineer_id
})

const masterAudioUrl = computed(() => {
  const d = track.value?.current_master_delivery
  if (!d) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-audio?v=${d.delivery_number}&c=${d.workflow_cycle ?? 1}`
})

const sortedMasterDeliveries = computed(() =>
  [...masterDeliveries.value].sort((a, b) => {
    if (a.workflow_cycle !== b.workflow_cycle) return b.workflow_cycle - a.workflow_cycle
    return b.delivery_number - a.delivery_number
  }),
)

const olderMasterDeliveries = computed(() => {
  const currentId = track.value?.current_master_delivery?.id ?? null
  return sortedMasterDeliveries.value.filter(d => d.id !== currentId)
})

const masterCompareOptions = computed<SelectOption[]>(() =>
  olderMasterDeliveries.value.map(d => ({
    value: d.id,
    label: masterDeliveryOptionLabel(d),
  })),
)

const selectedCompareMasterDelivery = computed(() =>
  olderMasterDeliveries.value.find(d => d.id === selectedCompareMasterDeliveryId.value) ?? null,
)

const selectedCompareMasterAudioUrl = computed(() => {
  const d = selectedCompareMasterDelivery.value
  if (!d) return ''
  return `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${d.id}/audio?v=${d.delivery_number}&c=${d.workflow_cycle}`
})

const canApproveFinal = computed(() => {
  if (!track.value?.current_master_delivery) return false
  const userId = appStore.currentUser?.id
  if (!userId) return false
  if (userId === track.value.producer_id) return !track.value.current_master_delivery.producer_approved_at
  if (userId === track.value.submitter_id) return !track.value.current_master_delivery.submitter_approved_at
  return false
})

const canUploadDelivery = computed(() => isMasteringEngineer.value && track.value != null)

const { downloading, downloadProgress, downloadTrackAudio, downloadAudioAsset } = useAudioDownload()
const handleMasterDownload = () => downloadTrackAudio(masterAudioUrl, track, '_master')

// WebSocket
const wsReloading = ref(false)
const wsHadConnection = ref(false)
const { connected: wsConnected } = useTrackWebSocket(trackId.value, async () => {
  if (wsReloading.value) return
  wsReloading.value = true
  await nextTick()
  await loadData()
  wsReloading.value = false
})

watch(wsConnected, (val) => {
  if (val) wsHadConnection.value = true
})

onMounted(loadData)
onBeforeUnmount(() => resetDeliveryPreview())

onBeforeRouteLeave(() => {
  if (!uploading.value && !uploadFile.value) return true
  return window.confirm(t('workflowStep.leaveUploadConfirm'))
})

async function loadData() {
  if (!track.value) loading.value = true
  loadError.value = false
  try {
    const detail = await trackApi.get(trackId.value)
    track.value = detail.track
    trackStore.setCurrentTrack(detail.track)
    masterDeliveries.value = detail.master_deliveries ?? []
    workflowConfig.value = detail.workflow_config ?? null

    if (canSeeMasteringDiscussion.value) {
      discussions.value = await discussionApi.list(trackId.value, 'mastering')
    }
  } catch {
    trackStore.setCurrentTrack(null)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function goBack() {
  const returnTo = route.query.returnTo
  if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
    router.push(returnTo)
  } else {
    router.push(`/tracks/${trackId.value}`)
  }
}

// Mastering notes
function startEditMasteringNotes() {
  masteringNotesForm.value = track.value?.mastering_notes ?? ''
  editingMasteringNotes.value = true
}

async function saveMasteringNotes() {
  if (!track.value) return
  savingMasteringNotes.value = true
  try {
    const updated = await trackApi.updateMasteringNotes(track.value.id, masteringNotesForm.value.trim() || null)
    track.value = { ...track.value, mastering_notes: updated.mastering_notes }
    editingMasteringNotes.value = false
    toastSuccess(t('trackDetail.notesSaved'))
  } catch {
    toastError(t('common.error'))
  } finally {
    savingMasteringNotes.value = false
  }
}

// Discussion CRUD
async function handleDiscussionSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  postingDiscussion.value = true
  postingDiscussionProgress.value = 0
  try {
    const d = await discussionApi.create(trackId.value, {
      content: payload.content.trim(),
      phase: 'mastering',
      images: payload.images.length ? payload.images : undefined,
      audios: payload.audios.length ? payload.audios : undefined,
    }, (p) => { postingDiscussionProgress.value = p })
    discussions.value.push(d)
    discussionInputRef.value?.reset()
  } finally {
    postingDiscussion.value = false
  }
}

function startEditDiscussion(d: Discussion) {
  editingDiscussionId.value = d.id
  editingDiscussionContent.value = d.content
}

async function saveEditDiscussion(d: Discussion) {
  const content = editingDiscussionContent.value.trim()
  if (!content) return
  try {
    const updated = await discussionApi.update(d.id, content)
    const idx = discussions.value.findIndex(x => x.id === d.id)
    if (idx !== -1) discussions.value[idx] = updated
    editingDiscussionId.value = null
  } catch { toastError(t('common.error')) }
}

async function deleteDiscussion(d: Discussion) {
  try {
    await discussionApi.delete(d.id)
    discussions.value = discussions.value.filter(x => x.id !== d.id)
  } catch { toastError(t('common.error')) }
}

async function showDiscussionHistory(discussionId: number) {
  showHistoryForDiscussionId.value = discussionId
  try {
    discussionHistoryItems.value = await discussionApi.history(discussionId)
  } catch { discussionHistoryItems.value = [] }
}

function closeDiscussionHistory() {
  showHistoryForDiscussionId.value = null
  discussionHistoryItems.value = []
}

function openImage(url: string) {
  window.open(resolveAssetUrl(url), '_blank')
}

// Delivery upload
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > MAX_AUDIO_SIZE) {
    toastError(t('workflowStep.fileTooLarge'))
    input.value = ''
    return
  }
  uploadFile.value = file
  resetDeliveryPreview()
  localDeliveryPreviewUrl.value = URL.createObjectURL(file)
}

function resetDeliveryPreview() {
  if (localDeliveryPreviewUrl.value) {
    URL.revokeObjectURL(localDeliveryPreviewUrl.value)
    localDeliveryPreviewUrl.value = ''
  }
}

async function handleUploadDelivery() {
  if (!uploadFile.value || !track.value) return
  uploading.value = true
  uploadProgress.value = 0
  uploadError.value = ''
  try {
    const file = uploadFile.value
    if (appStore.r2Enabled) {
      const [presigned, duration] = await Promise.all([
        r2Api.requestMasterDeliveryUpload(trackId.value, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (p) => {
        uploadProgress.value = p
      })
      await r2Api.confirmMasterDeliveryUpload(trackId.value, {
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
      })
    } else {
      await trackApi.uploadMasterDelivery(trackId.value, file, (p) => {
        uploadProgress.value = p
      })
    }
    uploadFile.value = null
    resetDeliveryPreview()
    toastSuccess(t('workflowStep.deliveryUploaded'))
    await loadData()
  } catch (err: any) {
    uploadError.value = err.message || t('workflowStep.uploadFailed')
  } finally {
    uploading.value = false
  }
}

// Approve final
async function handleApproveFinal() {
  if (!track.value) return
  try {
    const updated = await trackApi.approveFinalReview(track.value.id)
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.approved'))
  } catch {
    toastError(t('common.error'))
  }
}

// Confirm delivery
async function handleConfirmDelivery() {
  if (!track.value?.current_master_delivery) return
  try {
    const updated = await trackApi.confirmDelivery(track.value.id, track.value.current_master_delivery.id)
    track.value = updated
    await loadData()
    toastSuccess(t('masteringPage.deliveryConfirmed'))
  } catch {
    toastError(t('common.error'))
  }
}

const canConfirmDelivery = computed(() => {
  if (!track.value?.current_master_delivery) return false
  if (track.value.current_master_delivery.confirmed_at) return false
  return isMasteringEngineer.value
})

// Master compare
function toggleMasterCompare() {
  showMasterCompare.value = !showMasterCompare.value
  if (!showMasterCompare.value) selectedCompareMasterDeliveryId.value = null
}

function masterDeliveryOptionLabel(delivery: MasterDelivery): string {
  const version = `v${delivery.delivery_number}`
  const cycle = track.value && delivery.workflow_cycle !== track.value.workflow_cycle
    ? ` · C${delivery.workflow_cycle}`
    : ''
  return `${version}${cycle} · ${fmtDate(delivery.created_at)}`
}

function compareWithMasterDelivery(deliveryId: number) {
  showMasterCompare.value = true
  selectedCompareMasterDeliveryId.value = deliveryId
}

function handleMasterVersionDownload(delivery: MasterDelivery) {
  const cycleSuffix = track.value && delivery.workflow_cycle !== track.value.workflow_cycle
    ? `_cycle${delivery.workflow_cycle}`
    : ''
  const url = `${API_ORIGIN}/api/tracks/${trackId.value}/master-deliveries/${delivery.id}/audio?v=${delivery.delivery_number}&c=${delivery.workflow_cycle}`
  downloadAudioAsset(url, `${track.value?.title ?? 'track'}_master_v${delivery.delivery_number}${cycleSuffix}`, delivery.file_path)
}

watch(olderMasterDeliveries, (deliveries) => {
  if (deliveries.length > 0) return
  showMasterCompare.value = false
  selectedCompareMasterDeliveryId.value = null
})
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto"><SkeletonLoader :rows="5" :card="true" /></div>
  <div v-else-if="loadError" class="card max-w-md mx-auto mt-12 text-center space-y-3">
    <p class="text-sm text-error">{{ t('common.loadFailed') }}</p>
    <button @click="loadData" class="btn-secondary text-sm">{{ t('common.retry') }}</button>
  </div>
  <div v-else-if="track" class="max-w-4xl mx-auto space-y-6">
    <!-- WebSocket disconnect banner -->
    <div
      v-if="wsHadConnection && !wsConnected"
      class="flex items-center gap-2 px-4 py-2.5 bg-warning-bg border border-warning/30 text-warning text-sm font-mono"
    >
      <span class="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0"></span>
      {{ t('trackDetail.liveDisconnected') }}
    </div>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <StatusBadge :status="track.status" type="track" :variant="track.workflow_variant" :label="track.workflow_step?.label ?? null" />
          <span v-if="wsConnected" class="inline-flex items-center gap-1.5 text-xs text-success font-mono">
            <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
            {{ t('trackDetail.live') }}
          </span>
        </div>
        <h1 class="text-xl sm:text-2xl font-mono font-bold text-foreground">{{ t('masteringPage.heading') }}</h1>
        <p class="text-sm text-muted-foreground">{{ track.title }} · {{ track.artist ?? '--' }}</p>
      </div>
      <button @click="goBack" class="btn-secondary text-sm flex-shrink-0 self-start flex items-center gap-1.5">
        <ChevronLeft class="w-4 h-4" :stroke-width="2" />
        {{ t('common.backToTrack') }}
      </button>
    </div>

    <!-- Mastering Notes -->
    <div class="card space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('trackDetail.masteringNotes') }}</h3>
        <button v-if="isSubmitter && !editingMasteringNotes" @click="startEditMasteringNotes" class="text-xs text-primary hover:text-primary-hover font-mono">
          {{ t('common.edit') }}
        </button>
      </div>
      <template v-if="editingMasteringNotes">
        <textarea v-model="masteringNotesForm" class="textarea-field w-full" rows="3" :placeholder="t('trackDetail.masteringNotesPlaceholder')"></textarea>
        <div class="flex gap-2">
          <button @click="saveMasteringNotes" :disabled="savingMasteringNotes" class="btn-primary text-xs px-3 py-1.5">{{ t('common.save') }}</button>
          <button @click="editingMasteringNotes = false" class="btn-secondary text-xs px-3 py-1.5">{{ t('common.cancel') }}</button>
        </div>
      </template>
      <p v-else-if="track.mastering_notes" class="text-sm text-muted-foreground whitespace-pre-wrap">{{ track.mastering_notes }}</p>
      <p v-else class="text-xs text-muted-foreground italic">{{ t('trackDetail.noMasteringNotes') }}</p>
    </div>

    <!-- Current master delivery player -->
    <div v-if="masterAudioUrl" class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono font-semibold text-foreground">
          {{ t('masteringPage.currentDelivery') }}
          <span v-if="track.current_master_delivery" class="text-xs text-muted-foreground ml-1">v{{ track.current_master_delivery.delivery_number }}</span>
        </h3>
        <div class="flex items-center gap-2">
          <button v-if="olderMasterDeliveries.length > 0" @click="toggleMasterCompare" class="btn-secondary text-xs px-3 py-1">
            {{ t('compare.title') }}
          </button>
          <button @click="handleMasterDownload" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
            {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
          </button>
        </div>
      </div>
      <div v-if="showMasterCompare && olderMasterDeliveries.length > 0" class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ t('compare.selectVersion') }}</span>
        <CustomSelect v-model="selectedCompareMasterDeliveryId" :options="masterCompareOptions" :placeholder="`-- ${t('compare.selectVersion')} --`" size="sm" />
        <button v-if="selectedCompareMasterDeliveryId" @click="selectedCompareMasterDeliveryId = null" class="text-xs text-muted-foreground hover:text-foreground">
          {{ t('compare.clear') }}
        </button>
      </div>
      <WaveformPlayer :audio-url="masterAudioUrl" :issues="[]" :track-id="trackId" playback-scope="master" :compare-audio-url="selectedCompareMasterAudioUrl" />

      <!-- Approval status + actions -->
      <div class="card space-y-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.approvalStatus') }}</h3>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('trackDetail.producer') }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.producer_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.producer_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{{ t('trackDetail.submitter') }}</span>
          <span class="text-xs" :class="track.current_master_delivery?.submitter_approved_at ? 'text-success' : 'text-muted-foreground'">
            {{ track.current_master_delivery?.submitter_approved_at ? t('common.approved') : t('common.pending') }}
          </span>
        </div>
        <div class="flex gap-2 pt-1">
          <button v-if="canConfirmDelivery" @click="handleConfirmDelivery" class="btn-primary text-sm flex items-center gap-1.5">
            <Check class="w-4 h-4" :stroke-width="2" />
            {{ t('masteringPage.confirmDelivery') }}
          </button>
          <button v-if="canApproveFinal" @click="handleApproveFinal" class="btn-primary text-sm flex items-center gap-1.5">
            <Check class="w-4 h-4" :stroke-width="2" />
            {{ t('masteringPage.approveDelivery') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Upload delivery -->
    <div v-if="canUploadDelivery" class="card space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('masteringPage.uploadDelivery') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('masteringPage.uploadHint') }}</p>
      <input type="file" accept="audio/*" @change="onFileChange" class="input-field w-full" />
      <div v-if="uploadFile && localDeliveryPreviewUrl" class="space-y-4 border border-border bg-background rounded-none p-4">
        <div class="space-y-1">
          <h4 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.deliveryPreviewHeading') }}</h4>
          <p class="text-sm text-muted-foreground">{{ t('workflowStep.deliveryPreviewNotice') }}</p>
        </div>
        <WaveformPlayer :audio-url="localDeliveryPreviewUrl" :issues="[]" playback-scope="local" :compact="true" :height="96" />
        <div class="flex flex-wrap gap-2">
          <button @click="handleUploadDelivery" :disabled="uploading" class="btn-primary text-sm h-10 inline-flex items-center justify-center">
            <Upload class="w-4 h-4 mr-2" />
            {{ uploading ? t('workflowStep.uploading') : t('workflowStep.confirmUploadDelivery') }}
          </button>
          <button @click="uploadFile = null; resetDeliveryPreview()" :disabled="uploading" class="btn-secondary text-sm">
            {{ t('workflowStep.clearSelectedDelivery') }}
          </button>
        </div>
      </div>
      <div v-if="uploading" class="space-y-1">
        <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
        </div>
        <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
      </div>
      <div v-if="uploadError" class="text-sm text-error">{{ uploadError }}</div>
    </div>

    <!-- Master delivery version history -->
    <div v-if="sortedMasterDeliveries.length > 0" class="card space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-mono font-semibold text-foreground">{{ t('workflowStep.masterVersionHistory') }}</h3>
        <span class="text-xs text-muted-foreground">{{ sortedMasterDeliveries.length }}</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="delivery in sortedMasterDeliveries"
          :key="delivery.id"
          class="flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="space-y-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-mono font-semibold text-foreground">{{ masterDeliveryOptionLabel(delivery) }}</span>
              <span v-if="delivery.id === track.current_master_delivery?.id" class="bg-border text-foreground px-2 py-1 rounded-full text-[11px] font-mono">
                {{ t('compare.currentVersion') }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ delivery.confirmed_at ? t('workflowStep.deliveryConfirmed') : t('workflowStep.deliveryPendingConfirmation') }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button v-if="delivery.id !== track.current_master_delivery?.id" @click="compareWithMasterDelivery(delivery.id)" class="btn-secondary text-xs px-3 py-1">
              {{ t('compare.title') }}
            </button>
            <button @click="handleMasterVersionDownload(delivery)" :disabled="downloading" class="btn-secondary text-xs px-3 py-1">
              {{ downloading ? `${downloadProgress}%` : t('common.downloadAudio') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mastering Discussion -->
    <div v-if="canSeeMasteringDiscussion" class="card space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground">
        {{ t('masteringPage.discussionsHeading', { count: discussions.length }) }}
      </h3>
      <div v-if="discussions.length === 0" class="text-sm text-muted-foreground">
        {{ t('masteringPage.noDiscussions') }}
      </div>
      <div v-else class="space-y-3">
        <div v-for="d in discussions" :key="d.id" class="flex gap-3 py-3 border-b border-border last:border-0">
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            :style="{ backgroundColor: d.author?.avatar_color || '#6366f1' }"
          >
            {{ d.author?.display_name?.charAt(0) || '?' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-foreground">{{ d.author?.display_name || '?' }}</span>
              <span class="text-xs text-muted-foreground">{{ fmtDate(d.created_at) }}</span>
              <button
                v-if="d.edited_at"
                class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                @click="showDiscussionHistory(d.id)"
              >
                ({{ t('editHistory.edited') }})
              </button>
              <template v-if="d.author_id === appStore.currentUser?.id">
                <button @click="startEditDiscussion(d)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                  <Pencil class="w-3.5 h-3.5" :stroke-width="2" />
                </button>
                <button @click="deleteDiscussion(d)" class="text-muted-foreground hover:text-error transition-colors">
                  <Trash2 class="w-3.5 h-3.5" :stroke-width="2" />
                </button>
              </template>
            </div>
            <template v-if="editingDiscussionId === d.id">
              <textarea
                v-model="editingDiscussionContent"
                class="textarea-field w-full text-sm mt-1"
                rows="3"
                @keydown.ctrl.enter="saveEditDiscussion(d)"
                @keydown.meta.enter="saveEditDiscussion(d)"
              />
              <div class="flex gap-2 mt-1">
                <button @click="saveEditDiscussion(d)" class="btn-primary text-xs">{{ t('common.save') }}</button>
                <button @click="editingDiscussionId = null" class="btn-secondary text-xs">{{ t('common.cancel') }}</button>
              </div>
            </template>
            <template v-else>
              <p class="text-sm text-foreground mt-1 whitespace-pre-wrap">{{ d.content }}</p>
            </template>
            <div v-if="d.images?.length" class="flex gap-2 mt-2">
              <img
                v-for="img in d.images"
                :key="img.id"
                :src="resolveAssetUrl(img.image_url)"
                class="h-20 rounded border border-border object-cover cursor-pointer"
                @click="openImage(img.image_url)"
              />
            </div>
            <div v-if="d.audios?.length" class="space-y-2 mt-2">
              <div v-for="audio in d.audios" :key="audio.id" class="flex items-center gap-2 px-3 py-2 border border-border bg-background rounded-none">
                <Play class="w-4 h-4 text-primary flex-shrink-0" :stroke-width="2" />
                <a :href="resolveAssetUrl(audio.audio_url)" target="_blank" class="text-sm text-primary hover:text-primary-hover truncate">
                  {{ audio.original_filename }}
                </a>
                <span v-if="audio.duration" class="text-xs text-muted-foreground ml-auto shrink-0">
                  {{ Math.floor(audio.duration / 60) }}:{{ String(Math.floor(audio.duration % 60)).padStart(2, '0') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <CommentInput
        ref="discussionInputRef"
        :placeholder="t('masteringPage.discussionPlaceholder')"
        :submit-label="t('masteringPage.postDiscussion')"
        :submitting="postingDiscussion"
        :upload-progress="postingDiscussionProgress"
        :enable-audio="true"
        @submit="handleDiscussionSubmit"
      />
    </div>
  </div>

  <EditHistoryModal
    v-if="showHistoryForDiscussionId !== null"
    :items="discussionHistoryItems"
    @close="closeDiscussionHistory"
  />
</template>
