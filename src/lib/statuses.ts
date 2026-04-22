export type PrestamoEstado = 'activo' | 'pagado' | 'atrasado' | 'cancelado' | 'desconocido'
export type CuotaEstado = 'pendiente' | 'pagada' | 'vencida' | 'parcial' | 'desconocido'
export type PagoEstado = 'pendiente' | 'aprobado' | 'rechazado' | 'desconocido'

function low(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

export function normalizarEstadoPrestamo(value?: string | null): PrestamoEstado {
  const estado = low(value)
  if (['activo', 'pendiente'].includes(estado)) return 'activo'
  if (['pagado'].includes(estado)) return 'pagado'
  if (['atrasado', 'en_mora', 'vencido'].includes(estado)) return 'atrasado'
  if (['cancelado'].includes(estado)) return 'cancelado'
  return 'desconocido'
}

export function normalizarEstadoCuota(value?: string | null): CuotaEstado {
  const estado = low(value)
  if (estado === 'pagada') return 'pagada'
  if (estado === 'parcial') return 'parcial'
  if (estado === 'vencida') return 'vencida'
  if (estado === 'pendiente') return 'pendiente'
  return 'desconocido'
}

export function normalizarEstadoPago(value?: string | null): PagoEstado {
  const estado = low(value)
  if (['aprobado', 'pagado', 'acreditado', 'confirmado'].includes(estado)) return 'aprobado'
  if (['rechazado'].includes(estado)) return 'rechazado'
  if (['pendiente', 'pendiente_aprobacion', 'en_revision'].includes(estado)) return 'pendiente'
  return 'desconocido'
}

export function badgePrestamo(estado?: string | null) {
  const normalized = normalizarEstadoPrestamo(estado)
  const map = {
    activo: { label: 'Activo', bg: '#172554', border: '#1D4ED8', text: '#BFDBFE' },
    pagado: { label: 'Pagado', bg: '#052E16', border: '#166534', text: '#BBF7D0' },
    atrasado: { label: 'Atrasado', bg: '#431407', border: '#C2410C', text: '#FDBA74' },
    cancelado: { label: 'Cancelado', bg: '#3F3F46', border: '#52525B', text: '#E4E4E7' },
    desconocido: { label: 'Sin estado', bg: '#0F172A', border: '#334155', text: '#CBD5E1' },
  } as const
  return map[normalized]
}

export function badgeCuota(estado?: string | null) {
  const normalized = normalizarEstadoCuota(estado)
  const map = {
    pendiente: { label: 'Pendiente', bg: '#1E293B', border: '#334155', text: '#E2E8F0' },
    pagada: { label: 'Pagada', bg: '#052E16', border: '#166534', text: '#BBF7D0' },
    vencida: { label: 'Vencida', bg: '#431407', border: '#C2410C', text: '#FDBA74' },
    parcial: { label: 'Parcial', bg: '#0C4A6E', border: '#0284C7', text: '#BAE6FD' },
    desconocido: { label: 'Sin estado', bg: '#0F172A', border: '#334155', text: '#CBD5E1' },
  } as const
  return map[normalized]
}

export function badgePago(estado?: string | null) {
  const normalized = normalizarEstadoPago(estado)
  const map = {
    pendiente: { label: 'Pendiente', bg: '#78350F', border: '#D97706', text: '#FDE68A' },
    aprobado: { label: 'Aprobado', bg: '#052E16', border: '#166534', text: '#BBF7D0' },
    rechazado: { label: 'Rechazado', bg: '#450A0A', border: '#B91C1C', text: '#FECACA' },
    desconocido: { label: 'Sin estado', bg: '#0F172A', border: '#334155', text: '#CBD5E1' },
  } as const
  return map[normalized]
}
