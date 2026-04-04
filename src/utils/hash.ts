/**
 * FNV-1a 32-bit hash for stable, deterministic anonymization of user IDs.
 * Used to obscure peer reviewer identities while keeping the same ID
 * consistently hashed across all views in the same session.
 */
export function hashId(id: number): string {
  let h = 2166136261
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase()
}
