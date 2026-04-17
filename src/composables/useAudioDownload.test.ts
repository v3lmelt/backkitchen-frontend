import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  loadAudioCachedMock: vi.fn(),
  fetchMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: mocks.toastErrorMock,
  }),
}))

vi.mock('@/utils/audioCache', () => ({
  loadAudioCached: mocks.loadAudioCachedMock,
}))

import { useAudioDownload } from './useAudioDownload'

describe('useAudioDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetchMock)
    mocks.loadAudioCachedMock.mockReset()
    mocks.fetchMock.mockReset()
    mocks.toastErrorMock.mockReset()
    vi.mocked(URL.createObjectURL).mockClear()
    vi.mocked(URL.revokeObjectURL).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes through loadAudioCached and triggers a browser download', async () => {
    mocks.loadAudioCachedMock.mockImplementation(async (_url: string, onProgress?: (p: number) => void) => {
      onProgress?.(50)
      onProgress?.(100)
      return 'blob:mock-url'
    })
    const downloadBlob = new Blob(['audio-bytes'], { type: 'audio/wav' })
    mocks.fetchMock.mockResolvedValue({ ok: true, blob: async () => downloadBlob })

    const { downloadAudioAsset, downloading, downloadProgress } = useAudioDownload()
    downloadAudioAsset('/api/tracks/1/audio?v=1', 'track', 'demo.wav')

    await flushPromises()

    expect(mocks.loadAudioCachedMock).toHaveBeenCalledWith(
      '/api/tracks/1/audio?v=1',
      expect.any(Function),
    )
    expect(mocks.fetchMock).toHaveBeenCalledWith('blob:mock-url')
    expect(URL.createObjectURL).toHaveBeenCalledWith(downloadBlob)
    expect(downloading.value).toBe(false)
    expect(downloadProgress.value).toBe(100)
    expect(mocks.toastErrorMock).not.toHaveBeenCalled()
  })

  it('shows a toast when loadAudioCached rejects', async () => {
    mocks.loadAudioCachedMock.mockRejectedValue(new Error('boom'))

    const { downloadAudioAsset, downloading } = useAudioDownload()
    downloadAudioAsset('/api/tracks/1/audio?v=1', 'track', 'demo.wav')

    await flushPromises()

    expect(mocks.toastErrorMock).toHaveBeenCalledWith('common.downloadFailed')
    expect(downloading.value).toBe(false)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('caps progress at 99 while fetching, then sets it to 100 on completion', async () => {
    const progressSnapshots: number[] = []
    mocks.loadAudioCachedMock.mockImplementation(async (_url: string, onProgress?: (p: number) => void) => {
      onProgress?.(42)
      progressSnapshots.push(progressBefore())
      onProgress?.(100)
      progressSnapshots.push(progressBefore())
      return 'blob:mock-url'
    })
    mocks.fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })

    const { downloadAudioAsset, downloadProgress } = useAudioDownload()
    function progressBefore() {
      return downloadProgress.value
    }

    downloadAudioAsset('/api/tracks/1/audio?v=1', 'track', 'demo.wav')
    await flushPromises()

    // While streaming: capped at 99. After completion: 100.
    expect(progressSnapshots).toEqual([42, 99])
    expect(downloadProgress.value).toBe(100)
  })
})
