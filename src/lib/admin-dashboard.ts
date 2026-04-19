import { supabase } from './supabase'

type Cliente = {
  id: string
  nombre: string | null
  dni: string | null
  telefono: string | null
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
  saldo_pendiente: number | null
  estado: string | null
}

type Pago = {
  prestamo_id: string
  monto: number | null
  estado: string | null
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
  dni: string
  telefono: string
  monto: number
  estado: string
  proximaFecha: string
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

const ACTIVE_STATES = ['activo', 'pendiente', 'en_mora']

function low(v?: string | null) {
  return String(v || '').toLowerCase()
}

function dayKey(v: Date | string) {
  const d = typeof v === 'string' ? new Date(v) : v
  return d.toISOString().slice(0, 10)
}

export async function fetchAdminPanelData() {
  const [clientesRes, prestamosRes, cuotasRes, pagosRes] = await Promise.all([
    supabase.from('clientes').select('id,nombre,dni,telefono'),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,fecha_inicio,fecha_limite')
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('cuotas')
      .select('prestamo_id,numero_cuota,fecha_vencimiento,saldo_pendiente,estado')
      .order('numero_cuota', { ascending: true }),
    supabase.from('pagos').select('prestamo_id,monto,estado'),
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

  const pagosPendientes = pagos.filter((p) => ['pendiente', 'pendiente_aprobacion', 'en_revision'].includes(low(p.estado))).length

  const cuotasByPrestamo = new Map<string, Cuota[]>()
  for (const cuota of cuotas) {
    const list = cuotasByPrestamo.get(cuota.prestamo_id) || []
    list.push(cuota)
    cuotasByPrestamo.set(cuota.prestamo_id, list)
  }

  const pagosByPrestamo = new Map<string, number>()
  for (const pago of pagos) {
    const current = pagosByPrestamo.get(pago.prestamo_id) || 0
    pagosByPrestamo.set(pago.prestamo_id, current + Number(pago.monto || 0))
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = dayKey(today)

  let cobrarHoy = 0
  for (const cuota of cuotas) {
    const state = low(cuota.estado)
    if (['pendiente', 'parcial', 'vencida'].includes(state) && (cuota.fecha_vencimiento || '').slice(0, 10) === todayStr) {
      cobrarHoy += Number(cuota.saldo_pendiente || 0)
    }
  }

  const activePrestamos = prestamos.filter((p) => ACTIVE_STATES.includes(low(p.estado)))
  const clientesActivos = new Set(activePrestamos.map((p) => p.cliente_id)).size

  let prestamosVencidos = 0
  const activosCards: ClientePrestamoActivo[] = []

  for (const prestamo of activePrestamos) {
    const total = Number(prestamo.total_a_pagar || 0)
    const pagado = Number(pagosByPrestamo.get(prestamo.id) || 0)
    const restante = Math.max(total - pagado, 0)

    if (prestamo.fecha_limite && restante > 0) {
      const due = new Date(`${prestamo.fecha_limite.slice(0, 10)}T00:00:00`)
      if (due.getTime() < today.getTime()) prestamosVencidos += 1
    }

    const cliente = clientesMap.get(prestamo.cliente_id)
    const cuotasPrestamo = (cuotasByPrestamo.get(prestamo.id) || []).filter((q) => ['pendiente', 'parcial', 'vencida'].includes(low(q.estado)))
    const proxima = cuotasPrestamo.sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))[0]

    activosCards.push({
      prestamoId: prestamo.id,
      clienteId: prestamo.cliente_id,
      nombre: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      telefono: cliente?.telefono || 'Sin teléfono',
      monto: total,
      estado: low(prestamo.estado) || 'activo',
      proximaFecha: proxima?.fecha_vencimiento?.slice(0, 10) || '—',
    })
  }

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
    pagosPendientes,
  }

  return { kpis, activosCards, historial }
}
