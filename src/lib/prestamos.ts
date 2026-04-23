import { supabase } from './supabase'

export type PrestamoBase = {
  id: string
  cliente_id: string
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  fecha_inicio: string | null
  fecha_limite: string | null
  fecha_inicio_mora: string | null
  estado: string | null
  modalidad: 'mensual' | 'diario' | null
  cuotas: number | null
  dias_plazo: number | null
  saldo_pendiente: number | null
}

export type CuotaPrestamo = {
  id: string
  prestamo_id: string
  cliente_id: string
  numero_cuota: number
  fecha_vencimiento: string | null
  monto_cuota: number | null
  saldo_pendiente: number | null
  estado: string | null
}

export type PagoPrestamo = {
  id: string
  prestamo_id: string
  cliente_id: string
  monto: number | null
  metodo: string | null
  estado: string | null
  estado_validacion: string | null
  impactado: boolean | null
  comprobante_url: string | null
  fecha_pago: string | null
  created_at: string | null
}

export type PrestamoDetalle = {
  prestamo: PrestamoBase
  cuotas: CuotaPrestamo[]
  pagos: PagoPrestamo[]
  totalPagadoAprobado: number
  totalPendienteRevision: number
  totalRechazado: number
  saldoCalculado: number
  proximaCuota: CuotaPrestamo | null
  cuotasPagadas: number
  cuotasPendientes: number
  cuotasVencidas: number
}

export async function obtenerClientePorUsuario(usuarioId: string) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, direccion, dni, usuario_id')
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  if (error) throw error
  return data
}

function normalizarEstado(estado?: string | null) {
  return String(estado || '').toLowerCase()
}

async function construirDetallePrestamo(prestamoData: PrestamoBase): Promise<PrestamoDetalle> {
  const [cuotasRes, pagosRes] = await Promise.all([
    supabase
      .from('cuotas')
      .select('id, prestamo_id, cliente_id, numero_cuota, fecha_vencimiento, monto_cuota, saldo_pendiente, estado')
      .eq('prestamo_id', prestamoData.id)
      .order('numero_cuota', { ascending: true }),
    supabase
      .from('pagos')
      .select('id, prestamo_id, cliente_id, monto, metodo, estado, estado_validacion, impactado, comprobante_url, fecha_pago, created_at')
      .eq('prestamo_id', prestamoData.id)
      .order('created_at', { ascending: false }),
  ])

  if (cuotasRes.error) throw cuotasRes.error
  if (pagosRes.error) throw pagosRes.error

  const cuotas = (cuotasRes.data || []) as CuotaPrestamo[]
  const pagos = (pagosRes.data || []) as PagoPrestamo[]

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  let cuotasPagadas = 0
  let cuotasPendientes = 0
  let cuotasVencidas = 0

  for (const cuota of cuotas) {
    const estado = normalizarEstado(cuota.estado)
    if (estado === 'pagada') {
      cuotasPagadas += 1
      continue
    }

    cuotasPendientes += 1

    if (cuota.fecha_vencimiento) {
      const venc = new Date(`${cuota.fecha_vencimiento}T00:00:00`)
      venc.setHours(0, 0, 0, 0)
      if (venc.getTime() < hoy.getTime()) cuotasVencidas += 1
    }
  }

  const totalPagadoAprobado = pagos
    .filter((p) => normalizarEstado(p.estado) === 'aprobado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0)

  const totalPendienteRevision = pagos
    .filter((p) => ['pendiente', 'pendiente_aprobacion', 'en_revision'].includes(normalizarEstado(p.estado)))
    .reduce((acc, p) => acc + Number(p.monto || 0), 0)

  const totalRechazado = pagos
    .filter((p) => normalizarEstado(p.estado) === 'rechazado')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0)

  const saldoCuotas = cuotas.reduce((acc, c) => acc + Number(c.saldo_pendiente || 0), 0)
  const saldoDesdePrestamo = Number(prestamoData.saldo_pendiente || 0)
  const saldoCalculado = saldoCuotas > 0 ? saldoCuotas : saldoDesdePrestamo

  const proximaCuota = cuotas.find((cuota) => {
    const estado = normalizarEstado(cuota.estado)
    return estado === 'pendiente' || estado === 'parcial' || estado === 'vencida'
  }) || null

  return {
    prestamo: prestamoData,
    cuotas,
    pagos,
    totalPagadoAprobado,
    totalPendienteRevision,
    totalRechazado,
    saldoCalculado,
    proximaCuota,
    cuotasPagadas,
    cuotasPendientes,
    cuotasVencidas,
  }
}

export async function obtenerPrestamoActivoConDetalle(clienteId: string): Promise<PrestamoDetalle | null> {
  const { data: prestamoData, error: prestamoError } = await supabase
    .from('prestamos')
    .select(`
      id,
      cliente_id,
      monto,
      interes,
      total_a_pagar,
      fecha_inicio,
      fecha_limite,
      fecha_inicio_mora,
      estado,
      modalidad,
      cuotas,
      dias_plazo,
      saldo_pendiente
    `)
    .eq('cliente_id', clienteId)
    .in('estado', ['activo', 'pendiente', 'en_mora'])
    .order('fecha_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (prestamoError) throw prestamoError
  if (!prestamoData) return null

  return construirDetallePrestamo(prestamoData as PrestamoBase)
}

export async function obtenerPrestamoConDetallePorId(prestamoId: string): Promise<PrestamoDetalle | null> {
  const { data: prestamoData, error: prestamoError } = await supabase
    .from('prestamos')
    .select(`
      id,
      cliente_id,
      monto,
      interes,
      total_a_pagar,
      fecha_inicio,
      fecha_limite,
      fecha_inicio_mora,
      estado,
      modalidad,
      cuotas,
      dias_plazo,
      saldo_pendiente
    `)
    .eq('id', prestamoId)
    .maybeSingle()

  if (prestamoError) throw prestamoError
  if (!prestamoData) return null

  return construirDetallePrestamo(prestamoData as PrestamoBase)
}
