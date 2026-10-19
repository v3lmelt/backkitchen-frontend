import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSourceAudioUrl, resolveIssueAudio } from './issueAudio'
import { masterDeliveryAudioUrl, sourceVersionAudioUrl } from '@/api'
import { historyIssue, historyMaster, historySource, historyTrack } from '@/tests/issueHistoryFixtures'

vi.mock('./url', () => ({
  resolveAudioUrl: vi.fn(),
}))

// Tests use absolute URLs because Node's `Request` constructor rejects
// relative paths. Real browsers resolve relative URLs against document.baseURI
// so production callers in dev (VITE_API_BASE_URL empty) still work.
const BASE = 'https://app.example'

function streamingResponse(chunks: Uint8Array[], type = 'audio/wav') {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  let index = 0
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        const lowered = name.toLowerCase()
        if (lowered === 'content-length') return String(total)
        if (lowered === 'content-type') return type
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
    blob: async () => new Blob(chunks as BlobPart[], { type }),
  }
}

async function loadAudioCacheModule() {
  const module = await import('./audioCache')
  const urlModule = await import('./url')
  return {
    loadAudioCached: module.loadAudioCached,
    loadAudioBlobCached: module.loadAudioBlobCached,
    resolveAudioUrl: vi.mocked(urlModule.resolveAudioUrl),
  }
}

function makeCacheMock(initial: Array<{ url: string; size: number }> = []) {
  const store = new Map<string, { size: number; response: Response }>()
  for (const { url, size } of initial) {
    // Bytes work with Node's Response without mixing Node and jsdom Blob realms.
    const response = new Response(new Uint8Array(Math.min(size, 16)), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(size),
      },
    })
    store.set(url, { size, response })
  }
  const urlOf = (req: unknown): string =>
    typeof req === 'string' ? req : (req as { url: string }).url
  const cache = {
    match: vi.fn(async (req: unknown) => store.get(urlOf(req))?.response.clone()),
    put: vi.fn(async (req: unknown, resp: Response) => {
      const len = resp.headers.get('content-length')
      store.set(urlOf(req), { size: len ? parseInt(len, 10) : 0, response: resp.clone() })
    }),
    keys: vi.fn(async () => Array.from(store.keys()).map((url) => ({ url }))),
    delete: vi.fn(async (req: unknown) => store.delete(urlOf(req))),
  }
  return { cache, store }
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

  it('serves the persistent cache hit without going to the network', async () => {
    const { cache } = makeCacheMock([{ url: `${BASE}/api/tracks/1/audio?v=3`, size: 128 }])
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    const progress = vi.fn()

    const result = await loadAudioCached(`${BASE}/api/tracks/1/audio?v=3`, progress)

    expect(result).toBe('blob:mock-url')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolveAudioUrl).not.toHaveBeenCalled()
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it('serves cached blobs directly without creating an object URL', async () => {
    const { cache } = makeCacheMock([{ url: `${BASE}/api/tracks/1/audio?v=3`, size: 128 }])
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')

    const { loadAudioBlobCached, resolveAudioUrl } = await loadAudioCacheModule()
    const progress = vi.fn()

    const result = await loadAudioBlobCached(`${BASE}/api/tracks/1/audio?v=3`, progress)

    expect(result.type).toBe('audio/wav')
    expect(result.size).toBe(16)
    expect(result.slice(0, 4).size).toBe(4)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolveAudioUrl).not.toHaveBeenCalled()
    expect(createObjectUrl).not.toHaveBeenCalled()
    expect(progress).toHaveBeenLastCalledWith(100)
  })

  it('dedupes concurrent fetches, streams progress, and persists with a Content-Length header', async () => {
    const { cache, store } = makeCacheMock()
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5, 6])]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved/audio')

    const progress = vi.fn()
    const url = `${BASE}/api/tracks/2/audio?v=1`
    const [a, b] = await Promise.all([
      loadAudioCached(url, progress),
      loadAudioCached(url),
    ])
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled())

    expect(a).toBe('blob:mock-url')
    expect(b).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resolveAudioUrl).toHaveBeenCalledWith(url)
    expect(progress).toHaveBeenLastCalledWith(100)
    const stored = store.get(url)
    expect(stored?.response.headers.get('content-length')).toBe('6')
  })

  it('evicts the least-recently used in-memory entry past the size limit', async () => {
    let id = 0
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      id += 1
      return `blob:generated-${id}`
    })
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])]))
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(makeCacheMock().cache) })
    vi.stubGlobal('fetch', fetchMock)

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockImplementation(async (url) => `/resolved${url}`)

    for (let i = 0; i < 9; i += 1) {
      await loadAudioCached(`${BASE}/api/tracks/${i}/audio?v=1`)
    }

    expect(createObjectUrl).toHaveBeenCalledTimes(9)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:generated-1')
  })

  it('strips the token query param from the cache key', async () => {
    const { cache, store } = makeCacheMock()
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1, 2, 3])]))
    vi.stubGlobal('fetch', fetchMock)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved')

    await loadAudioCached(`${BASE}/api/tracks/9/audio?v=2&token=abc`)
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled())

    const keys = Array.from(store.keys())
    expect(keys).toEqual([`${BASE}/api/tracks/9/audio?v=2`])
    expect(resolveAudioUrl).toHaveBeenCalledWith(`${BASE}/api/tracks/9/audio?v=2`)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token'))
  })

  it('warns when the URL has no version query param', async () => {
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(makeCacheMock().cache) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1])])))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved')

    await loadAudioCached(`${BASE}/api/tracks/1/audio`)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lacks version query params'))
  })

  it('evicts oldest persistent entries until the byte budget fits the incoming blob', async () => {
    const HUGE = 2 * 1024 * 1024 * 1024 // 2 GB — guaranteed to exceed the 1.5 GB budget
    const { cache, store } = makeCacheMock([
      { url: `${BASE}/api/tracks/1/audio?v=1`, size: HUGE },
      { url: `${BASE}/api/tracks/2/audio?v=1`, size: HUGE },
    ])
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1, 2, 3])])))

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved')

    await loadAudioCached(`${BASE}/api/tracks/3/audio?v=1`)
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled())

    expect(store.has(`${BASE}/api/tracks/1/audio?v=1`)).toBe(false)
    expect(store.has(`${BASE}/api/tracks/2/audio?v=1`)).toBe(false)
    expect(store.has(`${BASE}/api/tracks/3/audio?v=1`)).toBe(true)
  })

  it('wipes the persistent namespace when put hits QuotaExceededError', async () => {
    const { cache } = makeCacheMock()
    cache.put.mockImplementation(async () => {
      const err = new Error('quota') as Error & { name: string }
      err.name = 'QuotaExceededError'
      throw err
    })
    const cachesDelete = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache), delete: cachesDelete })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([1, 2, 3])])))

    const { loadAudioCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved')

    await loadAudioCached(`${BASE}/api/tracks/7/audio?v=1`)
    await vi.waitFor(() => expect(cachesDelete).toHaveBeenCalledWith('backkitchen-audio-v1'))
  })
  it('downloads each canonical source or master once across main and independent issue preview', async () => {
    const { cache } = makeCacheMock()
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn().mockImplementation(async () => streamingResponse([new Uint8Array([1, 2, 3])]))
    vi.stubGlobal('fetch', fetchMock)
    const { loadAudioBlobCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved/audio')
    const track = historyTrack()
    const mainSource = new URL(currentSourceAudioUrl(track, track.source_versions), BASE).href
    const issueSource = new URL(resolveIssueAudio(historyIssue(), track), BASE).href
    const sourceBlob = await loadAudioBlobCached(mainSource)
    expect(await loadAudioBlobCached(issueSource)).toBe(sourceBlob)
    const mainMaster = new URL(masterDeliveryAudioUrl(9, historyMaster()), BASE).href
    const issueMaster = new URL(resolveIssueAudio(historyIssue({ master_delivery_id: 22 }), track), BASE).href
    const masterBlob = await loadAudioBlobCached(mainMaster)
    expect(await loadAudioBlobCached(issueMaster)).toBe(masterBlob)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(resolveAudioUrl).toHaveBeenCalledTimes(2)
  })

  it('misses the cache when a reused source record ID has a different creation timestamp', async () => {
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(makeCacheMock().cache) })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamingResponse([new Uint8Array([1])]))
      .mockResolvedValueOnce(streamingResponse([new Uint8Array([2, 3])]))
    vi.stubGlobal('fetch', fetchMock)
    const { loadAudioBlobCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved/audio')
    const original = historySource()
    const replacement = { ...original, created_at: '2026-10-13T03:00:00Z' }
    const originalUrl = new URL(sourceVersionAudioUrl(9, original), BASE).href
    const replacementUrl = new URL(sourceVersionAudioUrl(9, replacement), BASE).href
    const before = await loadAudioBlobCached(originalUrl)
    const after = await loadAudioBlobCached(replacementUrl)
    expect(originalUrl).not.toBe(replacementUrl)
    expect(after).not.toBe(before)
    expect(before.size).toBe(1)
    expect(after.size).toBe(2)
    expect(await loadAudioBlobCached(replacementUrl)).toBe(after)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    '/api/tracks/9/audio?v=3',
    '/api/tracks/9/source-versions/13/audio',
    '/api/tracks/9/source-versions/13/audio?v=3&c=2',
  ])('does not promote an older mutable or incomplete identity cache entry: %s', async (oldPath) => {
    const { cache } = makeCacheMock([{ url: `${BASE}${oldPath}`, size: 16 }])
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse([new Uint8Array([4, 5, 6])]))
    vi.stubGlobal('fetch', fetchMock)
    const { loadAudioBlobCached, resolveAudioUrl } = await loadAudioCacheModule()
    resolveAudioUrl.mockResolvedValue('/resolved/audio')
    const canonical = new URL(sourceVersionAudioUrl(9, historySource()), BASE).href
    const audio = await loadAudioBlobCached(canonical)
    expect(audio.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
