import { router } from 'expo-router'

export type AppUserRole = 'admin' | 'empleado' | 'cliente' | string | null | undefined

const ROLE_FALLBACK: Record<string, '/admin-home' | '/empleado-home' | '/cliente-home'> = {
  admin: '/admin-home',
  empleado: '/empleado-home',
  cliente: '/cliente-home',
}

export function safeGoBack(role?: AppUserRole, explicitFallback?: '/admin-home' | '/empleado-home' | '/cliente-home') {
  if (router.canGoBack()) {
    router.back()
    return
  }

  const normalized = String(role || '').toLowerCase()
  const fallback = explicitFallback || ROLE_FALLBACK[normalized] || '/admin-home'
  router.replace(fallback as any)
}
