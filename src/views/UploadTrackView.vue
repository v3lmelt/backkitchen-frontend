<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { albumApi, r2Api, uploadToR2, uploadWithProgress } from '@/api'
import type { Album, Track } from '@/types'
import { useToast } from '@/composables/useToast'
import { useAppStore } from '@/stores/app'
import { extractAudioDuration } from '@/utils/audio'
import { Upload } from 'lucide-vue-next'
import CustomSelect from '@/components/common/CustomSelect.vue'
import type { SelectOption } from '@/components/common/CustomSelect.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const DRAFT_STORAGE_KEY = 'backkitchen_upload_draft_v1'

const MAX_AUDIO_SIZE = 200 * 1024 * 1024 // 200 MB
const appStore = useAppStore()
const { error: toastError, success: toastSuccess } = useToast()
const albums = ref<Album[]>([])
const uploading = ref(false)
const uploadProgress = ref(0)
const dragOver = ref(false)

const form = ref({
  title: '',
  artist: '',
  album_id: null as number | null,
  bpm: '',
  original_title: '',
  original_artist: '',
  author_notes: '',
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
function validateArtist() {
  artistError.value = form.value.artist.trim() ? '' : t('upload.artistRequired')
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

const hasDraft = computed(() => {
  return Boolean(
    selectedFile.value
    || savedFileName.value
    || form.value.title.trim()
    || form.value.artist.trim()
    || form.value.bpm.trim()
    || form.value.original_title.trim()
    || form.value.original_artist.trim()
    || form.value.author_notes.trim(),
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
    const draft = JSON.parse(raw) as Partial<typeof form.value> & { saved_file_name?: string }
    form.value = {
      title: typeof draft.title === 'string' ? draft.title : '',
      artist: typeof draft.artist === 'string' ? draft.artist : '',
      album_id: typeof draft.album_id === 'number' && albums.value.some(album => album.id === draft.album_id)
        ? draft.album_id
        : (albums.value[0]?.id ?? null),
      bpm: typeof draft.bpm === 'string' ? draft.bpm : '',
      original_title: typeof draft.original_title === 'string' ? draft.original_title : '',
      original_artist: typeof draft.original_artist === 'string' ? draft.original_artist : '',
      author_notes: typeof draft.author_notes === 'string' ? draft.author_notes : '',
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

onMounted(async () => {
  albums.value = await albumApi.list()
  restoreDraft()
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
  validateArtist()
  if (titleError.value || artistError.value) return
  if (!selectedFile.value) return
  if (!form.value.album_id) {
    toastError(t('upload.albumRequired'))
    return
  }
  uploading.value = true
  uploadProgress.value = 0
  try {
    let track: Track
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
          artist: form.value.artist,
          bpm: form.value.bpm || null,
          original_title: form.value.original_title || null,
          original_artist: form.value.original_artist || null,
          author_notes: form.value.author_notes || null,
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
        artist: form.value.artist,
        bpm: form.value.bpm || null,
        original_title: form.value.original_title || null,
        original_artist: form.value.original_artist || null,
        author_notes: form.value.author_notes || null,
      })
    } else {
      // Legacy FormData upload
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      formData.append('title', form.value.title)
      formData.append('artist', form.value.artist)
      formData.append('album_id', String(form.value.album_id))
      if (form.value.bpm) formData.append('bpm', form.value.bpm)
      if (form.value.original_title) formData.append('original_title', form.value.original_title)
      if (form.value.original_artist) formData.append('original_artist', form.value.original_artist)
      if (form.value.author_notes) formData.append('author_notes', form.value.author_notes)
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
      <div>
        <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.artist') }}</label>
        <input v-model="form.artist" class="input-field w-full" :class="{ 'border-error': artistError }" :placeholder="t('upload.artistPlaceholder')" @blur="validateArtist" />
        <p v-if="artistError" class="text-xs text-error mt-1">{{ artistError }}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.album') }}</label>
          <CustomSelect v-model="form.album_id" :options="albumOptions" :placeholder="t('upload.noAlbum')" />
        </div>
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.bpm') }}</label>
          <input v-model="form.bpm" type="text" class="input-field w-full" :placeholder="t('upload.bpmPlaceholder')" />
        </div>
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
          :disabled="uploading || !selectedFile || !form.title || !form.artist"
          :class="[
            'flex-1 text-sm font-medium px-4 py-3 rounded-full transition-colors',
            uploading || !selectedFile || !form.title || !form.artist
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
