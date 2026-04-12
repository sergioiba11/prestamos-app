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

  if (['mp', 'mercado_pago', 'mercado-pago'].includes(valor)) {
    return 'mercadopago'
  }

  if (['efectivo', 'transferencia', 'mercadopago'].includes(valor)) {
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno' }, 500)
    }

    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization')

    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse({ error: 'Token requerido' }, 401)
    }

    // ✅ cliente para validar usuario
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido' }, 401)
    }

    // ✅ cliente admin (DB)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    const body = await req.json()

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const metodo = normalizarMetodoPago(body?.metodo)
    const montoIngresado = redondear(Number(body?.monto))

    if (!prestamo_id || !cliente_id || !metodo) {
      return jsonResponse({ error: 'Faltan datos' }, 400)
    }

    if (montoIngresado <= 0) {
      return jsonResponse({ error: 'Monto inválido' }, 400)
    }

    const { data: cuotas, error } = await supabase
      .from('cuotas')
      .select('*')
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota')

    if (error) return jsonResponse({ error: error.message }, 500)

    if (!cuotas?.length) {
      return jsonResponse({ error: 'Sin cuotas pendientes' }, 400)
    }

    let restante = montoIngresado
    const detalle: any[] = []

    for (const cuota of cuotas) {
      if (restante <= 0) break

      const saldo = redondear(cuota.saldo_pendiente)
      if (saldo <= 0) continue

      const aplicar = Math.min(restante, saldo)
      const nuevoSaldo = redondear(saldo - aplicar)
      const nuevoPagado = redondear((cuota.monto_pagado || 0) + aplicar)

      const { error: errUpdate } = await supabase
        .from('cuotas')
        .update({
          monto_pagado: nuevoPagado,
          saldo_pendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial',
        })
        .eq('id', cuota.id)

      if (errUpdate) return jsonResponse({ error: errUpdate.message }, 500)

      detalle.push({
        cuota_id: cuota.id,
        numero: cuota.numero_cuota,
        aplicado: aplicar,
      })

      restante = redondear(restante - aplicar)
    }

    const totalAplicado = redondear(
      detalle.reduce((acc, d) => acc + d.aplicado, 0)
    )

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

    if (pagoError) return jsonResponse({ error: pagoError.message }, 500)

    return jsonResponse({
      ok: true,
      pago,
      detalle,
      vuelto: redondear(montoIngresado - totalAplicado),
    })
  } catch (err) {
    return jsonResponse({ error: 'Error interno' }, 500)
  }
})