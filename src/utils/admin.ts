import type { AdminRole, User } from '@/types'

const ADMIN_ROLE_ORDER: Record<AdminRole, number> = {
  none: 0,
  viewer: 1,
  operator: 2,
  superadmin: 3,
}

export function normalizeAdminRole(user: Pick<User, 'admin_role' | 'is_admin'> | null | undefined): AdminRole {
  const role = user?.admin_role ?? (user?.is_admin ? 'superadmin' : 'none')
  return role in ADMIN_ROLE_ORDER ? (role as AdminRole) : 'none'
}

export function hasAdminRole(user: Pick<User, 'admin_role' | 'is_admin'> | null | undefined, minimum: AdminRole): boolean {
  return ADMIN_ROLE_ORDER[normalizeAdminRole(user)] >= ADMIN_ROLE_ORDER[minimum]
}
