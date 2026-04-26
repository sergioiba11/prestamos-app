import { supabase } from './supabase'

type AprobarAccion = 'aprobar' | 'rechazar'

type AprobarPagoInput = {
  pago_id: string
  accion: AprobarAccion
  observacion_revision?: string | null
}

type AprobarPagoOutput = {
  ok?: boolean
  pago_id?: string
  redirect_to?: string
  error?: string
}

export async function invocarAprobarPago(input: AprobarPagoInput) {
  const { data, error } = await supabase.functions.invoke<AprobarPagoOutput>('aprobar-pago', {
    body: input,
  })

  if (error) {
    throw new Error(error.message || 'No se pudo procesar el pago')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data || {}
}

export function buildAprobacionRedirect(data: AprobarPagoOutput, fallbackPagoId: string) {
  if (data.redirect_to && String(data.redirect_to).trim()) {
    return String(data.redirect_to)
  }
  return `/pago-aprobado?id=${encodeURIComponent(String(data.pago_id || fallbackPagoId))}`
}
