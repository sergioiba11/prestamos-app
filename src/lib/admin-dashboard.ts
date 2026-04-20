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

type PanelCliente = {
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

function low(v?: string | null) {
  return String(v || '').toLowerCase()
}

export async function fetchAdminPanelData() {
  const [clientesRes, panelClientesRes, prestamosRes, prestamosVencidosRes, cuotasRes, pagosRes] = await Promise.all([
    supabase.from('clientes').select('id,nombre,dni,telefono,direccion,usuario_id,usuarios:usuario_id(email)'),
    supabase.from('panel_clientes').select('*'),
    supabase
      .from('prestamos')
      .select('id,cliente_id,monto,interes,total_a_pagar,saldo_pendiente,estado,fecha_inicio,fecha_limite')
      .order('fecha_inicio', { ascending: false }),
    supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'vencido'),
    supabase
      .from('cuotas')
      .select('prestamo_id,numero_cuota,fecha_vencimiento,monto_cuota,monto_pagado,saldo_pendiente,estado')
      .order('numero_cuota', { ascending: true }),
    supabase
      .from('pagos')
      .select('id,cliente_id,prestamo_id,monto,metodo,created_at,fecha_pago,estado_validacion')
      .order('created_at', { ascending: false }),
  ])

  if (clientesRes.error) {
    console.error('admin-dashboard clientes error', clientesRes.error)
    throw clientesRes.error
  }
  if (panelClientesRes.error) {
    console.error('admin-dashboard panel_clientes error', panelClientesRes.error)
    throw panelClientesRes.error
  }
  if (prestamosRes.error) {
    console.error('admin-dashboard prestamos error', prestamosRes.error)
    throw prestamosRes.error
  }
  if (prestamosVencidosRes.error) {
    console.error('admin-dashboard prestamos_vencidos error', prestamosVencidosRes.error)
    throw prestamosVencidosRes.error
  }
  if (cuotasRes.error) {
    console.error('admin-dashboard cuotas error', cuotasRes.error)
    throw cuotasRes.error
  }
  if (pagosRes.error) {
    console.error('admin-dashboard pagos error', pagosRes.error)
    throw pagosRes.error
  }

  const clientes = (clientesRes.data || []) as Cliente[]
  const panelClientesRaw = (panelClientesRes.data || []) as PanelCliente[]
  const prestamos = (prestamosRes.data || []) as Prestamo[]
  const cuotas = (cuotasRes.data || []) as Cuota[]
  const pagos = (pagosRes.data || []) as Pago[]

  console.log('panel_clientes RAW:', panelClientesRaw, panelClientesRes.error)

  const clientesActivos = (panelClientesRaw || []).filter((c) => {
    const cantidadPrestamos = Number(c.cantidad_prestamos || 0)
    const totalAPagar = Number(c.total_a_pagar || 0)
    const totalPagado = Number(c.total_pagado || 0)
    return cantidadPrestamos > 0 || totalAPagar > totalPagado
  })

  console.log('clientes activos filtrados:', clientesActivos)

  const usuarioIds = Array.from(new Set(clientesActivos.map((c) => c.usuario_id).filter(Boolean))) as string[]

  let usuariosRaw: Array<{ id: string; email: string | null }> = []
  if (usuarioIds.length > 0) {
    const usuariosRes = await supabase.from('usuarios').select('id,email').in('id', usuarioIds)
    if (usuariosRes.error) throw usuariosRes.error
    usuariosRaw = (usuariosRes.data || []) as Array<{ id: string; email: string | null }>
  }

  const usuariosById = new Map(usuariosRaw.map((u) => [u.id, u.email || 'Sin email']))

  console.log('usuarios RAW:', usuariosRaw)

  const clientesMap = clientesActivos.map((c, index) => ({
    id: c.cliente_id_uuid || c.usuario_id || `sin-id-${index}`,
    nombre: c.nombre || 'Cliente',
    telefono: c.telefono || 'Sin teléfono',
    dni: c.dni || '—',
    prestamo: Number(c.total_a_pagar || 0),
    estado: 'Activo',
    usuario_id: c.usuario_id || '',
  }))

  console.log('clientes mapeados final:', clientesMap)

  const clientesById = new Map(clientes.map((c) => [c.id, c]))
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

  const activosCards: ClientePrestamoActivo[] = clientesMap.map((row) => {
    const cliente = clientesById.get(row.id)

    return {
      prestamoId: `panel-${row.id}`,
      clienteId: row.id,
      nombre: row.nombre,
      email: usuariosById.get(row.usuario_id) || 'Sin email',
      usuarioId: row.usuario_id,
      dni: row.dni,
      telefono: row.telefono,
      direccion: cliente?.direccion || '',
      prestamoActivo: Number(row.prestamo || 0),
      proximoPago: '—',
      estado: 'activo',
    }
  })

  const historial: HistorialPrestamoItem[] = prestamos.map((prestamo) => {
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
      fechaInicio: prestamo.fecha_inicio?.slice(0, 10) || '—',
      fechaLimite: prestamo.fecha_limite?.slice(0, 10) || '—',
    }
  })

  const kpis: AdminKpis = {
    cobrarHoy,
    clientesActivos: clientesMap.length,
    prestamosVencidos: prestamosVencidosRes.count || 0,
    pagosPendientes: pagosPendientesRaw.length,
  }

  return { kpis, activosCards, pagosPendientesList, historial }
}
