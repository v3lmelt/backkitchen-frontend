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
  appStoreState: { r2Enabled: false, currentUser: { id: 99 } as any },
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

async function selectCustomOption(wrapper: any, triggerIndex: number, text: string) {
  const trigger = wrapper.findAll('.custom-select-trigger')[triggerIndex]
  if (!trigger) throw new Error(`Custom select trigger not found: ${triggerIndex}`)
  await trigger.trigger('click')
  await flushPromises()
  const option = wrapper.findAll('.custom-select-option').find((item: any) => item.text().includes(text))
  if (!option) throw new Error(`Custom select option not found: ${text}`)
  await option.trigger('click')
  await flushPromises()
}

async function setArtistUid(wrapper: any, rowIndex: number, uid: string) {
  const row = wrapper.findAll('[data-testid="artist-entry-row"]')[rowIndex]
  if (!row) throw new Error(`Artist row not found: ${rowIndex}`)
  await row.find('input[placeholder="UID optional"]').setValue(uid)
  await flushPromises()
}

async function addArtistEntry(wrapper: any) {
  await wrapper.findAll('button').find((button: any) => button.text().includes('Add artist'))!.trigger('click')
  await flushPromises()
}

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
    localStorage.clear()
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

  it('shows a retryable error and blocks submit when albums fail to load', async () => {
    mocks.albumListMock.mockRejectedValueOnce(new Error('Albums unavailable'))

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    expect(wrapper.text()).toContain('Albums unavailable')
    expect(wrapper.text()).toContain('Retry')
    const submitBtn = wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!
    expect(submitBtn.attributes('disabled')).toBeDefined()
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
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Artist Name')
    await setArtistUid(wrapper, 0, '99')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    expect(mocks.uploadWithProgressMock).toHaveBeenCalledWith('/tracks', expect.any(FormData), expect.any(Function))
    const formData = mocks.uploadWithProgressMock.mock.calls[0][1] as FormData
    expect(formData.getAll('composer_ids')).toEqual(['99'])
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/42', query: { returnTo: '/upload' } })
  })

  it('shows manual UID inputs without account option text', async () => {
    mocks.appStoreState.currentUser = { id: 99, display_name: 'Kira' }
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Album A',
        members: [
          { id: 1, user_id: 99, user: { id: 99, display_name: 'Kira' } },
          { id: 2, user_id: 2, user: { id: 2, display_name: 'Nova' } },
        ],
      },
    ])

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    expect(wrapper.find('input[placeholder="UID optional"]').exists()).toBe(true)
    expect((wrapper.find('input[placeholder="UID optional"]').element as HTMLInputElement).value).toBe('99')
    expect(wrapper.text()).not.toContain('No linked account')
    expect(wrapper.text()).not.toContain('Nova')
  })

  it('uploads joint platform composers together with external composer names', async () => {
    mocks.appStoreState.currentUser = { id: 99, display_name: 'Kira' }
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Album A',
        members: [
          { id: 1, user_id: 99, user: { id: 99, display_name: 'Kira' } },
          { id: 2, user_id: 2, user: { id: 2, display_name: 'Nova' } },
        ],
      },
    ])
    mocks.uploadWithProgressMock.mockResolvedValue({ id: 42 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'collab.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.find('input[placeholder="Enter track title"]').setValue('Collab Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Kira Alias')
    await addArtistEntry(wrapper)
    await wrapper.findAll('input[placeholder="Artist alias"]')[1].setValue('Nova Alias')
    await setArtistUid(wrapper, 1, '2')
    await addArtistEntry(wrapper)
    await wrapper.findAll('input[placeholder="Artist alias"]')[2].setValue('Offline Guest')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    const formData = mocks.uploadWithProgressMock.mock.calls[0][1] as FormData
    expect(formData.getAll('composer_ids')).toEqual(['99', '2'])
    expect(formData.getAll('external_composer_names')).toEqual(['Offline Guest'])
    expect(formData.get('artist')).toBe('Kira Alias / Nova Alias / Offline Guest')
  })

  it('blocks external-only artist rows for non-producers after the default UID is cleared', async () => {
    mocks.appStoreState.currentUser = { id: 99, display_name: 'Kira' }
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Album A',
        producer_id: 100,
        members: [{ id: 1, user_id: 99, user: { id: 99, display_name: 'Kira' } }],
      },
    ])

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'member.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await wrapper.find('input[placeholder="Enter track title"]').setValue('Member Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Kira Alias')
    await setArtistUid(wrapper, 0, '')

    const submitBtn = wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!
    expect(submitBtn.attributes('disabled')).toBeDefined()

    await setArtistUid(wrapper, 0, '99')

    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })

  it('allows manager-flagged albums to submit external-only proxy rows', async () => {
    mocks.appStoreState.currentUser = { id: 99, display_name: 'Kira' }
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Managed Album',
        producer_id: 100,
        viewer_is_album_manager: true,
        members: [],
      },
    ])
    mocks.uploadWithProgressMock.mockResolvedValue({ id: 42 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'proxy.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.find('input[placeholder="Enter track title"]').setValue('Proxy Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Offline Composer')
    await setArtistUid(wrapper, 0, '')

    const submitBtn = wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!
    expect(submitBtn.attributes('disabled')).toBeUndefined()

    await submitBtn.trigger('click')
    await flushPromises()

    const formData = mocks.uploadWithProgressMock.mock.calls[0][1] as FormData
    expect(formData.get('proxy_submission')).toBe('true')
    expect(formData.get('external_submitter_name')).toBe('Offline Composer')
    expect(formData.getAll('external_composer_names')).toEqual(['Offline Composer'])
    expect(formData.getAll('composer_ids')).toEqual([])
  })

  it('keeps manually entered artist UIDs after switching albums', async () => {
    mocks.appStoreState.currentUser = { id: 99, display_name: 'Kira' }
    mocks.albumListMock.mockResolvedValue([
      {
        id: 1,
        title: 'Owned Album',
        producer_id: 99,
        members: [
          { id: 1, user_id: 99, user: { id: 99, display_name: 'Kira' } },
          { id: 2, user_id: 2, user: { id: 2, display_name: 'Nova' } },
        ],
      },
      {
        id: 2,
        title: 'Other Album',
        producer_id: 99,
        members: [{ id: 1, user_id: 99, user: { id: 99, display_name: 'Kira' } }],
      },
    ])

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    await wrapper.find('input[placeholder="Artist alias"]').setValue('Nova Alias')
    await setArtistUid(wrapper, 0, '2')

    await selectCustomOption(wrapper, 0, 'Other Album')
    await flushPromises()

    expect((wrapper.find('input[placeholder="UID optional"]').element as HTMLInputElement).value).toBe('2')
  })

  it('migrates saved artist account bindings into manual UID inputs', async () => {
    localStorage.setItem('backkitchen_upload_draft_v1', JSON.stringify({
      title: 'Draft Track',
      album_id: 1,
      artist_entries: [{ name: 'Legacy Alias', user_id: 7 }],
    }))

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    expect((wrapper.find('input[placeholder="Enter track title"]').element as HTMLInputElement).value).toBe('Draft Track')
    expect((wrapper.find('input[placeholder="Artist alias"]').element as HTMLInputElement).value).toBe('Legacy Alias')
    expect((wrapper.find('input[placeholder="UID optional"]').element as HTMLInputElement).value).toBe('7')
  })

  it('blocks invalid manual artist UIDs', async () => {
    mocks.uploadWithProgressMock.mockResolvedValue({ id: 42 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'invalid.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await wrapper.find('input[placeholder="Enter track title"]').setValue('Invalid UID Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('UID Alias')
    await setArtistUid(wrapper, 0, 'abc')
    await wrapper.find('input[placeholder="UID optional"]').trigger('blur')

    const submitBtn = wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!
    expect(submitBtn.attributes('disabled')).toBeDefined()

    await submitBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('UID must be a positive whole number')
    expect(mocks.uploadWithProgressMock).not.toHaveBeenCalled()
  })

  it('includes manual UID composer IDs in the R2 upload flow', async () => {
    mocks.appStoreState.r2Enabled = true
    mocks.requestTrackUploadMock.mockResolvedValue({
      upload_url: 'https://upload.example',
      object_key: 'tracks/new/source/99/r2.wav',
      upload_id: 'upload-1',
      expires_in: 300,
    })
    mocks.confirmTrackUploadMock.mockResolvedValue({ id: 84 })

    const wrapper = mountWithPlugins(UploadTrackView)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['audio'], 'r2.wav', { type: 'audio/wav' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper.find('input[placeholder="Enter track title"]').setValue('R2 Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('R2 Alias')
    await setArtistUid(wrapper, 0, '99')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    expect(mocks.requestTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      external_composer_names: [],
      composer_ids: [99],
      artist: 'R2 Alias',
    }))
    expect(mocks.confirmTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      external_composer_names: [],
      composer_ids: [99],
      artist: 'R2 Alias',
    }))
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/84', query: { returnTo: '/upload' } })
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

    await wrapper.find('input[placeholder="Enter track title"]').setValue('Proxy Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Offline Composer')
    await setArtistUid(wrapper, 0, '')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    const formData = mocks.uploadWithProgressMock.mock.calls[0][1] as FormData
    expect(formData.get('proxy_submission')).toBe('true')
    expect(formData.get('external_submitter_name')).toBe('Offline Composer')
    expect(formData.getAll('external_composer_names')).toEqual(['Offline Composer'])
    expect(formData.getAll('composer_ids')).toEqual([])
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

    await wrapper.find('input[placeholder="Enter track title"]').setValue('Proxy Track')
    await wrapper.find('input[placeholder="Artist alias"]').setValue('Offline Composer')
    await setArtistUid(wrapper, 0, '')

    await wrapper.findAll('button').find(button => button.text().includes('Submit Track'))!.trigger('click')
    await flushPromises()

    expect(mocks.requestTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      proxy_submission: true,
      external_submitter_name: 'Offline Composer',
      external_composer_names: ['Offline Composer'],
      composer_ids: [],
      artist: 'Offline Composer',
    }))
    expect(mocks.confirmTrackUploadMock).toHaveBeenCalledWith(expect.objectContaining({
      proxy_submission: true,
      external_submitter_name: 'Offline Composer',
      external_composer_names: ['Offline Composer'],
      composer_ids: [],
      artist: 'Offline Composer',
    }))
    expect(mocks.pushMock).toHaveBeenCalledWith({ path: '/tracks/84', query: { returnTo: '/upload' } })
  })
})
