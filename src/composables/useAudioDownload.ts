import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import type { Track } from '@/types'

const TOKEN_KEY = 'backkitchen_token'

export function useAudioDownload() {
  const { t } = useI18n()
  const { error: toastError } = useToast()
  const downloading = ref(false)
  const downloadProgress = ref(0)

  async function downloadAudio(url: string, filename: string): Promise<void> {
    downloading.value = true
    downloadProgress.value = 0
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        toastError(t('common.downloadFailed'))
        return
      }

      const contentLength = res.headers.get('Content-Length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (!total || !res.body) {
        // Fallback: no Content-Length or no ReadableStream support
        const blob = await res.blob()
        downloadProgress.value = 100
        triggerDownload(blob, filename)
        return
      }

      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        downloadProgress.value = Math.min(Math.round((received / total) * 100), 99)
      }

      const blob = new Blob(chunks as unknown as BlobPart[])
      downloadProgress.value = 100
      triggerDownload(blob, filename)
    } finally {
      downloading.value = false
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  }

  function downloadTrackAudio(audioUrl: Ref<string>, track: Ref<Track | null>, suffix = ''): void {
    if (!audioUrl.value || !track.value) return
    const filePath = suffix === '_master'
      ? track.value.current_master_delivery?.file_path
      : track.value.file_path
    const ext = filePath?.split('.').pop() || 'wav'
    downloadAudio(audioUrl.value, `${track.value.title}${suffix}.${ext}`)
  }

  return { downloading, downloadProgress, downloadTrackAudio }
}
