<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import TimestampSyntaxPopover from '@/components/common/TimestampSyntaxPopover.vue'
import type { Issue } from '@/types'
import type { TimestampTarget } from '@/utils/timestamps'
import { Music, ImageIcon } from 'lucide-vue-next'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_AUDIO_SIZE = 200 * 1024 * 1024 // 200 MB
const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,.mp3,.wav,.flac,.aac,.ogg'

const props = withDefaults(defineProps<{
  placeholder: string
  submitLabel: string
  submitting?: boolean
  uploadProgress?: number
  enableAudio?: boolean
  enableTimestampPopover?: boolean
  timestampDefaultTarget?: TimestampTarget
  rows?: number
  maxAudios?: number
  issues?: Issue[] | null
}>(), {
  submitting: false,
  uploadProgress: 0,
  enableAudio: true,
  enableTimestampPopover: false,
  timestampDefaultTarget: 'attachment',
  rows: 3,
  maxAudios: 3,
  issues: null,
})

const emit = defineEmits<{
  submit: [payload: { content: string; images: File[]; audios: File[] }]
}>()

const { t } = useI18n()
const { error: toastError } = useToast()

const content = ref('')
const cursorPos = ref(0)
const selectedImages = ref<File[]>([])
const imagePreviewUrls = ref<string[]>([])
const selectedAudios = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const audioInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

async function handleIssueMentionSelect(issue: Issue, mention: { start: number; end: number }) {
  const insertion = `@issue:${issue.local_number} `
  const before = content.value.slice(0, mention.start)
  const after = content.value.slice(mention.end)
  content.value = `${before}${insertion}${after}`
  const nextCursor = mention.start + insertion.length
  cursorPos.value = nextCursor
  await nextTick()
  const el = textareaRef.value
  if (el) {
    el.focus()
    el.setSelectionRange(nextCursor, nextCursor)
  }
}

const canSubmit = computed(
  () => !props.submitting && (!!content.value.trim() || !!selectedImages.value.length || !!selectedAudios.value.length),
)

const hasAttachments = computed(
  () => selectedImages.value.length > 0 || selectedAudios.value.length > 0,
)

function onFileSelect(event: Event) {
  if (props.submitting) return
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (file.size > MAX_IMAGE_SIZE) {
      toastError(t('upload.fileTooLarge', { max: '10 MB' }))
      continue
    }
    selectedImages.value.push(file)
    imagePreviewUrls.value.push(URL.createObjectURL(file))
  }
  input.value = ''
}

function removeImage(index: number) {
  if (props.submitting) return
  URL.revokeObjectURL(imagePreviewUrls.value[index])
  selectedImages.value.splice(index, 1)
  imagePreviewUrls.value.splice(index, 1)
}

function onAudioSelect(event: Event) {
  if (props.submitting) return
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (selectedAudios.value.length >= props.maxAudios) break
    if (file.size > MAX_AUDIO_SIZE) {
      toastError(t('upload.fileTooLarge', { max: '200 MB' }))
      continue
    }
    selectedAudios.value.push(file)
  }
  input.value = ''
}

function removeAudio(index: number) {
  if (props.submitting) return
  selectedAudios.value.splice(index, 1)
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    content: content.value,
    images: [...selectedImages.value],
    audios: [...selectedAudios.value],
  })
}

function reset() {
  content.value = ''
  cursorPos.value = 0
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  selectedImages.value = []
  imagePreviewUrls.value = []
  selectedAudios.value = []
}

onBeforeUnmount(() => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
})

defineExpose({ reset })
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <textarea
        ref="textareaRef"
        v-model="content"
        class="textarea-field w-full text-sm pr-8"
        :placeholder="placeholder"
        :rows="rows"
        @keydown.meta.enter="handleSubmit"
        @keydown.ctrl.enter="handleSubmit"
        @input="(e) => cursorPos = (e.target as HTMLTextAreaElement).selectionStart"
        @click="(e) => cursorPos = (e.target as HTMLTextAreaElement).selectionStart"
        @keyup="(e) => cursorPos = (e.target as HTMLTextAreaElement).selectionStart"
      />
      <TimestampSyntaxPopover
        v-if="enableTimestampPopover"
        :text="content"
        :cursor-pos="cursorPos"
        :default-target="timestampDefaultTarget"
        :issues="issues"
        @select="handleIssueMentionSelect"
      />
    </div>

    <!-- Image previews -->
    <div v-if="imagePreviewUrls.length" class="flex flex-wrap gap-2">
      <div v-for="(url, i) in imagePreviewUrls" :key="i" class="relative">
        <img :src="url" class="h-16 w-16 object-cover rounded border border-border" alt="preview" />
        <button
          @click="removeImage(i)"
          :disabled="submitting"
          class="absolute -top-1 -right-1 w-4 h-4 bg-error text-white rounded-full text-xs flex items-center justify-center leading-none disabled:opacity-50 disabled:cursor-not-allowed"
        >&times;</button>
      </div>
    </div>

    <!-- Audio previews -->
    <div v-if="enableAudio && selectedAudios.length" class="flex flex-wrap gap-2">
      <div
        v-for="(file, i) in selectedAudios" :key="i"
        class="flex items-center gap-1.5 bg-background border border-border rounded-full px-2.5 py-1"
      >
        <Music class="w-3 h-3 text-primary flex-shrink-0" :stroke-width="2" />
        <span class="text-xs font-mono text-foreground max-w-[120px] truncate">{{ file.name }}</span>
        <button
          @click="removeAudio(i)"
          :disabled="submitting"
          class="text-muted-foreground hover:text-error transition-colors leading-none text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >&times;</button>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-2 flex-wrap">
      <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="onFileSelect" />
      <button
        @click="!submitting && fileInputRef?.click()"
        :disabled="submitting"
        class="btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ImageIcon class="w-3.5 h-3.5" :stroke-width="2" />
        {{ t('issueDetail.image') }}
      </button>

      <template v-if="enableAudio">
        <input ref="audioInputRef" type="file" :accept="AUDIO_ACCEPT" multiple class="hidden" @change="onAudioSelect" />
        <button
          @click="!submitting && selectedAudios.length < maxAudios && audioInputRef?.click()"
          :disabled="submitting || selectedAudios.length >= maxAudios"
          :title="selectedAudios.length >= maxAudios ? t('issueDetail.audioMaxReached', { max: maxAudios }) : undefined"
          class="btn-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Music class="w-3.5 h-3.5" :stroke-width="2" />
          {{ t('issueDetail.audio') }}
        </button>
      </template>

      <button
        @click="handleSubmit"
        :disabled="!canSubmit"
        class="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >{{ submitting ? t('common.loading') : submitLabel }}</button>
    </div>

    <!-- Upload progress -->
    <div v-if="submitting && hasAttachments" class="space-y-1">
      <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
      </div>
      <p class="text-xs text-muted-foreground text-right">{{ uploadProgress }}%</p>
    </div>
  </div>
</template>
