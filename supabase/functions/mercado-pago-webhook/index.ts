import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function redondear(valor: number) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

function esMontoCerrado(valor: number) {
  return Math.abs(Number(valor || 0)) <= 0.009
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_TOKEN')
    const token = req.headers.get('x-webhook-token')

    if (secret && token !== secret) {
      return jsonResponse({ error: 'Webhook no autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json()
    const preferenceId = String(body?.mp_preference_id || body?.data?.id || '').trim()

    if (!preferenceId) {
      return jsonResponse({ error: 'Falta mp_preference_id' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, prestamo_id, cliente_id, monto, estado')
      .eq('mp_preference_id', preferenceId)
      .eq('metodo', 'mercado_pago')
      .maybeSingle()

    if (pagoError) return jsonResponse({ error: pagoError.message }, 500)
    if (!pago) return jsonResponse({ error: 'Pago no encontrado para esa preferencia' }, 404)
    if (pago.estado !== 'pendiente') return jsonResponse({ ok: true, estado: pago.estado, pago_id: pago.id })

    let restante = redondear(Number(pago.monto || 0))

    const { data: cuotasPendientes, error: cuotasError } = await supabase
      .from('cuotas')
      .select('id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado')
      .eq('prestamo_id', pago.prestamo_id)
      .eq('cliente_id', pago.cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasError) return jsonResponse({ error: cuotasError.message }, 500)

    const detalleAplicacion: Array<any> = []

    for (const cuota of cuotasPendientes || []) {
      if (restante <= 0) break

      const saldoAnterior = redondear(Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0))
      const pagadoAnterior = redondear(Number(cuota.monto_pagado ?? 0))
      if (saldoAnterior <= 0) continue

      const montoAplicado = redondear(Math.min(restante, saldoAnterior))
      const nuevoSaldo = redondear(saldoAnterior - montoAplicado)
      const nuevoMontoPagado = redondear(pagadoAnterior + montoAplicado)
      const nuevoEstado = esMontoCerrado(nuevoSaldo) ? 'pagada' : 'parcial'
      const saldoPersistido = esMontoCerrado(nuevoSaldo) ? 0 : nuevoSaldo

      const { error: cuotaUpdateError } = await supabase
        .from('cuotas')
        .update({
          monto_pagado: nuevoMontoPagado,
          saldo_pendiente: saldoPersistido,
          estado: nuevoEstado,
          fecha_pago: new Date().toISOString(),
        })
        .eq('id', cuota.id)

      if (cuotaUpdateError) return jsonResponse({ error: cuotaUpdateError.message }, 500)

      detalleAplicacion.push({
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        monto_aplicado: montoAplicado,
        saldo_cuota_antes: saldoAnterior,
        saldo_cuota_despues: saldoPersistido,
      })

      restante = redondear(restante - montoAplicado)
      if (!esMontoCerrado(saldoPersistido)) break
    }

    const { error: pagoUpdateError } = await supabase
      .from('pagos')
      .update({ estado: 'aprobado', fecha_pago: new Date().toISOString() })
      .eq('id', pago.id)

    if (pagoUpdateError) return jsonResponse({ error: pagoUpdateError.message }, 500)

    if (detalleAplicacion.length > 0) {
      const { error: detalleError } = await supabase.from('pagos_detalle').insert(
        detalleAplicacion.map((item) => ({
          pago_id: pago.id,
          cuota_id: item.cuota_id,
          prestamo_id: pago.prestamo_id,
          cliente_id: pago.cliente_id,
          numero_cuota: item.numero_cuota,
          monto_aplicado: item.monto_aplicado,
          saldo_cuota_antes: item.saldo_cuota_antes,
          saldo_cuota_despues: item.saldo_cuota_despues,
        }))
      )
      if (detalleError) return jsonResponse({ error: detalleError.message }, 500)
    }

    await supabase.from('pagos_logs').insert({
      pago_id: pago.id,
      accion: 'webhook_mp_aprobado',
      detalle: { mp_preference_id: preferenceId, cuotas_impactadas: detalleAplicacion.map((i) => i.numero_cuota) },
    })

    const { data: cuotasRestantes } = await supabase
      .from('cuotas')
      .select('saldo_pendiente, estado')
      .eq('prestamo_id', pago.prestamo_id)
      .eq('cliente_id', pago.cliente_id)
      .in('estado', ['pendiente', 'parcial'])

    const saldoRestante = redondear((cuotasRestantes || []).reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0))

    await supabase
      .from('prestamos')
      .update({ estado: saldoRestante <= 0 ? 'pagado' : 'activo' })
      .eq('id', pago.prestamo_id)

    return jsonResponse({ ok: true, pago_id: pago.id, estado: 'aprobado', saldo_restante: saldoRestante })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
