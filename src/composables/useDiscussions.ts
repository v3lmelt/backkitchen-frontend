import { ref, type Ref } from 'vue'
import { discussionApi, resolveAssetUrl } from '@/api'
import type { Discussion, DiscussionPhase, EditHistory } from '@/types'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'

export function useDiscussions(trackId: Ref<number>, phase?: DiscussionPhase) {
  const { t } = useI18n()
  const { error: toastError } = useToast()

  const discussions = ref<Discussion[]>([])
  const posting = ref(false)
  const postingProgress = ref(0)
  const editingId = ref<number | null>(null)
  const editingContent = ref('')
  const historyItems = ref<EditHistory[]>([])
  const showHistoryForId = ref<number | null>(null)

  async function load() {
    try {
      discussions.value = await discussionApi.list(trackId.value, phase)
    } catch { discussions.value = [] }
  }

  async function submit(payload: { content: string; images: File[]; audios: File[] }) {
    posting.value = true
    postingProgress.value = 0
    try {
      const d = await discussionApi.create(trackId.value, {
        content: payload.content.trim(),
        phase,
        images: payload.images.length ? payload.images : undefined,
        audios: payload.audios.length ? payload.audios : undefined,
      }, (p) => { postingProgress.value = p })
      discussions.value.push(d)
    } catch {
      toastError(t('common.error'))
    } finally {
      posting.value = false
    }
  }

  function startEdit(d: Discussion) {
    editingId.value = d.id
    editingContent.value = d.content
  }

  async function saveEdit(d: Discussion) {
    const content = editingContent.value.trim()
    if (!content) return
    try {
      const updated = await discussionApi.update(d.id, content)
      const idx = discussions.value.findIndex(x => x.id === d.id)
      if (idx !== -1) discussions.value[idx] = updated
      editingId.value = null
    } catch { toastError(t('common.error')) }
  }

  async function remove(d: Discussion) {
    try {
      await discussionApi.delete(d.id)
      discussions.value = discussions.value.filter(x => x.id !== d.id)
    } catch { toastError(t('common.error')) }
  }

  async function showHistory(discussionId: number) {
    showHistoryForId.value = discussionId
    try {
      historyItems.value = await discussionApi.history(discussionId)
    } catch { historyItems.value = [] }
  }

  function cancelEdit() {
    editingId.value = null
  }

  function closeHistory() {
    showHistoryForId.value = null
    historyItems.value = []
  }

  function openImage(url: string) {
    window.open(resolveAssetUrl(url), '_blank')
  }

  return {
    discussions,
    posting,
    postingProgress,
    editingId,
    editingContent,
    historyItems,
    showHistoryForId,
    load,
    submit,
    startEdit,
    saveEdit,
    cancelEdit,
    remove,
    showHistory,
    closeHistory,
    openImage,
  }
}
