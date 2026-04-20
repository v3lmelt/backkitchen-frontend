<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Discussion, EditHistory, Issue } from '@/types'
import { resolveAssetUrl } from '@/api'
import { formatLocaleDate, formatDuration } from '@/utils/time'
import { useAppStore } from '@/stores/app'
import CommentInput from '@/components/common/CommentInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import EditHistoryModal from '@/components/common/EditHistoryModal.vue'
import TimestampText from '@/components/common/TimestampText.vue'
import { Music, Pencil, Trash2 } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  discussions: Discussion[]
  heading: string
  emptyText: string
  placeholder: string
  submitLabel: string
  posting: boolean
  postingProgress: number
  editingId: number | null
  editingContent: string
  historyItems: EditHistory[]
  showHistoryForId: number | null
  loading?: boolean
  loadError?: string
  enableAudio?: boolean
  issues?: Issue[] | null
  enableReferencePopover?: boolean
  hasMore?: boolean
  loadingOlder?: boolean
}>(), {
  enableReferencePopover: true,
})

const emit = defineEmits<{
  submit: [payload: { content: string; images: File[]; audios: File[] }]
  startEdit: [d: Discussion]
  saveEdit: [d: Discussion]
  cancelEdit: []
  remove: [d: Discussion]
  showHistory: [id: number]
  closeHistory: []
  openImage: [url: string]
  openIssue: [issueId: number]
  retry: []
  loadOlder: []
  'update:editingContent': [value: string]
}>()

const { locale, t } = useI18n()
const appStore = useAppStore()
const fmtDate = (d: string) => formatLocaleDate(d, locale.value)
const commentInputRef = ref<InstanceType<typeof CommentInput> | null>(null)
const pendingDeleteDiscussion = ref<Discussion | null>(null)

const editContent = computed({
  get: () => props.editingContent,
  set: (v: string) => emit('update:editingContent', v),
})

// Reset input when a new discussion is added (discussions array grows while posting finishes)
watch(() => props.discussions.length, (newLen, oldLen) => {
  if (newLen > oldLen) commentInputRef.value?.reset()
})

function requestDelete(discussion: Discussion) {
  pendingDeleteDiscussion.value = discussion
}

function confirmDelete() {
  if (!pendingDeleteDiscussion.value) return
  emit('remove', pendingDeleteDiscussion.value)
  pendingDeleteDiscussion.value = null
}
</script>

<template>
  <div class="card space-y-4">
    <h3 class="text-sm font-sans font-semibold text-foreground">{{ heading }}</h3>
    <div
      v-if="loadError && discussions.length > 0"
      class="flex items-center justify-between gap-3 rounded-none border border-error/30 bg-error-bg/30 px-3 py-2"
    >
      <p class="text-sm text-error">{{ loadError }}</p>
      <button class="btn-secondary text-xs flex-shrink-0" @click="emit('retry')">{{ $t('common.retry') }}</button>
    </div>
    <div v-if="loading && discussions.length === 0" class="text-sm text-muted-foreground">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="loadError && discussions.length === 0" class="space-y-3">
      <p class="text-sm text-error">{{ loadError }}</p>
      <div>
        <button class="btn-secondary text-sm" @click="emit('retry')">{{ $t('common.retry') }}</button>
      </div>
    </div>
    <div v-else-if="discussions.length === 0" class="text-sm text-muted-foreground">
      {{ emptyText }}
    </div>
    <div v-else class="space-y-3">
      <div v-if="hasMore" class="flex justify-center pb-1">
        <button
          type="button"
          class="btn-secondary text-xs px-3 py-1.5"
          :disabled="loadingOlder"
          @click="emit('loadOlder')"
        >
          {{ loadingOlder ? $t('discussionPanel.loadingEarlier') : $t('discussionPanel.loadEarlier') }}
        </button>
      </div>
      <TransitionGroup tag="div" name="msg">
      <div v-for="d in discussions" :key="d.id" class="flex gap-3 py-3 border-b border-border last:border-0">
        <div
          class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          :style="{ backgroundColor: d.author?.avatar_color || '#6366f1' }"
        >
          {{ d.author?.display_name?.charAt(0) || '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-foreground">{{ d.author?.display_name || '?' }}</span>
            <span class="text-xs text-muted-foreground">{{ fmtDate(d.created_at) }}</span>
            <button
              v-if="d.edited_at"
              class="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              @click="emit('showHistory', d.id)"
            >
              ({{ $t('editHistory.edited') }})
            </button>
            <template v-if="d.author_id === appStore.currentUser?.id">
              <button @click="emit('startEdit', d)" class="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                <Pencil class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
              <button @click="requestDelete(d)" class="text-muted-foreground hover:text-error transition-colors">
                <Trash2 class="w-3.5 h-3.5" :stroke-width="2" />
              </button>
            </template>
          </div>
          <template v-if="editingId === d.id">
            <textarea
              v-model="editContent"
              class="textarea-field w-full text-sm mt-1"
              rows="3"
              @keydown.ctrl.enter="emit('saveEdit', d)"
              @keydown.meta.enter="emit('saveEdit', d)"
            />
            <div class="flex gap-2 mt-1">
              <button @click="emit('saveEdit', d)" class="btn-primary text-xs">{{ $t('common.save') }}</button>
              <button @click="emit('cancelEdit')" class="btn-secondary text-xs">{{ $t('common.cancel') }}</button>
            </div>
          </template>
          <template v-else>
            <TimestampText
              :text="d.content"
              :issues="issues"
              class="text-sm text-foreground mt-1"
              @issueActivate="(target) => emit('openIssue', target.id)"
            />
          </template>
          <div v-if="d.images?.length" class="flex gap-2 mt-2">
            <img
              v-for="img in d.images"
              :key="img.id"
              :src="resolveAssetUrl(img.image_url)"
              class="h-20 rounded border border-border object-cover cursor-pointer"
              @click="emit('openImage', img.image_url)"
            />
          </div>
          <div v-if="d.audios?.length" class="flex flex-col gap-2 mt-2">
            <div
              v-for="audio in d.audios"
              :key="audio.id"
              class="bg-background border border-border rounded-2xl px-3 py-2 space-y-1.5"
            >
              <div class="flex items-center gap-2">
                <Music class="w-3.5 h-3.5 text-primary flex-shrink-0" :stroke-width="2" />
                <span class="text-xs font-mono text-foreground truncate flex-1">{{ audio.original_filename }}</span>
                <span v-if="audio.duration" class="text-xs text-muted-foreground font-mono flex-shrink-0">{{ formatDuration(audio.duration) }}</span>
              </div>
              <audio
                :src="resolveAssetUrl(audio.audio_url)"
                controls
                class="w-full h-8"
                style="accent-color: #FF8400;"
              />
            </div>
          </div>
        </div>
      </div>
      </TransitionGroup>
    </div>
    <CommentInput
      ref="commentInputRef"
      :placeholder="placeholder"
      :submit-label="submitLabel"
      :submitting="posting"
      :upload-progress="postingProgress"
      :enable-audio="enableAudio ?? false"
      :enable-timestamp-popover="enableReferencePopover"
      :issues="issues"
      @submit="emit('submit', $event)"
    />
  </div>

  <EditHistoryModal
    v-if="showHistoryForId !== null"
    :items="historyItems"
    @close="emit('closeHistory')"
  />

  <ConfirmModal
    v-if="pendingDeleteDiscussion"
    :title="t('discussionPanel.deleteTitle')"
    :message="t('discussionPanel.deleteConfirm')"
    :confirm-text="t('common.delete')"
    destructive
    @confirm="confirmDelete"
    @cancel="pendingDeleteDiscussion = null"
  />
</template>
