import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./url', () => ({
  resolveAudioUrl: vi.fn(),
}))

function createStreamingResponse(chunks: Uint8Array[], type = 'audio/wav') {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  let index = 0

  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        if (name === 'content-length') return String(total)
        if (name === 'content-type') return type
        return null
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined }
            const value = chunks[index]
            index += 1
            return { done: false, value }
          },
        }
      },
    },
    blob: async () => new Blob(chunks, { type }),
  }
}

function createBlobResponse(type = 'audio/wav') {
  const blob = new Blob(['blob-data'], { type })
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        if (name === 'content-type') return type
        return null
      },
    },
    body: null,
    blob: async () => blob,
  }
}

async function loadAudioCacheModule() {
  const module = await import('./audioCache')
  const urlModule = await import('./url')
  return {
    loadAudioCached: module.loadAudioCached,
    resolveAudioUrl: vi.mocked(urlModule.resolveAudioUrl),
  }
}

describe('audioCache', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the persistent cache before hitting the network and then serves the memory hit', async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(new Response(new Blob(['cached'], { type: 'audio/wav' }))),
      put: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    }
    const cachesMock = { open: vi.fn().mockResolvedValue(cache) }
    const fetchMock = vi.fn()

    vi.stubGlobal('caches', cachesMock)
    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    const progress = vi.fn()

    const first = await loadAudioCached('/audio/1', progress)
    const second = await loadAudioCached('/audio/1')

    expect(first).toBe('blob:mock-url')
    expect(second).toBe(first)
    expect(progress).toHaveBeenLastCalledWith(100)
    expect(cachesMock.open).toHaveBeenCalledOnce()
    expect(cache.match).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolveAudioUrl).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent fetches, reports progress, and stores the blob in the persistent cache', async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    }
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamingResponse([
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
      ]),
    )

    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved/audio/2')
    const progress = vi.fn()

    const [first, second] = await Promise.all([
      loadAudioCached('https://app.example.com/audio/2', progress),
      loadAudioCached('https://app.example.com/audio/2'),
    ])
    await Promise.resolve()

    expect(first).toBe('blob:mock-url')
    expect(second).toBe(first)
    expect(resolveAudioUrl).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/resolved/audio/2')
    expect(progress.mock.calls.some(([value]) => value === 50)).toBe(true)
    expect(progress).toHaveBeenLastCalledWith(100)
    expect(cache.put).toHaveBeenCalledTimes(1)
  })

  it('evicts the least recently used in-memory entry once the cache exceeds its size limit', async () => {
    let objectUrlId = 0
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      objectUrlId += 1
      return `blob:generated-${objectUrlId}`
    })
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(createBlobResponse())

    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockImplementation(async rawUrl => `/resolved${rawUrl}`)

    for (let index = 0; index < 9; index += 1) {
      await loadAudioCached(`https://app.example.com/audio/${index}`)
    }

    expect(createObjectUrl).toHaveBeenCalledTimes(9)
    expect(fetchMock).toHaveBeenCalledTimes(9)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:generated-1')
  })
})
