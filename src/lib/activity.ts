import { supabase } from './supabase'

export type ActivityType =
  | 'cliente_creado'
  | 'prestamo_creado'
  | 'pago_registrado'
  | 'pago_aprobado'
  | 'pago_rechazado'

export async function logActivity(params: {
  tipo: ActivityType
  actorId?: string | null
  clienteId?: string | null
  prestamoId?: string | null
  pagoId?: string | null
  descripcion: string
  metadata?: Record<string, unknown>
}) {
  const payload = {
    tipo: params.tipo,
    actor_id: params.actorId || null,
    cliente_id: params.clienteId || null,
    prestamo_id: params.prestamoId || null,
    pago_id: params.pagoId || null,
    descripcion: params.descripcion,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  }

  const targets = ['actividad', 'actividad_logs', 'audit_log']

  for (const table of targets) {
    const { error } = await supabase.from(table).insert(payload)
    if (!error) return
  }

  await supabase.from('notificaciones').insert({
    tipo: params.tipo,
    titulo: 'Actividad registrada',
    descripcion: params.descripcion,
    cliente_id: params.clienteId || null,
    prestamo_id: params.prestamoId || null,
    pago_id: params.pagoId || null,
    metadata: payload,
  })
}
