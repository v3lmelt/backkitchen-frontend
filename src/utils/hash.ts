const ANON_ID_NAMESPACE = 'backkitchen-anon-v2'

/**
 * FNV-1a 32-bit hash for stable, deterministic anonymization of user IDs.
 * The namespace rotates anonymous IDs without changing stored user records.
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
