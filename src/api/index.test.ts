import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { issueApi, resolveAssetUrl, resolveUploadUrl, trackApi } from './index'

const fetchMock = vi.fn()

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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

  it('does not clear a newer login when an old-token request returns 401', async () => {
    localStorage.setItem('backkitchen_token', 'old-token')
    localStorage.setItem('backkitchen_user', '{"id":1}')
    fetchMock.mockImplementationOnce(async () => {
      localStorage.setItem('backkitchen_token', 'new-token')
      localStorage.setItem('backkitchen_user', '{"id":2}')
      return {
        ok: false,
        status: 401,
        json: async () => ({ detail: 'expired' }),
      }
    })

    await expect(trackApi.archive(1)).rejects.toThrow('expired')
    expect(localStorage.getItem('backkitchen_token')).toBe('new-token')
    expect(localStorage.getItem('backkitchen_user')).toBe('{"id":2}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-reads the current token before retrying idempotent requests', async () => {
    localStorage.setItem('backkitchen_token', 'old-token')
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem('backkitchen_token', 'new-token')
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: 'try again' }),
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      })

    await trackApi.list()

    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer old-token')
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe('Bearer new-token')
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

  it('normalizes uploaded asset paths without duplicating uploads prefix', () => {
    expect(resolveUploadUrl('avatars/user.png')).toBe('/uploads/avatars/user.png')
    expect(resolveUploadUrl('uploads/avatars/user.png')).toBe('/uploads/avatars/user.png')
    expect(resolveUploadUrl('/uploads/avatars/user.png')).toBe('/uploads/avatars/user.png')
  })

  it('resolves uploaded asset paths against configured api origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
    vi.resetModules()
    const { resolveUploadUrl: resolveUploadUrlWithOrigin } = await import('./index')

    expect(resolveUploadUrlWithOrigin('avatars/user.png')).toBe('https://api.example.test/uploads/avatars/user.png')
  })

  it('appends token params for protected attachment audio urls', () => {
    localStorage.setItem('backkitchen_token', 'secret token')

    expect(resolveAssetUrl('/api/comment-audios/7/file')).toBe('/api/comment-audios/7/file?token=secret%20token')
    expect(resolveAssetUrl('/api/discussion-audios/8/file?download=1')).toBe('/api/discussion-audios/8/file?download=1&token=secret%20token')
  })

  it('does not rewrite external absolute asset urls', () => {
    expect(resolveAssetUrl('https://cdn.example.com/audio.wav')).toBe('https://cdn.example.com/audio.wav')
  })
})
