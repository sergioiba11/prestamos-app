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

function normalizarMetodoPago(metodo: unknown) {
  const valor = String(metodo || '').trim().toLowerCase()

  if (valor === 'mp' || valor === 'mercado_pago' || valor === 'mercado-pago') {
    return 'mercadopago'
  }

  if (
    valor === 'efectivo' ||
    valor === 'transferencia' ||
    valor === 'mercadopago'
  ) {
    return valor
  }

  return ''
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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          error: 'Faltan variables de entorno en la función',
          detalle: {
            hasUrl: Boolean(supabaseUrl),
            hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
          },
        },
        500
      )
    }

    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization')

    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse(
        {
          error: 'Authorization header inválido',
          detalle: 'Debe venir como: Bearer TOKEN',
        },
        401
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse(
        {
          error: 'Token inválido o usuario no autenticado',
          detalle: userError?.message || null,
        },
        401
      )
    }

    const body = await req.json()

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const cuota_id_inicial = body?.cuota_id || null
    const numero_cuota_inicial = body?.numero_cuota || null
    const metodo = normalizarMetodoPago(body?.metodo)
    const montoIngresado = redondear(
      Number(body?.monto_ingresado ?? body?.monto)
    )
    const aplicarAMultiples = body?.aplicar_a_multiples !== false

    if (!prestamo_id || !cliente_id || !metodo) {
      return jsonResponse(
        {
          error: 'Faltan datos obligatorios: prestamo_id, cliente_id, metodo',
        },
        400
      )
    }

    if (Number.isNaN(montoIngresado) || montoIngresado <= 0) {
      return jsonResponse({ error: 'Monto inválido' }, 400)
    }

    const { data: prestamo, error: prestamoError } = await supabase
      .from('prestamos')
      .select('id, cliente_id, estado')
      .eq('id', prestamo_id)
      .single()

    if (prestamoError || !prestamo) {
      return jsonResponse({ error: 'Préstamo no encontrado' }, 404)
    }

    if (prestamo.cliente_id !== cliente_id) {
      return jsonResponse(
        { error: 'El préstamo no pertenece al cliente enviado' },
        400
      )
    }

    const { data: cuotasPendientes, error: cuotasError } = await supabase
      .from('cuotas')
      .select(`
        id,
        prestamo_id,
        cliente_id,
        numero_cuota,
        monto_cuota,
        monto_pagado,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasError) {
      return jsonResponse({ error: cuotasError.message }, 500)
    }

    if (!cuotasPendientes || cuotasPendientes.length === 0) {
      return jsonResponse(
        { error: 'El préstamo no tiene cuotas pendientes' },
        400
      )
    }

    let cuotasAProcesar = cuotasPendientes

    if (cuota_id_inicial) {
      const index = cuotasPendientes.findIndex((c) => c.id === cuota_id_inicial)

      if (index === -1) {
        return jsonResponse(
          {
            error:
              'La cuota seleccionada no pertenece a ese préstamo o no está pendiente',
          },
          404
        )
      }

      if (
        numero_cuota_inicial &&
        Number(numero_cuota_inicial) !==
          Number(cuotasPendientes[index].numero_cuota)
      ) {
        return jsonResponse(
          {
            error: 'El número de cuota no coincide con la cuota seleccionada',
          },
          400
        )
      }

      cuotasAProcesar = cuotasPendientes.slice(index)
    }

    let restante = montoIngresado
    const cuotasImpactadas: number[] = []
    const detalleAplicacion: Array<{
      cuota_id: string
      numero_cuota: number
      monto_aplicado: number
      saldo_cuota_antes: number
      saldo_cuota_despues: number
      estado_resultante: string
    }> = []

    for (const cuota of cuotasAProcesar) {
      if (restante <= 0) break

      const saldoAnterior = redondear(
        Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0)
      )
      const pagadoAnterior = redondear(Number(cuota.monto_pagado ?? 0))

      if (saldoAnterior <= 0) continue

      const montoAplicado = redondear(
        aplicarAMultiples
          ? Math.min(restante, saldoAnterior)
          : Math.min(montoIngresado, saldoAnterior)
      )

      if (montoAplicado <= 0) continue

      const nuevoSaldo = redondear(saldoAnterior - montoAplicado)
      const nuevoMontoPagado = redondear(pagadoAnterior + montoAplicado)
      const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'parcial'

      const { error: updateCuotaError } = await supabase
        .from('cuotas')
        .update({
          monto_pagado: nuevoMontoPagado,
          saldo_pendiente: nuevoSaldo,
          estado: nuevoEstado,
          fecha_pago: new Date().toISOString(),
        })
        .eq('id', cuota.id)

      if (updateCuotaError) {
        return jsonResponse({ error: updateCuotaError.message }, 500)
      }

      cuotasImpactadas.push(Number(cuota.numero_cuota))
      detalleAplicacion.push({
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        monto_aplicado: montoAplicado,
        saldo_cuota_antes: saldoAnterior,
        saldo_cuota_despues: nuevoSaldo,
        estado_resultante: nuevoEstado,
      })

      restante = aplicarAMultiples ? redondear(restante - montoAplicado) : 0
    }

    const totalAplicado = redondear(
      detalleAplicacion.reduce(
        (acc, item) => acc + Number(item.monto_aplicado || 0),
        0
      )
    )

    if (totalAplicado <= 0) {
      return jsonResponse(
        { error: 'No se pudo aplicar el pago a ninguna cuota' },
        400
      )
    }

    const vuelto = redondear(montoIngresado - totalAplicado)

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto: totalAplicado,
        metodo,
        registrado_por: user.id,
      })
      .select()
      .single()

    if (pagoError || !pago) {
      return jsonResponse(
        { error: pagoError?.message || 'No se pudo crear el pago' },
        500
      )
    }

    const detalleRows = detalleAplicacion.map((item) => ({
      pago_id: pago.id,
      cuota_id: item.cuota_id,
      prestamo_id,
      cliente_id,
      numero_cuota: item.numero_cuota,
      monto_aplicado: item.monto_aplicado,
      saldo_cuota_antes: item.saldo_cuota_antes,
      saldo_cuota_despues: item.saldo_cuota_despues,
    }))

    const { error: detalleError } = await supabase
      .from('pagos_detalle')
      .insert(detalleRows)

    if (detalleError) {
      return jsonResponse({ error: detalleError.message }, 500)
    }

    const { data: cuotasRestantes, error: cuotasRestantesError } = await supabase
      .from('cuotas')
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        monto_pagado,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasRestantesError) {
      return jsonResponse({ error: cuotasRestantesError.message }, 500)
    }

    const saldoRestante = redondear(
      (cuotasRestantes || []).reduce(
        (acc, item) => acc + Number(item.saldo_pendiente || 0),
        0
      )
    )

    const nuevoEstadoPrestamo = saldoRestante <= 0 ? 'pagado' : 'activo'

    const { error: updatePrestamoError } = await supabase
      .from('prestamos')
      .update({
        estado: nuevoEstadoPrestamo,
      })
      .eq('id', prestamo_id)

    if (updatePrestamoError) {
      return jsonResponse({ error: updatePrestamoError.message }, 500)
    }

    const proximaCuota = cuotasRestantes?.[0] || null
    const cuotaActualizada =
      detalleAplicacion.length > 0
        ? {
            cuota_id: detalleAplicacion[0].cuota_id,
            numero_cuota: detalleAplicacion[0].numero_cuota,
            saldo_despues: detalleAplicacion[0].saldo_cuota_despues,
            estado: detalleAplicacion[0].estado_resultante,
          }
        : null

    return jsonResponse({
      ok: true,
      pago,
      cuotas_impactadas: cuotasImpactadas,
      detalle_aplicacion: detalleAplicacion,
      total_aplicado: totalAplicado,
      monto_ingresado: montoIngresado,
      vuelto,
      saldo_restante: saldoRestante,
      cuota_actualizada: cuotaActualizada,
      proxima_cuota: proximaCuota,
      prestamo_estado: nuevoEstadoPrestamo,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Error interno',
      },
      500
    )
  }
})
