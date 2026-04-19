import { router } from 'expo-router'
import { supabase } from './supabase'

export async function goByRole(userId: string) {
  const { data: userData, error } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()

  if (error) {
    router.replace('/login' as any)
    return
  }

  const rol = userData?.rol

  if (rol === 'admin') {
    router.replace('/admin-home' as any)
    return
  }

  if (rol === 'empleado') {
    router.replace('/empleado-home' as any)
    return
  }

  router.replace('/cliente-home' as any)
}
