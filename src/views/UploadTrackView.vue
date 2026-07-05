<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, r2Api, uploadToR2, uploadWithProgress } from '@/api'
import type { Album, Track } from '@/types'
import { useToast } from '@/composables/useToast'
import { useAppStore } from '@/stores/app'
import { extractAudioDuration } from '@/utils/audio'
import { Plus, Upload, X } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'

type ArtistEntry = {
  name: string
  uid: string
}

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const DRAFT_STORAGE_KEY = 'backkitchen_upload_draft_v1'

const MAX_AUDIO_SIZE = 200 * 1024 * 1024 // 200 MB
const appStore = useAppStore()
const { error: toastError, success: toastSuccess } = useToast()
const albums = ref<Album[]>([])
const loadingAlbums = ref(false)
const albumLoadError = ref('')
const uploading = ref(false)
const uploadProgress = ref(0)
const dragOver = ref(false)

const form = ref({
  title: '',
  album_id: null as number | null,
  bpm: '',
  original_title: '',
  original_artist: '',
  author_notes: '',
  artist_entries: [createArtistEntry({ prefillUid: true })] as ArtistEntry[],
})
const selectedFile = ref<File | null>(null)
const audioDuration = ref<number | null>(null)
const titleError = ref('')
const artistError = ref('')
const draftRestored = ref(false)
const needsFileReselect = ref(false)
const savedFileName = ref('')
const submitted = ref(false)

function validateTitle() {
  titleError.value = form.value.title.trim() ? '' : t('upload.titleRequired')
}

function formatDurationFull(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function extractFileMeta(file: File) {
  audioDuration.value = null
  try {
    audioDuration.value = await extractAudioDuration(file)
  } catch {
    // Not all formats support browser-side extraction
  }
}

const albumOptions = computed<SelectOption[]>(() =>
  albums.value.map((a) => ({ value: a.id, label: a.title }))
)

const selectedAlbum = computed(() =>
  albums.value.find(album => album.id === form.value.album_id) ?? null
)

const canProxySubmission = computed(() =>
  selectedAlbum.value?.producer_id != null
  && appStore.currentUser?.id != null
  && selectedAlbum.value.producer_id === appStore.currentUser.id
)

function currentUserUid(): string {
  const id = appStore.currentUser?.id
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? String(id) : ''
}

function createArtistEntry(options: { prefillUid?: boolean } = {}): ArtistEntry {
  return { name: '', uid: options.prefillUid ? currentUserUid() : '' }
}

function ensureArtistEntry() {
  if (form.value.artist_entries.length === 0) {
    form.value.artist_entries = [createArtistEntry({ prefillUid: true })]
  }
}

function addArtistEntry() {
  form.value.artist_entries.push(createArtistEntry())
}

function removeArtistEntry(index: number) {
  form.value.artist_entries.splice(index, 1)
  ensureArtistEntry()
  validateArtists()
}

function normalizedArtistEntries(): ArtistEntry[] {
  return form.value.artist_entries
    .map(entry => ({ name: entry.name.trim(), uid: entry.uid.trim() }))
    .filter(entry => entry.name || entry.uid)
}

function hasArtistDraftContent(): boolean {
  const defaultUid = currentUserUid()
  return form.value.artist_entries.some((entry, index) => {
    const name = entry.name.trim()
    const uid = entry.uid.trim()
    if (!name && !uid) return index > 0
    return Boolean(name || uid !== defaultUid)
  })
}

function dedupeNames(names: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  return result
}

const artistDisplayName = computed(() =>
  normalizedArtistEntries()
    .filter(entry => entry.name)
    .map(entry => entry.name)
    .join(' / ')
)

const selectedComposerIds = computed(() => {
  const ids = normalizedArtistEntries()
    .map(entry => parseArtistUid(entry.uid))
    .filter((id): id is number => id !== null)
  return Array.from(new Set(ids))
})

const externalComposerNames = computed(() =>
  dedupeNames(
    normalizedArtistEntries()
      .filter(entry => !entry.uid && entry.name)
      .map(entry => entry.name)
  )
)

function isValidArtistUid(uid: string): boolean {
  if (!/^[1-9]\d*$/.test(uid)) return false
  const parsed = Number(uid)
  return Number.isSafeInteger(parsed)
}

function parseArtistUid(uid: string): number | null {
  if (!uid) return null
  return isValidArtistUid(uid) ? Number(uid) : null
}

const autoProxySubmission = computed(() =>
  selectedComposerIds.value.length === 0
  && externalComposerNames.value.length > 0
  && canProxySubmission.value
)

const canSubmitArtists = computed(() => {
  const entries = normalizedArtistEntries()
  if (entries.length === 0) return false
  if (entries.some(entry => !entry.name || entry.name.length > 100)) return false
  if (entries.some(entry => entry.uid && !isValidArtistUid(entry.uid))) return false
  if (!artistDisplayName.value || artistDisplayName.value.length > 100) return false
  if (selectedComposerIds.value.length === 0 && externalComposerNames.value.length > 0 && !canProxySubmission.value) return false
  return selectedComposerIds.value.length > 0 || externalComposerNames.value.length > 0
})

function validateArtists() {
  const entries = normalizedArtistEntries()
  if (entries.some(entry => entry.uid && !entry.name)) {
    artistError.value = t('upload.artistNameRequiredForAccount')
    return
  }
  if (entries.length === 0 || !artistDisplayName.value) {
    artistError.value = t('upload.artistRequired')
    return
  }
  if (entries.some(entry => entry.uid && !isValidArtistUid(entry.uid))) {
    artistError.value = t('upload.artistUidInvalid')
    return
  }
  if (entries.some(entry => entry.name.length > 100)) {
    artistError.value = t('upload.artistNameTooLong')
    return
  }
  if (artistDisplayName.value.length > 100) {
    artistError.value = t('upload.artistDisplayTooLong')
    return
  }
  if (selectedComposerIds.value.length === 0 && externalComposerNames.value.length > 0 && !canProxySubmission.value) {
    artistError.value = t('upload.artistAccountRequired')
    return
  }
  artistError.value = ''
}

const hasDraft = computed(() => {
  return Boolean(
    selectedFile.value
    || savedFileName.value
    || form.value.title.trim()
    || form.value.bpm.trim()
    || form.value.original_title.trim()
    || form.value.original_artist.trim()
    || form.value.author_notes.trim()
    || hasArtistDraftContent(),
  )
})

function clearDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY)
  draftRestored.value = false
  needsFileReselect.value = false
  savedFileName.value = ''
}

function persistDraft() {
  if (!hasDraft.value) {
    clearDraft()
    return
  }

  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    ...form.value,
    saved_file_name: selectedFile.value?.name ?? savedFileName.value,
  }))
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
  if (!raw) {
    if (albums.value.length > 0) form.value.album_id = albums.value[0].id
    return
  }

  try {
    const draft = JSON.parse(raw) as Partial<typeof form.value> & {
      saved_file_name?: string
      artist?: string
      composer_ids?: unknown
      external_composer_names?: unknown
      external_submitter_name?: unknown
    }
    const rawComposerIds = Array.isArray((draft as any).composer_ids)
      ? (draft as any).composer_ids
          .filter((id: unknown): id is number | string => typeof id === 'number' || typeof id === 'string')
          .map((id: number | string) => String(id).trim())
          .filter(isValidArtistUid)
      : []
    const rawExternalComposerNames = Array.isArray((draft as any).external_composer_names)
      ? (draft as any).external_composer_names.filter((name: unknown): name is string => typeof name === 'string')
      : (typeof draft.external_submitter_name === 'string' && draft.external_submitter_name.trim()
          ? [draft.external_submitter_name]
          : [])
    const rawArtistEntries = Array.isArray((draft as any).artist_entries)
      ? (draft as any).artist_entries
          .filter((entry: unknown): entry is ArtistEntry =>
            typeof entry === 'object'
            && entry !== null
            && typeof (entry as ArtistEntry).name === 'string'
            && (
              typeof (entry as ArtistEntry).uid === 'string'
              || (entry as any).user_id === null
              || typeof (entry as any).user_id === 'number'
              || typeof (entry as any).user_id === 'string'
            )
          )
          .map((entry: ArtistEntry & { user_id?: number | string | null }) => ({
            name: entry.name,
            uid: typeof entry.uid === 'string'
              ? entry.uid
              : (entry.user_id === null || entry.user_id === undefined ? '' : String(entry.user_id)),
          }))
      : []
    const migratedArtistEntries = rawArtistEntries.length
      ? rawArtistEntries
      : [
          ...rawComposerIds.map((userId: string) => ({
            name: typeof draft.artist === 'string' && draft.artist.trim() ? draft.artist : '',
            uid: userId,
          })),
          ...rawExternalComposerNames.map((name: string) => ({ name, uid: '' })),
          ...(!rawComposerIds.length && !rawExternalComposerNames.length && typeof draft.artist === 'string' && draft.artist.trim()
            ? [{ name: draft.artist, uid: '' }]
            : []),
        ]
    form.value = {
      title: typeof draft.title === 'string' ? draft.title : '',
      album_id: typeof draft.album_id === 'number' && albums.value.some(album => album.id === draft.album_id)
        ? draft.album_id
        : (albums.value[0]?.id ?? null),
      bpm: typeof draft.bpm === 'string' ? draft.bpm : '',
      original_title: typeof draft.original_title === 'string' ? draft.original_title : '',
      original_artist: typeof draft.original_artist === 'string' ? draft.original_artist : '',
      author_notes: typeof draft.author_notes === 'string' ? draft.author_notes : '',
      artist_entries: migratedArtistEntries.length ? migratedArtistEntries : [createArtistEntry({ prefillUid: true })],
    }
    savedFileName.value = typeof draft.saved_file_name === 'string' ? draft.saved_file_name : ''
    needsFileReselect.value = Boolean(savedFileName.value)
    draftRestored.value = true
  } catch {
    clearDraft()
    if (albums.value.length > 0) form.value.album_id = albums.value[0].id
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasDraft.value && !uploading.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function loadAlbums() {
  loadingAlbums.value = true
  albumLoadError.value = ''
  try {
    albums.value = await albumApi.list()
    restoreDraft()
  } catch (e: any) {
    albums.value = []
    albumLoadError.value = e?.message || t('common.loadFailed')
  } finally {
    loadingAlbums.value = false
  }
}

onMounted(async () => {
  await loadAlbums()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (submitted.value || (!hasDraft.value && !uploading.value)) {
    return true
  }
  return window.confirm(t('upload.leaveConfirm'))
})

watch(form, () => {
  persistDraft()
}, { deep: true })

function validateFileSize(file: File): boolean {
  if (file.size > MAX_AUDIO_SIZE) {
    toastError(t('upload.fileTooLarge', { max: '200 MB' }))
    return false
  }
  return true
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    if (!validateFileSize(input.files[0])) { input.value = ''; return }
    selectedFile.value = input.files[0]
    savedFileName.value = input.files[0].name
    needsFileReselect.value = false
    if (!form.value.title) {
      form.value.title = input.files[0].name.replace(/\.[^/.]+$/, '')
    }
    extractFileMeta(input.files[0])
    persistDraft()
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files?.[0]) {
    if (!validateFileSize(e.dataTransfer.files[0])) return
    selectedFile.value = e.dataTransfer.files[0]
    savedFileName.value = e.dataTransfer.files[0].name
    needsFileReselect.value = false
    if (!form.value.title) {
      form.value.title = e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, '')
    }
    extractFileMeta(e.dataTransfer.files[0])
    persistDraft()
  }
}

async function upload() {
  validateTitle()
  validateArtists()
  if (titleError.value || artistError.value) return
  if (!selectedFile.value) return
  if (albumLoadError.value) {
    toastError(albumLoadError.value)
    return
  }
  if (!form.value.album_id) {
    toastError(t('upload.albumRequired'))
    return
  }
  uploading.value = true
  uploadProgress.value = 0
  try {
    let track: Track
    const artist = artistDisplayName.value
    const proxySubmission = autoProxySubmission.value
    const externalSubmitterName = proxySubmission ? (externalComposerNames.value[0] ?? null) : null
    const composerIds = selectedComposerIds.value
    if (appStore.r2Enabled) {
      // R2 presigned upload flow
      const file = selectedFile.value
      const [presigned, duration] = await Promise.all([
        r2Api.requestTrackUpload({
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
          album_id: form.value.album_id,
          title: form.value.title,
          artist,
          bpm: form.value.bpm || null,
          original_title: form.value.original_title || null,
          original_artist: form.value.original_artist || null,
          author_notes: form.value.author_notes || null,
          proxy_submission: proxySubmission,
          external_submitter_name: externalSubmitterName,
          external_composer_names: externalComposerNames.value,
          composer_ids: composerIds,
        }),
        extractAudioDuration(file).catch(() => null),
      ])
      await uploadToR2(presigned.upload_url, file, file.type || 'application/octet-stream', (p) => {
        uploadProgress.value = p
      })
      track = await r2Api.confirmTrackUpload({
        upload_id: presigned.upload_id,
        object_key: presigned.object_key,
        duration,
        album_id: form.value.album_id,
        title: form.value.title,
        artist,
        bpm: form.value.bpm || null,
        original_title: form.value.original_title || null,
        original_artist: form.value.original_artist || null,
        author_notes: form.value.author_notes || null,
        proxy_submission: proxySubmission,
        external_submitter_name: externalSubmitterName,
        external_composer_names: externalComposerNames.value,
        composer_ids: composerIds,
      })
    } else {
      // Legacy FormData upload
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      formData.append('title', form.value.title)
      formData.append('artist', artist)
      formData.append('album_id', String(form.value.album_id))
      if (form.value.bpm) formData.append('bpm', form.value.bpm)
      if (form.value.original_title) formData.append('original_title', form.value.original_title)
      if (form.value.original_artist) formData.append('original_artist', form.value.original_artist)
      if (form.value.author_notes) formData.append('author_notes', form.value.author_notes)
      if (proxySubmission && externalSubmitterName) {
        formData.append('proxy_submission', 'true')
        formData.append('external_submitter_name', externalSubmitterName)
      }
      for (const externalName of externalComposerNames.value) {
        formData.append('external_composer_names', externalName)
      }
      for (const composerId of composerIds) {
        formData.append('composer_ids', String(composerId))
      }
      track = await uploadWithProgress<Track>(
        '/tracks', formData, (p) => { uploadProgress.value = p }
      )
    }
    toastSuccess(t('upload.uploadSuccess'))
    clearDraft()
    submitted.value = true
    router.push({ path: `/tracks/${track.id}`, query: { returnTo: route.path } })
  } catch (err: any) {
    toastError(err.message || t('upload.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-2xl font-mono font-bold text-foreground">{{ t('upload.heading') }}</h1>

    <div v-if="albumLoadError" class="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-error">{{ albumLoadError }}</p>
      <button class="btn-secondary text-sm" :disabled="loadingAlbums" @click="loadAlbums">
        {{ loadingAlbums ? t('common.loading') : t('common.retry') }}
      </button>
    </div>

    <div v-if="draftRestored || needsFileReselect" class="card border-primary/30 bg-primary/5 space-y-2">
      <p class="text-sm text-foreground">{{ t('upload.draftRestored') }}</p>
      <p v-if="needsFileReselect && savedFileName" class="text-xs text-muted-foreground">
        {{ t('upload.reselectFile', { file: savedFileName }) }}
      </p>
    </div>

    <!-- Drop Zone -->
    <div
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
      :class="[
        'border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer',
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      ]"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="onFileSelect" />
      <Upload class="w-12 h-12 mx-auto text-muted-foreground mb-3" :stroke-width="1.5" />
      <p v-if="!selectedFile" class="text-muted-foreground">
        {{ t('upload.dropHint') }} <span class="text-primary">{{ t('upload.browse') }}</span>
      </p>
      <div v-else class="text-foreground">
        <p class="font-medium">{{ selectedFile.name }}</p>
        <div class="flex items-center justify-center gap-3 text-sm text-muted-foreground mt-1">
          <span>{{ formatFileSize(selectedFile.size) }}</span>
          <template v-if="audioDuration !== null">
            <span class="text-border">·</span>
            <span class="font-mono text-info">{{ formatDurationFull(audioDuration) }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Form -->
    <div class="card space-y-4">
      <div>
        <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.trackTitle') }}</label>
        <input v-model="form.title" class="input-field w-full" :class="{ 'border-error': titleError }" :placeholder="t('upload.titlePlaceholder')" @blur="validateTitle" />
        <p v-if="titleError" class="text-xs text-error mt-1">{{ titleError }}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.album') }}</label>
          <CustomSelect v-model="form.album_id" :options="albumOptions" :placeholder="loadingAlbums ? t('common.loading') : t('upload.noAlbum')" />
        </div>
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.bpm') }}</label>
          <input v-model="form.bpm" type="text" class="input-field w-full" :placeholder="t('upload.bpmPlaceholder')" />
        </div>
      </div>
      <div class="border border-border bg-background p-4 space-y-4">
        <div>
          <label class="block text-sm font-mono font-semibold text-foreground">{{ t('upload.artist') }}</label>
          <p class="text-xs text-muted-foreground mt-1">{{ t('upload.artistHint') }}</p>
        </div>
        <div class="space-y-3">
          <div
            v-for="(entry, index) in form.artist_entries"
            :key="index"
            data-testid="artist-entry-row"
            class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_40px] sm:items-center"
          >
            <input
              v-model="entry.name"
              class="input-field min-w-0 flex-1"
              :class="{ 'border-error': artistError }"
              :placeholder="t('upload.artistNamePlaceholder')"
              @blur="validateArtists"
            />
            <input
              v-model="entry.uid"
              type="text"
              inputmode="numeric"
              class="input-field min-w-0 !h-10"
              :class="{ 'border-error': artistError }"
              :placeholder="t('upload.artistUidPlaceholder')"
              :aria-label="t('upload.artistUidLabel')"
              @blur="validateArtists"
            />
            <button
              type="button"
              class="btn-secondary !h-10 !w-10 !p-0 inline-flex items-center justify-center"
              :aria-label="t('common.delete')"
              @click="removeArtistEntry(index)"
            >
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </div>
        <button type="button" class="btn-secondary text-sm inline-flex items-center gap-2" @click="addArtistEntry">
          <Plus class="w-4 h-4" :stroke-width="2" />
          {{ t('upload.addArtist') }}
        </button>
        <p v-if="autoProxySubmission" class="text-xs text-warning">{{ t('upload.autoProxySubmissionHint') }}</p>
        <p v-else class="text-xs text-muted-foreground">{{ t('upload.artistBindingHint') }}</p>
        <p v-if="artistError" class="text-xs text-error">{{ artistError }}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.originalTitle') }}</label>
          <input v-model="form.original_title" type="text" class="input-field w-full" :placeholder="t('upload.originalTitlePlaceholder')" />
        </div>
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.originalArtist') }}</label>
          <input v-model="form.original_artist" type="text" class="input-field w-full" :placeholder="t('upload.originalArtistPlaceholder')" />
        </div>
      </div>

      <div>
        <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.authorNotes') }}</label>
        <textarea v-model="form.author_notes" class="textarea-field w-full" rows="3" :placeholder="t('upload.authorNotesPlaceholder')"></textarea>
      </div>

      <div class="flex gap-3">
        <button @click="router.back()" :disabled="uploading" class="btn-secondary text-sm flex-1">
          {{ t('common.cancel') }}
        </button>
        <button
          @click="upload"
          :disabled="uploading || loadingAlbums || !!albumLoadError || !selectedFile || !form.title || !canSubmitArtists"
          :class="[
            'flex-1 text-sm font-medium px-4 py-3 rounded-full transition-colors',
            uploading || loadingAlbums || !!albumLoadError || !selectedFile || !form.title || !canSubmitArtists
              ? 'bg-border text-muted-foreground cursor-not-allowed'
              : 'btn-primary'
          ]"
        >
          {{ uploading ? t('upload.uploading') : t('upload.submit') }}
        </button>
      </div>
      <div v-if="uploading" class="space-y-1">
        <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
        </div>
        <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
      </div>
    </div>
  </div>
</template>
