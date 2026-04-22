import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function businessError(error: string, code: string, status = 200) {
  return jsonResponse({ ok: false, error, code }, status)
}

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido.', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const identifier = String(body?.identifier ?? '').trim()

    if (!identifier) {
      return businessError('Ingresá DNI o correo.', 'IDENTIFIER_REQUIRED')
    }

    if (isEmail(identifier)) {
      return jsonResponse({ ok: true, email: identifier.toLowerCase(), source: 'email' })
    }

    const dni = normalizeDni(identifier)
    if (!/^\d{7,8}$/.test(dni)) {
      return businessError('Ingresá un DNI válido de 7 u 8 dígitos o un correo válido.', 'IDENTIFIER_INVALID')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('usuario_id,dni')
      .not('dni', 'is', null)

    if (clientesError) throw new Error(clientesError.message)

    const match = (clientes || []).find((row: any) => normalizeDni(row?.dni) === dni)

    if (!match?.usuario_id) {
      return businessError('No encontramos una cuenta asociada a ese DNI.', 'DNI_NOT_FOUND')
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('email')
      .eq('id', match.usuario_id)
      .maybeSingle()

    if (usuarioError) throw new Error(usuarioError.message)

    const email = String(usuario?.email ?? '').trim().toLowerCase()
    if (!email || !isEmail(email)) {
      return businessError('La cuenta asociada al DNI no tiene un correo válido.', 'EMAIL_NOT_AVAILABLE')
    }

    return jsonResponse({ ok: true, email, source: 'dni' })
  } catch (error: any) {
    console.error('[resolver-identificador-login] fatal error', error)
    return jsonResponse({ ok: false, error: error?.message || 'No se pudo resolver el acceso.' }, 500)
  }
})
