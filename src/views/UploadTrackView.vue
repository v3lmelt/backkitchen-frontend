<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { trackApi, albumApi } from '@/api'
import type { Album } from '@/types'

const router = useRouter()
const albums = ref<Album[]>([])
const uploading = ref(false)
const dragOver = ref(false)

const form = ref({
  title: '',
  artist: '',
  album_id: '',
  bpm: '',
})
const selectedFile = ref<File | null>(null)

onMounted(async () => {
  albums.value = await albumApi.list()
  if (albums.value.length > 0) {
    form.value.album_id = String(albums.value[0].id)
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
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('title', form.value.title)
    formData.append('artist', form.value.artist)
    if (form.value.album_id) formData.append('album_id', String(form.value.album_id))
    if (form.value.bpm) formData.append('bpm', String(form.value.bpm))

    const track = await trackApi.upload(formData)
    router.push(`/tracks/${track.id}`)
  } catch (err: any) {
    alert(err.message || 'Upload failed')
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
    <h1 class="text-2xl font-mono font-bold text-foreground">Upload Track</h1>

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
      <svg class="w-12 h-12 mx-auto text-muted-foreground mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p v-if="!selectedFile" class="text-muted-foreground">
        Drop audio file here or <span class="text-primary">browse</span>
      </p>
      <div v-else class="text-foreground">
        <p class="font-medium">{{ selectedFile.name }}</p>
        <p class="text-sm text-muted-foreground">{{ formatFileSize(selectedFile.size) }}</p>
      </div>
    </div>

    <!-- Form -->
    <div class="card space-y-4">
      <div>
        <label class="block text-sm text-muted-foreground mb-1">Track Title *</label>
        <input v-model="form.title" class="input-field w-full" placeholder="Enter track title" />
      </div>
      <div>
        <label class="block text-sm text-muted-foreground mb-1">Artist *</label>
        <input v-model="form.artist" class="input-field w-full" placeholder="Artist name" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-muted-foreground mb-1">Album</label>
          <select v-model="form.album_id" class="input-field w-full">
            <option value="">No album</option>
            <option v-for="album in albums" :key="album.id" :value="album.id">
              {{ album.title }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-muted-foreground mb-1">BPM</label>
          <input v-model="form.bpm" type="number" class="input-field w-full" placeholder="e.g. 128" />
        </div>
      </div>

      <button
        @click="upload"
        :disabled="uploading || !selectedFile || !form.title || !form.artist"
        :class="[
          'w-full text-sm font-medium px-4 py-3 rounded-full transition-colors',
          uploading || !selectedFile || !form.title || !form.artist
            ? 'bg-border text-muted-foreground cursor-not-allowed'
            : 'btn-primary'
        ]"
      >
        {{ uploading ? 'Uploading...' : 'Upload Track' }}
      </button>
    </div>
  </div>
</template>
