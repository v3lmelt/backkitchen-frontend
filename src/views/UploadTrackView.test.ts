import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  albumListMock: vi.fn(),
  uploadWithProgressMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/upload' }),
  useRouter: () => ({ push: mocks.pushMock }),
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('@/api', () => ({
  albumApi: { list: mocks.albumListMock },
  uploadWithProgress: mocks.uploadWithProgressMock,
  r2Api: {},
  uploadToR2: vi.fn(),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ r2Enabled: false }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}))

import UploadTrackView from './UploadTrackView.vue'

describe('UploadTrackView', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.albumListMock.mockReset()
    mocks.uploadWithProgressMock.mockReset()
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
})
