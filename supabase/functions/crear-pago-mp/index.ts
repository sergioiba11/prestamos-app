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

function extraerTokenBearer(authHeader: string | null) {
  if (!authHeader) return null
  const limpio = authHeader.trim()
  if (!limpio) return null
  if (limpio.toLowerCase().startsWith('bearer ')) return limpio.slice(7).trim()
  return limpio
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse({ error: 'Falta token de autorización' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const mercadoPagoAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || Deno.env.get('FRONTEND_URL') || 'https://example.com'
    const webhookBase = `${supabaseUrl?.replace(/\/$/, '') || ''}/functions/v1/webhook-mp`

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de Supabase' }, 500)
    }

    if (!mercadoPagoAccessToken) {
      return jsonResponse({ error: 'Falta MERCADO_PAGO_ACCESS_TOKEN' }, 500)
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido o usuario no autenticado' }, 401)
    }

    const body = await req.json()
    const prestamoId = String(body?.prestamo_id || '').trim()
    const clienteId = String(body?.cliente_id || '').trim()
    const cuotaId = String(body?.cuota_id || '').trim()
    const numeroCuota = Number(body?.numero_cuota || 0)
    const monto = Number(body?.monto || 0)
    const title = String(body?.title || `Pago cuota #${numeroCuota || 1}`).trim()

    if (!prestamoId || !clienteId || !cuotaId || !Number.isFinite(monto) || monto <= 0) {
      return jsonResponse({ error: 'Faltan datos obligatorios para crear pago MP' }, 400)
    }

    const externalReference = `prestamo:${prestamoId}|cliente:${clienteId}|cuota:${cuotaId}|monto:${monto.toFixed(2)}`

    const preferencePayload = {
      items: [
        {
          id: cuotaId,
          title,
          quantity: 1,
          unit_price: Number(monto.toFixed(2)),
          currency_id: 'ARS',
        },
      ],
      external_reference: externalReference,
      metadata: {
        prestamo_id: prestamoId,
        cliente_id: clienteId,
        cuota_id: cuotaId,
        numero_cuota: numeroCuota,
        monto,
      },
      notification_url: webhookBase,
      back_urls: {
        success: appBaseUrl,
        pending: appBaseUrl,
        failure: appBaseUrl,
      },
      auto_return: 'approved',
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mercadoPagoAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferencePayload),
    })

    const mpJson = await mpRes.json()

    if (!mpRes.ok) {
      return jsonResponse(
        {
          error: 'Mercado Pago rechazó la creación de preferencia',
          detalle: mpJson,
        },
        502
      )
    }

    return jsonResponse({
      ok: true,
      preference_id: String(mpJson?.id || ''),
      init_point: String(mpJson?.init_point || ''),
      qr_url: String(mpJson?.point_of_interaction?.transaction_data?.qr_code || ''),
      qr_base64: String(mpJson?.point_of_interaction?.transaction_data?.qr_code_base64 || ''),
      external_reference: externalReference,
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error interno en crear-pago-mp' },
      500
    )
  }
})
