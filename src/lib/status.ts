export type PrestamoEstado = 'activo' | 'pagado' | 'atrasado' | 'cancelado' | 'desconocido'
export type CuotaEstado = 'pendiente' | 'pagada' | 'vencida' | 'parcial' | 'desconocido'
export type PagoEstado = 'pendiente' | 'aprobado' | 'rechazado' | 'desconocido'

function low(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

export function normalizePrestamoEstado(value?: string | null): PrestamoEstado {
  const estado = low(value)
  if (['activo', 'pendiente', 'en_mora'].includes(estado)) return 'activo'
  if (['atrasado', 'vencido'].includes(estado)) return 'atrasado'
  if (estado === 'pagado') return 'pagado'
  if (estado === 'cancelado') return 'cancelado'
  return 'desconocido'
}

export function normalizeCuotaEstado(value?: string | null): CuotaEstado {
  const estado = low(value)
  if (['pendiente'].includes(estado)) return 'pendiente'
  if (['pagada', 'aprobada'].includes(estado)) return 'pagada'
  if (['vencida', 'atrasada'].includes(estado)) return 'vencida'
  if (['parcial'].includes(estado)) return 'parcial'
  return 'desconocido'
}

export function normalizePagoEstado(value?: string | null): PagoEstado {
  const estado = low(value)
  if (['pendiente', 'pendiente_aprobacion', 'en_revision'].includes(estado)) return 'pendiente'
  if (['aprobado', 'confirmado', 'acreditado', 'pagado'].includes(estado)) return 'aprobado'
  if (estado === 'rechazado') return 'rechazado'
  return 'desconocido'
}

export function prestamoEstadoLabel(value?: string | null) {
  const estado = normalizePrestamoEstado(value)
  if (estado === 'activo') return 'Activo'
  if (estado === 'pagado') return 'Pagado'
  if (estado === 'atrasado') return 'Atrasado'
  if (estado === 'cancelado') return 'Cancelado'
  return 'Sin estado'
}

export function cuotaEstadoLabel(value?: string | null) {
  const estado = normalizeCuotaEstado(value)
  if (estado === 'pendiente') return 'Pendiente'
  if (estado === 'pagada') return 'Pagada'
  if (estado === 'vencida') return 'Vencida'
  if (estado === 'parcial') return 'Parcial'
  return 'Sin estado'
}

export function pagoEstadoLabel(value?: string | null) {
  const estado = normalizePagoEstado(value)
  if (estado === 'pendiente') return 'Pendiente'
  if (estado === 'aprobado') return 'Aprobado'
  if (estado === 'rechazado') return 'Rechazado'
  return 'Sin estado'
}
