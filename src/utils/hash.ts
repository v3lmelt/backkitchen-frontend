const ANON_ID_NAMESPACE = 'backkitchen-anon-v2'

/**
 * FNV-1a 32-bit hash for stable, deterministic anonymization of user IDs.
 * The namespace rotates anonymous IDs without changing stored user records.
 *
 * Fallback only: newer backends send the authoritative token as
 * `User.anon_token` (see `backend/app/anon.py`) — prefer `anonTokenFor`.
 */
export function hashId(id: number): string {
  let h = 2166136261
  const s = `${ANON_ID_NAMESPACE}:${id}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase()
}

/**
 * Anonymous display token for a user: prefer the server-computed
 * `anon_token`, fall back to the local `hashId` of the user's id (or of
 * `fallbackId` when no user object is embedded in the payload).
 */
export function anonTokenFor(
  user: { id: number; anon_token?: string | null } | null | undefined,
  fallbackId?: number | null,
): string {
  if (user?.anon_token) return user.anon_token
  const id = user?.id ?? fallbackId
  return id != null ? hashId(id) : ''
}
