<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Issue, IssueStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import { formatTimestamp, formatLocaleDate, formatDuration } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const appStore = useAppStore()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const allTrackIssues = ref<Issue[]>([])
const loading = ref(true)
const widgetExpanded = ref(false)

let loadCount = 0
let cachedTrackId: number | null = null
const waveformRef = ref<InstanceType<typeof WaveformPlayer> | null>(null)
const newComment = ref('')

const audioUrl = computed(() =>
  issue.value ? `/api/tracks/${issue.value.track_id}/audio` : ''
)

function onWaveformReady() {
  if (!issue.value || !waveformRef.value) return
  waveformRef.value.seekTo(issue.value.time_start)
  if (issue.value.issue_type === 'range') {
    waveformRef.value.highlightIssue(issue.value)
  }
}
const selectedImages = ref<File[]>([])
const imagePreviewUrls = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,.mp3,.wav,.flac,.aac,.ogg'
const MAX_AUDIOS = 3
const selectedAudios = ref<File[]>([])
const audioInputRef = ref<HTMLInputElement | null>(null)
const pendingStatus = ref<Exclude<IssueStatus, 'open'> | null>(null)
const statusNote = ref('')

async function loadIssue(id: number) {
  const token = ++loadCount
  loading.value = true
  try {
    const fetched = await issueApi.get(id)
    if (token !== loadCount) return
    issue.value = fetched
    if (fetched.track_id !== cachedTrackId) {
      const all = await issueApi.listForTrack(fetched.track_id)
      if (token !== loadCount) return
      allTrackIssues.value = all
      cachedTrackId = fetched.track_id
    }
  } finally {
    if (token === loadCount) loading.value = false
  }
}

onMounted(() => loadIssue(issueId.value))
watch(issueId, (id) => {
  widgetExpanded.value = false
  loadIssue(id)
})
onBeforeUnmount(() => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
})

const siblingIssues = computed(() => {
  if (!issue.value) return []
  const { phase, workflow_cycle } = issue.value
  return allTrackIssues.value
    .filter(i => i.phase === phase && i.workflow_cycle === workflow_cycle)
    .sort((a, b) => a.time_start - b.time_start)
})

const currentSiblingIndex = computed(() =>
  siblingIssues.value.findIndex(i => i.id === issueId.value)
)
const prevIssue = computed(() =>
  currentSiblingIndex.value > 0 ? siblingIssues.value[currentSiblingIndex.value - 1] : null
)
const nextIssue = computed(() =>
  currentSiblingIndex.value < siblingIssues.value.length - 1
    ? siblingIssues.value[currentSiblingIndex.value + 1]
    : null
)

const unresolvedIssues = computed(() =>
  allTrackIssues.value.filter(i => i.status === 'open' || i.status === 'will_fix')
)


const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    selectedImages.value.push(file)
    imagePreviewUrls.value.push(URL.createObjectURL(file))
  }
  input.value = ''
}

function removeSelectedImage(index: number) {
  URL.revokeObjectURL(imagePreviewUrls.value[index])
  selectedImages.value.splice(index, 1)
  imagePreviewUrls.value.splice(index, 1)
}

function onAudioSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (selectedAudios.value.length >= MAX_AUDIOS) break
    selectedAudios.value.push(file)
  }
  input.value = ''
}

function removeSelectedAudio(index: number) {
  selectedAudios.value.splice(index, 1)
}

async function addComment() {
  if ((!newComment.value.trim() && !selectedImages.value.length && !selectedAudios.value.length) || !appStore.currentUser || !issue.value) return
  const comment = await issueApi.addComment(issueId.value, {
    content: newComment.value,
    images: selectedImages.value.length ? selectedImages.value : undefined,
    audios: selectedAudios.value.length ? selectedAudios.value : undefined,
  })
  if (!issue.value.comments) issue.value.comments = []
  issue.value.comments.push(comment)
  newComment.value = ''
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  selectedImages.value = []
  imagePreviewUrls.value = []
  selectedAudios.value = []
}

function selectStatus(status: Exclude<IssueStatus, 'open'>) {
  pendingStatus.value = status
  statusNote.value = ''
}

async function confirmStatusChange() {
  if (!issue.value || !pendingStatus.value) return
  issue.value = await issueApi.update(issueId.value, {
    status: pendingStatus.value,
    status_note: statusNote.value || undefined,
  })
  const idx = allTrackIssues.value.findIndex(i => i.id === issueId.value)
  if (idx !== -1 && issue.value) allTrackIssues.value[idx] = issue.value
  pendingStatus.value = null
  statusNote.value = ''
}

function cancelStatusChange() {
  pendingStatus.value = null
  statusNote.value = ''
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">{{ t('common.loading') }}</div>
  <div v-else-if="issue" class="max-w-3xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <button @click="router.back()" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('issueDetail.back') }}
        </button>
        <div v-if="siblingIssues.length > 1" class="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            @click="prevIssue && router.push(`/issues/${prevIssue.id}`)"
            :disabled="!prevIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="prevIssue?.title"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="font-mono text-xs">{{ currentSiblingIndex + 1 }} / {{ siblingIssues.length }}</span>
          <button
            @click="nextIssue && router.push(`/issues/${nextIssue.id}`)"
            :disabled="!nextIssue"
            class="p-1 rounded hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            :title="nextIssue?.title"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
      <h1 class="text-2xl font-sans font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex items-center gap-3 mt-2">
        <StatusBadge :status="issue.phase" type="phase" />
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span class="text-sm text-muted-foreground">
          {{ formatTimestamp(issue.time_start) }}
          <span v-if="issue.time_end"> - {{ formatTimestamp(issue.time_end) }}</span>
        </span>
        <span class="text-sm text-muted-foreground">
          {{ issue.issue_type === 'range' ? t('issueType.range') : t('issueType.point') }}
        </span>
      </div>
    </div>

    <!-- Waveform -->
    <div class="card overflow-hidden !p-0">
      <div class="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
        <span class="text-xs font-mono font-medium text-muted-foreground">{{ t('issueDetail.audioContext') }}</span>
        <span class="text-xs text-muted-foreground font-mono">
          {{ formatTimestamp(issue.time_start) }}<span v-if="issue.time_end"> – {{ formatTimestamp(issue.time_end) }}</span>
        </span>
      </div>
      <WaveformPlayer
        ref="waveformRef"
        :audio-url="audioUrl"
        :issues="[issue]"
        :height="80"
        @ready="onWaveformReady"
      />
    </div>

    <!-- Description -->
    <div class="card">
      <p class="text-sm text-foreground whitespace-pre-wrap">{{ issue.description }}</p>
      <div class="text-xs text-muted-foreground mt-3">
        {{ t('issueDetail.created', { date: fmtDate(issue.created_at) }) }}
      </div>
    </div>

    <!-- Status Actions -->
    <div class="space-y-3">
      <div v-if="issue.status === 'open' || issue.status === 'will_fix'" class="flex gap-2">
        <button
          @click="selectStatus('resolved')"
          class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
          :class="pendingStatus === 'resolved'
            ? 'bg-primary text-black'
            : 'bg-card border border-border text-foreground hover:bg-border'"
        >
          {{ t('issueDetail.markFixed') }}
        </button>
        <button
          v-if="issue.status === 'open'"
          @click="selectStatus('disagreed')"
          class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
          :class="pendingStatus === 'disagreed'
            ? 'bg-error-bg text-error border border-error/30'
            : 'bg-card border border-border text-foreground hover:bg-border'"
        >
          {{ t('issueDetail.disagree') }}
        </button>
      </div>
      <div v-if="pendingStatus" class="space-y-2">
        <textarea
          v-model="statusNote"
          :placeholder="t('issue.statusNotePlaceholder')"
          class="textarea-field w-full"
          rows="3"
        ></textarea>
        <div class="flex gap-2">
          <button @click="confirmStatusChange" class="btn-primary text-sm">
            {{ t('common.confirm') }}
          </button>
          <button @click="cancelStatusChange" class="btn-secondary text-sm">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Comments -->
    <div class="space-y-4">
      <h3 class="text-sm font-sans font-semibold text-foreground">
        {{ t('issueDetail.commentsHeading', { count: issue.comments?.length || 0 }) }}
      </h3>

      <template v-for="comment in issue.comments" :key="comment.id">
        <div v-if="comment.is_status_note" class="rounded-lg bg-warning-bg border border-warning/20 px-3 py-2">
          <span class="text-xs font-semibold text-warning block mb-1">{{ t('issue.revisionNote') }}</span>
          <p class="text-sm text-foreground">{{ comment.content }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ comment.author?.display_name || t('issueDetail.unknown') }} · {{ fmtDate(comment.created_at) }}</p>
        </div>
        <div v-else class="card">
          <div class="flex items-center gap-2 mb-2">
            <div
              v-if="comment.author"
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              :style="{ backgroundColor: comment.author.avatar_color }"
            >
              {{ comment.author.display_name.charAt(0) }}
            </div>
            <span class="text-sm font-medium text-foreground">
              {{ comment.author?.display_name || t('issueDetail.unknown') }}
            </span>
            <span class="text-xs text-muted-foreground">{{ fmtDate(comment.created_at) }}</span>
          </div>
          <p class="text-sm text-foreground whitespace-pre-wrap">{{ comment.content }}</p>
          <div v-if="comment.images && comment.images.length" class="flex flex-wrap gap-2 mt-3">
            <a
              v-for="img in comment.images"
              :key="img.id"
              :href="img.image_url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                :src="img.image_url"
                class="h-20 w-20 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                alt="attachment"
              />
            </a>
          </div>
          <div v-if="comment.audios && comment.audios.length" class="flex flex-col gap-2 mt-3">
            <div
              v-for="audio in comment.audios"
              :key="audio.id"
              class="bg-background border border-border rounded-2xl px-4 py-3 space-y-2"
            >
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
              </div>
              <audio :src="audio.audio_url" controls class="w-full h-8" style="accent-color: #FF8400;" />
            </div>
          </div>
        </div>
      </template>

      <!-- New Comment -->
      <div class="space-y-2">
        <textarea
          v-model="newComment"
          class="textarea-field w-full h-20"
          :placeholder="t('issueDetail.addCommentPlaceholder')"
          @keydown.meta.enter="addComment"
          @keydown.ctrl.enter="addComment"
        />

        <!-- Image previews -->
        <div v-if="imagePreviewUrls.length" class="flex flex-wrap gap-2">
          <div
            v-for="(url, i) in imagePreviewUrls"
            :key="i"
            class="relative"
          >
            <img :src="url" class="h-16 w-16 object-cover rounded border border-border" alt="preview" />
            <button
              @click="removeSelectedImage(i)"
              class="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center leading-none"
              title="Remove"
            >×</button>
          </div>
        </div>

        <!-- Audio previews -->
        <div v-if="selectedAudios.length" class="flex flex-wrap gap-2">
          <div
            v-for="(file, i) in selectedAudios"
            :key="i"
            class="flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1"
          >
            <svg class="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span class="text-xs font-mono text-foreground max-w-[120px] truncate">{{ file.name }}</span>
            <button @click="removeSelectedAudio(i)" class="text-muted-foreground hover:text-error transition-colors leading-none">×</button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="onFileSelect"
          />
          <input
            ref="audioInputRef"
            type="file"
            :accept="AUDIO_ACCEPT"
            multiple
            class="hidden"
            @change="onAudioSelect"
          />
          <button
            @click="fileInputRef?.click()"
            class="btn-secondary text-sm inline-flex items-center gap-1"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {{ t('issueDetail.image') }}
          </button>
          <button
            @click="selectedAudios.length < MAX_AUDIOS && audioInputRef?.click()"
            :disabled="selectedAudios.length >= MAX_AUDIOS"
            :title="selectedAudios.length >= MAX_AUDIOS ? t('issueDetail.audioMaxReached', { max: MAX_AUDIOS }) : undefined"
            class="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            {{ t('issueDetail.audio') }}
          </button>
          <button @click="addComment" :disabled="!newComment.trim() && !selectedImages.length && !selectedAudios.length" class="btn-primary text-sm">
            {{ t('issueDetail.addComment') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating unresolved issues widget -->
  <Teleport to="body">
    <div v-if="!loading && unresolvedIssues.length > 0" class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <Transition name="widget-slide">
        <div v-if="widgetExpanded" class="bg-card border border-border w-72 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
          <div class="flex items-center justify-between px-3 py-2 border-b border-border">
            <span class="text-xs font-mono font-semibold text-foreground">
              {{ t('issueDetail.unresolvedTitle') }} ({{ unresolvedIssues.length }})
            </span>
            <button @click="widgetExpanded = false" class="text-muted-foreground hover:text-foreground transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div class="max-h-72 overflow-y-auto">
            <div
              v-for="item in unresolvedIssues"
              :key="item.id"
              @click="router.push(`/issues/${item.id}`)"
              class="px-3 py-2 border-b border-border last:border-0 cursor-pointer transition-colors"
              :class="item.id === issueId ? 'bg-border/40' : 'hover:bg-border/30'"
            >
              <div class="flex items-center gap-1.5 mb-0.5">
                <StatusBadge :status="item.phase" type="phase" />
                <StatusBadge :status="item.severity" type="severity" />
              </div>
              <p class="text-xs text-foreground truncate">{{ item.title }}</p>
              <p class="text-xs text-muted-foreground font-mono">{{ formatTimestamp(item.time_start) }}</p>
            </div>
          </div>
        </div>
      </Transition>
      <button
        @click="widgetExpanded = !widgetExpanded"
        class="btn-secondary text-xs inline-flex items-center gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
      >
        <span>{{ t('issueDetail.unresolvedTitle') }}</span>
        <span class="bg-primary text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold leading-none">{{ unresolvedIssues.length }}</span>
        <svg class="w-3.5 h-3.5 transition-transform" :class="widgetExpanded ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.widget-slide-enter-active, .widget-slide-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.widget-slide-enter-from, .widget-slide-leave-to { opacity: 0; transform: translateY(8px); }
</style>
