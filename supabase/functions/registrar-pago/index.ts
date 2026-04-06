import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Falta Authorization header' }),
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

    const token = authHeader.replace('Bearer ', '').trim()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

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

    const {
      prestamo_id,
      cliente_id,
      cuota_id,
      numero_cuota,
      monto,
      monto_ingresado,
      metodo,
    } = await req.json()

    if (!prestamo_id || !cliente_id || !monto || !metodo) {
      return new Response(
        JSON.stringify({ error: 'Faltan datos obligatorios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const montoAplicado = Number(monto)
    const montoIngresado = Number(monto_ingresado ?? monto)

    if (Number.isNaN(montoAplicado) || montoAplicado <= 0) {
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
      .select('id, total_a_pagar, estado')
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

    const { data: cuotasPendientes, error: cuotasError } = await supabase
      .from('cuotas')
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

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

    let restante = montoAplicado
    const cuotasImpactadas: number[] = []
    let cuotaActualizada: any = null

    for (const cuota of cuotasPendientes) {
      if (restante <= 0) break

      const saldoPendiente = Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0)

      if (saldoPendiente <= 0) continue

      if (restante >= saldoPendiente) {
        const { error: updateError } = await supabase
          .from('cuotas')
          .update({
            saldo_pendiente: 0,
            estado: 'pagada',
          })
          .eq('id', cuota.id)

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        cuotasImpactadas.push(cuota.numero_cuota)

        cuotaActualizada = {
          id: cuota.id,
          numero_cuota: cuota.numero_cuota,
          estado: 'pagada',
          saldo_antes: saldoPendiente,
          saldo_despues: 0,
        }

        restante -= saldoPendiente
      } else {
        const nuevoSaldo = Number((saldoPendiente - restante).toFixed(2))

        const { error: updateError } = await supabase
          .from('cuotas')
          .update({
            saldo_pendiente: nuevoSaldo,
            estado: 'parcial',
          })
          .eq('id', cuota.id)

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        cuotasImpactadas.push(cuota.numero_cuota)

        cuotaActualizada = {
          id: cuota.id,
          numero_cuota: cuota.numero_cuota,
          estado: 'parcial',
          saldo_antes: saldoPendiente,
          saldo_despues: nuevoSaldo,
        }

        restante = 0
      }
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto: montoAplicado,
        metodo,
        registrado_por: user.id,
      })
      .select()
      .single()

    if (pagoError) {
      return new Response(
        JSON.stringify({ error: pagoError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: proximaCuota } = await supabase
      .from('cuotas')
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: cuotasRestantes } = await supabase
      .from('cuotas')
      .select('saldo_pendiente')
      .eq('prestamo_id', prestamo_id)
      .in('estado', ['pendiente', 'parcial'])

    const saldoRestante = Number(
      (cuotasRestantes || []).reduce((acc, item) => {
        return acc + Number(item.saldo_pendiente || 0)
      }, 0).toFixed(2)
    )

    const vuelto = Number(Math.max(0, montoIngresado - montoAplicado).toFixed(2))

    const { data: siguePendiente } = await supabase
      .from('cuotas')
      .select('id')
      .eq('prestamo_id', prestamo_id)
      .in('estado', ['pendiente', 'parcial'])
      .limit(1)

    if (!siguePendiente || siguePendiente.length === 0) {
      await supabase
        .from('prestamos')
        .update({ estado: 'pagado' })
        .eq('id', prestamo_id)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pago,
        cuota_id: cuota_id ?? null,
        numero_cuota: numero_cuota ?? null,
        cuotas_impactadas: cuotasImpactadas,
        cuota_actualizada: cuotaActualizada,
        proxima_cuota: proximaCuota ?? null,
        saldo_restante: saldoRestante,
        vuelto,
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