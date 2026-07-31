import type { Ref } from 'vue'
import { isEditableTarget } from '@/utils/dom'

interface IssueFormLike {
  setRangeAnchorAt?: (time: number) => void
  commitRangeFromAnchorTo?: (time: number) => void
  removeLastMarker?: () => void
  clearRangeAnchor?: () => void
}

interface WaveformLike {
  togglePlay?: () => void
  getCurrentTime?: () => number
}

interface WaveformHotkeysDeps {
  issueFormRef: Ref<IssueFormLike | null | undefined>
  waveformRef: Ref<WaveformLike | null | undefined>
  canUse?: () => boolean
}

export function useWaveformHotkeys({ issueFormRef, waveformRef, canUse }: WaveformHotkeysDeps) {
  function handleWaveformHotkeys(event: KeyboardEvent) {
    if (canUse && !canUse()) return
    if (isEditableTarget(event.target)) return
    if (!issueFormRef.value || !waveformRef.value) return

    if (event.key === ' ') {
      event.preventDefault()
      waveformRef.value.togglePlay?.()
      return
    }

    if (event.key === '[') {
      event.preventDefault()
      const time = waveformRef.value.getCurrentTime?.() ?? 0
      issueFormRef.value.setRangeAnchorAt?.(time)
      return
    }

    if (event.key === ']') {
      event.preventDefault()
      const time = waveformRef.value.getCurrentTime?.() ?? 0
      issueFormRef.value.commitRangeFromAnchorTo?.(time)
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      issueFormRef.value.removeLastMarker?.()
      return
    }

    if (event.key === 'Escape') {
      issueFormRef.value.clearRangeAnchor?.()
    }
  }

  return { handleWaveformHotkeys }
}
