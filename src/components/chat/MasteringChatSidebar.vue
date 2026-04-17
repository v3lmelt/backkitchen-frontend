<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveAssetUrl } from '@/api'
import { useAppStore } from '@/stores/app'
import type { Discussion, Issue } from '@/types'
import { formatLocaleDate, formatDuration } from '@/utils/time'
import { useDiscussions } from '@/composables/useDiscussions'
import CommentInput from '@/components/common/CommentInput.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import { MessageSquare, X, Pencil, Trash2, Music } from 'lucide-vue-next'

const props = defineProps<{
  trackId: number
  trackCompleted?: boolean
  issues?: Issue[] | null
}>()

const emit = defineEmits<{
  openIssue: [issueId: number]
}>()

const { t, locale } = useI18n()
const appStore = useAppStore()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)

const trackIdRef = computed(() => props.trackId)
const mastering = useDiscussions(trackIdRef, 'mastering')

const open = ref(false)
const unreadCount = ref(0)
const messageListRef = ref<HTMLElement | null>(null)
const commentInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const pendingDeleteDiscussion = ref<Discussion | null>(null)

const launcherMeta = computed(() => (
  unreadCount.value > 0
    ? t('chat.unreadCount', { count: unreadCount.value > 99 ? '99+' : unreadCount.value })
    : t('chat.launchHint')
))

function openPanel() {
  if (open.value) return
  open.value = true
  unreadCount.value = 0
  nextTick(scrollToBottom)
}

function closePanel() {
  open.value = false
}

async function loadDiscussions() {
  await mastering.load()
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

async function handleSubmit(payload: { content: string; images: File[]; audios: File[] }) {
  const prevLen = mastering.discussions.value.length
  await mastering.submit(payload)
  if (mastering.discussions.value.length > prevLen) {
    commentInputRef.value?.reset()
    scrollToBottom()
  }
}

async function handleDiscussionEvent(event: string, discussionId: number) {
  if (event === 'created') {
    if (mastering.discussions.value.some(d => d.id === discussionId)) return
    const prevLen = mastering.discussions.value.length
    await mastering.applyRealtimeEvent(event, discussionId)
    if (mastering.discussions.value.length > prevLen) {
      if (open.value) {
        scrollToBottom()
      } else {
        unreadCount.value++
      }
    }
  } else {
    await mastering.applyRealtimeEvent(event, discussionId)
  }
}

const isOwnMessage = (d: Discussion) => d.author_id === appStore.currentUser?.id

function requestDeleteDiscussion(discussion: Discussion) {
  pendingDeleteDiscussion.value = discussion
}

function confirmDeleteDiscussion() {
  if (!pendingDeleteDiscussion.value) return
  mastering.remove(pendingDeleteDiscussion.value)
  pendingDeleteDiscussion.value = null
}

onMounted(loadDiscussions)

watch(() => props.trackId, loadDiscussions)

defineExpose({ handleDiscussionEvent, openPanel, closePanel })
</script>

<template>
  <!-- Toggle button -->
  <button
    v-if="!open"
    @click="openPanel"
    class="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex w-[132px] sm:w-[148px] items-center gap-3 rounded-l-2xl border border-primary/30 border-r-0 bg-card/95 px-3 py-3 text-left shadow-lg backdrop-blur transition-all hover:bg-primary/10"
    :title="t('chat.openChat')"
  >
    <div class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
      <MessageSquare class="w-5 h-5" :stroke-width="2" />
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-[10px] font-mono font-bold text-black px-1"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </div>
    <div class="min-w-0 pr-1">
      <div class="text-xs font-mono text-primary">{{ t('chat.title') }}</div>
      <div class="mt-0.5 text-[11px] leading-4 text-muted-foreground">{{ launcherMeta }}</div>
    </div>
  </button>

  <!-- Sidebar panel -->
  <Transition name="chat-slide">
    <div
      v-if="open"
      class="fixed right-0 top-0 bottom-0 z-40 w-[360px] max-w-full flex flex-col bg-card border-l border-border shadow-lg"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 class="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <MessageSquare class="w-4 h-4 text-primary" :stroke-width="2" />
          {{ t('chat.title') }}
        </h3>
        <button @click="closePanel" class="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X class="w-4 h-4" :stroke-width="2" />
        </button>
      </div>

      <!-- Messages -->
      <div
        ref="messageListRef"
        class="flex-1 overflow-y-auto px-4 py-3 space-y-4"
      >
        <!-- Loading -->
        <div v-if="mastering.loading.value" class="flex items-center justify-center py-8">
          <span class="text-sm text-muted-foreground">{{ t('common.loading') }}</span>
        </div>

        <div v-else-if="mastering.loadError.value && mastering.discussions.value.length === 0" class="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p class="text-sm text-error">{{ mastering.loadError.value }}</p>
          <button class="btn-secondary text-sm" @click="loadDiscussions">{{ t('common.retry') }}</button>
        </div>

        <!-- Empty -->
        <div v-else-if="mastering.discussions.value.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare class="w-8 h-8 text-muted-foreground mb-2" :stroke-width="1.5" />
          <p class="text-sm text-muted-foreground">{{ t('chat.empty') }}</p>
        </div>

        <!-- Messages list -->
        <template v-else>
          <div
            v-if="mastering.loadError.value"
            class="rounded-none border border-error/30 bg-error-bg/30 px-3 py-2"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm text-error">{{ mastering.loadError.value }}</p>
              <button class="btn-secondary text-xs flex-shrink-0" @click="loadDiscussions">{{ t('common.retry') }}</button>
            </div>
          </div>
          <div
            v-for="d in mastering.discussions.value"
            :key="d.id"
            class="flex gap-2.5"
            :class="isOwnMessage(d) ? 'flex-row-reverse' : ''"
          >
            <!-- Avatar -->
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              :style="{ backgroundColor: d.author?.avatar_color || '#6366f1' }"
            >
              {{ d.author?.display_name?.charAt(0) || '?' }}
            </div>

            <!-- Bubble -->
            <div class="max-w-[75%] min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5" :class="isOwnMessage(d) ? 'flex-row-reverse' : ''">
                <span class="text-xs font-medium text-foreground">{{ d.author?.display_name || '?' }}</span>
                <span class="text-[10px] text-muted-foreground">{{ fmtDate(d.created_at) }}</span>
              </div>

              <div
                class="rounded-2xl px-3 py-2 text-sm break-words"
                :class="isOwnMessage(d) ? 'bg-primary/15 text-foreground' : 'bg-background border border-border text-foreground'"
              >
                <!-- Editing -->
                <template v-if="mastering.editingId.value === d.id">
                  <textarea
                    v-model="mastering.editingContent.value"
                    class="textarea-field w-full text-sm"
                    rows="2"
                    @keydown.ctrl.enter="mastering.saveEdit(d)"
                    @keydown.meta.enter="mastering.saveEdit(d)"
                  />
                  <div class="flex gap-1.5 mt-1.5">
                    <button @click="mastering.saveEdit(d)" class="btn-primary text-xs px-2 py-1">{{ t('common.save') }}</button>
                    <button @click="mastering.cancelEdit()" class="btn-secondary text-xs px-2 py-1">{{ t('common.cancel') }}</button>
                  </div>
                </template>

                <!-- Content -->
                <template v-else>
                  <TimestampText
                    :text="d.content"
                    :issues="issues"
                    class="text-sm text-foreground"
                    @issueActivate="(target) => emit('openIssue', target.id)"
                  />

                  <!-- Images -->
                  <div v-if="d.images?.length" class="flex flex-wrap gap-1.5 mt-2">
                    <img
                      v-for="img in d.images"
                      :key="img.id"
                      :src="resolveAssetUrl(img.image_url)"
                      class="h-16 rounded border border-border object-cover cursor-pointer"
                      @click="mastering.openImage(img.image_url)"
                    />
                  </div>

                  <!-- Audio -->
                  <div v-if="d.audios?.length" class="space-y-1.5 mt-2">
                    <div
                      v-for="audio in d.audios"
                      :key="audio.id"
                      class="bg-card border border-border rounded-xl px-2.5 py-1.5 space-y-1"
                    >
                      <div class="flex items-center gap-1.5">
                        <Music class="w-3 h-3 text-primary flex-shrink-0" :stroke-width="2" />
                        <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                        <span v-if="audio.duration" class="text-[10px] text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
                      </div>
                      <audio
                        :src="resolveAssetUrl(audio.audio_url)"
                        controls
                        class="w-full h-7"
                        style="accent-color: #FF8400;"
                      />
                    </div>
                  </div>
                </template>
              </div>

              <!-- Actions: edit/delete + edited indicator -->
              <div v-if="!trackCompleted" class="flex items-center gap-1.5 mt-0.5 px-1" :class="isOwnMessage(d) ? 'flex-row-reverse' : ''">
                <button
                  v-if="d.edited_at"
                  class="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="mastering.showHistory(d.id)"
                >
                  {{ t('editHistory.edited') }}
                </button>
                <template v-if="isOwnMessage(d)">
                  <button @click="mastering.startEdit(d)" class="text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil class="w-3 h-3" :stroke-width="2" />
                  </button>
                  <button @click="requestDeleteDiscussion(d)" class="text-muted-foreground hover:text-error transition-colors">
                    <Trash2 class="w-3 h-3" :stroke-width="2" />
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Input area -->
      <div v-if="!trackCompleted" class="shrink-0 border-t border-border px-3 py-2">
        <CommentInput
          ref="commentInputRef"
          :placeholder="t('chat.placeholder')"
          :submit-label="t('chat.send')"
          :submitting="mastering.posting.value"
          :upload-progress="mastering.postingProgress.value"
          :enable-audio="true"
          enable-timestamp-popover
          :rows="2"
          @submit="handleSubmit"
        />
      </div>
      <div v-else class="shrink-0 border-t border-border px-4 py-3">
        <p class="text-xs text-muted-foreground text-center">{{ t('chat.archived') }}</p>
      </div>
    </div>
  </Transition>

  <EditHistoryModal
    v-if="mastering.showHistoryForId.value !== null"
    :items="mastering.historyItems.value"
    @close="mastering.closeHistory()"
  />

  <ConfirmModal
    v-if="pendingDeleteDiscussion"
    :title="t('discussion.deleteTitle')"
    :message="t('discussion.deleteMessage')"
    :confirm-text="t('common.delete')"
    destructive
    @confirm="confirmDeleteDiscussion"
    @cancel="pendingDeleteDiscussion = null"
  />
</template>

<style scoped>
.chat-slide-enter-active,
.chat-slide-leave-active {
  transition: transform 0.25s ease;
}
.chat-slide-enter-from,
.chat-slide-leave-to {
  transform: translateX(100%);
}
</style>
