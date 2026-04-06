import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CuotaDb = {
  id: string
  numero_cuota: number
  monto_cuota: number | null
  saldo_pendiente: number | null
  fecha_vencimiento: string
  estado: string | null
}

const redondear = (valor: number) =>
  Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUser = createClient(
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
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json().catch(() => null)

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const monto = body?.monto
    const metodo = body?.metodo
    const monto_ingresado = body?.monto_ingresado
    const vuelto = body?.vuelto

    if (!prestamo_id || !cliente_id || !monto || !metodo) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const montoAplicado = redondear(Number(monto))
    const montoIngresado = redondear(Number(monto_ingresado || monto))
    const vueltoNumero = redondear(Number(vuelto || 0))

    if (!Number.isFinite(montoAplicado) || montoAplicado <= 0) {
      return new Response(JSON.stringify({ error: 'Monto inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: prestamo, error: prestamoError } = await supabaseAdmin
      .from('prestamos')
      .select('id, cliente_id, total_a_pagar, estado')
      .eq('id', prestamo_id)
      .single()

    if (prestamoError || !prestamo) {
      return new Response(JSON.stringify({ error: 'Préstamo no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (prestamo.cliente_id !== cliente_id) {
      return new Response(JSON.stringify({ error: 'El préstamo no pertenece al cliente enviado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const deudaActual = redondear(Number(prestamo.total_a_pagar || 0))

    if (deudaActual <= 0) {
      return new Response(JSON.stringify({ error: 'El préstamo no tiene deuda pendiente' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (montoAplicado > deudaActual) {
      return new Response(JSON.stringify({ error: 'Monto mayor a deuda' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: cuotasRaw, error: cuotasError } = await supabaseAdmin
      .from('cuotas')
      .select('id, numero_cuota, monto_cuota, saldo_pendiente, fecha_vencimiento, estado')
      .eq('prestamo_id', prestamo_id)
      .order('numero_cuota', { ascending: true })

    if (cuotasError) {
      return new Response(JSON.stringify({ error: cuotasError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cuotas = (cuotasRaw || []) as CuotaDb[]

    if (cuotas.length === 0) {
      return new Response(JSON.stringify({ error: 'El préstamo no tiene cuotas generadas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let restante = montoAplicado
    const detalleAplicacion: Array<Record<string, unknown>> = []
    const pagoId = crypto.randomUUID()

    for (const cuota of cuotas) {
      if (restante <= 0) break

      const saldoCuota = redondear(Number(cuota.saldo_pendiente || 0))
      if (saldoCuota <= 0) continue

      const aplicado = redondear(Math.min(restante, saldoCuota))
      if (aplicado <= 0) continue

      const nuevoSaldo = redondear(saldoCuota - aplicado)
      const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'parcial'

      const { error: updateCuotaError } = await supabaseAdmin
        .from('cuotas')
        .update({
          saldo_pendiente: nuevoSaldo,
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cuota.id)

      if (updateCuotaError) {
        return new Response(JSON.stringify({ error: updateCuotaError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      detalleAplicacion.push({
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        fecha_vencimiento: cuota.fecha_vencimiento,
        monto_cuota: redondear(Number(cuota.monto_cuota || 0)),
        aplicado,
        saldo_anterior: saldoCuota,
        saldo_nuevo: nuevoSaldo,
        estado_nuevo: nuevoEstado,
      })

      restante = redondear(restante - aplicado)
    }

    if (restante > 0) {
      return new Response(JSON.stringify({ error: 'No se pudo aplicar el pago completo a las cuotas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: pagoError } = await supabaseAdmin.from('pagos').insert({
      id: pagoId,
      prestamo_id,
      cliente_id,
      monto: montoAplicado,
      monto_ingresado: montoIngresado,
      vuelto: vueltoNumero,
      metodo,
      registrado_por: user.id,
      detalle_aplicacion: detalleAplicacion,
    })

    if (pagoError) {
      return new Response(JSON.stringify({ error: pagoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: cuotasActualizadasRaw, error: cuotasActualizadasError } = await supabaseAdmin
      .from('cuotas')
      .select('id, numero_cuota, saldo_pendiente, fecha_vencimiento, estado')
      .eq('prestamo_id', prestamo_id)
      .order('numero_cuota', { ascending: true })

    if (cuotasActualizadasError) {
      return new Response(JSON.stringify({ error: cuotasActualizadasError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cuotasActualizadas = (cuotasActualizadasRaw || []) as Array<{
      id: string
      numero_cuota: number
      saldo_pendiente: number | null
      fecha_vencimiento: string
      estado: string | null
    }>

    const siguientePendiente =
      cuotasActualizadas.find(
        (cuota) => redondear(Number(cuota.saldo_pendiente || 0)) > 0
      ) || null

    const cuotasPagadas = cuotasActualizadas.filter(
      (cuota) => redondear(Number(cuota.saldo_pendiente || 0)) <= 0
    ).length

    const nuevoSaldo = redondear(
      cuotasActualizadas.reduce(
        (acc, cuota) => acc + Number(cuota.saldo_pendiente || 0),
        0
      )
    )

    const { error: updatePrestamoError } = await supabaseAdmin
      .from('prestamos')
      .update({
        total_a_pagar: nuevoSaldo,
        estado: nuevoSaldo <= 0 ? 'pagado' : 'activo',
        fecha_limite: siguientePendiente?.fecha_vencimiento ?? null,
        fecha_inicio_mora: siguientePendiente?.fecha_vencimiento ?? null,
      })
      .eq('id', prestamo_id)

    if (updatePrestamoError) {
      return new Response(JSON.stringify({ error: updatePrestamoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pago_id: pagoId,
        saldo_restante: nuevoSaldo,
        cuotas_pagadas: cuotasPagadas,
        cuotas_totales: cuotasActualizadas.length,
        proxima_cuota: siguientePendiente
          ? {
              numero: siguientePendiente.numero_cuota,
              fecha_vencimiento: siguientePendiente.fecha_vencimiento,
            }
          : null,
        detalle_aplicacion: detalleAplicacion,
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