import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function redondear(valor: number) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

function normalizarMetodoPago(metodo: unknown) {
  const valor = String(metodo || '').trim().toLowerCase()
  if (valor === 'mp' || valor === 'mercado_pago' || valor === 'mercado-pago') {
    return 'mercadopago'
  }
  if (valor === 'efectivo' || valor === 'transferencia' || valor === 'mercadopago') {
    return valor
  }
  return valor
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Falta Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Token inválido o usuario no autenticado',
          detalle: userError?.message || null,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const cuota_id_inicial = body?.cuota_id || null
    const numero_cuota_inicial = body?.numero_cuota || null
    const metodo = normalizarMetodoPago(body?.metodo)

    const montoIngresado = redondear(Number(body?.monto_ingresado ?? body?.monto))
    const aplicarAMultiples = body?.aplicar_a_multiples !== false

    if (!prestamo_id || !cliente_id || !metodo) {
      return new Response(
        JSON.stringify({
          error: 'Faltan datos obligatorios: prestamo_id, cliente_id, metodo',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (Number.isNaN(montoIngresado) || montoIngresado <= 0) {
      return new Response(
        JSON.stringify({ error: 'Monto inválido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: prestamo, error: prestamoError } = await supabase
      .from('prestamos')
      .select('id, cliente_id, estado')
      .eq('id', prestamo_id)
      .single()

    if (prestamoError || !prestamo) {
      return new Response(
        JSON.stringify({ error: 'Préstamo no encontrado' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (prestamo.cliente_id !== cliente_id) {
      return new Response(
        JSON.stringify({ error: 'El préstamo no pertenece al cliente enviado' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let cuotasQuery = supabase
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

    const { data: cuotasPendientes, error: cuotasError } = await cuotasQuery

    if (cuotasError) {
      return new Response(
        JSON.stringify({ error: cuotasError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!cuotasPendientes || cuotasPendientes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'El préstamo no tiene cuotas pendientes' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let cuotasAProcesar = cuotasPendientes

    if (cuota_id_inicial) {
      const index = cuotasPendientes.findIndex((c) => c.id === cuota_id_inicial)

      if (index === -1) {
        return new Response(
          JSON.stringify({ error: 'La cuota seleccionada no pertenece a ese préstamo o no está pendiente' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      if (
        numero_cuota_inicial &&
        Number(numero_cuota_inicial) !== Number(cuotasPendientes[index].numero_cuota)
      ) {
        return new Response(
          JSON.stringify({ error: 'El número de cuota no coincide con la cuota seleccionada' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      cuotasAProcesar = cuotasPendientes.slice(index)
    }

    let restante = montoIngresado
    const cuotasImpactadas: number[] = []
    const detalleAplicacion: any[] = []

    for (const cuota of cuotasAProcesar) {
      if (restante <= 0) break

      const saldoAnterior = redondear(Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0))
      const pagadoAnterior = redondear(Number(cuota.monto_pagado ?? 0))

      if (saldoAnterior <= 0) continue

      const montoAplicado = redondear(
        aplicarAMultiples ? Math.min(restante, saldoAnterior) : Math.min(montoIngresado, saldoAnterior)
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
        return new Response(
          JSON.stringify({ error: updateCuotaError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
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
      detalleAplicacion.reduce((acc, item) => acc + Number(item.monto_aplicado || 0), 0)
    )

    if (totalAplicado <= 0) {
      return new Response(
        JSON.stringify({ error: 'No se pudo aplicar el pago a ninguna cuota' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
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
      return new Response(
        JSON.stringify({ error: pagoError?.message || 'No se pudo crear el pago' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
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
      return new Response(
        JSON.stringify({ error: detalleError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
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
      return new Response(
        JSON.stringify({ error: cuotasRestantesError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const saldoRestante = redondear(
      (cuotasRestantes || []).reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0)
    )

    const nuevoEstadoPrestamo = saldoRestante <= 0 ? 'pagado' : 'activo'

    const { error: updatePrestamoError } = await supabase
      .from('prestamos')
      .update({
        estado: nuevoEstadoPrestamo,
      })
      .eq('id', prestamo_id)

    if (updatePrestamoError) {
      return new Response(
        JSON.stringify({ error: updatePrestamoError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const proximaCuota = cuotasRestantes?.[0] || null

    return new Response(
      JSON.stringify({
        ok: true,
        pago,
        cuotas_impactadas: cuotasImpactadas,
        detalle_aplicacion: detalleAplicacion,
        total_aplicado: totalAplicado,
        monto_ingresado: montoIngresado,
        vuelto,
        saldo_restante: saldoRestante,
        proxima_cuota: proximaCuota,
        prestamo_estado: nuevoEstadoPrestamo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error interno',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})