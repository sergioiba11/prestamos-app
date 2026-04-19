import { supabase } from './supabase'

type Cliente = {
  id: string
  nombre: string | null
  dni: string | null
  telefono: string | null
  direccion: string | null
  usuario_id?: string | null
  usuarios?: { email?: string | null } | Array<{ email?: string | null }> | null
}

type Prestamo = {
  id: string
  cliente_id: string
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  saldo_pendiente: number | null
  estado: string | null
  fecha_inicio: string | null
  fecha_limite: string | null
}

type Cuota = {
  prestamo_id: string
  numero_cuota: number
  fecha_vencimiento: string | null
  monto_cuota: number | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  estado: string | null
}

type Pago = {
  id: string
  cliente_id: string | null
  prestamo_id: string | null
  monto: number | null
  metodo: string | null
  created_at: string | null
  fecha_pago: string | null
  estado_validacion?: string | null
}

export type AdminKpis = {
  cobrarHoy: number
  clientesActivos: number
  prestamosVencidos: number
  pagosPendientes: number
}

export type ClientePrestamoActivo = {
  prestamoId: string
  clienteId: string
  nombre: string
  email: string
  usuarioId: string
  dni: string
  telefono: string
  direccion: string
  prestamoActivo: number
  proximoPago: string
  estado: string
}

export type PagoPendienteItem = {
  id: string
  clienteId: string
  cliente: string
  dni: string
  monto: number
  metodo: string
  createdAt: string
}

export type HistorialPrestamoItem = {
  prestamoId: string
  clienteId: string
  cliente: string
  dni: string
  monto: number
  interes: number
  total: number
  pagado: number
  restante: number
  estado: string
  fechaInicio: string
  fechaLimite: string
}

function low(v?: string | null) {
  return String(v || '').toLowerCase()
}

function getEmail(cliente: Cliente) {
  const rel = Array.isArray(cliente.usuarios) ? cliente.usuarios[0] : cliente.usuarios
  return rel?.email || 'Sin email'
}

function isActivoEstado(estado?: string | null) {
  const e = low(estado)
  return e === 'activo' || e === 'atrasado' || e === 'en_mora'
}

export async function fetchAdminPanelData() {
  const [clientesRes, prestamosRes, cuotasRes, pagosRes] = await Promise.all([
    supabase.from('clientes').select('id,nombre,dni,telefono,direccion,usuario_id,usuarios:usuario_id(email)'),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,fecha_inicio,fecha_limite')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('cuotas')
      .select('prestamo_id,numero_cuota,fecha_vencimiento,monto_cuota,monto_pagado,saldo_pendiente,estado')
      .order('numero_cuota', { ascending: true }),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')
      .order('created_at', { ascending: false }),
  ])

  if (clientesRes.error) throw clientesRes.error
  if (prestamosRes.error) throw prestamosRes.error
  if (cuotasRes.error) throw cuotasRes.error
  if (pagosRes.error) throw pagosRes.error

  const clientes = (clientesRes.data || []) as Cliente[]
  const prestamos = (prestamosRes.data || []) as Prestamo[]
  const cuotas = (cuotasRes.data || []) as Cuota[]
  const pagos = (pagosRes.data || []) as Pago[]

  const clientesMap = new Map(clientes.map((c) => [c.id, c]))
  const cuotasByPrestamo = new Map<string, Cuota[]>()

  for (const cuota of cuotas) {
    const list = cuotasByPrestamo.get(cuota.prestamo_id) || []
    list.push(cuota)
    cuotasByPrestamo.set(cuota.prestamo_id, list)
  }

  const pagosByPrestamo = new Map<string, number>()
  for (const pago of pagos) {
    if (!pago.prestamo_id) continue
    const current = pagosByPrestamo.get(pago.prestamo_id) || 0
    pagosByPrestamo.set(pago.prestamo_id, current + Number(pago.monto || 0))
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)

  let cobrarHoy = 0
  for (const cuota of cuotas) {
    const estado = low(cuota.estado)
    if (!['pendiente', 'parcial'].includes(estado)) continue
    if ((cuota.fecha_vencimiento || '').slice(0, 10) !== todayKey) continue
    const montoPendiente = Number(cuota.saldo_pendiente || 0)
    const fallback = Number(cuota.monto_cuota || 0) - Number(cuota.monto_pagado || 0)
    cobrarHoy += montoPendiente > 0 ? montoPendiente : Math.max(fallback, 0)
  }

  const activePrestamos = prestamos.filter((p) => isActivoEstado(p.estado))
  const clientesActivos = new Set(activePrestamos.map((p) => p.cliente_id)).size

  const prestamosVencidos = prestamos.filter((p) => {
    const estado = low(p.estado)
    if (estado === 'atrasado' || estado === 'en_mora') return true

    const remaining = Number(p.saldo_pendiente || 0)
    if (p.fecha_limite && remaining > 0) {
      const due = new Date(`${p.fecha_limite.slice(0, 10)}T00:00:00`)
      return due.getTime() < today.getTime()
    }

    return false
  }).length

  const pagosPendientesRaw = pagos.filter((p) => {
    const estadoValidacion = low(p.estado_validacion)
    if (estadoValidacion) return estadoValidacion === 'pendiente'
    return !p.fecha_pago
  })

  const pagosPendientesList: PagoPendienteItem[] = pagosPendientesRaw.slice(0, 8).map((p) => {
    const cliente = p.cliente_id ? clientesMap.get(p.cliente_id) : null

    return {
      id: p.id,
      clienteId: p.cliente_id || '',
      cliente: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      monto: Number(p.monto || 0),
      metodo: p.metodo || 'Sin método',
      createdAt: p.created_at || '',
    }
  })

  const activosCards: ClientePrestamoActivo[] = activePrestamos.map((prestamo) => {
    const cliente = clientesMap.get(prestamo.cliente_id)
    const cuotasPrestamo = (cuotasByPrestamo.get(prestamo.id) || [])
      .filter((q) => ['pendiente', 'parcial'].includes(low(q.estado)))
      .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))

    const proximaCuota = cuotasPrestamo[0]

    return {
      prestamoId: prestamo.id,
      clienteId: prestamo.cliente_id,
      nombre: cliente?.nombre || 'Cliente',
      email: cliente ? getEmail(cliente) : 'Sin email',
      usuarioId: cliente?.usuario_id || '',
      dni: cliente?.dni || '—',
      telefono: cliente?.telefono || 'Sin teléfono',
      direccion: cliente?.direccion || '',
      prestamoActivo: Number(prestamo.saldo_pendiente || prestamo.total_a_pagar || prestamo.monto || 0),
      proximoPago: proximaCuota?.fecha_vencimiento?.slice(0, 10) || prestamo.fecha_limite?.slice(0, 10) || '—',
      estado: low(prestamo.estado) || 'activo',
    }
  })

  const historial: HistorialPrestamoItem[] = prestamos.map((prestamo) => {
    const total = Number(prestamo.total_a_pagar || 0)
    const pagado = Number(pagosByPrestamo.get(prestamo.id) || 0)
    const restante = Math.max(total - pagado, 0)
    const cliente = clientesMap.get(prestamo.cliente_id)

    return {
      prestamoId: prestamo.id,
      clienteId: prestamo.cliente_id,
      cliente: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      monto: Number(prestamo.monto || 0),
      interes: Number(prestamo.interes || 0),
      total,
      pagado,
      restante,
      estado: low(prestamo.estado) || 'activo',
      fechaInicio: prestamo.fecha_inicio?.slice(0, 10) || '—',
      fechaLimite: prestamo.fecha_limite?.slice(0, 10) || '—',
    }
  })

  const kpis: AdminKpis = {
    cobrarHoy,
    clientesActivos,
    prestamosVencidos,
    pagosPendientes: pagosPendientesRaw.length,
  }

  return { kpis, activosCards, pagosPendientesList, historial }
}
