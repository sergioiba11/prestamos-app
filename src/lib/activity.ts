import { supabase } from './supabase'

export type ActivityPriority = 'normal' | 'alta' | 'critica'

export type ActivityType =
  | 'cliente_creado'
  | 'prestamo_creado'
  | 'pago_registrado'
  | 'pago_pendiente'
  | 'pago_aprobado'
  | 'pago_rechazado'
  | 'solicitud_prestamo'
  | 'login_usuario'
  | 'login_admin'
  | 'dni_editado'
  | 'cliente_editado'
  | 'prestamo_vencido'
  | 'error_operativo_importante'

export type ActivityItem = {
  id: string
  tipo: ActivityType | string
  titulo: string
  descripcion: string | null
  entidad_tipo: string | null
  entidad_id: string | null
  usuario_id: string | null
  usuario_nombre: string | null
  prioridad: ActivityPriority
  fijada: boolean
  leida: boolean
  visible_en_notificaciones: boolean
  metadata: Record<string, any>
  created_at: string
}

export type CreateSystemActivityPayload = {
  tipo: ActivityType | string
  titulo: string
  descripcion?: string | null
  entidad_tipo?: string | null
  entidad_id?: string | null
  usuario_id?: string | null
  usuario_nombre?: string | null
  prioridad?: ActivityPriority
  fijada?: boolean
  leida?: boolean
  visible_en_notificaciones?: boolean
  metadata?: Record<string, unknown>
}

export type ActivityFeedFilter = 'todos' | 'clientes' | 'prestamos' | 'pagos' | 'solicitudes' | 'logins'

const FILTER_TIPOS: Record<ActivityFeedFilter, string[] | null> = {
  todos: null,
  clientes: ['cliente_creado', 'cliente_editado', 'dni_editado'],
  prestamos: ['prestamo_creado', 'prestamo_vencido'],
  pagos: ['pago_registrado', 'pago_pendiente', 'pago_aprobado', 'pago_rechazado'],
  solicitudes: ['solicitud_prestamo'],
  logins: ['login_usuario', 'login_admin'],
}

function normalizeActivity(row: any): ActivityItem {
  return {
    id: String(row.id),
    tipo: String(row.tipo || 'evento'),
    titulo: String(row.titulo || 'Actividad del sistema'),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    entidad_tipo: row.entidad_tipo ? String(row.entidad_tipo) : null,
    entidad_id: row.entidad_id ? String(row.entidad_id) : null,
    usuario_id: row.usuario_id ? String(row.usuario_id) : null,
    usuario_nombre: row.usuario_nombre ? String(row.usuario_nombre) : null,
    prioridad: (row.prioridad || 'normal') as ActivityPriority,
    fijada: Boolean(row.fijada),
    leida: Boolean(row.leida),
    visible_en_notificaciones: row.visible_en_notificaciones !== false,
    metadata: (row.metadata as Record<string, any>) || {},
    created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
  }
}

function sortNotifications(items: ActivityItem[]) {
  const priorityWeight: Record<ActivityPriority, number> = { critica: 3, alta: 2, normal: 1 }

  return [...items].sort((a, b) => {
    const aPinnedOrCritical = a.fijada || a.prioridad === 'critica'
    const bPinnedOrCritical = b.fijada || b.prioridad === 'critica'

    if (aPinnedOrCritical !== bPinnedOrCritical) return aPinnedOrCritical ? -1 : 1
    if (a.leida !== b.leida) return a.leida ? 1 : -1

    const prioDiff = (priorityWeight[b.prioridad] || 0) - (priorityWeight[a.prioridad] || 0)
    if (prioDiff !== 0) return prioDiff

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export async function createSystemActivity(payload: CreateSystemActivityPayload) {
  const record = {
    tipo: payload.tipo,
    titulo: payload.titulo,
    descripcion: payload.descripcion ?? null,
    entidad_tipo: payload.entidad_tipo ?? null,
    entidad_id: payload.entidad_id ?? null,
    usuario_id: payload.usuario_id ?? null,
    usuario_nombre: payload.usuario_nombre ?? null,
    prioridad: payload.prioridad ?? 'normal',
    fijada: payload.fijada ?? false,
    leida: payload.leida ?? false,
    visible_en_notificaciones: payload.visible_en_notificaciones ?? true,
    metadata: payload.metadata ?? {},
  }

  const { data, error } = await supabase.from('actividad_sistema').insert(record).select('*').single()

  if (error) {
    console.error('[activity] createSystemActivity error', error)
    throw error
  }

  return normalizeActivity(data)
}

export async function getTopNotifications(limit = 12) {
  const safeLimit = Math.max(1, Math.min(limit, 60))
  const { data, error } = await supabase
    .from('actividad_sistema')
    .select('*')
    .eq('visible_en_notificaciones', true)
    .order('created_at', { ascending: false })
    .limit(Math.max(safeLimit * 3, 24))

  if (error) {
    console.error('[activity] getTopNotifications error', error)
    throw error
  }

  const normalized = (data || []).map(normalizeActivity)
  return sortNotifications(normalized).slice(0, safeLimit)
}

export async function getUnreadNotificationsCount() {
  const { count, error } = await supabase
    .from('actividad_sistema')
    .select('id', { count: 'exact', head: true })
    .eq('visible_en_notificaciones', true)
    .eq('leida', false)

  if (error) {
    console.error('[activity] getUnreadNotificationsCount error', error)
    throw error
  }

  return count || 0
}

export async function markNotificationAsRead(id: string) {
  const { error } = await supabase.from('actividad_sistema').update({ leida: true }).eq('id', id)
  if (error) {
    console.error('[activity] markNotificationAsRead error', error)
    throw error
  }
}

export async function markAllNotificationsAsRead() {
  const { error } = await supabase
    .from('actividad_sistema')
    .update({ leida: true })
    .eq('visible_en_notificaciones', true)
    .eq('leida', false)

  if (error) {
    console.error('[activity] markAllNotificationsAsRead error', error)
    throw error
  }
}

export async function getActivityFeed(filters?: { filter?: ActivityFeedFilter; limit?: number }) {
  const filter = filters?.filter || 'todos'
  const limit = Math.max(10, Math.min(filters?.limit || 150, 400))

  let query = supabase.from('actividad_sistema').select('*').order('created_at', { ascending: false }).limit(limit)

  const allowedTypes = FILTER_TIPOS[filter]
  if (allowedTypes?.length) query = query.in('tipo', allowedTypes)

  const { data, error } = await query

  if (error) {
    console.error('[activity] getActivityFeed error', error)
    throw error
  }

  return (data || []).map(normalizeActivity)
}

export async function registerLoginActivity(userId: string) {
  const { data: actor } = await supabase.from('usuarios').select('id,nombre,rol').eq('id', userId).maybeSingle()

  const isAdminOrEmployee = ['admin', 'empleado'].includes(String(actor?.rol || '').toLowerCase())

  await createSystemActivity({
    tipo: isAdminOrEmployee ? 'login_admin' : 'login_usuario',
    titulo: 'Inicio de sesión',
    descripcion: isAdminOrEmployee ? 'Inició sesión un administrador/empleado.' : 'Inició sesión un usuario.',
    entidad_tipo: 'usuario',
    entidad_id: userId,
    usuario_id: userId,
    usuario_nombre: actor?.nombre || null,
    prioridad: 'normal',
    visible_en_notificaciones: true,
    metadata: { rol: actor?.rol || null },
  })
}
