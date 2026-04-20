import { supabase } from './supabase'

type Cuota = {
  prestamo_id: string
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

type PrestamoHistorial = {
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

type AdminClientesListadoRow = {
  cliente_id: string
  usuario_id: string | null
  nombre: string | null
  dni: string | null
  telefono: string | null
  direccion: string | null
  email: string | null
  cantidad_prestamos: number | null
  cantidad_prestamos_activos: number | null
  tiene_prestamo_activo: boolean | null
  tiene_prestamo_vencido: boolean | null
  deuda_activa: number | null
  total_pagado: number | null
  restante: number | null
  fecha_ultimo_pago: string | null
  proximo_vencimiento: string | null
  estado_cliente: string | null
}

type ClienteFallbackRow = {
  id: string
  usuario_id: string | null
  nombre: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  dni: string | null
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

export type ClienteAdminListadoItem = {
  clienteId: string
  usuarioId: string
  nombre: string
  dni: string
  telefono: string
  direccion: string
  email: string
  cantidadPrestamos: number
  cantidadPrestamosActivos: number
  tienePrestamoActivo: boolean
  tienePrestamoVencido: boolean
  deudaActiva: number
  restante: number
  estadoCliente: string
  fechaUltimoPago: string
  proximoVencimiento: string
  totalPagado: number
}

function low(v?: string | null) {
  return String(v || '').toLowerCase()
}

function ymd(v?: string | null) {
  return v ? String(v).slice(0, 10) : '—'
}

function toListadoItem(row: AdminClientesListadoRow): ClienteAdminListadoItem {
  const deudaActiva = Math.max(Number(row.deuda_activa || 0), 0)
  const restante = Math.max(Number(row.restante || 0), deudaActiva)
  const cantidadPrestamos = Number(row.cantidad_prestamos || 0)
  const cantidadPrestamosActivos = Number(row.cantidad_prestamos_activos || 0)
  const tienePrestamoVencido = Boolean(row.tiene_prestamo_vencido)
  const tienePrestamoActivo =
    Boolean(row.tiene_prestamo_activo) || cantidadPrestamosActivos > 0 || deudaActiva > 0 || restante > 0

  return {
    clienteId: row.cliente_id,
    usuarioId: row.usuario_id || '',
    nombre: row.nombre || 'Cliente',
    dni: row.dni || '—',
    telefono: row.telefono || 'Sin teléfono',
    direccion: row.direccion || 'Sin dirección',
    email: row.email || 'Sin email',
    cantidadPrestamos,
    cantidadPrestamosActivos,
    tienePrestamoActivo,
    tienePrestamoVencido,
    deudaActiva,
    restante,
    estadoCliente: low(row.estado_cliente) || (tienePrestamoVencido ? 'vencido' : tienePrestamoActivo ? 'activo' : 'sin_prestamo'),
    fechaUltimoPago: ymd(row.fecha_ultimo_pago),
    proximoVencimiento: ymd(row.proximo_vencimiento),
    totalPagado: Number(row.total_pagado || 0),
  }
}
const ACTIVE_LOAN_STATES = new Set(['activo', 'atrasado', 'en_mora', 'vencido'])
const OVERDUE_LOAN_STATES = new Set(['vencido', 'atrasado', 'en_mora'])
const PENDING_QUOTA_STATES = new Set(['pendiente', 'parcial'])
const PENDING_PAYMENT_VALIDATION_STATES = new Set(['pendiente', 'en_revision'])

function hasActiveLoan(cliente: ClienteAdminListadoItem) {
  const estado = low(cliente.estadoCliente)
  if (cliente.tienePrestamoActivo || cliente.tienePrestamoVencido) return true
  if (cliente.cantidadPrestamosActivos > 0) return true
  if (cliente.deudaActiva > 0 || cliente.restante > 0) return true
  return ACTIVE_LOAN_STATES.has(estado)
}

export function getClientesConPrestamoActivo(clientesListado: ClienteAdminListadoItem[]) {
  return clientesListado.filter(hasActiveLoan)
}

function hasOverdueLoan(cliente: ClienteAdminListadoItem) {
  const estado = low(cliente.estadoCliente)
  return Boolean(cliente.tienePrestamoVencido) || OVERDUE_LOAN_STATES.has(estado) || estado.includes('venc')
}

export function toClientePrestamoActivoCard(row: ClienteAdminListadoItem): ClientePrestamoActivo {
  return {
    prestamoId: `panel-${row.clienteId}`,
    clienteId: row.clienteId,
    nombre: row.nombre,
    email: row.email,
    usuarioId: row.usuarioId,
    dni: row.dni,
    telefono: row.telefono,
    direccion: row.direccion,
    prestamoActivo: Math.max(row.deudaActiva, row.restante, 0),
    proximoPago: row.proximoVencimiento,
    estado: row.estadoCliente,
  }
}

export async function fetchAdminClientesListado(): Promise<ClienteAdminListadoItem[]> {
  const { data, error } = await supabase.from('admin_clientes_listado').select('*').order('nombre', { ascending: true })

  if (!error) {
    const rows = (data || []) as AdminClientesListadoRow[]
    console.log('[admin-dashboard] admin_clientes_listado rows', rows.length)
    return rows.map(toListadoItem)
  }

  console.warn('[admin-dashboard] admin_clientes_listado query failed, fallback to clientes + usuarios', error)

  const { data: clientesRaw, error: clientesError } = await supabase
    .from('clientes')
    .select('id,usuario_id,nombre,email,telefono,direccion,dni')
    .order('nombre', { ascending: true })

  if (clientesError) {
    console.error('[admin-dashboard] clientes fallback error', clientesError)
    throw clientesError
  }

  const fallbackRows = (clientesRaw || []) as ClienteFallbackRow[]
  console.log('[admin-dashboard] clientes fallback rows', fallbackRows.length)
  return fallbackRows.map((c) => {
    return {
      clienteId: c.id,
      usuarioId: c.usuario_id || '',
      nombre: c.nombre || 'Cliente',
      dni: c.dni || '—',
      telefono: c.telefono || 'Sin teléfono',
      direccion: c.direccion || 'Sin dirección',
      email: c.email || 'Sin email',
      cantidadPrestamos: 0,
      cantidadPrestamosActivos: 0,
      tienePrestamoActivo: false,
      tienePrestamoVencido: false,
      deudaActiva: 0,
      restante: 0,
      estadoCliente: 'sin_prestamo',
      fechaUltimoPago: '—',
      proximoVencimiento: '—',
      totalPagado: 0,
    } satisfies ClienteAdminListadoItem
  })
}

export async function fetchAdminPanelData() {
  const clientesListado = await fetchAdminClientesListado()

  const [cuotasResult, pagosResult, prestamosHistorialResult] = await Promise.allSettled([
    supabase
      .from('cuotas')
      .select('prestamo_id,fecha_vencimiento,monto_cuota,monto_pagado,saldo_pendiente,estado'),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')
      .order('created_at', { ascending: false }),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,fecha_inicio,fecha_limite')
      .order('fecha_inicio', { ascending: false }),
  ])

  const cuotas =
    cuotasResult.status === 'fulfilled' && !cuotasResult.value.error ? ((cuotasResult.value.data || []) as Cuota[]) : []
  if (cuotasResult.status === 'rejected') {
    console.error('[admin-dashboard] cuotas request rejected', cuotasResult.reason)
  } else if (cuotasResult.value.error) {
    console.error('[admin-dashboard] cuotas query error', cuotasResult.value.error)
  }

  const pagos = pagosResult.status === 'fulfilled' && !pagosResult.value.error ? ((pagosResult.value.data || []) as Pago[]) : []
  if (pagosResult.status === 'rejected') {
    console.error('[admin-dashboard] pagos request rejected', pagosResult.reason)
  } else if (pagosResult.value.error) {
    console.error('[admin-dashboard] pagos query error', pagosResult.value.error)
  }

  const prestamosHistorial =
    prestamosHistorialResult.status === 'fulfilled' && !prestamosHistorialResult.value.error
      ? ((prestamosHistorialResult.value.data || []) as PrestamoHistorial[])
      : []
  if (prestamosHistorialResult.status === 'rejected') {
    console.error('[admin-dashboard] prestamos request rejected', prestamosHistorialResult.reason)
  } else if (prestamosHistorialResult.value.error) {
    console.error('[admin-dashboard] prestamos query error', prestamosHistorialResult.value.error)
  }

  const clientesById = new Map(clientesListado.map((c) => [c.clienteId, c]))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)

  const cobrarHoy = cuotas.reduce((acc, cuota) => {
    const estado = low(cuota.estado)
    if (!PENDING_QUOTA_STATES.has(estado)) return acc
    if ((cuota.fecha_vencimiento || '').slice(0, 10) !== todayKey) return acc

    const saldoPendiente = Number(cuota.saldo_pendiente || 0)
    const fallback = Number(cuota.monto_cuota || 0) - Number(cuota.monto_pagado || 0)
    return acc + (saldoPendiente > 0 ? saldoPendiente : Math.max(fallback, 0))
  }, 0)

  const pagosPendientesRaw = pagos.filter((pago) => {
    const estadoValidacion = low(pago.estado_validacion)
    if (estadoValidacion) {
      return PENDING_PAYMENT_VALIDATION_STATES.has(estadoValidacion)
    }
    return !pago.fecha_pago
  })

  const pagosPendientesList: PagoPendienteItem[] = pagosPendientesRaw.slice(0, 8).map((p) => {
    const cliente = p.cliente_id ? clientesById.get(p.cliente_id) : null

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

  const activos = getClientesConPrestamoActivo(clientesListado)

  const activosCards: ClientePrestamoActivo[] = activos.map(toClientePrestamoActivoCard)

  const pagosByPrestamo = new Map<string, number>()
  for (const pago of pagos) {
    if (!pago.prestamo_id) continue
    const current = pagosByPrestamo.get(pago.prestamo_id) || 0
    pagosByPrestamo.set(pago.prestamo_id, current + Number(pago.monto || 0))
  }

  const historial: HistorialPrestamoItem[] = prestamosHistorial.map((prestamo) => {
    const total = Number(prestamo.total_a_pagar || 0)
    const pagado = Number(pagosByPrestamo.get(prestamo.id) || 0)
    const restante = Math.max(total - pagado, 0)
    const cliente = clientesById.get(prestamo.cliente_id)

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
      fechaInicio: ymd(prestamo.fecha_inicio),
      fechaLimite: ymd(prestamo.fecha_limite),
    }
  })

  const prestamosVencidosByPrestamo = prestamosHistorial.filter((prestamo) => {
    const estado = low(prestamo.estado)
    if (OVERDUE_LOAN_STATES.has(estado)) return true
    const fechaLimite = (prestamo.fecha_limite || '').slice(0, 10)
    return Boolean(fechaLimite) && fechaLimite < todayKey && estado !== 'pagado' && estado !== 'cancelado'
  }).length
  const prestamosVencidosListado = clientesListado.filter(hasOverdueLoan).length

  const kpis: AdminKpis = {
    cobrarHoy,
    clientesActivos: activos.length,
    prestamosVencidos: Math.max(prestamosVencidosByPrestamo, prestamosVencidosListado),
    pagosPendientes: pagosPendientesRaw.length,
  }

  return { kpis, activosCards, pagosPendientesList, historial, clientesListado }
}
