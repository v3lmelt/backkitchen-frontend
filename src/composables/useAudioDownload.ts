import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import type { Track } from '@/types'
import { loadAudioCached } from '@/utils/audioCache'

export function useAudioDownload() {
  const { t } = useI18n()
  const { error: toastError } = useToast()
  const downloading = ref(false)
  const downloadProgress = ref(0)

  async function downloadAudio(url: string, filename: string): Promise<void> {
    downloading.value = true
    downloadProgress.value = 0
    try {
      // Route through the shared audio cache so downloads reuse bytes that
      // playback has already fetched (and vice versa).  `loadAudioCached`
      // handles URL resolution, streaming progress, and persistence.
      const blobUrl = await loadAudioCached(url, (percent) => {
        downloadProgress.value = Math.min(Math.max(percent, 0), 99)
      })
      const res = await fetch(blobUrl)
      const blob = await res.blob()
      downloadProgress.value = 100
      triggerDownload(blob, filename)
    } catch {
      toastError(t('common.downloadFailed'))
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

  function extensionFromPath(filePath?: string | null): string {
    return filePath?.split('.').pop() || 'wav'
  }

  function downloadAudioAsset(audioUrl: string, filenameStem: string, filePath?: string | null): void {
    if (!audioUrl) return
    void downloadAudio(audioUrl, `${filenameStem}.${extensionFromPath(filePath)}`)
  }

  function downloadTrackAudio(audioUrl: Ref<string>, track: Ref<Track | null>, suffix = ''): void {
    if (!audioUrl.value || !track.value) return
    const filePath = suffix === '_master'
      ? track.value.current_master_delivery?.file_path
      : track.value.file_path
    downloadAudioAsset(audioUrl.value, `${track.value.title}${suffix}`, filePath)
  }

  return { downloading, downloadProgress, downloadTrackAudio, downloadAudioAsset }
}
