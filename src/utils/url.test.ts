import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildWsUrl, resolveAudioUrl, withAuthToken } from './url'

describe('url helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('builds websocket URLs from the configured API base', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    expect(buildWsUrl('/ws/tracks/1')).toBe('wss://api.example.com/ws/tracks/1')

    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    expect(buildWsUrl('/ws/tracks/1')).toBe('ws://localhost:8000/ws/tracks/1')
  })

  it('appends the stored auth token without clobbering existing query params', () => {
    localStorage.setItem('backkitchen_token', 'token with space')

    expect(withAuthToken('/api/tracks/1/audio')).toBe('/api/tracks/1/audio?token=token%20with%20space')
    expect(withAuthToken('/api/tracks/1/audio?download=1')).toBe('/api/tracks/1/audio?download=1&token=token%20with%20space')
  })

  it('returns blob and external absolute URLs as-is', async () => {
    expect(await resolveAudioUrl('blob:local-audio')).toBe('blob:local-audio')
    expect(await resolveAudioUrl('https://cdn.example.com/audio.wav')).toBe('https://cdn.example.com/audio.wav')
  })

  it('resolves relative API audio URLs through the backend and falls back to the authed URL on failure', async () => {
    localStorage.setItem('backkitchen_token', 'secret')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/resolved.wav' }),
      })
      .mockRejectedValueOnce(new Error('network down'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveAudioUrl('/api/tracks/1/audio')).resolves.toBe('https://cdn.example.com/resolved.wav')
    await expect(resolveAudioUrl('/api/tracks/2/audio')).resolves.toBe('/api/tracks/2/audio?token=secret')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/tracks/1/audio?token=secret&resolve=json')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/tracks/2/audio?token=secret&resolve=json')
  })
})
