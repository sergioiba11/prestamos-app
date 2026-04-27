import { supabase } from './supabase'
import { getLatestValidReceiptPayment } from './comprobantes'

type ClienteRow = {
  id: string
  usuario_id: string | null
  nombre: string | null
  dni: string | null
  dni_editado?: boolean | null
  dniEditado?: boolean | null
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
  estado: string | null
  impactado: boolean | null
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
  dni_editado?: boolean | null
  dniEditado?: boolean | null
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
  dniEditado: boolean
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
  cobrarSemana: number
  clientesActivos: number
  clientesDemorados: number
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
  dniEditado: boolean
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
  pendingDays?: number
}


export type ResumenCaja = {
  cobradoHoy: number
  cobradoSemana: number
  pendienteTotal: number
  moraEstimada: number
}

export type ClienteDemoradoItem = {
  clienteId: string
  nombre: string
  dni: string
  telefono: string
  saldoPendiente: number
  diasAtraso: number
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
  comprobantePagoId: string | null
}

export type AdminDashboardData = {
  kpis: AdminKpis
  resumenCaja: ResumenCaja
  activosCards: ClientePrestamoActivo[]
  clientesDemorados: ClienteDemoradoItem[]
  clientesDemoradosIds: string[]
  pagosPendientesList: PagoPendienteItem[]
  historial: HistorialPrestamoItem[]
  clientesListado: ClienteAdminListadoItem[]
}

const ACTIVE_STATES = new Set(['activo', 'atrasado', 'en_mora', 'vencido', 'pendiente'])
const OVERDUE_STATES = new Set(['vencido', 'atrasado', 'en_mora'])
const PENDING_QUOTA_STATES = new Set(['pendiente', 'parcial'])
const OVERDUE_QUOTA_STATES = new Set(['pendiente', 'parcial', 'vencida', 'vencido'])
const PENDING_VALIDATION_STATES = new Set(['pendiente_aprobacion'])

function low(value?: string | null): string {
  return String(value || '').toLowerCase()
}

function ymd(value?: string | null): string {
  return value ? String(value).slice(0, 10) : '—'
}

function toNumber(value: unknown): number {
  return Number(value || 0)
}
function getDiffDaysFromToday(value?: string | null): number {
  if (!value) return 0
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}


function resolveDniEditado(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return value > 0
  const normalized = String(value).trim().toLowerCase()
  return normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'si' || normalized === 'sí'
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

function isApprovedPayment(pago: Pick<PagoRow, 'estado' | 'metodo'>) {
  const estado = low(pago.estado)
  if (estado) return estado === 'aprobado'
  return low(pago.metodo) === 'efectivo'
}

function isPendingValidationPayment(pago: Pick<PagoRow, 'estado'>) {
  const estado = low(pago.estado)
  return PENDING_VALIDATION_STATES.has(estado)
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
    dniEditado: resolveDniEditado((row as any).dni_editado ?? (row as any).dniEditado ?? false),
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
    dniEditado: row.dniEditado,
    telefono: row.telefono,
    direccion: row.direccion,
    prestamoActivo: Math.max(row.deudaActiva, row.restante, 0),
    proximoPago: row.proximoVencimiento,
    estado: row.estadoCliente,
  }
}

export async function fetchAdminClientesListadoFromBaseTables(): Promise<ClienteAdminListadoItem[]> {
  let clientesRaw: any[] | null = null

  const clientesWithDniEditado = await supabase
    .from('clientes')
    .select('id,usuario_id,nombre,dni,dni_editado,telefono,direccion')
    .order('nombre', { ascending: true })

  if (!clientesWithDniEditado.error) {
    clientesRaw = clientesWithDniEditado.data
  } else {
    console.warn('[admin-dashboard] clientes fallback sin dni_editado, reintentando', clientesWithDniEditado.error)
    const clientesLegacy = await supabase
      .from('clientes')
      .select('id,usuario_id,nombre,dni,telefono,direccion')
      .order('nombre', { ascending: true })

    if (clientesLegacy.error) {
      console.error('[admin-dashboard] clientes fallback error', clientesLegacy.error)
      throw clientesLegacy.error
    }

    clientesRaw = clientesLegacy.data
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
    .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado,impactado')

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
      if (low(p.metodo) !== 'efectivo' && p.impactado === false) return acc
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
      dniEditado: resolveDniEditado((cliente as any).dni_editado ?? (cliente as any).dniEditado ?? false),
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
  const selectWithDniEditado =
    'cliente_id,usuario_id,nombre,dni,dni_editado,telefono,direccion,email,cantidad_prestamos,cantidad_prestamos_activos,tiene_prestamo_activo,tiene_prestamo_vencido,deuda_activa,total_pagado,restante,fecha_ultimo_pago,proximo_vencimiento,estado_cliente'
  const selectLegacy =
    'cliente_id,usuario_id,nombre,dni,telefono,direccion,email,cantidad_prestamos,cantidad_prestamos_activos,tiene_prestamo_activo,tiene_prestamo_vencido,deuda_activa,total_pagado,restante,fecha_ultimo_pago,proximo_vencimiento,estado_cliente'

  const withDniEditado = await supabase
    .from('admin_clientes_listado')
    .select(selectWithDniEditado)
    .order('nombre', { ascending: true })

  let data = withDniEditado.data
  let error = withDniEditado.error

  if (error) {
    console.warn('[admin-dashboard] admin_clientes_listado with dni_editado failed', error)

    const legacy = await supabase
      .from('admin_clientes_listado')
      .select(selectLegacy)
      .order('nombre', { ascending: true })

    data = legacy.data
    error = legacy.error
  }

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
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado,impactado')
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
  const weekAhead = new Date(today)
  weekAhead.setDate(weekAhead.getDate() + 7)
  const weekAheadKey = weekAhead.toISOString().slice(0, 10)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - 6)
  const weekStartKey = weekStart.toISOString().slice(0, 10)

  const cobrarHoy = cuotas.reduce((acc, cuota) => {
    if ((cuota.fecha_vencimiento || '').slice(0, 10) !== todayKey) return acc

    const saldoPendiente = toNumber(cuota.saldo_pendiente)
    if (saldoPendiente <= 0) return acc
    return acc + saldoPendiente
  }, 0)

  const cobrarSemana = cuotas.reduce((acc, cuota) => {
    const fechaVencimiento = (cuota.fecha_vencimiento || '').slice(0, 10)
    if (!fechaVencimiento) return acc
    if (fechaVencimiento < todayKey || fechaVencimiento > weekAheadKey) return acc
    const saldoPendiente = toNumber(cuota.saldo_pendiente)
    if (saldoPendiente <= 0) return acc
    return acc + saldoPendiente
  }, 0)

  const pendienteTotal = cuotas.reduce((acc, cuota) => acc + Math.max(toNumber(cuota.saldo_pendiente), 0), 0)

  const clientesMoraMap = new Map<string, ClienteDemoradoItem>()
  for (const cuota of cuotas) {
    const fechaVencimiento = (cuota.fecha_vencimiento || '').slice(0, 10)
    if (!fechaVencimiento || fechaVencimiento >= todayKey) continue
    const estado = low(cuota.estado)
    if (!OVERDUE_QUOTA_STATES.has(estado)) continue
    const saldoPendiente = toNumber(cuota.saldo_pendiente)
    if (saldoPendiente <= 0) continue
    const prestamo = prestamosById.get(cuota.prestamo_id)
    if (!prestamo?.cliente_id) continue
    const cliente = clientesById.get(prestamo.cliente_id)
    const diasAtraso = getDiffDaysFromToday(fechaVencimiento)
    const prev = clientesMoraMap.get(prestamo.cliente_id)

    clientesMoraMap.set(prestamo.cliente_id, {
      clienteId: prestamo.cliente_id,
      nombre: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      telefono: cliente?.telefono || 'Sin teléfono',
      saldoPendiente: (prev?.saldoPendiente || 0) + saldoPendiente,
      diasAtraso: Math.max(prev?.diasAtraso || 0, diasAtraso),
    })
  }

  for (const prestamo of prestamos) {
    const estado = low(prestamo.estado)
    if (!['atrasado', 'demorado', 'en_mora', 'vencido'].includes(estado)) continue
    const clienteId = prestamo.cliente_id
    if (!clienteId) continue
    if (clientesMoraMap.has(clienteId)) continue
    const cliente = clientesById.get(clienteId)
    const diasAtraso = getDiffDaysFromToday(prestamo.fecha_limite)
    clientesMoraMap.set(clienteId, {
      clienteId,
      nombre: cliente?.nombre || 'Cliente',
      dni: cliente?.dni || '—',
      telefono: cliente?.telefono || 'Sin teléfono',
      saldoPendiente: Math.max(toNumber(prestamo.saldo_pendiente), 0, cliente?.deudaActiva || 0, cliente?.restante || 0),
      diasAtraso: Math.max(diasAtraso, 0),
    })
  }

  const clientesDemorados = Array.from(clientesMoraMap.values()).sort(
    (a, b) => b.diasAtraso - a.diasAtraso || b.saldoPendiente - a.saldoPendiente,
  )

  const pagosPendientesRaw = pagos.filter((pago) => isPendingValidationPayment(pago))

  const pagosPendientesList: PagoPendienteItem[] = pagosPendientesRaw
    .map((pago) => {
      const resolvedClienteId = resolvePagoClienteId(pago, prestamosById)
      const cliente = resolvedClienteId ? clientesById.get(resolvedClienteId) : undefined
      const pendingDays = getDiffDaysFromToday(pago.created_at)
      return {
        id: pago.id,
        clienteId: resolvedClienteId || '',
        cliente: cliente?.nombre || 'Cliente',
        dni: cliente?.dni || '—',
        monto: toNumber(pago.monto),
        metodo: pago.metodo || 'Sin método',
        createdAt: pago.created_at || '',
        estadoValidacion: low(pago.estado) || (isApprovedPayment(pago) ? 'aprobado' : 'pendiente_aprobacion'),
        prestamoId: pago.prestamo_id || undefined,
        telefono: cliente?.telefono || undefined,
        pendingDays,
      } as PagoPendienteItem & { pendingDays: number }
    })
    .sort((a, b) => b.pendingDays - a.pendingDays || b.monto - a.monto)
    .slice(0, 8)

  const activos = clientesListado.filter(hasActiveLoan)
  const activosCards = activos.map(toActivoCard)

  console.log('[admin-dashboard] clientesListado', clientesListado)
  console.log('[admin-dashboard] activos', activos)
  console.log('[admin-dashboard] pagosPendientesRaw', pagosPendientesRaw)

  const pagosByPrestamo = new Map<string, number>()
  const pagosRowsByPrestamo = new Map<string, PagoRow[]>()
  for (const pago of pagos) {
    if (!pago.prestamo_id) continue
    const pagosList = pagosRowsByPrestamo.get(pago.prestamo_id) || []
    pagosList.push(pago)
    pagosRowsByPrestamo.set(pago.prestamo_id, pagosList)
    if (!isApprovedPayment(pago)) continue
    if (low(pago.metodo) !== 'efectivo' && pago.impactado === false) continue
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
    const restanteDesdeCuotas = cuotasPrestamo.reduce((acc, cuota) => {
      const saldo = toNumber(cuota.saldo_pendiente)
      if (saldo > 0) return acc + saldo
      const fallback = Math.max(toNumber(cuota.monto_cuota) - toNumber(cuota.monto_pagado), 0)
      return acc + fallback
    }, 0)
    const restante = Math.max(restanteDesdeCuotas, toNumber(prestamo.saldo_pendiente), 0)
    const pagado = Math.max(total - restante, toNumber(pagosByPrestamo.get(prestamo.id)), 0)
    const cuotasPagadas = cuotasPrestamo.filter((c) => low(c.estado) === 'pagada' || toNumber(c.saldo_pendiente) <= 0).length
    const cuotasPendientes = cuotasPrestamo.filter((c) => PENDING_QUOTA_STATES.has(low(c.estado)) || toNumber(c.saldo_pendiente) > 0).length
    const proximaCuota = cuotasPrestamo
      .filter((c) => PENDING_QUOTA_STATES.has(low(c.estado)) || toNumber(c.saldo_pendiente) > 0)
      .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))[0]
    const latestReceiptPayment = getLatestValidReceiptPayment(pagosRowsByPrestamo.get(prestamo.id) || [])

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
      estado: low(prestamo.estado) || 'activo',
      fechaInicio: ymd(prestamo.fecha_inicio),
      fechaLimite: ymd(prestamo.fecha_limite),
      fechaMora: ymd(prestamo.fecha_inicio_mora || prestamo.fecha_limite),
      cuotasPagadas,
      cuotasPendientes,
      proximaCuotaNumero: proximaCuota?.numero_cuota ? toNumber(proximaCuota.numero_cuota) : null,
      proximaCuotaVencimiento: ymd(proximaCuota?.fecha_vencimiento || null),
      comprobantePagoId: latestReceiptPayment?.id || null,
    }
  })

  const prestamosVencidosByPrestamo = prestamos.filter((prestamo) => {
    const estado = low(prestamo.estado)
    if (OVERDUE_STATES.has(estado)) return true
    const fechaLimite = (prestamo.fecha_limite || '').slice(0, 10)
    return Boolean(fechaLimite) && fechaLimite < todayKey && estado !== 'pagado' && estado !== 'cancelado'
  }).length

  const prestamosVencidosListado = clientesListado.filter(hasOverdueLoan).length
  const prestamosDemorados = prestamos.filter((prestamo) => ['atrasado', 'demorado', 'en_mora', 'vencido'].includes(low(prestamo.estado))).length

  const pagosAprobados = pagos.filter((pago) => isApprovedPayment(pago))
  const cobradoHoy = pagosAprobados.reduce((acc, pago) => {
    const createdAt = (pago.created_at || '').slice(0, 10)
    if (createdAt !== todayKey) return acc
    return acc + Math.max(toNumber(pago.monto), 0)
  }, 0)
  const cobradoSemana = pagosAprobados.reduce((acc, pago) => {
    const createdAt = (pago.created_at || '').slice(0, 10)
    if (!createdAt || createdAt < weekStartKey || createdAt > todayKey) return acc
    return acc + Math.max(toNumber(pago.monto), 0)
  }, 0)

  const moraEstimada = clientesDemorados.reduce((acc, cliente) => acc + Math.max(cliente.saldoPendiente, 0), 0)

  console.log('[admin-dashboard] historial size', historial.length)

  const kpis: AdminKpis = {
    cobrarHoy,
    cobrarSemana,
    clientesActivos: activos.length,
    clientesDemorados: clientesDemorados.length,
    prestamosVencidos: Math.max(prestamosVencidosByPrestamo, prestamosVencidosListado, prestamosDemorados),
    pagosPendientes: pagosPendientesRaw.length,
  }

  return {
    kpis,
    resumenCaja: {
      cobradoHoy,
      cobradoSemana,
      pendienteTotal,
      moraEstimada,
    },
    activosCards,
    clientesDemorados,
    clientesDemoradosIds: clientesDemorados.map((cliente) => cliente.clienteId),
    pagosPendientesList,
    historial,
    clientesListado,
  }
}

export type ClientePrestamoDetalleItem = {
  id: string
  clienteId: string
  monto: number
  interes: number
  totalAPagar: number
  saldoPendiente: number
  estado: string
  modalidad: string | null
  fechaInicio: string
  fechaLimite: string
  proximaCuota: string
}

export type ClientePagoDetalleItem = {
  id: string
  clienteId: string
  prestamoId: string | null
  monto: number
  metodo: string
  estado: string
  impactado: boolean
  tieneComprobante: boolean
  createdAt: string
}

export type ClienteDetalleConsolidado = {
  cliente: ClienteAdminListadoItem | null
  prestamosActivos: ClientePrestamoDetalleItem[]
  historialPrestamos: ClientePrestamoDetalleItem[]
  pagosCliente: ClientePagoDetalleItem[]
}

export async function fetchClienteDetalleConsolidado(clienteId: string): Promise<ClienteDetalleConsolidado> {
  const normalizedClienteId = String(clienteId || '').trim()
  if (!normalizedClienteId) {
    throw new Error('Cliente inválido para consulta consolidada.')
  }

  const [clientesListado, prestamosResult, pagosResult, cuotasResult] = await Promise.all([
    fetchAdminClientesListado(),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,modalidad,fecha_inicio,fecha_limite')
      .eq('cliente_id', normalizedClienteId)
      .order('fecha_inicio', { ascending: false }),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,estado,impactado')
      .order('created_at', { ascending: false }),
    supabase
      .from('cuotas')
      .select('prestamo_id,fecha_vencimiento,estado,saldo_pendiente')
      .order('fecha_vencimiento', { ascending: true }),
  ])

  if (prestamosResult.error) {
    console.error('[admin-dashboard] detalle prestamos error', prestamosResult.error)
    throw prestamosResult.error
  }

  console.log('detalle cliente/prestamo data:', {
    clienteId: normalizedClienteId,
    prestamos: prestamosResult.data,
    pagos: pagosResult.data,
  })
  console.log('detalle cliente/prestamo error:', {
    prestamosError: prestamosResult.error,
    pagosError: pagosResult.error,
  })

  if (pagosResult.error) {
    console.error('[admin-dashboard] detalle pagos error', pagosResult.error)
    throw pagosResult.error
  }
  if (cuotasResult.error) {
    console.error('[admin-dashboard] detalle cuotas error', cuotasResult.error)
    throw cuotasResult.error
  }

  const cliente = clientesListado.find((row) => row.clienteId === normalizedClienteId) || null
  const prestamos = ((prestamosResult.data || []) as PrestamoRow[]).filter((prestamo) => prestamo.cliente_id === normalizedClienteId)

  const prestamosById = new Map<string, PrestamoRow>()
  for (const prestamo of prestamos) prestamosById.set(prestamo.id, prestamo)

  const pagosRows = (pagosResult.data || []) as PagoRow[]
  const cuotasRows = (cuotasResult.data || []) as CuotaRow[]
  const cuotasByPrestamo = new Map<string, CuotaRow[]>()
  for (const cuota of cuotasRows) {
    if (!cuota.prestamo_id || !prestamosById.has(cuota.prestamo_id)) continue
    const list = cuotasByPrestamo.get(cuota.prestamo_id) || []
    list.push(cuota)
    cuotasByPrestamo.set(cuota.prestamo_id, list)
  }
  const pagosCliente = pagosRows
    .filter((pago) => {
      if (pago.cliente_id === normalizedClienteId) return true
      if (!pago.prestamo_id) return false
      return prestamosById.has(pago.prestamo_id)
    })
    .map((pago) => ({
      id: pago.id,
      clienteId: pago.cliente_id || normalizedClienteId,
      prestamoId: pago.prestamo_id || null,
      monto: toNumber(pago.monto),
      metodo: pago.metodo || 'sin_metodo',
      estado: low(pago.estado) || 'pendiente_aprobacion',
      impactado: Boolean(pago.impactado),
      tieneComprobante: low(pago.estado) === 'aprobado' && Boolean(pago.impactado),
      createdAt: pago.created_at || '',
    }))

  const historialPrestamos: ClientePrestamoDetalleItem[] = prestamos.map((prestamo) => {
    const proximaCuota = (cuotasByPrestamo.get(prestamo.id) || [])
      .filter((cuota) => PENDING_QUOTA_STATES.has(low(cuota.estado)) || toNumber(cuota.saldo_pendiente) > 0)
      .sort((a, b) => String(a.fecha_vencimiento || '').localeCompare(String(b.fecha_vencimiento || '')))[0]

    return {
      id: prestamo.id,
      clienteId: prestamo.cliente_id,
      monto: toNumber(prestamo.monto),
      interes: toNumber(prestamo.interes),
      totalAPagar: toNumber(prestamo.total_a_pagar),
      saldoPendiente: Math.max(toNumber(prestamo.saldo_pendiente), 0),
      estado: low(prestamo.estado) || 'activo',
      modalidad: prestamo.modalidad,
      fechaInicio: ymd(prestamo.fecha_inicio),
      fechaLimite: ymd(prestamo.fecha_limite),
      proximaCuota: ymd(proximaCuota?.fecha_vencimiento || null),
    }
  })

  const prestamosActivos = historialPrestamos.filter((prestamo) => isActiveLoanState(prestamo.estado))

  console.log('[admin-dashboard] detalle cliente diagnostico', {
    clienteId: normalizedClienteId,
    cantidadPrestamosListado: cliente?.cantidadPrestamos,
    cantidadPrestamosActivosListado: cliente?.cantidadPrestamosActivos,
    prestamosConsulta: historialPrestamos.length,
    prestamosActivosConsulta: prestamosActivos.length,
    pagosConsulta: pagosCliente.length,
  })

  return {
    cliente,
    prestamosActivos,
    historialPrestamos,
    pagosCliente,
  }
}
