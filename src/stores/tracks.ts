import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Track, TrackStatus } from '@/types'
import { trackApi } from '@/api'

export const useTrackStore = defineStore('tracks', () => {
  const tracks = ref<Track[]>([])
  const currentTrack = ref<Track | null>(null)
  const loading = ref(false)

  function setCurrentTrack(track: Track | null) {
    currentTrack.value = track
  }

  async function loadTracks(params?: { status?: TrackStatus; album_id?: number; limit?: number; offset?: number }) {
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
      currentTrack.value = (await trackApi.get(id)).track
    } finally {
      loading.value = false
    }
  }

  return { tracks, currentTrack, loading, setCurrentTrack, loadTracks, loadTrack }
})
