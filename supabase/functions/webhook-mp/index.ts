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

async function aplicarPagoPendiente(supabase: any, pago: any, source: Record<string, unknown>) {
  let restante = redondear(Number(pago.monto || 0))

  const { data: cuotasPendientes, error: cuotasError } = await supabase
    .from('cuotas')
    .select('id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado')
    .eq('prestamo_id', pago.prestamo_id)
    .eq('cliente_id', pago.cliente_id)
    .in('estado', ['pendiente', 'parcial'])
    .order('numero_cuota', { ascending: true })

  if (cuotasError) return { error: cuotasError.message }

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

    if (cuotaUpdateError) return { error: cuotaUpdateError.message }

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

  if (pagoUpdateError) return { error: pagoUpdateError.message }

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
    if (detalleError) return { error: detalleError.message }
  }

  await supabase.from('pagos_logs').insert({
    pago_id: pago.id,
    accion: 'webhook_mp_aprobado',
    detalle: { ...source, cuotas_impactadas: detalleAplicacion.map((i) => i.numero_cuota) },
  })

  const { data: cuotasRestantes } = await supabase
    .from('cuotas')
    .select('saldo_pendiente, estado')
    .eq('prestamo_id', pago.prestamo_id)
    .eq('cliente_id', pago.cliente_id)
    .in('estado', ['pendiente', 'parcial'])

  const saldoRestante = redondear(
    (cuotasRestantes || []).reduce((acc: number, item: any) => acc + Number(item.saldo_pendiente || 0), 0)
  )

  await supabase
    .from('prestamos')
    .update({ estado: saldoRestante <= 0 ? 'pagado' : 'activo' })
    .eq('id', pago.prestamo_id)

  return { ok: true, saldo_restante: saldoRestante, detalle_aplicacion: detalleAplicacion }
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
    const fallbackMpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase' }, 500)
    }


    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}))

    const paymentIdRaw =
      body?.data?.id || body?.id || body?.resource?.split('/').pop() || url.searchParams.get('data.id')
    const paymentId = String(paymentIdRaw || '').trim()
    const preferenceIdFromBody = String(
      body?.mp_preference_id || url.searchParams.get('mp_preference_id') || ''
    ).trim()

    let paymentStatus = ''
    let preferenceId = preferenceIdFromBody
    let externalReference = ''


    let mpAccessToken = String(fallbackMpAccessToken || '').trim()

    if (!mpAccessToken && preferenceIdFromBody) {
      const { data: pagoConPreferencia } = await supabase
        .from('pagos')
        .select('registrado_por')
        .eq('metodo', 'mercado_pago')
        .eq('mp_preference_id', preferenceIdFromBody)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const registradoPor = String(pagoConPreferencia?.registrado_por || '').trim()

      if (registradoPor) {
        const { data: adminSettings } = await supabase
          .from('admin_settings')
          .select('mp_access_token')
          .eq('user_id', registradoPor)
          .maybeSingle()

        const tokenAdmin = String(adminSettings?.mp_access_token || '').trim()
        if (tokenAdmin) {
          mpAccessToken = tokenAdmin
        }
      }
    }

    if (paymentId) {
      if (!mpAccessToken) {
        return jsonResponse({ error: 'No hay access_token de Mercado Pago configurado para validar el pago' }, 500)
      }
      const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const paymentJson = await paymentRes.json().catch(() => ({}))

      if (!paymentRes.ok) {
        return jsonResponse({ error: 'No se pudo consultar pago en Mercado Pago', detalle: paymentJson }, 502)
      }

      paymentStatus = String(paymentJson?.status || '').toLowerCase()
      preferenceId = String(
        preferenceId ||
          paymentJson?.metadata?.mp_preference_id ||
          paymentJson?.metadata?.preference_id ||
          paymentJson?.order?.id ||
          ''
      ).trim()
      externalReference = String(paymentJson?.external_reference || '').trim()

      if (paymentStatus !== 'approved') {
        return jsonResponse({ ok: true, estado_mp: paymentStatus || 'desconocido', aprobado: false })
      }
    }

    let pagoQuery = supabase
      .from('pagos')
      .select('id, prestamo_id, cliente_id, monto, estado, mp_preference_id, registrado_por')
      .eq('metodo', 'mercado_pago')
      .eq('estado', 'pendiente')

    if (preferenceId) {
      pagoQuery = pagoQuery.eq('mp_preference_id', preferenceId)
    }

    const { data: pagos, error: pagoError } = await pagoQuery.order('created_at', { ascending: false }).limit(1)

    if (pagoError) return jsonResponse({ error: pagoError.message }, 500)

    let pago = pagos?.[0]

    if (!pago && externalReference) {
      const matchPrestamo = externalReference.match(/prestamo:([^|]+)/)?.[1] || null
      const matchCliente = externalReference.match(/cliente:([^|]+)/)?.[1] || null
      const matchMonto = Number(externalReference.match(/monto:([^|]+)/)?.[1] || 0)

      const { data: porReferencia, error: refError } = await supabase
        .from('pagos')
        .select('id, prestamo_id, cliente_id, monto, estado, mp_preference_id, registrado_por')
        .eq('metodo', 'mercado_pago')
        .eq('estado', 'pendiente')
        .eq('prestamo_id', matchPrestamo)
        .eq('cliente_id', matchCliente)
        .eq('monto', Number(matchMonto.toFixed(2)))
        .order('created_at', { ascending: false })
        .limit(1)

      if (refError) return jsonResponse({ error: refError.message }, 500)
      pago = porReferencia?.[0]
    }

    if (!pago) {
      return jsonResponse({ error: 'Pago pendiente de Mercado Pago no encontrado' }, 404)
    }

    const aplicado = await aplicarPagoPendiente(supabase, pago, {
      payment_id: paymentId || null,
      mp_preference_id: preferenceId || pago.mp_preference_id || null,
      external_reference: externalReference || null,
    })

    if ((aplicado as any).error) {
      return jsonResponse({ error: (aplicado as any).error }, 500)
    }

    return jsonResponse({
      ok: true,
      aprobado: true,
      pago_id: pago.id,
      estado: 'aprobado',
      saldo_restante: (aplicado as any).saldo_restante,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
