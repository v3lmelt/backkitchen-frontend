import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Track, TrackStatus } from '@/types'
import { trackApi } from '@/api'

export const useTrackStore = defineStore('tracks', () => {
  const tracks = ref<Track[]>([])
  const currentTrack = ref<Track | null>(null)
  const loading = ref(false)
  let listRequestSerial = 0

  function setCurrentTrack(track: Track | null) {
    currentTrack.value = track
  }

  async function loadTracks(params?: { status?: TrackStatus; album_id?: number; limit?: number; offset?: number }) {
    const serial = ++listRequestSerial
    loading.value = true
    try {
      const loaded = await trackApi.list(params)
      if (serial === listRequestSerial) {
        tracks.value = loaded
      }
    } finally {
      if (serial === listRequestSerial) {
        loading.value = false
      }
    }
  }

  return { tracks, currentTrack, loading, setCurrentTrack, loadTracks }
})
