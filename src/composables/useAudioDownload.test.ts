import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  resolveAudioUrlMock: vi.fn(),
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

vi.mock('@/utils/url', () => ({
  resolveAudioUrl: mocks.resolveAudioUrlMock,
}))

import { useAudioDownload } from './useAudioDownload'

describe('useAudioDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetchMock)
    mocks.fetchMock.mockReset()
    mocks.resolveAudioUrlMock.mockReset()
    mocks.toastErrorMock.mockReset()
    vi.mocked(URL.createObjectURL).mockClear()
    vi.mocked(URL.revokeObjectURL).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a toast when audio url resolution fails', async () => {
    mocks.resolveAudioUrlMock.mockRejectedValue(new Error('boom'))

    const { downloadAudioAsset, downloading } = useAudioDownload()
    downloadAudioAsset('/api/tracks/1/audio', 'track', 'demo.wav')

    await flushPromises()

    expect(mocks.toastErrorMock).toHaveBeenCalledWith('common.downloadFailed')
    expect(downloading.value).toBe(false)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a toast when fetch throws before the blob is downloaded', async () => {
    mocks.resolveAudioUrlMock.mockResolvedValue('/api/tracks/1/audio?token=token-1')
    mocks.fetchMock.mockRejectedValue(new Error('network down'))

    const { downloadTrackAudio, downloading } = useAudioDownload()
    downloadTrackAudio(
      { value: '/api/tracks/1/audio' } as any,
      { value: { title: 'Demo', file_path: 'demo.wav' } } as any,
    )

    await flushPromises()

    expect(mocks.fetchMock).toHaveBeenCalledWith('/api/tracks/1/audio?token=token-1')
    expect(mocks.toastErrorMock).toHaveBeenCalledWith('common.downloadFailed')
    expect(downloading.value).toBe(false)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
