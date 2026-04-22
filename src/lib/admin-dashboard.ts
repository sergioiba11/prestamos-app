import { supabase } from './supabase'
import { estadoCuotaCalculado, estadoPrestamoDesdeCuotas, saldoPrestamoDesdeCuotas } from './statuses'

type ClienteRow = {
  id: string
  usuario_id: string | null
  nombre: string | null
  dni: string | null
  telefono: string | null
  direccion: string | null
}

type UsuarioRow = {
  id: string
  email: string | null
  rol: string | null
}

type PrestamoRow = {
  id: string
  cliente_id: string
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  saldo_pendiente: number | null
  estado: string | null
  modalidad: 'mensual' | 'diario' | null
  cuotas: number | null
  fecha_inicio: string | null
  fecha_limite: string | null
  fecha_inicio_mora: string | null
}

type PagoRow = {
  id: string
  cliente_id: string | null
  prestamo_id: string | null
  monto: number | null
  metodo: string | null
  created_at: string | null
  fecha_pago: string | null
  estado_validacion: string | null
}

type CuotaRow = {
  prestamo_id: string
  numero_cuota?: number | null
  fecha_vencimiento: string | null
  monto_cuota: number | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  estado: string | null
}

type AdminClientesListadoViewRow = {
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
  totalPagado: number
  restante: number
  proximoVencimiento: string
  fechaUltimoPago: string
  estadoCliente: string
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
  estadoValidacion?: string
  prestamoId?: string
  telefono?: string
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
  modalidad: 'mensual' | 'diario' | null
  cuotasPlan: number
  estado: string
  fechaInicio: string
  fechaLimite: string
  fechaMora: string
  cuotasPagadas: number
  cuotasPendientes: number
  proximaCuotaNumero: number | null
  proximaCuotaVencimiento: string
}

export type AdminDashboardData = {
  kpis: AdminKpis
  activosCards: ClientePrestamoActivo[]
  pagosPendientesList: PagoPendienteItem[]
  historial: HistorialPrestamoItem[]
  clientesListado: ClienteAdminListadoItem[]
}

const ACTIVE_STATES = new Set(['activo', 'atrasado', 'en_mora', 'vencido', 'pendiente'])
const OVERDUE_STATES = new Set(['vencido', 'atrasado', 'en_mora'])
const PENDING_VALIDATION_STATES = new Set(['pendiente', 'pendiente_aprobacion', 'en_revision'])
const APPROVED_VALIDATION_STATES = new Set(['aprobado', 'confirmado', 'acreditado', 'pagado'])
const TRANSFER_PENDING_METHODS = new Set(['transferencia', 'alias', 'mp_transferencia'])

function low(value?: string | null): string {
  return String(value || '').toLowerCase()
}

function ymd(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '—'
}

function toNumber(value: unknown): number {
  return Number(value || 0)
}

function hasActiveLoan(cliente: ClienteAdminListadoItem): boolean {
  if (cliente.tienePrestamoActivo || cliente.tienePrestamoVencido) return true
  if (cliente.cantidadPrestamosActivos > 0) return true
  if (cliente.deudaActiva > 0 || cliente.restante > 0) return true
  return ACTIVE_STATES.has(low(cliente.estadoCliente))
}

function hasOverdueLoan(cliente: ClienteAdminListadoItem): boolean {
  const estado = low(cliente.estadoCliente)
  return Boolean(cliente.tienePrestamoVencido) || OVERDUE_STATES.has(estado) || estado.includes('venc')
}

function isActiveLoanState(value?: string | null) {
  return ACTIVE_STATES.has(low(value))
}

function isOverdueLoanState(value?: string | null) {
  return OVERDUE_STATES.has(low(value))
}

function resolvePagoClienteId(pago: PagoRow, prestamosById: Map<string, PrestamoRow>) {
  if (pago.cliente_id) return pago.cliente_id
  if (!pago.prestamo_id) return ''
  return prestamosById.get(pago.prestamo_id)?.cliente_id || ''
}

function isApprovedPayment(pago: Pick<PagoRow, 'estado_validacion' | 'metodo'>) {
  const estado = low(pago.estado_validacion)
  if (estado) return APPROVED_VALIDATION_STATES.has(estado)
  return low(pago.metodo) === 'efectivo'
}

function isPendingValidationPayment(pago: Pick<PagoRow, 'estado_validacion' | 'metodo' | 'created_at'>) {
  const estado = low(pago.estado_validacion)
  if (estado) return PENDING_VALIDATION_STATES.has(estado)
  const metodo = low(pago.metodo)
  return TRANSFER_PENDING_METHODS.has(metodo) && Boolean(pago.created_at)
}

function toListadoItemFromView(row: AdminClientesListadoViewRow): ClienteAdminListadoItem {
  const deudaActiva = Math.max(toNumber(row.deuda_activa), 0)
  const restante = Math.max(toNumber(row.restante), deudaActiva)
  const cantidadPrestamos = toNumber(row.cantidad_prestamos)
  const cantidadPrestamosActivos = toNumber(row.cantidad_prestamos_activos)
  const tienePrestamoVencido = Boolean(row.tiene_prestamo_vencido)
  const tienePrestamoActivo = Boolean(row.tiene_prestamo_activo) || cantidadPrestamosActivos > 0 || deudaActiva > 0 || restante > 0

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
    totalPagado: toNumber(row.total_pagado),
    restante,
    proximoVencimiento: ymd(row.proximo_vencimiento),
    fechaUltimoPago: ymd(row.fecha_ultimo_pago),
    estadoCliente: low(row.estado_cliente) || (tienePrestamoVencido ? 'vencido' : tienePrestamoActivo ? 'activo' : 'sin_prestamo'),
  }
}

function toActivoCard(row: ClienteAdminListadoItem): ClientePrestamoActivo {
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

export async function fetchAdminClientesListadoFromBaseTables(): Promise<ClienteAdminListadoItem[]> {
  const { data: clientesRaw, error: clientesError } = await supabase
    .from('clientes')
    .select('id,usuario_id,nombre,dni,telefono,direccion')
    .order('nombre', { ascending: true })

  if (clientesError) {
    console.error('[admin-dashboard] clientes fallback error', clientesError)
    throw clientesError
  }

  const clientes = (clientesRaw || []) as ClienteRow[]
  const usuarioIds = clientes.map((c) => c.usuario_id).filter(Boolean) as string[]

  let usuarios: UsuarioRow[] = []
  if (usuarioIds.length > 0) {
    const { data: usuariosRaw, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id,email,rol')
      .in('id', usuarioIds)

    if (usuariosError) {
      console.error('[admin-dashboard] usuarios fallback error', usuariosError)
    } else {
      usuarios = (usuariosRaw || []) as UsuarioRow[]
    }
  }

  const { data: prestamosRaw, error: prestamosError } = await supabase
    .from('prestamos')
    .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,modalidad,cuotas,fecha_inicio,fecha_limite,fecha_inicio_mora')

  if (prestamosError) {
    console.error('[admin-dashboard] prestamos fallback error', prestamosError)
  }

  const { data: pagosRaw, error: pagosError } = await supabase
    .from('pagos')
    .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')

  if (pagosError) {
    console.error('[admin-dashboard] pagos fallback error', pagosError)
  }

  const prestamos = ((prestamosRaw || []) as PrestamoRow[]).filter((p) => Boolean(p.cliente_id))
  const pagos = (pagosRaw || []) as PagoRow[]
  const prestamosById = new Map<string, PrestamoRow>()
  for (const prestamo of prestamos) prestamosById.set(prestamo.id, prestamo)

  const usuariosById = new Map<string, UsuarioRow>()
  for (const usuario of usuarios) usuariosById.set(usuario.id, usuario)

  const prestamosByCliente = new Map<string, PrestamoRow[]>()
  for (const prestamo of prestamos) {
    const list = prestamosByCliente.get(prestamo.cliente_id) || []
    list.push(prestamo)
    prestamosByCliente.set(prestamo.cliente_id, list)
  }

  const pagosByCliente = new Map<string, PagoRow[]>()
  for (const pago of pagos) {
    const pagoClienteId = resolvePagoClienteId(pago, prestamosById)
    if (!pagoClienteId) continue
    const list = pagosByCliente.get(pagoClienteId) || []
    list.push(pago)
    pagosByCliente.set(pagoClienteId, list)
  }

  const mapped: ClienteAdminListadoItem[] = clientes.map((cliente) => {
    const usuario = cliente.usuario_id ? usuariosById.get(cliente.usuario_id) : undefined
    const prestamosCliente = prestamosByCliente.get(cliente.id) || []
    const pagosCliente = pagosByCliente.get(cliente.id) || []

    const cantidadPrestamos = prestamosCliente.length
    const prestamosActivos = prestamosCliente.filter((p) => isActiveLoanState(p.estado))
    const cantidadPrestamosActivos = prestamosActivos.length
    const tienePrestamoVencido = prestamosCliente.some((p) => isOverdueLoanState(p.estado))

    const deudaActiva = prestamosActivos.reduce((acc, p) => {
      const saldo = Number(p.saldo_pendiente ?? p.total_a_pagar ?? p.monto ?? 0)
      return acc + Math.max(saldo, 0)
    }, 0)

    const totalAPagar = prestamosCliente.reduce((acc, p) => {
      const total = Number(p.total_a_pagar ?? p.monto ?? 0)
      return acc + Math.max(total, 0)
    }, 0)

    const totalPagado = pagosCliente.reduce((acc, p) => {
      if (!isApprovedPayment(p)) return acc
      return acc + Math.max(Number(p.monto || 0), 0)
    }, 0)

    const restante = Math.max(totalAPagar - totalPagado, 0)

    const proximoVencimientoRaw = prestamosActivos
      .map((p) => (p.fecha_limite || '').slice(0, 10))
      .filter(Boolean)
      .sort()[0]

    const fechaUltimoPagoRaw = pagosCliente
      .map((p) => p.fecha_pago || p.created_at || '')
      .filter(Boolean)
      .sort()
      .pop()

    return {
      clienteId: cliente.id,
      usuarioId: cliente.usuario_id || '',
      nombre: cliente.nombre || 'Cliente',
      dni: cliente.dni || '—',
      telefono: cliente.telefono || 'Sin teléfono',
      direccion: cliente.direccion || 'Sin dirección',
      email: usuario?.email || 'Sin email',
      cantidadPrestamos,
      cantidadPrestamosActivos,
      tienePrestamoActivo: cantidadPrestamosActivos > 0 || deudaActiva > 0 || restante > 0,
      tienePrestamoVencido,
      deudaActiva,
      totalPagado,
      restante,
      proximoVencimiento: ymd(proximoVencimientoRaw),
      fechaUltimoPago: ymd(fechaUltimoPagoRaw),
      estadoCliente: tienePrestamoVencido ? 'vencido' : cantidadPrestamosActivos > 0 ? 'activo' : 'sin_prestamo',
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
  const { data, error } = await supabase
    .from('admin_clientes_listado')
    .select('*')
    .order('nombre', { ascending: true })

  if (!error) {
    const viewRows = (data || []) as AdminClientesListadoViewRow[]
    console.log('[admin-dashboard] view rows', viewRows.length)

    if (viewRows.length > 0) {
      return viewRows.map(toListadoItemFromView)
    }
  } else {
    console.warn('[admin-dashboard] admin_clientes_listado failed', error)
  }

  console.warn('[admin-dashboard] using fallback from base tables')
  return fetchAdminClientesListadoFromBaseTables()
}

export async function fetchAdminPanelData(): Promise<AdminDashboardData> {
  const clientesListado = await fetchAdminClientesListado()

  const [cuotasResult, pagosResult, prestamosResult] = await Promise.allSettled([
    supabase
      .from('cuotas')
      .select('prestamo_id,numero_cuota,fecha_vencimiento,monto_cuota,monto_pagado,saldo_pendiente,estado'),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')
      .order('created_at', { ascending: false }),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,modalidad,cuotas,fecha_inicio,fecha_limite,fecha_inicio_mora')
      .order('fecha_inicio', { ascending: false }),
  ])

  const cuotas: CuotaRow[] =
    cuotasResult.status === 'fulfilled' && !cuotasResult.value.error ? ((cuotasResult.value.data || []) as CuotaRow[]) : []

  const pagos: PagoRow[] =
    pagosResult.status === 'fulfilled' && !pagosResult.value.error ? ((pagosResult.value.data || []) as PagoRow[]) : []

  const prestamos: PrestamoRow[] =
    prestamosResult.status === 'fulfilled' && !prestamosResult.value.error ? ((prestamosResult.value.data || []) as PrestamoRow[]) : []
  const prestamosById = new Map<string, PrestamoRow>()
  for (const prestamo of prestamos) prestamosById.set(prestamo.id, prestamo)

  if (cuotasResult.status === 'rejected') console.error('[admin-dashboard] cuotas rejected', cuotasResult.reason)
  if (cuotasResult.status === 'fulfilled' && cuotasResult.value.error) console.error('[admin-dashboard] cuotas error', cuotasResult.value.error)
  if (pagosResult.status === 'rejected') console.error('[admin-dashboard] pagos rejected', pagosResult.reason)
  if (pagosResult.status === 'fulfilled' && pagosResult.value.error) console.error('[admin-dashboard] pagos error', pagosResult.value.error)
  if (prestamosResult.status === 'rejected') console.error('[admin-dashboard] prestamos rejected', prestamosResult.reason)
  if (prestamosResult.status === 'fulfilled' && prestamosResult.value.error) console.error('[admin-dashboard] prestamos error', prestamosResult.value.error)

  const clientesById = new Map<string, ClienteAdminListadoItem>(clientesListado.map((c) => [c.clienteId, c]))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)

  const cobrarHoy = cuotas.reduce((acc, cuota) => {
    const estado = estadoCuotaCalculado(cuota, todayKey)
    if (!['pendiente', 'parcial'].includes(estado)) return acc
    if ((cuota.fecha_vencimiento || '').slice(0, 10) !== todayKey) return acc

    const saldoPendiente = toNumber(cuota.saldo_pendiente)
    const fallback = toNumber(cuota.monto_cuota) - toNumber(cuota.monto_pagado)
    return acc + (saldoPendiente > 0 ? saldoPendiente : Math.max(fallback, 0))
  }, 0)

  const pagosPendientesRaw = pagos.filter((pago) => isPendingValidationPayment(pago))

  const pagosPendientesList: PagoPendienteItem[] = pagosPendientesRaw.slice(0, 8).map((pago) => {
    const resolvedClienteId = resolvePagoClienteId(pago, prestamosById)
    const cliente = resolvedClienteId ? clientesById.get(resolvedClienteId) : undefined

    return {
      id: pago.id,
      clienteId: resolvedClienteId || '',
      cliente: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      monto: toNumber(pago.monto),
      metodo: pago.metodo || 'Sin método',
      createdAt: pago.created_at || '',
      estadoValidacion: low(pago.estado_validacion) || (isApprovedPayment(pago) ? 'aprobado' : 'pendiente'),
      prestamoId: pago.prestamo_id || undefined,
      telefono: cliente?.telefono || undefined,
    }
  })

  console.log('[admin-dashboard] clientesListado', clientesListado)
  console.log('[admin-dashboard] pagosPendientesRaw', pagosPendientesRaw)

  const pagosByPrestamo = new Map<string, number>()
  for (const pago of pagos) {
    if (!pago.prestamo_id) continue
    if (!isApprovedPayment(pago)) continue
    const current = pagosByPrestamo.get(pago.prestamo_id) || 0
    pagosByPrestamo.set(pago.prestamo_id, current + toNumber(pago.monto))
  }

  const cuotasByPrestamo = new Map<string, CuotaRow[]>()
  for (const cuota of cuotas) {
    if (!cuota.prestamo_id) continue
    const list = cuotasByPrestamo.get(cuota.prestamo_id) || []
    list.push(cuota)
    cuotasByPrestamo.set(cuota.prestamo_id, list)
  }

  const historial: HistorialPrestamoItem[] = prestamos.map((prestamo) => {
    const total = toNumber(prestamo.total_a_pagar)
    const cliente = clientesById.get(prestamo.cliente_id)
    const cuotasPrestamo = cuotasByPrestamo.get(prestamo.id) || []
    const restante = cuotasPrestamo.length ? saldoPrestamoDesdeCuotas(cuotasPrestamo) : Math.max(total - toNumber(pagosByPrestamo.get(prestamo.id)), 0)
    const pagado = Math.max(total - restante, 0)
    const cuotasPagadas = cuotasPrestamo.filter((c) => estadoCuotaCalculado(c, todayKey) === 'pagada').length
    const cuotasPendientes = cuotasPrestamo.filter((c) => ['pendiente', 'parcial', 'vencida'].includes(estadoCuotaCalculado(c, todayKey))).length
    const proximaCuota = cuotasPrestamo
      .filter((c) => ['pendiente', 'parcial', 'vencida'].includes(estadoCuotaCalculado(c, todayKey)))
      .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))[0]
    const estadoCalculado = cuotasPrestamo.length ? estadoPrestamoDesdeCuotas(cuotasPrestamo, todayKey) : (low(prestamo.estado) || 'activo')

    return {
      prestamoId: prestamo.id,
      clienteId: prestamo.cliente_id,
      cliente: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      monto: toNumber(prestamo.monto),
      interes: toNumber(prestamo.interes),
      total,
      pagado,
      restante,
      modalidad: prestamo.modalidad || null,
      cuotasPlan: toNumber(prestamo.cuotas),
      estado: estadoCalculado,
      fechaInicio: ymd(prestamo.fecha_inicio),
      fechaLimite: ymd(prestamo.fecha_limite),
      fechaMora: ymd(prestamo.fecha_inicio_mora || prestamo.fecha_limite),
      cuotasPagadas,
      cuotasPendientes,
      proximaCuotaNumero: proximaCuota?.numero_cuota ? toNumber(proximaCuota.numero_cuota) : null,
      proximaCuotaVencimiento: ymd(proximaCuota?.fecha_vencimiento || null),
    }
  })

  const prestamosVencidosByPrestamo = prestamos.filter((prestamo) => {
    const cuotasPrestamo = cuotasByPrestamo.get(prestamo.id) || []
    if (!cuotasPrestamo.length) return false
    return cuotasPrestamo.some((cuota) => estadoCuotaCalculado(cuota, todayKey) === 'vencida')
  }).length

  const prestamosVencidosListado = clientesListado.filter(hasOverdueLoan).length

  console.log('[admin-dashboard] historial size', historial.length)

  const clientesActivosIds = new Set(
    historial
      .filter((item) => item.restante > 0 && item.estado !== 'pagado' && item.estado !== 'cancelado')
      .map((item) => item.clienteId)
  )
  const activos = clientesListado.filter((cliente) => clientesActivosIds.has(cliente.clienteId) || hasActiveLoan(cliente))
  const activosCards = activos.map(toActivoCard)

  const kpis: AdminKpis = {
    cobrarHoy,
    clientesActivos: activos.length,
    prestamosVencidos: Math.max(prestamosVencidosByPrestamo, prestamosVencidosListado),
    pagosPendientes: pagosPendientesRaw.length,
  }

  return {
    kpis,
    activosCards,
    pagosPendientesList,
    historial,
    clientesListado,
  }
}
