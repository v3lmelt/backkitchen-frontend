import { resolveAudioUrl } from './url'

/**
 * Two-layer audio cache: in-memory LRU + persistent Cache API.
 *
 * Keyed by the raw audio URL (before token / presigned resolution),
 * which already encodes track ID + version/cycle and is therefore
 * a stable content identifier.
 *
 * Layer 1 (in-memory Map):
 *   Stores Blob object URLs for instant same-session access when
 *   navigating between views (e.g. TrackDetail → PeerReview).
 *   Cleared on page refresh.
 *
 * Layer 2 (Cache API — persistent):
 *   Stores the fetched Blob in the browser's Cache Storage so that
 *   page refreshes do not re-download large audio files (~100 MB WAV).
 *   Survives refresh, tab close, and browser restart.
 */

const MAX_MEMORY_ENTRIES = 8
const PERSISTENT_CACHE_NAME = 'backkitchen-audio-v1'
/**
 * Soft budget for the persistent cache.  Chosen to keep a handful of large
 * (50–150 MB) WAV masters around without risking browser quota on typical
 * laptops.  Entries are evicted FIFO (Cache API keys() preserve insertion
 * order) until the total fits under this limit.
 */
const MAX_PERSISTENT_BYTES = 1.5 * 1024 * 1024 * 1024

interface CacheEntry {
  blob: Blob
  objectUrl: string
  /** Timestamp of last access — used for LRU eviction. */
  lastAccess: number
}

const _cache = new Map<string, CacheEntry>()

/** In-flight fetch promises — prevents duplicate concurrent fetches for the same key. */
const _pending = new Map<string, Promise<string>>()

/**
 * Strip auth tokens so callers that accidentally pass an authed URL still
 * hit the same cache entry as the canonical form.  Also keeps playback and
 * download paths sharing the same cache key even if one of them forgets.
 */
function _normalizeKey(url: string): string {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return url
  const params = new URLSearchParams(url.slice(qIndex + 1))
  if (!params.has('token')) return url
  if (import.meta.env?.DEV) {
    console.warn('[audioCache] rawUrl contained `token` query param; stripping for cache key')
  }
  params.delete('token')
  const cleaned = params.toString()
  return cleaned ? `${url.slice(0, qIndex)}?${cleaned}` : url.slice(0, qIndex)
}

function _warnIfUnversioned(key: string): void {
  if (!import.meta.env?.DEV) return
  const qIndex = key.indexOf('?')
  const params = new URLSearchParams(qIndex === -1 ? '' : key.slice(qIndex + 1))
  if (!params.has('v') && !params.has('c')) {
    console.warn(
      `[audioCache] URL "${key}" lacks version query params (v / c); cached copy may become stale after re-uploads`,
    )
  }
}

function _evictMemoryIfNeeded() {
  while (_cache.size > MAX_MEMORY_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of _cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
      }
    }
    if (oldestKey) {
      const entry = _cache.get(oldestKey)!
      URL.revokeObjectURL(entry.objectUrl)
      _cache.delete(oldestKey)
    }
  }
}

async function _openPersistentCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(PERSISTENT_CACHE_NAME)
  } catch {
    return null
  }
}

async function _evictPersistentToFit(cache: Cache, incomingBytes: number): Promise<void> {
  try {
    const keys = await cache.keys()
    const entries: Array<{ key: Request; size: number }> = []
    for (const key of keys) {
      const resp = await cache.match(key)
      const len = resp?.headers.get('content-length')
      entries.push({ key, size: len ? parseInt(len, 10) || 0 : 0 })
    }
    let total = entries.reduce((sum, e) => sum + e.size, 0) + incomingBytes
    for (const entry of entries) {
      if (total <= MAX_PERSISTENT_BYTES) break
      await cache.delete(entry.key)
      total -= entry.size
    }
  } catch {
    // Ignore eviction errors — worst case we simply skip this put
  }
}

async function _persistBlob(cache: Cache, key: string, blob: Blob): Promise<void> {
  try {
    await _evictPersistentToFit(cache, blob.size)
    const response = new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'audio/mpeg',
        'Content-Length': String(blob.size),
      },
    })
    await cache.put(new Request(key), response)
  } catch (err: unknown) {
    // Quota can still trip even after eviction (other origins, stale stats).
    // Wipe the namespace so in-memory playback keeps working without
    // repeatedly hammering the failing put.
    if ((err as { name?: string } | null)?.name === 'QuotaExceededError') {
      try { await caches.delete(PERSISTENT_CACHE_NAME) } catch { /* ignore */ }
    }
  }
}

function _storeInMemory(key: string, blob: Blob): string {
  const objectUrl = URL.createObjectURL(blob)
  _cache.set(key, { blob, objectUrl, lastAccess: Date.now() })
  _evictMemoryIfNeeded()
  return objectUrl
}

/**
 * Resolve an audio URL to a cached object URL.
 *
 * Returns a blob: URL that WaveSurfer can load directly.
 * On cache hit (memory or persistent) the network is skipped entirely.
 *
 * @param rawUrl  The unresolved audio URL (as passed via the audioUrl prop).
 *                Callers should pass the bare versioned endpoint without a
 *                `token` param; tokens are stripped from the cache key (with
 *                a dev-mode warning) so entries stay stable across sessions.
 * @param onProgress  Optional callback receiving download percentage (0–100).
 */
export async function loadAudioCached(
  rawUrl: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  // Blob URLs are already local — pass through
  if (rawUrl.startsWith('blob:')) return rawUrl

  const key = _normalizeKey(rawUrl)
  _warnIfUnversioned(key)

  // Layer 1: in-memory cache hit
  const cached = _cache.get(key)
  if (cached) {
    cached.lastAccess = Date.now()
    onProgress?.(100)
    return cached.objectUrl
  }

  // De-duplicate concurrent fetches for the same URL
  const inflight = _pending.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    // Layer 2: persistent Cache API hit
    const persistentCache = await _openPersistentCache()
    if (persistentCache) {
      try {
        const cachedResponse = await persistentCache.match(key)
        if (cachedResponse) {
          const blob = await cachedResponse.blob()
          onProgress?.(100)
          return _storeInMemory(key, blob)
        }
      } catch {
        // Cache read failed — fall through to network
      }
    }

    // Layer 3: network fetch
    const resolved = await resolveAudioUrl(key)
    const response = await fetch(resolved)
    if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`)

    let blob: Blob
    const contentLength = response.headers.get('content-length')
    if (contentLength && response.body) {
      const total = parseInt(contentLength, 10)
      const reader = response.body.getReader()
      const chunks: BlobPart[] = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.byteLength
        onProgress?.(Math.round((received / total) * 100))
      }
      blob = new Blob(chunks, {
        type: response.headers.get('content-type') || 'audio/mpeg',
      })
    } else {
      // Fallback: no content-length or no ReadableStream
      blob = await response.blob()
    }

    onProgress?.(100)

    // Store in persistent Cache API (fire-and-forget)
    if (persistentCache) {
      void _persistBlob(persistentCache, key, blob)
    }

    return _storeInMemory(key, blob)
  })()

  _pending.set(key, promise)
  try {
    return await promise
  } finally {
    _pending.delete(key)
  }
}
