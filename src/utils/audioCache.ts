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
const MAX_PERSISTENT_ENTRIES = 16

interface CacheEntry {
  blob: Blob
  objectUrl: string
  /** Timestamp of last access — used for LRU eviction. */
  lastAccess: number
}

const _cache = new Map<string, CacheEntry>()

/** In-flight fetch promises — prevents duplicate concurrent fetches for the same key. */
const _pending = new Map<string, Promise<string>>()

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

async function _evictPersistentIfNeeded(cache: Cache) {
  try {
    const keys = await cache.keys()
    if (keys.length <= MAX_PERSISTENT_ENTRIES) return
    // FIFO eviction — Cache API keys() returns entries in insertion order
    const toRemove = keys.length - MAX_PERSISTENT_ENTRIES
    for (let i = 0; i < toRemove; i++) {
      await cache.delete(keys[i])
    }
  } catch {
    // Ignore eviction errors
  }
}

function _storeInMemory(rawUrl: string, blob: Blob): string {
  const objectUrl = URL.createObjectURL(blob)
  _cache.set(rawUrl, { blob, objectUrl, lastAccess: Date.now() })
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
 * @param onProgress  Optional callback receiving download percentage (0–100).
 */
export async function loadAudioCached(
  rawUrl: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  // Blob URLs are already local — pass through
  if (rawUrl.startsWith('blob:')) return rawUrl

  // Layer 1: in-memory cache hit
  const cached = _cache.get(rawUrl)
  if (cached) {
    cached.lastAccess = Date.now()
    onProgress?.(100)
    return cached.objectUrl
  }

  // De-duplicate concurrent fetches for the same URL
  const inflight = _pending.get(rawUrl)
  if (inflight) return inflight

  const promise = (async () => {
    // Layer 2: persistent Cache API hit
    const persistentCache = await _openPersistentCache()
    if (persistentCache) {
      try {
        const cachedResponse = await persistentCache.match(rawUrl)
        if (cachedResponse) {
          const blob = await cachedResponse.blob()
          onProgress?.(100)
          return _storeInMemory(rawUrl, blob)
        }
      } catch {
        // Cache read failed — fall through to network
      }
    }

    // Layer 3: network fetch
    const resolved = await resolveAudioUrl(rawUrl)
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
      persistentCache.put(
        new Request(rawUrl),
        new Response(blob, {
          headers: { 'Content-Type': blob.type || 'audio/mpeg' },
        }),
      ).then(() => _evictPersistentIfNeeded(persistentCache)).catch(() => {})
    }

    return _storeInMemory(rawUrl, blob)
  })()

  _pending.set(rawUrl, promise)
  try {
    return await promise
  } finally {
    _pending.delete(rawUrl)
  }
}
