import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithPlugins } from '@/tests/utils'
import AuthenticatedImageLink from './AuthenticatedImageLink.vue'

vi.mock('@/api', () => ({
  getAuthToken: () => 'fixture-token',
  resolveAssetUrl: (path: string) => path,
}))
let wrapper: VueWrapper | undefined
let nextObjectUrl = 0
const createObjectURL = vi.fn((_blob: Blob | MediaSource) => `blob:attachment-${++nextObjectUrl}`)
const revokeObjectURL = vi.fn((_url: string) => undefined)

beforeEach(() => {
  vi.useFakeTimers()
  nextObjectUrl = 0
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL = createObjectURL
    static override revokeObjectURL = revokeObjectURL
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AuthenticatedImageLink', () => {
  it('keeps denied attachment bytes out of previews and links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private', { status: 403 })))
    wrapper = mountWithPlugins(AuthenticatedImageLink, {
      props: { src: '/api/comment-images/1/file', alt: 'attachment' },
    })
    await vi.waitFor(() => expect(wrapper!.attributes('aria-busy')).toBe('false'))
    expect(wrapper.attributes('href')).toBeUndefined()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.attributes('aria-disabled')).toBe('true')
  })

  it('retains the new record image when an old request completes late', async () => {
    const previous = Promise.withResolvers<Response>()
    const lateResponse = new Response('old image', { headers: { 'Content-Type': 'image/png' } })
    vi.spyOn(lateResponse, 'blob').mockResolvedValue(new Blob(['old image'], { type: 'image/png' }))
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(new Response('new image', { headers: { 'Content-Type': 'image/png' } })))
    wrapper = mountWithPlugins(AuthenticatedImageLink, {
      props: { src: '/api/comment-images/1/file', alt: 'attachment' },
    })
    await wrapper.setProps({ src: '/api/comment-images/2/file' })
    await vi.waitFor(() => expect(wrapper!.attributes('href')).toBe('blob:attachment-1'))
    previous.resolve(lateResponse)
    await previous.promise
    await nextTick()
    expect(wrapper.attributes('href')).toBe('blob:attachment-1')
    expect(wrapper.attributes('aria-disabled')).toBe('false')
  })

  it('keeps the account token out of foreign image requests', async () => {
    const fetchImage = vi.fn<typeof fetch>().mockResolvedValue(new Response('public image', {
      headers: { 'Content-Type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchImage)
    wrapper = mountWithPlugins(AuthenticatedImageLink, {
      props: { src: 'https://cdn.example.invalid/image.png', alt: 'attachment' },
    })
    await vi.waitFor(() => expect(wrapper!.attributes('href')).toBe('blob:attachment-1'))
    const options = fetchImage.mock.calls[0]?.[1]
    expect(new Headers(options?.headers).has('Authorization')).toBe(false)
  })
})
