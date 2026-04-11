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

/**
 * Resolve an audio URL for playback.
 *
 * - Blob URLs and absolute URLs (public R2 CDN) are returned as-is.
 * - Relative API URLs go through ``?resolve=json`` to obtain the
 *   actual URL (public R2 or local fallback with auth token).
 */
export async function resolveAudioUrl(url: string): Promise<string> {
  // Blob URLs are local object URLs — no resolution needed
  if (url.startsWith('blob:')) return url

  // Absolute URLs pointing to our own API still need auth resolution
  const apiOrigin = (import.meta.env.VITE_API_BASE_URL ?? '') as string
  if (/^https?:\/\//i.test(url) && !(apiOrigin && url.startsWith(apiOrigin))) return url

  // Relative API URL — resolve via backend
  const authedUrl = withAuthToken(url)
  try {
    const separator = authedUrl.includes('?') ? '&' : '?'
    const res = await fetch(`${authedUrl}${separator}resolve=json`)
    if (res.ok) {
      const data = await res.json()
      if (data.url) return data.url
    }
  } catch {
    // fall through — use authed URL as fallback
  }
  return authedUrl
}
