import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import type { Track } from '@/types'

const TOKEN_KEY = 'backkitchen_token'

export function useAudioDownload() {
  const { t } = useI18n()
  const { error: toastError } = useToast()
  const downloading = ref(false)

  async function downloadAudio(url: string, filename: string): Promise<void> {
    downloading.value = true
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        toastError(t('common.downloadFailed'))
        return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } finally {
      downloading.value = false
    }
  }

  function downloadTrackAudio(audioUrl: Ref<string>, track: Ref<Track | null>, suffix = ''): void {
    if (!audioUrl.value || !track.value) return
    const filePath = suffix === '_master'
      ? track.value.current_master_delivery?.file_path
      : track.value.file_path
    const ext = filePath?.split('.').pop() || 'wav'
    downloadAudio(audioUrl.value, `${track.value.title}${suffix}.${ext}`)
  }

  return { downloading, downloadAudio, downloadTrackAudio }
}
