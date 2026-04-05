export type ModalidadPrestamo = 'mensual' | 'diario'

export type CuotaProgramada = {
  numero_cuota: number
  monto_cuota: number
  saldo_pendiente: number
  fecha_vencimiento: string
  estado: 'pendiente'
}

function redondear(valor: number) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

function diasEnMes(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function formatearFechaISO(fecha: Date) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calcularFechaCuotaMensual(
  fechaInicioTexto: string,
  numeroCuota: number,
  diaPagoMensual?: number | null
) {
  const fechaInicio = new Date(`${fechaInicioTexto}T00:00:00`)
  const fecha = new Date(fechaInicio)
  fecha.setMonth(fecha.getMonth() + numeroCuota)

  const diaBase = Number(diaPagoMensual || 0) > 0
    ? Number(diaPagoMensual)
    : fechaInicio.getDate()

  const ultimoDia = diasEnMes(fecha.getFullYear(), fecha.getMonth())
  fecha.setDate(Math.min(diaBase, ultimoDia))

  return formatearFechaISO(fecha)
}

export function construirCronogramaCuotas(params: {
  modalidad: ModalidadPrestamo
  fechaInicio: string
  totalAPagar: number
  cuotas?: number | null
  diasPlazo?: number | null
  diaPagoMensual?: number | null
}) {
  const {
    modalidad,
    fechaInicio,
    totalAPagar,
    cuotas,
    diasPlazo,
    diaPagoMensual,
  } = params

  const cantidad = modalidad === 'mensual'
    ? Number(cuotas || 0)
    : Number(diasPlazo || 0)

  if (!fechaInicio || !totalAPagar || cantidad <= 0) return [] as CuotaProgramada[]

  const montoBase = redondear(totalAPagar / cantidad)
  let acumulado = 0
  const cronograma: CuotaProgramada[] = []

  for (let i = 1; i <= cantidad; i += 1) {
    const esUltima = i === cantidad
    const monto = esUltima
      ? redondear(totalAPagar - acumulado)
      : montoBase

    acumulado = redondear(acumulado + monto)

    let fechaVencimiento = ''

    if (modalidad === 'mensual') {
      fechaVencimiento = calcularFechaCuotaMensual(
        fechaInicio,
        i,
        diaPagoMensual,
      )
    } else {
      const fecha = new Date(`${fechaInicio}T00:00:00`)
      fecha.setDate(fecha.getDate() + i)
      fechaVencimiento = formatearFechaISO(fecha)
    }

    cronograma.push({
      numero_cuota: i,
      monto_cuota: monto,
      saldo_pendiente: monto,
      fecha_vencimiento: fechaVencimiento,
      estado: 'pendiente',
    })
  }

  return cronograma
}

export function obtenerSiguienteVencimiento(cronograma: CuotaProgramada[]) {
  return cronograma.find((cuota) => cuota.saldo_pendiente > 0) || null
}

export function calcularResumenCuotas<T extends {
  monto_cuota?: number | null
  monto_pagado?: number | null
  saldo_pendiente?: number | null
  estado?: string | null
}>(cuotas: T[]) {
  const total = cuotas.length
  const pagadas = cuotas.filter((c) => Number(c.saldo_pendiente || 0) <= 0 || c.estado === 'pagada').length
  const pendientes = total - pagadas
  const totalPagado = redondear(cuotas.reduce((acc, item) => acc + Number(item.monto_pagado || 0), 0))
  const totalPendiente = redondear(cuotas.reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0))

  return {
    total,
    pagadas,
    pendientes,
    totalPagado,
    totalPendiente,
  }
}