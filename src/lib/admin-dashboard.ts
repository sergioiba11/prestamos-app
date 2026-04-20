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
  email: string | null
  cantidad_prestamos: number | null
  tiene_prestamo_activo: boolean | null
  deuda_activa: number | null
  estado_cliente: string | null
  fecha_ultimo_pago: string | null
  proximo_vencimiento: string | null
  total_a_pagar: number | null
  total_pagado: number | null
}

type PanelClienteFallback = {
  cliente_id_uuid: string | null
  usuario_id: string | null
  nombre: string | null
  telefono: string | null
  dni: string | null
  cantidad_prestamos: number | null
  total_a_pagar: number | null
  total_pagado: number | null
  restante: number | null
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
  email: string
  cantidadPrestamos: number
  tienePrestamoActivo: boolean
  deudaActiva: number
  estadoCliente: string
  fechaUltimoPago: string
  proximoVencimiento: string
  totalAPagar: number
  totalPagado: number
}

function low(v?: string | null) {
  return String(v || '').toLowerCase()
}

function ymd(v?: string | null) {
  return v ? String(v).slice(0, 10) : '—'
}

function toListadoItem(row: AdminClientesListadoRow): ClienteAdminListadoItem {
  const totalAPagar = Number(row.total_a_pagar || 0)
  const totalPagado = Number(row.total_pagado || 0)
  const deuda = Math.max(Number(row.deuda_activa || 0), totalAPagar - totalPagado, 0)
  const tieneActivo =
    Boolean(row.tiene_prestamo_activo) ||
    Number(row.cantidad_prestamos || 0) > 0 ||
    deuda > 0 ||
    totalAPagar > totalPagado

  return {
    clienteId: row.cliente_id,
    usuarioId: row.usuario_id || '',
    nombre: row.nombre || 'Cliente',
    dni: row.dni || '—',
    telefono: row.telefono || 'Sin teléfono',
    email: row.email || 'Sin email',
    cantidadPrestamos: Number(row.cantidad_prestamos || 0),
    tienePrestamoActivo: tieneActivo,
    deudaActiva: deuda,
    estadoCliente: low(row.estado_cliente) || (tieneActivo ? 'activo' : 'sin_prestamo'),
    fechaUltimoPago: ymd(row.fecha_ultimo_pago),
    proximoVencimiento: ymd(row.proximo_vencimiento),
    totalAPagar,
    totalPagado,
  }
}

export async function fetchAdminClientesListado(): Promise<ClienteAdminListadoItem[]> {
  const { data, error } = await supabase.from('admin_clientes_listado').select('*').order('nombre', { ascending: true })

  if (!error) {
    const rows = (data || []) as AdminClientesListadoRow[]
    const mapped = rows.map(toListadoItem)
    console.log('admin_clientes_listado RAW:', rows)
    console.log('admin_clientes_listado mapped:', mapped)
    return mapped
  }

  console.warn('admin_clientes_listado fallback to panel_clientes', error)

  const { data: panelData, error: panelError } = await supabase.from('panel_clientes').select('*')
  if (panelError) {
    console.error('panel_clientes fallback error', panelError)
    throw panelError
  }

  const fallbackRows = (panelData || []) as PanelClienteFallback[]
  console.log('panel_clientes RAW:', fallbackRows, panelError)

  const mapped = fallbackRows.map((c, index) => {
    const clienteId = c.cliente_id_uuid || c.usuario_id || `sin-id-${index}`
    const totalAPagar = Number(c.total_a_pagar || 0)
    const totalPagado = Number(c.total_pagado || 0)
    const deuda = Math.max(Number(c.restante || 0), totalAPagar - totalPagado, 0)

    return {
      clienteId,
      usuarioId: c.usuario_id || '',
      nombre: c.nombre || 'Cliente',
      dni: c.dni || '—',
      telefono: c.telefono || 'Sin teléfono',
      email: 'Sin email',
      cantidadPrestamos: Number(c.cantidad_prestamos || 0),
      tienePrestamoActivo: Number(c.cantidad_prestamos || 0) > 0 || deuda > 0 || totalAPagar > totalPagado,
      deudaActiva: deuda,
      estadoCliente: deuda > 0 ? 'activo' : 'sin_prestamo',
      fechaUltimoPago: '—',
      proximoVencimiento: '—',
      totalAPagar,
      totalPagado,
    } satisfies ClienteAdminListadoItem
  })

  console.log('panel_clientes mapped:', mapped)
  return mapped
}

export async function fetchAdminPanelData() {
  const [clientesListado, cuotasRes, prestamosVencidosRes, pagosRes, prestamosHistorialRes] = await Promise.all([
    fetchAdminClientesListado(),
    supabase
      .from('cuotas')
      .select('prestamo_id,fecha_vencimiento,monto_cuota,monto_pagado,saldo_pendiente,estado'),
    supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'vencido'),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')
      .order('created_at', { ascending: false }),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,fecha_inicio,fecha_limite')
      .order('fecha_inicio', { ascending: false }),
  ])

  if (cuotasRes.error) throw cuotasRes.error
  if (prestamosVencidosRes.error) throw prestamosVencidosRes.error
  if (pagosRes.error) throw pagosRes.error
  if (prestamosHistorialRes.error) throw prestamosHistorialRes.error

  const cuotas = (cuotasRes.data || []) as Cuota[]
  const pagos = (pagosRes.data || []) as Pago[]
  const prestamosHistorial = (prestamosHistorialRes.data || []) as PrestamoHistorial[]

  const clientesById = new Map(clientesListado.map((c) => [c.clienteId, c]))

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

  const pagosPendientesRaw = pagos.filter((p) => {
    const estadoValidacion = low(p.estado_validacion)
    if (estadoValidacion) return estadoValidacion === 'pendiente'
    return !p.fecha_pago
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

  const activos = clientesListado.filter((c) => c.tienePrestamoActivo)

  const activosCards: ClientePrestamoActivo[] = activos.slice(0, 8).map((row) => ({
    prestamoId: `panel-${row.clienteId}`,
    clienteId: row.clienteId,
    nombre: row.nombre,
    email: row.email,
    usuarioId: row.usuarioId,
    dni: row.dni,
    telefono: row.telefono,
    direccion: '',
    prestamoActivo: row.deudaActiva,
    proximoPago: row.proximoVencimiento,
    estado: row.estadoCliente,
  }))

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

  const kpis: AdminKpis = {
    cobrarHoy,
    clientesActivos: activos.length,
    prestamosVencidos: prestamosVencidosRes.count || 0,
    pagosPendientes: pagosPendientesRaw.length,
  }

  return { kpis, activosCards, pagosPendientesList, historial, clientesListado }
}
