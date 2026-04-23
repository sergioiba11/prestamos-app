export type PagoComprobanteCandidate = {
  id: string
  estado?: string | null
  estado_validacion?: string | null
  impactado?: boolean | null
  comprobante_url?: string | null
  created_at?: string | null
  fecha_pago?: string | null
}

const PENDING_VALIDATION_STATES = new Set(['pendiente', 'pendiente_aprobacion', 'en_revision'])
const APPROVED_VALIDATION_STATES = new Set(['aprobado', 'confirmado', 'acreditado', 'pagado'])
const REJECTED_STATES = new Set(['rechazado', 'denegado', 'cancelado'])

function low(value?: string | null): string {
  return String(value || '').trim().toLowerCase()
}

export function isPendingValidationPayment(pago: Pick<PagoComprobanteCandidate, 'estado' | 'estado_validacion'>): boolean {
  const estado = low(pago.estado)
  if (estado) return PENDING_VALIDATION_STATES.has(estado)
  return PENDING_VALIDATION_STATES.has(low(pago.estado_validacion))
}

export function isRejectedPayment(pago: Pick<PagoComprobanteCandidate, 'estado' | 'estado_validacion'>): boolean {
  const estado = low(pago.estado)
  if (estado) return REJECTED_STATES.has(estado)
  return REJECTED_STATES.has(low(pago.estado_validacion))
}

export function isApprovedPaymentForReceipt(pago: Pick<PagoComprobanteCandidate, 'estado' | 'estado_validacion' | 'impactado'>): boolean {
  const estado = low(pago.estado)
  const estadoValidacion = low(pago.estado_validacion)
  const approved = estado ? estado === 'aprobado' : APPROVED_VALIDATION_STATES.has(estadoValidacion)
  return approved && Boolean(pago.impactado)
}

export function hasValidReceipt(pago: PagoComprobanteCandidate): boolean {
  if (!pago.id) return false
  if (!isApprovedPaymentForReceipt(pago)) return false
  if (isPendingValidationPayment(pago)) return false
  if (isRejectedPayment(pago)) return false
  if (!String(pago.comprobante_url || '').trim()) return false
  return true
}

function getPaymentTimestamp(pago: Pick<PagoComprobanteCandidate, 'fecha_pago' | 'created_at'>): number {
  const dateRaw = pago.fecha_pago || pago.created_at || ''
  const value = new Date(dateRaw).getTime()
  return Number.isFinite(value) ? value : 0
}

export function getLatestValidReceiptPayment<T extends PagoComprobanteCandidate>(pagos: T[]): T | null {
  const valid = pagos.filter(hasValidReceipt)
  if (valid.length === 0) return null
  return valid.sort((a, b) => getPaymentTimestamp(b) - getPaymentTimestamp(a))[0] || null
}
