<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
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
const { t } = useI18n()
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
})
const selectedFile = ref<File | null>(null)

const albumOptions = computed<SelectOption[]>(() =>
  albums.value.map((a) => ({ value: a.id, label: a.title }))
)

onMounted(async () => {
  albums.value = await albumApi.list()
  if (albums.value.length > 0) {
    form.value.album_id = albums.value[0].id
  }
})

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    selectedFile.value = input.files[0]
    if (!form.value.title) {
      form.value.title = input.files[0].name.replace(/\.[^/.]+$/, '')
    }
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files?.[0]) {
    selectedFile.value = e.dataTransfer.files[0]
    if (!form.value.title) {
      form.value.title = e.dataTransfer.files[0].name.replace(/\.[^/.]+$/, '')
    }
  }
}

async function upload() {
  if (!selectedFile.value || !form.value.title || !form.value.artist) return
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
          bpm: form.value.bpm ? Number(form.value.bpm) : null,
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
        bpm: form.value.bpm ? Number(form.value.bpm) : null,
      })
    } else {
      // Legacy FormData upload
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      formData.append('title', form.value.title)
      formData.append('artist', form.value.artist)
      formData.append('album_id', String(form.value.album_id))
      if (form.value.bpm) formData.append('bpm', String(form.value.bpm))
      track = await uploadWithProgress<Track>(
        '/tracks', formData, (p) => { uploadProgress.value = p }
      )
    }
    toastSuccess(t('upload.uploadSuccess'))
    router.push(`/tracks/${track.id}`)
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
        <p class="text-sm text-muted-foreground">{{ formatFileSize(selectedFile.size) }}</p>
      </div>
    </div>

    <!-- Form -->
    <div class="card space-y-4">
      <div>
        <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.trackTitle') }}</label>
        <input v-model="form.title" class="input-field w-full" :placeholder="t('upload.titlePlaceholder')" />
      </div>
      <div>
        <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.artist') }}</label>
        <input v-model="form.artist" class="input-field w-full" :placeholder="t('upload.artistPlaceholder')" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.album') }}</label>
          <CustomSelect v-model="form.album_id" :options="albumOptions" :placeholder="t('upload.noAlbum')" />
        </div>
        <div>
          <label class="block text-sm text-muted-foreground mb-1">{{ t('upload.bpm') }}</label>
          <input v-model="form.bpm" type="number" class="input-field w-full" :placeholder="t('upload.bpmPlaceholder')" />
        </div>
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
