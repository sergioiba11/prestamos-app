import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function extraerTokenBearer(authHeader: string | null) {
  if (!authHeader) return null
  const limpio = authHeader.trim()
  if (!limpio) return null
  if (limpio.toLowerCase().startsWith('bearer ')) {
    return limpio.slice(7).trim()
  }
  return limpio
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase' }, 500)
    }

    const token = extraerTokenBearer(req.headers.get('Authorization'))

    if (!token) {
      return jsonResponse({ error: 'Authorization header requerido' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido o usuario no autenticado' }, 401)
    }

    const { data: usuarioRol, error: rolError } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', user.id)
      .maybeSingle()

    if (rolError) {
      return jsonResponse({ error: rolError.message }, 500)
    }

    if (!usuarioRol || !['admin', 'empleado'].includes(String(usuarioRol.rol || '').toLowerCase())) {
      return jsonResponse({ error: 'No autorizado para aprobar/rechazar pagos' }, 403)
    }

    const body = await req.json()
    const pagoId = String(body?.pago_id || '').trim()
    const accion = String(body?.accion || '').trim().toLowerCase()

    if (!pagoId || !['aprobar', 'rechazar'].includes(accion)) {
      return jsonResponse({ error: 'Input inválido. Requerido: pago_id y accion (aprobar|rechazar)' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, prestamo_id, cliente_id, monto, metodo, estado, registrado_por')
      .eq('id', pagoId)
      .maybeSingle()

    if (pagoError) {
      return jsonResponse({ error: pagoError.message }, 500)
    }

    if (!pago) {
      return jsonResponse({ error: 'Pago no encontrado' }, 404)
    }

    if (pago.estado !== 'pendiente') {
      return jsonResponse({ error: `El pago ya fue procesado con estado ${pago.estado}` }, 400)
    }

    if (accion === 'rechazar') {
      const { error: rechazarError } = await supabase
        .from('pagos')
        .update({
          estado: 'rechazado',
          aprobado_por: user.id,
        })
        .eq('id', pago.id)

      if (rechazarError) {
        return jsonResponse({ error: rechazarError.message }, 500)
      }

      await supabase.from('pagos_logs').insert({
        pago_id: pago.id,
        accion: 'rechazar',
        actor_id: user.id,
        detalle: { metodo: pago.metodo, estado_anterior: pago.estado },
      })

      return jsonResponse({ ok: true, estado: 'rechazado', pago_id: pago.id })
    }

    let restante = redondear(Number(pago.monto || 0))
    if (restante <= 0) {
      return jsonResponse({ error: 'Monto del pago inválido' }, 400)
    }

    const { data: cuotasPendientes, error: cuotasError } = await supabase
      .from('cuotas')
      .select('id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado')
      .eq('prestamo_id', pago.prestamo_id)
      .eq('cliente_id', pago.cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasError) {
      return jsonResponse({ error: cuotasError.message }, 500)
    }

    if (!cuotasPendientes || cuotasPendientes.length === 0) {
      return jsonResponse({ error: 'El préstamo no tiene cuotas pendientes para aplicar el pago' }, 400)
    }

    const detalleAplicacion: Array<{
      cuota_id: string
      numero_cuota: number
      monto_aplicado: number
      saldo_cuota_antes: number
      saldo_cuota_despues: number
      estado_resultante: string
    }> = []

    for (const cuota of cuotasPendientes) {
      if (restante <= 0) break

      const saldoAnterior = redondear(Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0))
      const pagadoAnterior = redondear(Number(cuota.monto_pagado ?? 0))

      if (saldoAnterior <= 0) continue

      const montoAplicado = redondear(Math.min(restante, saldoAnterior))
      if (montoAplicado <= 0) continue

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

      if (cuotaUpdateError) {
        return jsonResponse({ error: cuotaUpdateError.message }, 500)
      }

      detalleAplicacion.push({
        cuota_id: String(cuota.id),
        numero_cuota: Number(cuota.numero_cuota),
        monto_aplicado: montoAplicado,
        saldo_cuota_antes: saldoAnterior,
        saldo_cuota_despues: saldoPersistido,
        estado_resultante: nuevoEstado,
      })

      restante = redondear(restante - montoAplicado)

      if (!esMontoCerrado(saldoPersistido)) {
        restante = 0
        break
      }
    }

    const totalAplicado = redondear(
      detalleAplicacion.reduce((acc, item) => acc + Number(item.monto_aplicado || 0), 0)
    )

    if (totalAplicado <= 0) {
      return jsonResponse({ error: 'No se pudo aplicar el pago a ninguna cuota' }, 400)
    }

    const { error: aprobarError } = await supabase
      .from('pagos')
      .update({
        estado: 'aprobado',
        aprobado_por: user.id,
        fecha_pago: new Date().toISOString(),
      })
      .eq('id', pago.id)

    if (aprobarError) {
      return jsonResponse({ error: aprobarError.message }, 500)
    }

    const detalleRows = detalleAplicacion.map((item) => ({
      pago_id: pago.id,
      cuota_id: item.cuota_id,
      prestamo_id: pago.prestamo_id,
      cliente_id: pago.cliente_id,
      numero_cuota: item.numero_cuota,
      monto_aplicado: item.monto_aplicado,
      saldo_cuota_antes: item.saldo_cuota_antes,
      saldo_cuota_despues: item.saldo_cuota_despues,
    }))

    if (detalleRows.length > 0) {
      const { error: detalleError } = await supabase.from('pagos_detalle').insert(detalleRows)
      if (detalleError) {
        return jsonResponse({ error: detalleError.message }, 500)
      }
    }

    const { data: cuotasRestantes, error: cuotasRestantesError } = await supabase
      .from('cuotas')
      .select('saldo_pendiente, estado')
      .eq('prestamo_id', pago.prestamo_id)
      .eq('cliente_id', pago.cliente_id)
      .in('estado', ['pendiente', 'parcial'])

    if (cuotasRestantesError) {
      return jsonResponse({ error: cuotasRestantesError.message }, 500)
    }

    const saldoRestante = redondear(
      (cuotasRestantes || []).reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0)
    )
    const nuevoEstadoPrestamo = saldoRestante <= 0 ? 'pagado' : 'activo'

    const { error: updatePrestamoError } = await supabase
      .from('prestamos')
      .update({ estado: nuevoEstadoPrestamo })
      .eq('id', pago.prestamo_id)

    if (updatePrestamoError) {
      return jsonResponse({ error: updatePrestamoError.message }, 500)
    }

    await supabase.from('pagos_logs').insert({
      pago_id: pago.id,
      accion: 'aprobar',
      actor_id: user.id,
      detalle: {
        metodo: pago.metodo,
        total_aplicado: totalAplicado,
        cuotas_impactadas: detalleAplicacion.map((item) => item.numero_cuota),
      },
    })

    return jsonResponse({
      ok: true,
      estado: 'aprobado',
      pago_id: pago.id,
      cuotas_impactadas: detalleAplicacion.map((item) => item.numero_cuota),
      total_aplicado: totalAplicado,
      saldo_restante: saldoRestante,
      prestamo_estado: nuevoEstadoPrestamo,
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error interno' },
      500
    )
  }
})
