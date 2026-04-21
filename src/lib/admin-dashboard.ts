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

type UsuarioFallbackRow = {
  id: string
  email: string | null
  rol: string | null
}

type PrestamoFallbackRow = {
  cliente_id: string
  estado: string | null
  total_a_pagar: number | null
  saldo_pendiente: number | null
  monto: number | null
  fecha_limite: string | null
}

type PagoFallbackRow = {
  cliente_id: string | null
  monto: number | null
  estado_validacion: string | null
  fecha_pago: string | null
  created_at: string | null
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

const ACTIVE_LOAN_STATES = new Set(['activo', 'atrasado', 'en_mora', 'vencido'])
const OVERDUE_LOAN_STATES = new Set(['vencido', 'atrasado', 'en_mora'])
const PENDING_QUOTA_STATES = new Set(['pendiente', 'parcial'])
const PENDING_PAYMENT_VALIDATION_STATES = new Set(['pendiente', 'en_revision'])
const PAID_PAYMENT_VALIDATION_STATES = new Set(['aprobado', 'confirmado', 'acreditado'])

function low(value?: string | null) {
  return String(value || '').toLowerCase()
}

function ymd(value?: string | null) {
  return value ? String(value).slice(0, 10) : '—'
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

function hasActiveLoan(cliente: ClienteAdminListadoItem) {
  const estado = low(cliente.estadoCliente)
  if (cliente.tienePrestamoActivo || cliente.tienePrestamoVencido) return true
  if (cliente.cantidadPrestamosActivos > 0) return true
  if (cliente.deudaActiva > 0 || cliente.restante > 0) return true
  return ACTIVE_LOAN_STATES.has(estado)
}

function hasOverdueLoan(cliente: ClienteAdminListadoItem) {
  const estado = low(cliente.estadoCliente)
  return Boolean(cliente.tienePrestamoVencido) || OVERDUE_LOAN_STATES.has(estado) || estado.includes('venc')
}

export function getClientesConPrestamoActivo(clientesListado: ClienteAdminListadoItem[]) {
  return clientesListado.filter(hasActiveLoan)
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

async function fetchAdminClientesListadoFromBaseTables(): Promise<ClienteAdminListadoItem[]> {
  const { data: clientesRaw, error: clientesError } = await supabase
    .from('clientes')
    .select('id,usuario_id,nombre,email,telefono,direccion,dni')
    .order('nombre', { ascending: true })

  if (clientesError) {
    console.error('[admin-dashboard] clientes fallback error', clientesError)
    throw clientesError
  }

  const clientes = (clientesRaw || []) as ClienteFallbackRow[]
  const usuarioIds = clientes.map((row) => row.usuario_id).filter(Boolean) as string[]

  let usuarios: UsuarioFallbackRow[] = []
  if (usuarioIds.length > 0) {
    const { data: usuariosRaw, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id,email,rol')
      .in('id', usuarioIds)

    if (usuariosError) {
      console.error('[admin-dashboard] usuarios fallback error', usuariosError)
    } else {
      usuarios = (usuariosRaw || []) as UsuarioFallbackRow[]
    }
  }

  const { data: prestamosRaw, error: prestamosError } = await supabase
    .from('prestamos')
    .select('cliente_id,estado,total_a_pagar,saldo_pendiente,monto,fecha_limite')

  if (prestamosError) {
    console.error('[admin-dashboard] prestamos fallback error', prestamosError)
  }

  const { data: pagosRaw, error: pagosError } = await supabase
    .from('pagos')
    .select('cliente_id,monto,estado_validacion,fecha_pago,created_at')

  if (pagosError) {
    console.error('[admin-dashboard] pagos fallback error', pagosError)
  }

  const prestamos = ((prestamosRaw || []) as PrestamoFallbackRow[]).filter((p) => Boolean(p.cliente_id))
  const pagos = (pagosRaw || []) as PagoFallbackRow[]

  const usuariosById = new Map<string, UsuarioFallbackRow>()
  for (const usuario of usuarios) usuariosById.set(usuario.id, usuario)

  const prestamosByCliente = new Map<string, PrestamoFallbackRow[]>()
  for (const prestamo of prestamos) {
    const list = prestamosByCliente.get(prestamo.cliente_id) || []
    list.push(prestamo)
    prestamosByCliente.set(prestamo.cliente_id, list)
  }

  const pagosByCliente = new Map<string, PagoFallbackRow[]>()
  for (const pago of pagos) {
    if (!pago.cliente_id) continue
    const list = pagosByCliente.get(pago.cliente_id) || []
    list.push(pago)
    pagosByCliente.set(pago.cliente_id, list)
  }

  const mapped: ClienteAdminListadoItem[] = clientes.map((cliente) => {
    const usuario = cliente.usuario_id ? usuariosById.get(cliente.usuario_id) : undefined
    const clientePrestamos = prestamosByCliente.get(cliente.id) || []
    const clientePagos = pagosByCliente.get(cliente.id) || []

    const cantidadPrestamos = clientePrestamos.length
    const prestamosActivos = clientePrestamos.filter((p) => ACTIVE_LOAN_STATES.has(low(p.estado)))
    const cantidadPrestamosActivos = prestamosActivos.length
    const tienePrestamoVencido = clientePrestamos.some((p) => OVERDUE_LOAN_STATES.has(low(p.estado)))

    const deudaActiva = prestamosActivos.reduce((acc, p) => {
      const saldo = Number(p.saldo_pendiente ?? p.total_a_pagar ?? p.monto ?? 0)
      return acc + Math.max(saldo, 0)
    }, 0)

    const totalAPagar = clientePrestamos.reduce((acc, p) => {
      const total = Number(p.total_a_pagar ?? p.monto ?? 0)
      return acc + Math.max(total, 0)
    }, 0)

    const totalPagado = clientePagos.reduce((acc, p) => {
      const estadoValidacion = low(p.estado_validacion)
      if (estadoValidacion && !PAID_PAYMENT_VALIDATION_STATES.has(estadoValidacion)) return acc
      return acc + Math.max(Number(p.monto || 0), 0)
    }, 0)

    const restante = Math.max(totalAPagar - totalPagado, 0)

    const proximoVencimientoRaw = prestamosActivos
      .map((p) => (p.fecha_limite || '').slice(0, 10))
      .filter(Boolean)
      .sort()[0]

    const fechaUltimoPagoRaw = clientePagos
      .map((p) => p.fecha_pago || p.created_at || '')
      .filter(Boolean)
      .sort()
      .pop()

  const mapped: ClienteAdminListadoItem[] = clientes.map((cliente) => {
    const usuario = cliente.usuario_id ? usuariosById.get(cliente.usuario_id) : null
    const clientePrestamos = prestamosByCliente.get(cliente.id) || []
    const clientePagos = pagosByCliente.get(cliente.id) || []

    const cantidadPrestamos = clientePrestamos.length
    const prestamosActivos = clientePrestamos.filter((p) => ACTIVE_LOAN_STATES.has(low(p.estado)))
    const cantidadPrestamosActivos = prestamosActivos.length
    const tienePrestamoVencido = clientePrestamos.some((p) => OVERDUE_LOAN_STATES.has(low(p.estado)))

    const deudaActiva = prestamosActivos.reduce((acc, p) => {
      const saldo = Number(p.saldo_pendiente ?? p.total_a_pagar ?? p.monto ?? 0)
      return acc + Math.max(saldo, 0)
    }, 0)

    const totalAPagar = clientePrestamos.reduce((acc, p) => {
      return acc + Math.max(Number(p.total_a_pagar ?? p.monto ?? 0), 0)
    }, 0)

    const totalPagado = clientePagos.reduce((acc, p) => {
      const estadoValidacion = low(p.estado_validacion)
      if (estadoValidacion && !PAID_PAYMENT_VALIDATION_STATES.has(estadoValidacion)) return acc
      return acc + Math.max(Number(p.monto || 0), 0)
    }, 0)

    const restante = Math.max(totalAPagar - totalPagado, 0)

    const proximoVencimientoRaw = prestamosActivos
      .map((p) => (p.fecha_limite || '').slice(0, 10))
      .filter(Boolean)
      .sort()[0]

    const fechaUltimoPagoRaw = clientePagos
      .map((p) => p.fecha_pago || p.created_at || '')
      .filter(Boolean)
      .sort()
      .pop()

  const mapped = fallbackRows.map((c) => {
    const usuario = c.usuario_id ? usuariosById.get(c.usuario_id) : null
    const clientePrestamos = prestamosByCliente.get(c.id) || []
    const clientePagos = pagosByCliente.get(c.id) || []

    const cantidadPrestamos = clientePrestamos.length
    const activos = clientePrestamos.filter((p) => ACTIVE_LOAN_STATES.has(low(p.estado)))
    const cantidadPrestamosActivos = activos.length
    const tienePrestamoVencido = clientePrestamos.some((p) => OVERDUE_LOAN_STATES.has(low(p.estado)))
    const deudaActiva = activos.reduce((acc, prestamo) => {
      const saldo = Number(prestamo.saldo_pendiente ?? prestamo.total_a_pagar ?? prestamo.monto ?? 0)
      return acc + Math.max(saldo, 0)
    }, 0)
    const totalAPagar = clientePrestamos.reduce((acc, prestamo) => acc + Math.max(Number(prestamo.total_a_pagar ?? prestamo.monto ?? 0), 0), 0)
    const totalPagado = clientePagos.reduce((acc, pago) => {
      const estadoValidacion = low(pago.estado_validacion)
      if (estadoValidacion && !['aprobado', 'confirmado', 'acreditado'].includes(estadoValidacion)) return acc
      return acc + Math.max(Number(pago.monto || 0), 0)
    }, 0)
    const restante = Math.max(totalAPagar - totalPagado, 0)
    const proximoVencimientoRaw = activos
      .map((p) => (p.fecha_limite || '').slice(0, 10))
      .filter(Boolean)
      .sort()[0]
    const fechaUltimoPagoRaw = clientePagos
      .map((p) => p.fecha_pago || p.created_at || '')
      .filter(Boolean)
      .sort()
      .pop()

  const fallbackRows = (clientesRaw || []) as ClienteFallbackRow[]
  console.log('[admin-dashboard] clientes fallback rows', fallbackRows.length)
  return fallbackRows.map((c) => {
    return {
      clienteId: cliente.id,
      usuarioId: cliente.usuario_id || '',
      nombre: cliente.nombre || 'Cliente',
      dni: cliente.dni || '—',
      telefono: cliente.telefono || 'Sin teléfono',
      direccion: cliente.direccion || 'Sin dirección',
      email: usuario?.email || cliente.email || 'Sin email',
      cantidadPrestamos,
      cantidadPrestamosActivos,
      tienePrestamoActivo: cantidadPrestamosActivos > 0 || deudaActiva > 0 || restante > 0,
      tienePrestamoVencido,
      deudaActiva,
      restante,
      estadoCliente: tienePrestamoVencido ? 'vencido' : cantidadPrestamosActivos > 0 ? 'activo' : 'sin_prestamo',
      fechaUltimoPago: ymd(fechaUltimoPagoRaw),
      proximoVencimiento: ymd(proximoVencimientoRaw),
      totalPagado,
    }
  })

  const filtered = mapped.filter((row) => {
    const usuario = row.usuarioId ? usuariosById.get(row.usuarioId) : undefined
    const rol = low(usuario?.rol)
    if (!rol) return true
    return rol === 'cliente'
  })

  console.log('[admin-dashboard] clientes fallback rows', filtered.length)
  return filtered
}

export async function fetchAdminClientesListado(): Promise<ClienteAdminListadoItem[]> {
  const { data, error } = await supabase.from('admin_clientes_listado').select('*').order('nombre', { ascending: true })

  if (!error) {
    const rows = (data || []) as AdminClientesListadoRow[]

    if (rows.length > 0) {
      console.log('[admin-dashboard] admin_clientes_listado rows', rows.length)
      return rows.map(toListadoItem)
    }

    const { count, error: countError } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .not('usuario_id', 'is', null)

    if (!countError && Number(count || 0) > 0) {
      console.warn('[admin-dashboard] admin_clientes_listado returned 0 rows with linked clientes. Using table fallback.')
      return fetchAdminClientesListadoFromBaseTables()
    }

    console.log('[admin-dashboard] admin_clientes_listado rows', rows.length)
    return []
  }

  console.warn('[admin-dashboard] admin_clientes_listado query failed, fallback to clientes + usuarios', error)
  return fetchAdminClientesListadoFromBaseTables()
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

  const cuotas: Cuota[] =
    cuotasResult.status === 'fulfilled' && !cuotasResult.value.error ? ((cuotasResult.value.data || []) as Cuota[]) : []

  if (cuotasResult.status === 'rejected') {
    console.error('[admin-dashboard] cuotas request rejected', cuotasResult.reason)
  } else if (cuotasResult.value.error) {
    console.error('[admin-dashboard] cuotas query error', cuotasResult.value.error)
  }

  const pagos: Pago[] =
    pagosResult.status === 'fulfilled' && !pagosResult.value.error ? ((pagosResult.value.data || []) as Pago[]) : []

  const pagos = pagosResult.status === 'fulfilled' && !pagosResult.value.error ? ((pagosResult.value.data || []) as Pago[]) : []
  if (pagosResult.status === 'rejected') {
    console.error('[admin-dashboard] pagos request rejected', pagosResult.reason)
  } else if (pagosResult.value.error) {
    console.error('[admin-dashboard] pagos query error', pagosResult.value.error)
  }

  const prestamosHistorial: PrestamoHistorial[] =
    prestamosHistorialResult.status === 'fulfilled' && !prestamosHistorialResult.value.error
      ? ((prestamosHistorialResult.value.data || []) as PrestamoHistorial[])
      : []

  if (prestamosHistorialResult.status === 'rejected') {
    console.error('[admin-dashboard] prestamos request rejected', prestamosHistorialResult.reason)
  } else if (prestamosHistorialResult.value.error) {
    console.error('[admin-dashboard] prestamos query error', prestamosHistorialResult.value.error)
  }

  const clientesById = new Map<string, ClienteAdminListadoItem>()
  for (const cliente of clientesListado) clientesById.set(cliente.clienteId, cliente)

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
    if (estadoValidacion) return PENDING_PAYMENT_VALIDATION_STATES.has(estadoValidacion)
    return !pago.fecha_pago
  })

  const pagosPendientesList: PagoPendienteItem[] = pagosPendientesRaw.slice(0, 8).map((p) => {
    const cliente = p.cliente_id ? clientesById.get(p.cliente_id) : undefined

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
