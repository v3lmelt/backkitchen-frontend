<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { trackApi, albumApi } from '@/api'
import type { Track, Album, TrackStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const router = useRouter()
const tracks = ref<Track[]>([])
const albums = ref<Album[]>([])
const loading = ref(true)
const filterStatus = ref<TrackStatus | ''>('')

onMounted(async () => {
  try {
    const [t, a] = await Promise.all([trackApi.list(), albumApi.list()])
    tracks.value = t
    albums.value = a
  } finally {
    loading.value = false
  }
})

const filteredTracks = computed(() => {
  if (!filterStatus.value) return tracks.value
  return tracks.value.filter(t => t.status === filterStatus.value)
})

const stats = computed(() => ({
  total: tracks.value.length,
  submitted: tracks.value.filter(t => t.status === 'submitted').length,
  in_review: tracks.value.filter(t => t.status === 'in_review').length,
  revision: tracks.value.filter(t => t.status === 'revision').length,
  approved: tracks.value.filter(t => t.status === 'approved').length,
}))

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = ''">
        <div class="text-2xl font-bold text-foreground">{{ stats.total }}</div>
        <div class="text-xs text-muted-foreground mt-1">Total Tracks</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'submitted'">
        <div class="text-2xl font-bold text-info">{{ stats.submitted }}</div>
        <div class="text-xs text-muted-foreground mt-1">Submitted</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'in_review'">
        <div class="text-2xl font-bold text-warning">{{ stats.in_review }}</div>
        <div class="text-xs text-muted-foreground mt-1">In Review</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'revision'">
        <div class="text-2xl font-bold text-error">{{ stats.revision }}</div>
        <div class="text-xs text-muted-foreground mt-1">Revision</div>
      </div>
      <div class="card cursor-pointer hover:border-primary/50" @click="filterStatus = 'approved'">
        <div class="text-2xl font-bold text-success">{{ stats.approved }}</div>
        <div class="text-xs text-muted-foreground mt-1">Approved</div>
      </div>
    </div>

    <!-- Albums -->
    <div v-if="albums.length > 0">
      <h2 class="text-lg font-mono font-semibold text-foreground mb-3">Albums</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="album in albums" :key="album.id" class="card">
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
              :style="{ backgroundColor: album.cover_color }"
            >
              {{ album.title.charAt(0) }}
            </div>
            <div>
              <h3 class="text-sm font-medium text-foreground">{{ album.title }}</h3>
              <p class="text-xs text-muted-foreground">{{ album.track_count }} tracks</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Track List -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-mono font-semibold text-foreground">
          Tracks
          <span v-if="filterStatus" class="text-sm font-normal text-muted-foreground ml-2">
            (filtered: {{ filterStatus }})
            <button @click="filterStatus = ''" class="text-primary hover:underline ml-1">clear</button>
          </span>
        </h2>
        <button @click="router.push('/upload')" class="btn-primary text-sm">
          + Upload Track
        </button>
      </div>

      <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
      <div v-else-if="filteredTracks.length === 0" class="text-center text-muted-foreground py-12">
        No tracks found. Upload your first track to get started.
      </div>
      <div v-else class="bg-card border border-border rounded-none overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              <th class="px-4 py-3">Title</th>
              <th class="px-4 py-3">Artist</th>
              <th class="px-4 py-3">Duration</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Issues</th>
              <th class="px-4 py-3">Version</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="track in filteredTracks"
              :key="track.id"
              @click="router.push(`/tracks/${track.id}`)"
              class="border-b border-border last:border-0 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td class="px-4 py-3">
                <span class="text-sm font-medium text-foreground">{{ track.title }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">{{ track.artist }}</td>
              <td class="px-4 py-3 text-sm text-muted-foreground font-mono">{{ formatDuration(track.duration) }}</td>
              <td class="px-4 py-3">
                <StatusBadge :status="track.status" type="track" />
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">
                <span v-if="track.open_issue_count" class="text-error">{{ track.open_issue_count }} open</span>
                <span v-else>--</span>
              </td>
              <td class="px-4 py-3 text-sm text-muted-foreground">v{{ track.version }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
