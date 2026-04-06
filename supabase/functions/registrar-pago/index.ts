import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cuota = {
  id: string
  prestamo_id: string
  cliente_id: string
  numero_cuota: number
  monto_cuota: number
  saldo_pendiente: number
  estado: 'pendiente' | 'parcial' | 'pagado' | 'pagada'
  fecha_vencimiento: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Falta Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JWT',
          detalle: userError?.message || 'Token inválido o expirado',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const body = await req.json().catch(() => null)

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const cuota_id = body?.cuota_id
    const numero_cuota = Number(body?.numero_cuota || 0)
    const monto = Number(body?.monto || 0)
    const monto_ingresado = Number(body?.monto_ingresado || monto || 0)
    const vuelto = Number(body?.vuelto || 0)
    const metodo = body?.metodo || 'efectivo'

    if (!prestamo_id || !cliente_id || !cuota_id || !monto || monto <= 0) {
      return new Response(
        JSON.stringify({ error: 'Datos incompletos o monto inválido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: prestamo, error: prestamoError } = await supabase
      .from('prestamos')
      .select('id, cliente_id, total_a_pagar, estado')
      .eq('id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .maybeSingle()

    if (prestamoError || !prestamo) {
      return new Response(
        JSON.stringify({ error: 'Préstamo no encontrado' }),
        {
          status: 404,
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
      .eq('cliente_id', cliente_id)
      .maybeSingle()

    if (cuotaError || !cuota) {
      return new Response(
        JSON.stringify({ error: 'Cuota no encontrada' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const cuotaActual = cuota as Cuota

    if (numero_cuota > 0 && cuotaActual.numero_cuota !== numero_cuota) {
      return new Response(
        JSON.stringify({ error: 'La cuota enviada no coincide con la cuota seleccionada' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (
      cuotaActual.estado === 'pagado' ||
      cuotaActual.estado === 'pagada' ||
      Number(cuotaActual.saldo_pendiente || 0) <= 0
    ) {
      return new Response(
        JSON.stringify({ error: 'La cuota seleccionada ya está pagada' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const saldoAntes = Number(cuotaActual.saldo_pendiente || 0)
    const montoAplicado = Number(Math.min(monto, saldoAntes).toFixed(2))
    const saldoDespues = Number((saldoAntes - montoAplicado).toFixed(2))

    const nuevoEstado =
      saldoDespues <= 0
        ? 'pagado'
        : saldoDespues < Number(cuotaActual.monto_cuota || 0)
        ? 'parcial'
        : 'pendiente'

    const { error: updateCuotaError } = await supabase
      .from('cuotas')
      .update({
        saldo_pendiente: saldoDespues,
        estado: nuevoEstado,
        pagada_at: saldoDespues <= 0 ? new Date().toISOString() : null,
      })
      .eq('id', cuotaActual.id)

    if (updateCuotaError) {
      return new Response(
        JSON.stringify({ error: updateCuotaError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: pagoInsertado, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto: montoAplicado,
        monto_ingresado,
        vuelto,
        metodo,
        registrado_por: user.id,
      })
      .select('id')
      .single()

    if (pagoError || !pagoInsertado) {
      return new Response(
        JSON.stringify({ error: pagoError?.message || 'No se pudo guardar el pago' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { error: detalleError } = await supabase
      .from('pagos_detalle')
      .insert({
        pago_id: pagoInsertado.id,
        cuota_id: cuotaActual.id,
        prestamo_id,
        cliente_id,
        numero_cuota: cuotaActual.numero_cuota,
        monto_aplicado: montoAplicado,
        saldo_cuota_antes: saldoAntes,
        saldo_cuota_despues: saldoDespues,
      })

    if (detalleError) {
      return new Response(
        JSON.stringify({ error: detalleError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: cuotasRestantes, error: cuotasRestantesError } = await supabase
      .from('cuotas')
      .select('id, numero_cuota, saldo_pendiente, estado, fecha_vencimiento')
      .eq('prestamo_id', prestamo_id)
      .order('numero_cuota', { ascending: true })

    if (cuotasRestantesError) {
      return new Response(
        JSON.stringify({ error: cuotasRestantesError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const saldo_restante = Number(
      (cuotasRestantes || [])
        .reduce((acc, item) => acc + Number(item.saldo_pendiente || 0), 0)
        .toFixed(2)
    )

    const todasPagadas = (cuotasRestantes || []).every(
      (c) => Number(c.saldo_pendiente || 0) <= 0
    )

    const proximaPendiente = (cuotasRestantes || []).find(
      (c) => Number(c.saldo_pendiente || 0) > 0
    )

    const { error: updatePrestamoError } = await supabase
      .from('prestamos')
      .update({
        estado: todasPagadas ? 'pagado' : 'activo',
      })
      .eq('id', prestamo_id)

    if (updatePrestamoError) {
      return new Response(
        JSON.stringify({ error: updatePrestamoError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pago_id: pagoInsertado.id,
        cuota_id: cuotaActual.id,
        numero_cuota: cuotaActual.numero_cuota,
        monto_aplicado: montoAplicado,
        saldo_restante,
        cuota_actualizada: {
          numero_cuota: cuotaActual.numero_cuota,
          saldo_antes: saldoAntes,
          saldo_despues: saldoDespues,
          estado: nuevoEstado,
        },
        proxima_cuota: proximaPendiente
          ? {
              numero_cuota: proximaPendiente.numero_cuota,
              saldo_pendiente: Number(proximaPendiente.saldo_pendiente || 0),
              fecha_vencimiento: proximaPendiente.fecha_vencimiento,
            }
          : null,
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