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

    const body = await req.json()

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const cuota_id = body?.cuota_id
    const numero_cuota = body?.numero_cuota
    const metodo = body?.metodo

    const montoAplicado = Number(body?.monto)
    const montoIngresado = Number(body?.monto_ingresado ?? body?.monto)

    if (!prestamo_id || !cliente_id || !cuota_id || !metodo) {
      return new Response(
        JSON.stringify({
          error: 'Faltan datos obligatorios: prestamo_id, cliente_id, cuota_id, metodo',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (Number.isNaN(montoAplicado) || montoAplicado <= 0) {
      return new Response(
        JSON.stringify({ error: 'Monto inválido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (Number.isNaN(montoIngresado) || montoIngresado <= 0) {
      return new Response(
        JSON.stringify({ error: 'Monto ingresado inválido' }),
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

    const { data: cuota, error: cuotaError } = await supabase
      .from('cuotas')
      .select(`
        id,
        prestamo_id,
        cliente_id,
        numero_cuota,
        monto_cuota,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('id', cuota_id)
      .eq('prestamo_id', prestamo_id)
      .single()

    if (cuotaError || !cuota) {
      return new Response(
        JSON.stringify({ error: 'Cuota no encontrada para ese préstamo' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (cuota.cliente_id && cuota.cliente_id !== cliente_id) {
      return new Response(
        JSON.stringify({ error: 'La cuota no pertenece al cliente enviado' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!['pendiente', 'parcial'].includes(cuota.estado)) {
      return new Response(
        JSON.stringify({ error: 'La cuota seleccionada ya está pagada o no admite pagos' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (numero_cuota && Number(numero_cuota) !== Number(cuota.numero_cuota)) {
      return new Response(
        JSON.stringify({ error: 'El número de cuota no coincide con la cuota seleccionada' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const saldoAnterior = Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0)

    if (saldoAnterior <= 0) {
      return new Response(
        JSON.stringify({ error: 'La cuota no tiene saldo pendiente' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Solo se aplica a la cuota seleccionada.
    // Si entra más plata que la deuda de la cuota, el excedente queda como vuelto.
    const montoRealAplicado = Number(Math.min(montoAplicado, saldoAnterior).toFixed(2))
    const nuevoSaldo = Number((saldoAnterior - montoRealAplicado).toFixed(2))
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagada' : 'parcial'
    const vuelto = Number(Math.max(0, montoIngresado - montoRealAplicado).toFixed(2))

    const { error: updateCuotaError } = await supabase
      .from('cuotas')
      .update({
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado,
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

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto: montoRealAplicado,
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

    const { data: cuotasRestantes, error: cuotasRestantesError } = await supabase
      .from('cuotas')
      .select('saldo_pendiente')
      .eq('prestamo_id', prestamo_id)
      .in('estado', ['pendiente', 'parcial'])

    if (cuotasRestantesError) {
      return new Response(
        JSON.stringify({ error: cuotasRestantesError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const saldoRestante = Number(
      (cuotasRestantes || [])
        .reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0)
        .toFixed(2)
    )

    if (saldoRestante <= 0) {
      await supabase
        .from('prestamos')
        .update({ estado: 'pagado' })
        .eq('id', prestamo_id)
    } else {
      await supabase
        .from('prestamos')
        .update({ estado: 'activo' })
        .eq('id', prestamo_id)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pago,
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        cuotas_impactadas: [cuota.numero_cuota],
        cuota_actualizada: {
          id: cuota.id,
          numero_cuota: cuota.numero_cuota,
          estado: nuevoEstado,
          saldo_antes: saldoAnterior,
          saldo_despues: nuevoSaldo,
        },
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