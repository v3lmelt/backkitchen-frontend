import { resolveAudioUrl } from './url'

/**
 * LRU in-memory audio blob cache.
 *
 * Keyed by the raw audio URL (before token / presigned resolution),
 * which already encodes track ID + version/cycle and is therefore
 * a stable content identifier.
 *
 * The cache stores the fetched Blob so that navigating between views
 * that reference the same audio (e.g. TrackDetail → PeerReview) does
 * not trigger a second network download.
 */

const MAX_ENTRIES = 8

interface CacheEntry {
  blob: Blob
  objectUrl: string
  /** Timestamp of last access — used for LRU eviction. */
  lastAccess: number
}

const _cache = new Map<string, CacheEntry>()

/** In-flight fetch promises — prevents duplicate concurrent fetches for the same key. */
const _pending = new Map<string, Promise<string>>()

function _evictIfNeeded() {
  while (_cache.size > MAX_ENTRIES) {
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

/**
 * Resolve an audio URL to a cached object URL.
 *
 * Returns a blob: URL that WaveSurfer can load directly.
 * On cache hit the network is skipped entirely.
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

  // Cache hit
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
    // Step 1: resolve presigned / authed URL
    const resolved = await resolveAudioUrl(rawUrl)

    // Step 2: fetch the blob with progress tracking
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

    // Step 3: store in cache
    const objectUrl = URL.createObjectURL(blob)
    _cache.set(rawUrl, { blob, objectUrl, lastAccess: Date.now() })
    _evictIfNeeded()

    return objectUrl
  })()

  _pending.set(rawUrl, promise)
  try {
    return await promise
  } finally {
    _pending.delete(rawUrl)
  }
}
