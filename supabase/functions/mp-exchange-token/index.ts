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
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Método no permitido' }, 405)
    }

    const authHeader = req.headers.get('authorization')
    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse({ error: 'Falta token de autorización' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const mpClientId = Deno.env.get('MP_CLIENT_ID')
    const mpClientSecret = Deno.env.get('MP_CLIENT_SECRET')
    const redirectUri = Deno.env.get('MP_REDIRECT_URI')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de Supabase' }, 500)
    }

    if (!mpClientId || !mpClientSecret || !redirectUri) {
      return jsonResponse({ error: 'Faltan MP_CLIENT_ID, MP_CLIENT_SECRET o MP_REDIRECT_URI' }, 500)
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido o usuario no autenticado' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const code = String(body?.code || '').trim()

    if (!code) {
      return jsonResponse({ error: 'Falta el code de Mercado Pago' }, 400)
    }

    const mpRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: mpClientId,
        client_secret: mpClientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const mpJson = await mpRes.json().catch(() => ({}))

    if (!mpRes.ok) {
      return jsonResponse(
        {
          error: 'Mercado Pago rechazó el intercambio del code',
          detalle: mpJson,
        },
        502
      )
    }

    const mpAccessToken = String(mpJson?.access_token || '').trim()
    const mpRefreshToken = String(mpJson?.refresh_token || '').trim()
    const mpUserId = String(mpJson?.user_id || '').trim()
    const mpPublicKey = String(mpJson?.public_key || '').trim()

    if (!mpAccessToken) {
      return jsonResponse({ error: 'Mercado Pago no devolvió access_token' }, 502)
    }

    let aliasCuenta: string | null = null

    try {
      const userRes = await fetch('https://api.mercadopago.com/users/me', {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      })
      const userJson = await userRes.json().catch(() => ({}))

      if (userRes.ok) {
        const nickname = String(userJson?.nickname || '').trim()
        const firstName = String(userJson?.first_name || '').trim()
        const lastName = String(userJson?.last_name || '').trim()
        aliasCuenta = nickname || `${firstName} ${lastName}`.trim() || null
      }
    } catch (_error) {
      aliasCuenta = null
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const { error: upsertError } = await adminClient.from('admin_settings').upsert(
      {
        user_id: user.id,
        connected: true,
        mp_access_token: mpAccessToken,
        mp_refresh_token: mpRefreshToken || null,
        mp_user_id: mpUserId || null,
        public_key: mpPublicKey || null,
        alias_cuenta: aliasCuenta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500)
    }

    return jsonResponse({
      ok: true,
      connected: true,
      mp_user_id: mpUserId || null,
      public_key: mpPublicKey || null,
      alias_cuenta: aliasCuenta,
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error interno en mp-exchange-token' },
      500
    )
  }
})
