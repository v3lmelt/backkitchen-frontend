<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { issueApi } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Issue } from '@/types'
import StatusBadge from '@/components/workflow/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const issueId = computed(() => Number(route.params.id))

const issue = ref<Issue | null>(null)
const loading = ref(true)
const newComment = ref('')

onMounted(async () => {
  try {
    issue.value = await issueApi.get(issueId.value)
  } finally {
    loading.value = false
  }
})

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

async function addComment() {
  if (!newComment.value.trim() || !appStore.currentUser || !issue.value) return
  const comment = await issueApi.addComment(issueId.value, {
    author_id: appStore.currentUser.id,
    content: newComment.value,
  })
  if (!issue.value.comments) issue.value.comments = []
  issue.value.comments.push(comment)
  newComment.value = ''
}

async function updateStatus(status: 'will_fix' | 'disagreed' | 'resolved') {
  if (!issue.value) return
  issue.value = await issueApi.update(issueId.value, { status })
}
</script>

<template>
  <div v-if="loading" class="text-center text-muted-foreground py-12">Loading...</div>
  <div v-else-if="issue" class="max-w-3xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <button @click="router.back()" class="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      <h1 class="text-2xl font-mono font-bold text-foreground">{{ issue.title }}</h1>
      <div class="flex items-center gap-3 mt-2">
        <StatusBadge :status="issue.severity" type="severity" />
        <StatusBadge :status="issue.status" type="issue" />
        <span class="text-sm text-muted-foreground">
          {{ formatTime(issue.time_start) }}
          <span v-if="issue.time_end"> - {{ formatTime(issue.time_end) }}</span>
        </span>
        <span class="text-sm text-muted-foreground">
          {{ issue.issue_type === 'range' ? 'Range' : 'Point' }}
        </span>
      </div>
    </div>

    <!-- Description -->
    <div class="card">
      <p class="text-sm text-foreground whitespace-pre-wrap">{{ issue.description }}</p>
      <div class="text-xs text-muted-foreground mt-3">
        Created {{ formatDate(issue.created_at) }}
      </div>
    </div>

    <!-- Status Actions -->
    <div class="flex gap-2">
      <button
        v-if="issue.status === 'open'"
        @click="updateStatus('will_fix')"
        class="btn-primary text-sm"
      >
        Will Fix
      </button>
      <button
        v-if="issue.status === 'open'"
        @click="updateStatus('disagreed')"
        class="btn-secondary text-sm"
      >
        Disagree
      </button>
      <button
        v-if="issue.status === 'will_fix'"
        @click="updateStatus('resolved')"
        class="bg-success-bg text-success font-medium px-4 py-2 rounded-full text-sm hover:opacity-80 transition-opacity"
      >
        Mark Resolved
      </button>
    </div>

    <!-- Comments -->
    <div class="space-y-4">
      <h3 class="text-sm font-mono font-semibold text-foreground">
        Comments ({{ issue.comments?.length || 0 }})
      </h3>

      <div v-for="comment in issue.comments" :key="comment.id" class="card">
        <div class="flex items-center gap-2 mb-2">
          <div
            v-if="comment.author"
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
            :style="{ backgroundColor: comment.author.avatar_color }"
          >
            {{ comment.author.display_name.charAt(0) }}
          </div>
          <span class="text-sm font-medium text-foreground">
            {{ comment.author?.display_name || 'Unknown' }}
          </span>
          <span class="text-xs text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
        </div>
        <p class="text-sm text-foreground whitespace-pre-wrap">{{ comment.content }}</p>
      </div>

      <!-- New Comment -->
      <div class="flex gap-2">
        <textarea
          v-model="newComment"
          class="input-field flex-1 h-20 resize-none"
          placeholder="Add a comment..."
          @keydown.meta.enter="addComment"
          @keydown.ctrl.enter="addComment"
        />
      </div>
      <button @click="addComment" :disabled="!newComment.trim()" class="btn-primary text-sm">
        Add Comment
      </button>
    </div>
  </div>
</template>
