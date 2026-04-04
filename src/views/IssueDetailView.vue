<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { issueApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Issue, IssueStatus } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'
import WaveformPlayer from '@/components/audio/WaveformPlayer.vue'
import { formatTimestamp } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const appStore = useAppStore()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const loading = ref(true)
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
const pendingStatus = ref<Exclude<IssueStatus, 'open'> | null>(null)
const statusNote = ref('')

onMounted(async () => {
  try {
    issue.value = await issueApi.get(issueId.value)
  } finally {
    loading.value = false
  }
})

function formatTime(seconds: number): string {
  return formatTimestamp(seconds)
}

function formatDate(dateStr: string): string {
  const localeStr = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Date(dateStr).toLocaleDateString(localeStr, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

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

async function addComment() {
  if ((!newComment.value.trim() && !selectedImages.value.length) || !appStore.currentUser || !issue.value) return
  const comment = await issueApi.addComment(issueId.value, {
    content: newComment.value,
    images: selectedImages.value.length ? selectedImages.value : undefined,
  })
  if (!issue.value.comments) issue.value.comments = []
  issue.value.comments.push(comment)
  newComment.value = ''
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  selectedImages.value = []
  imagePreviewUrls.value = []
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
      <button @click="router.back()" class="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {{ t('issueDetail.back') }}
      </button>
      <h1 class="text-2xl font-sans font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex items-center gap-3 mt-2">
        <StatusBadge :status="issue.phase" type="phase" />
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span class="text-sm text-muted-foreground">
          {{ formatTime(issue.time_start) }}
          <span v-if="issue.time_end"> - {{ formatTime(issue.time_end) }}</span>
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
          {{ formatTime(issue.time_start) }}<span v-if="issue.time_end"> – {{ formatTime(issue.time_end) }}</span>
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
        {{ t('issueDetail.created', { date: formatDate(issue.created_at) }) }}
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
        <div v-if="comment.is_status_note" class="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <span class="text-xs font-semibold text-amber-400 block mb-1">{{ t('issue.revisionNote') }}</span>
          <p class="text-sm text-foreground">{{ comment.content }}</p>
          <p class="text-xs text-gray-500 mt-1">{{ comment.author?.display_name || t('issueDetail.unknown') }} · {{ formatDate(comment.created_at) }}</p>
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
            <span class="text-xs text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
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

        <div class="flex items-center gap-2">
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="onFileSelect"
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
          <button @click="addComment" :disabled="!newComment.trim() && !selectedImages.length" class="btn-primary text-sm">
            {{ t('issueDetail.addComment') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
