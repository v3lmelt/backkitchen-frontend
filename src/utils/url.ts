const TOKEN_KEY = 'backkitchen_token'

/**
 * Append the stored auth token as a query parameter to an audio URL.
 * Audio endpoints accept `?token=` for streaming contexts where
 * Authorization headers cannot be set (e.g. `<audio>` element src).
 */
export function withAuthToken(url: string): string {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

// Cache presigned URLs — they're valid for ~1 hour, cache for 50 min
const _urlCache = new Map<string, { resolved: string; expiry: number }>()
const _CACHE_TTL = 50 * 60 * 1000

/**
 * Resolve an audio URL that may point to R2 storage.
 *
 * When R2 is enabled, calls the backend with ``?resolve=json`` to obtain
 * the presigned R2 URL, avoiding cross-origin 307 redirects that
 * wavesurfer.js ``fetch`` cannot follow.  Results are cached for 50 min.
 *
 * When R2 is disabled (local storage), returns the token-authed URL
 * directly without any extra network call.
 */
export async function resolveAudioUrl(url: string): Promise<string> {
  const authedUrl = withAuthToken(url)

  // Skip resolve call when R2 is not enabled — no redirect to worry about
  const { useAppStore } = await import('@/stores/app')
  if (!useAppStore().r2Enabled) return authedUrl

  const cached = _urlCache.get(url)
  if (cached && cached.expiry > Date.now()) return cached.resolved

  try {
    const separator = authedUrl.includes('?') ? '&' : '?'
    const res = await fetch(`${authedUrl}${separator}resolve=json`)
    if (res.ok) {
      const data = await res.json()
      if (data.url) {
        _urlCache.set(url, { resolved: data.url, expiry: Date.now() + _CACHE_TTL })
        return data.url
      }
    }
  } catch {
    // fall through — use authed URL as fallback
  }
  return authedUrl
}
