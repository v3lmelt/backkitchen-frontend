import { ref, type Ref } from 'vue'
import { discussionApi, r2Api, resolveAssetUrl, uploadToR2 } from '@/api'
import type { Discussion, DiscussionPhase, EditHistory } from '@/types'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

export interface UseDiscussionsOptions {
  paginated?: boolean
  pageSize?: number
}

export function useDiscussions(
  trackId: Ref<number>,
  phase?: DiscussionPhase,
  options: UseDiscussionsOptions = {},
) {
  const { t } = useI18n()
  const { error: toastError } = useToast()
  const appStore = useAppStore()

  const paginated = options.paginated ?? false
  const pageSize = options.pageSize ?? 20

  const discussions = ref<Discussion[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const posting = ref(false)
  const postingProgress = ref(0)
  const editingId = ref<number | null>(null)
  const editingContent = ref('')
  const historyItems = ref<EditHistory[]>([])
  const showHistoryForId = ref<number | null>(null)
  const loadingOlder = ref(false)
  const hasMore = ref(false)

  async function load() {
    loading.value = true
    loadError.value = ''
    try {
      if (paginated) {
        const items = await discussionApi.list(trackId.value, phase, { limit: pageSize })
        discussions.value = items
        hasMore.value = items.length === pageSize
      } else {
        discussions.value = await discussionApi.list(trackId.value, phase)
        hasMore.value = false
      }
    } catch (err: any) {
      loadError.value = err?.message || t('common.loadFailed')
    } finally {
      loading.value = false
    }
  }

  async function loadOlder() {
    if (!paginated || !hasMore.value || loadingOlder.value) return
    const oldestId = discussions.value[0]?.id
    if (oldestId === undefined) return
    loadingOlder.value = true
    try {
      const older = await discussionApi.list(trackId.value, phase, {
        beforeId: oldestId,
        limit: pageSize,
      })
      if (older.length > 0) {
        discussions.value = [...older, ...discussions.value]
      }
      hasMore.value = older.length === pageSize
    } catch {
      toastError(t('common.error'))
    } finally {
      loadingOlder.value = false
    }
  }

  // Pull the latest page and fold it into the current list without rewinding
  // any already-loaded older items. Used to react to realtime create/update.
  async function refreshLatestPage() {
    try {
      if (!paginated) {
        discussions.value = await discussionApi.list(trackId.value, phase)
        return
      }
      const latest = await discussionApi.list(trackId.value, phase, { limit: pageSize })
      const byId = new Map(latest.map(d => [d.id, d]))
      const merged = discussions.value.map(d => byId.get(d.id) ?? d)
      const existingIds = new Set(merged.map(d => d.id))
      for (const d of latest) {
        if (!existingIds.has(d.id)) merged.push(d)
      }
      merged.sort((a, b) => a.id - b.id)
      discussions.value = merged
    } catch {
      // silent; next user action will retry
    }
  }

  async function applyRealtimeEvent(event: string, discussionId: number) {
    if (event === 'deleted') {
      discussions.value = discussions.value.filter(d => d.id !== discussionId)
      return
    }
    // Updates to items outside our loaded range can't be applied by refreshing
    // only the latest page, so skip the refetch when the id isn't in view.
    if (event === 'updated' && !discussions.value.some(d => d.id === discussionId)) {
      return
    }
    await refreshLatestPage()
  }

  async function submit(payload: { content: string; images: File[]; audios: File[] }) {
    posting.value = true
    postingProgress.value = 0
    try {
      let d: Discussion

      if (appStore.r2Enabled && payload.audios.length > 0) {
        const presignedResp = await r2Api.requestDiscussionAudioUpload(
          trackId.value,
          payload.audios.map(file => ({
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            file_size: file.size,
          })),
        )
        const totalSize = payload.audios.reduce((sum, file) => sum + file.size, 0)
        let uploadedBytes = 0

        for (let index = 0; index < presignedResp.uploads.length; index += 1) {
          const file = payload.audios[index]
          const previousBytes = uploadedBytes
          await uploadToR2(
            presignedResp.uploads[index].upload_url,
            file,
            file.type || 'application/octet-stream',
            (percent) => {
              const currentBytes = previousBytes + (file.size * percent / 100)
              postingProgress.value = Math.round((currentBytes / totalSize) * 100)
            },
          )
          uploadedBytes += file.size
        }

        d = await discussionApi.create(trackId.value, {
          content: payload.content.trim(),
          phase,
          images: payload.images.length ? payload.images : undefined,
          audioObjectKeys: presignedResp.uploads.map(upload => upload.object_key),
          audioOriginalFilenames: payload.audios.map(file => file.name),
        }, payload.images.length > 0 ? (p) => { postingProgress.value = p } : undefined)
      } else {
        d = await discussionApi.create(trackId.value, {
          content: payload.content.trim(),
          phase,
          images: payload.images.length ? payload.images : undefined,
          audios: payload.audios.length ? payload.audios : undefined,
        }, (p) => { postingProgress.value = p })
      }

      if (!discussions.value.some(x => x.id === d.id)) {
        discussions.value.push(d)
      }
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
    loading,
    loadError,
    posting,
    postingProgress,
    editingId,
    editingContent,
    historyItems,
    showHistoryForId,
    loadingOlder,
    hasMore,
    load,
    loadOlder,
    applyRealtimeEvent,
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
