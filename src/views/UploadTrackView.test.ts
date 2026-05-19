import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  albumListMock: vi.fn(),
  uploadWithProgressMock: vi.fn(),
  requestTrackUploadMock: vi.fn(),
  confirmTrackUploadMock: vi.fn(),
  uploadToR2Mock: vi.fn(),
  appStoreState: { r2Enabled: false, currentUser: { id: 99 } },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/upload' }),
  useRouter: () => ({ push: mocks.pushMock }),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/api', () => ({
  albumApi: { list: mocks.albumListMock },
  uploadWithProgress: mocks.uploadWithProgressMock,
  r2Api: {
    requestTrackUpload: mocks.requestTrackUploadMock,
    confirmTrackUpload: mocks.confirmTrackUploadMock,
  },
  uploadToR2: mocks.uploadToR2Mock,
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => mocks.appStoreState,
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

vi.mock('@/utils/audio', () => ({
  extractAudioDuration: vi.fn().mockResolvedValue(123),
}))

import UploadTrackView from './UploadTrackView.vue'

describe('UploadTrackView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.albumListMock.mockReset()
    mocks.uploadWithProgressMock.mockReset()
    mocks.requestTrackUploadMock.mockReset()
    mocks.confirmTrackUploadMock.mockReset()
    mocks.uploadToR2Mock.mockReset()
    mocks.appStoreState.r2Enabled = false
    mocks.appStoreState.currentUser = { id: 99 }
    mocks.albumListMock.mockResolvedValue([
      { id: 1, title: 'Album A' },
      { id: 2, title: 'Album B' },
    ])
  })

  it('loads albums on mount', async () => {
    mountWithPlugins(UploadTrackView)
    await flushPromises()
    expect(mocks.albumListMock).toHaveBeenCalledTimes(1)
  })

  it('disables submit when required fields are empty', async () => {
    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const submitBtn = wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('auto-fills title from selected file name', async () => {
    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'my-track.wav', { type: 'audio/wav' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    const inputs = wrapper.findAll('input')
    expect((inputs[1].element as HTMLInputElement).value).toBe('my-track')
  })

  it('uploads track and redirects on success', async () => {
    mocks.uploadWithProgressMock.mockImplementation(async (_path: string, formData: FormData, onProgress: (progress: number) => void) => {
      onProgress(100)
      return { id: 42, formData }
    })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    const inputs = wrapper.findAll('input')
    await inputs[1].setValue('My Track')
    await inputs[2].setValue('Artist Name')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    expect(mocks.uploadWithProgressMock).toHaveBeenCalledWith('/tracks', expect.any(FormData), expect.any(Function))
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/42', query: { returnTo: '/upload' } })
  })

  it('uploads a proxy submission with an external composer name', async () => {
    mocks.albumListMock.mockResolvedValue([{ id: 1, title: 'Album A', producer_id: 99 }])
    mocks.uploadWithProgressMock.mockResolvedValue({ id: 42 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'proxy.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.find('input[type="checkbox"]').setValue(true)
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[0].setValue('Proxy Track')
    await wrapper.find('input[placeholder="Name shown to the producer and mastering engineer"]').setValue('Offline Composer')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    const formData = mocks.uploadWithProgressMock.mock.calls[0][1] as FormData
    expect(formData.get('proxy_submission')).toBe('true')
    expect(formData.get('external_submitter_name')).toBe('Offline Composer')
    expect(formData.get('artist')).toBe('Offline Composer')
  })

  it('includes proxy submission metadata in the R2 upload flow', async () => {
    mocks.appStoreState.r2Enabled = true
    mocks.albumListMock.mockResolvedValue([{ id: 1, title: 'Album A', producer_id: 99 }])
    mocks.requestTrackUploadMock.mockResolvedValue({
      upload_url: 'https://upload.example',
      object_key: 'tracks/new/source/99/proxy.wav',
      upload_id: 'upload-1',
      expires_in: 300,
    })
    mocks.confirmTrackUploadMock.mockResolvedValue({ id: 84 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'proxy.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.find('input[type="checkbox"]').setValue(true)
    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[0].setValue('Proxy Track')
    await wrapper.find('input[placeholder="Name shown to the producer and mastering engineer"]').setValue('Offline Composer')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    expect(mocks.requestTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      proxy_submission: true,
      external_submitter_name: 'Offline Composer',
      artist: 'Offline Composer',
    }))
    expect(mocks.confirmTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      proxy_submission: true,
      external_submitter_name: 'Offline Composer',
      artist: 'Offline Composer',
    }))
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/84', query: { returnTo: '/upload' } })
  })
})
