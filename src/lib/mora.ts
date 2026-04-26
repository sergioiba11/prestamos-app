export type ReglaMora = {
  tramo: string
  dias_desde: number
  dias_hasta: number | null
  porcentaje_diario: number
  activo?: boolean
}

export const REGLAS_MORA_DEFAULT: ReglaMora[] = [
  { tramo: 'gracia', dias_desde: 1, dias_hasta: 3, porcentaje_diario: 0, activo: true },
  { tramo: 'mora_normal', dias_desde: 4, dias_hasta: 10, porcentaje_diario: 1, activo: true },
  { tramo: 'mora_alta', dias_desde: 11, dias_hasta: null, porcentaje_diario: 2, activo: true },
]

const MS_POR_DIA = 24 * 60 * 60 * 1000

function inicioDelDia(fecha: Date) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
}

function parsearFechaLocal(fecha?: string | null) {
  if (!fecha) return null
  const [yyyy, mm, dd] = fecha.slice(0, 10).split('-').map((p) => Number(p))
  if (!yyyy || !mm || !dd) return null
  return new Date(yyyy, mm - 1, dd)
}

function normalizarReglas(reglas?: ReglaMora[]) {
  const base = (reglas && reglas.length ? reglas : REGLAS_MORA_DEFAULT)
    .filter((r) => r && r.activo !== false)
    .map((r) => ({
      ...r,
      dias_desde: Number(r.dias_desde || 0),
      dias_hasta: r.dias_hasta === null || r.dias_hasta === undefined ? null : Number(r.dias_hasta),
      porcentaje_diario: Number(r.porcentaje_diario || 0),
    }))
    .filter((r) => Number.isFinite(r.dias_desde) && r.dias_desde > 0 && Number.isFinite(r.porcentaje_diario))

  if (!base.length) return REGLAS_MORA_DEFAULT

  return base.sort((a, b) => a.dias_desde - b.dias_desde)
}

export function calcularMoraCuota({
  saldoPendiente,
  fechaVencimiento,
  hoy,
  reglasMora,
}: {
  saldoPendiente: number
  fechaVencimiento?: string | null
  hoy?: Date
  reglasMora?: ReglaMora[]
}) {
  const saldo = Number(saldoPendiente || 0)
  if (!Number.isFinite(saldo) || saldo <= 0) {
    return { diasAtraso: 0, porcentajeTotalMora: 0, montoMora: 0, totalConMora: Math.max(0, saldo) }
  }

  const vencimiento = parsearFechaLocal(fechaVencimiento)
  if (!vencimiento) {
    return { diasAtraso: 0, porcentajeTotalMora: 0, montoMora: 0, totalConMora: saldo }
  }

  const fechaHoy = inicioDelDia(hoy || new Date())
  const fechaVto = inicioDelDia(vencimiento)
  const diff = Math.floor((fechaHoy.getTime() - fechaVto.getTime()) / MS_POR_DIA)
  const diasAtraso = Math.max(0, diff)

  if (diasAtraso <= 0) {
    return { diasAtraso: 0, porcentajeTotalMora: 0, montoMora: 0, totalConMora: saldo }
  }

  let porcentajeTotalMora = 0
  const reglas = normalizarReglas(reglasMora)

  for (const regla of reglas) {
    const desde = Math.max(1, Number(regla.dias_desde || 0))
    const hasta = regla.dias_hasta == null ? diasAtraso : Math.min(diasAtraso, Number(regla.dias_hasta || 0))
    if (hasta < desde) continue
    const diasEnTramo = hasta - desde + 1
    if (diasEnTramo <= 0) continue
    porcentajeTotalMora += diasEnTramo * Number(regla.porcentaje_diario || 0)
  }

  const porcentajeRedondeado = Number(porcentajeTotalMora.toFixed(4))
  const montoMora = Number(((saldo * porcentajeRedondeado) / 100).toFixed(2))
  const totalConMora = Number((saldo + montoMora).toFixed(2))

  return {
    diasAtraso,
    porcentajeTotalMora: porcentajeRedondeado,
    montoMora,
    totalConMora,
  }
}
