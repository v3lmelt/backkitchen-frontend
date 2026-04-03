import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Track, TrackStatus } from '@/types'
import { trackApi } from '@/api'

export const useTrackStore = defineStore('tracks', () => {
  const tracks = ref<Track[]>([])
  const currentTrack = ref<Track | null>(null)
  const loading = ref(false)

  async function loadTracks(params?: { status?: TrackStatus; album_id?: number }) {
    loading.value = true
    try {
      tracks.value = await trackApi.list(params)
    } finally {
      loading.value = false
    }
  }

  async function loadTrack(id: number) {
    loading.value = true
    try {
      currentTrack.value = await trackApi.get(id)
    } finally {
      loading.value = false
    }
  }

  async function updateStatus(id: number, status: TrackStatus) {
    const updated = await trackApi.updateStatus(id, status)
    currentTrack.value = updated
    const idx = tracks.value.findIndex(t => t.id === id)
    if (idx !== -1) tracks.value[idx] = updated
  }

  return { tracks, currentTrack, loading, loadTracks, loadTrack, updateStatus }
})
