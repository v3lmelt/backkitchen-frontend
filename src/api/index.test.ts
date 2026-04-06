import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { issueApi, resolveAssetUrl, trackApi } from './index'

const fetchMock = vi.fn()

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds auth and json headers for json requests', async () => {
    localStorage.setItem('backkitchen_token', 'secret-token')
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })

    await trackApi.list({ status: 'peer_review', album_id: 12 })

    expect(fetchMock).toHaveBeenCalledWith('/api/tracks?status=peer_review&album_id=12', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
      },
    })
  })

  it('does not force json headers for form data requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1 }),
    })

    await issueApi.addComment(7, { content: 'hello', images: [new File(['x'], 'shot.png', { type: 'image/png' })] })

    const [, options] = fetchMock.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('clears auth on 401 responses', async () => {
    localStorage.setItem('backkitchen_token', 'stale')
    localStorage.setItem('backkitchen_user', '{"id":1}')
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'expired' }),
    })

    await expect(trackApi.get(1)).rejects.toThrow('expired')
    expect(localStorage.getItem('backkitchen_token')).toBeNull()
    expect(localStorage.getItem('backkitchen_user')).toBeNull()
  })

  it('formats array validation errors into a single message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ msg: 'title required' }, { msg: 'file missing' }] }),
    })

    await expect(trackApi.get(1)).rejects.toThrow('title required; file missing')
  })

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    })

    await expect(trackApi.delete(9)).resolves.toBeUndefined()
  })

  it('resolves relative asset urls to api origin', () => {
    expect(resolveAssetUrl('/uploads/comment_images/abc.png')).toBe('/uploads/comment_images/abc.png')
  })
})
