import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithPlugins } from '@/tests/utils'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  albumListMock: vi.fn(),
  trackUploadMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.pushMock }),
}))

vi.mock('@/api', () => ({
  trackApi: { upload: mocks.trackUploadMock },
  albumApi: { list: mocks.albumListMock },
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
    mocks.trackUploadMock.mockReset()
    mocks.albumListMock.mockResolvedValue([
      { id: 1, title: 'Album A' },
      { id: 2, title: 'Album B' },
    ])
  })

  it('loads albums on mount', async () => {
    mountWithPlugins(UploadTrackView)
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.albumListMock).toHaveBeenCalledTimes(1)
  })

  it('disables submit when required fields are empty', async () => {
    const wrapper = mountWithPlugins(UploadTrackView)
    await Promise.resolve()
    await Promise.resolve()

    const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit'))
    expect(submitBtn).toBeTruthy()
    expect(submitBtn!.attributes('disabled')).toBeDefined()
  })

  it('auto-fills title from selected file name', async () => {
    const wrapper = mountWithPlugins(UploadTrackView)
    await Promise.resolve()
    await Promise.resolve()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'my-track.wav', { type: 'audio/wav' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    const titleInput = wrapper.findAll('input').find(i => (i.element as HTMLInputElement).type === 'text')
    expect(titleInput).toBeTruthy()
    expect((titleInput!.element as HTMLInputElement).value).toBe('my-track')
  })

  it('uploads track and redirects on success', async () => {
    mocks.trackUploadMock.mockResolvedValue({ id: 42 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await Promise.resolve()
    await Promise.resolve()

    // Select file
    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    // Fill form fields
    const textInputs = wrapper.findAll('input').filter(i => (i.element as HTMLInputElement).type === 'text' || (i.element as HTMLInputElement).type === '')
    expect(textInputs.length).toBeGreaterThanOrEqual(2)
    await textInputs[0].setValue('My Track')
    await textInputs[1].setValue('Artist Name')

    // Find and click upload button (last button)
    const buttons = wrapper.findAll('button')
    const uploadBtn = buttons[buttons.length - 1]
    expect(uploadBtn.exists()).toBe(true)
    await uploadBtn.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.trackUploadMock).toHaveBeenCalled()
    expect(mocks.pushMock).toHaveBeenCalledWith('/tracks/42')
  })
})
