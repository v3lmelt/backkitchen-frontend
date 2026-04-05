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
