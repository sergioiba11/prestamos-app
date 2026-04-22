export type UserRole = 'admin' | 'empleado' | 'cliente' | 'unknown'

export function normalizeRole(raw?: string | null): UserRole {
  const role = String(raw || '').trim().toLowerCase()
  if (role === 'admin' || role === 'empleado' || role === 'cliente') return role
  return 'unknown'
}

export function canManagePendingPayments(role: UserRole) {
  return role === 'admin' || role === 'empleado'
}

export function isOperationalRole(role: UserRole) {
  return role === 'admin' || role === 'empleado'
}
