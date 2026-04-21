import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DNI_REGEX = /^\d{7,8}$/
const PHONE_REGEX = /^\+549\d{10}$/

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '')
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type ClienteRow = {
  id: string
  dni: string | null
  usuario_id: string | null
  telefono: string | null
}

async function findClienteByDni(adminClient: ReturnType<typeof createClient>, cleanDni: string): Promise<ClienteRow | null> {
  const { data, error } = await adminClient
    .from('clientes')
    .select('id,dni,usuario_id,telefono')
    .not('dni', 'is', null)

  if (error) throw new Error(error.message)

  const rows = (data || []) as ClienteRow[]
  return rows.find((row) => normalizeDni(row.dni) === cleanDni) || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'Falta Authorization Bearer token.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '').trim()

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ ok: false, error: 'Sesión inválida o expirada.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const dni = normalizeDni(body?.dni)
    const nombre = String(body?.nombre || '').trim()
    const password = String(body?.password || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const telefono = normalizePhone(body?.telefono || user.phone || '')

    console.log('[completar-registro-cliente] payload', {
      userId: user.id,
      dni,
      nombre,
      email,
      telefono,
    })

    if (!DNI_REGEX.test(dni)) {
      return jsonResponse({ ok: false, error: 'Ingresá un DNI válido de 7 u 8 dígitos.' }, 400)
    }

    if (!nombre) {
      return jsonResponse({ ok: false, error: 'Falta el nombre del cliente.' }, 400)
    }

    if (!email) {
      return jsonResponse({ ok: false, error: 'Falta el email del cliente.' }, 400)
    }

    if (password.length < 8) {
      return jsonResponse({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
    }

    if (!PHONE_REGEX.test(telefono)) {
      return jsonResponse({ ok: false, error: 'El teléfono verificado no es válido (+549...).' }, 400)
    }

    let cliente = await findClienteByDni(adminClient, dni)

    if (!cliente) {
      const { data: createdCliente, error: createClienteError } = await adminClient
        .from('clientes')
        .insert({
          dni,
          nombre,
          telefono,
          usuario_id: null,
        })
        .select('id,dni,usuario_id,telefono')
        .maybeSingle<ClienteRow>()

      if (createClienteError || !createdCliente) {
        return jsonResponse({ ok: false, error: createClienteError?.message || 'No se pudo crear el cliente base.' }, 500)
      }

      cliente = createdCliente
    }

    if (cliente.usuario_id && cliente.usuario_id !== user.id) {
      return jsonResponse({ ok: false, error: 'Ese DNI ya tiene una cuenta activa.' }, 409)
    }

    const { data: existingEmail, error: existingEmailError } = await adminClient
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .neq('id', user.id)
      .maybeSingle()

    if (existingEmailError) {
      return jsonResponse({ ok: false, error: 'No se pudo validar el email.' }, 500)
    }

    if (existingEmail) {
      return jsonResponse({ ok: false, error: 'El email ya está registrado.' }, 409)
    }

    const { data: samePhoneRows, error: samePhoneError } = await adminClient
      .from('clientes')
      .select('id,dni')
      .eq('telefono', telefono)

    if (samePhoneError) {
      return jsonResponse({ ok: false, error: 'No se pudo validar el teléfono.' }, 500)
    }

    const phoneInUse = (samePhoneRows || []).some((row) => normalizeDni(row.dni) !== dni)
    if (phoneInUse) {
      return jsonResponse({ ok: false, error: 'El teléfono ya está asociado a otro cliente.' }, 409)
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user.id, {
      email,
      password,
      phone: telefono,
      user_metadata: {
        rol: 'cliente',
        dni,
        nombre,
      },
      email_confirm: true,
      phone_confirm: true,
    })

    if (updateAuthError) {
      const msg = updateAuthError.message?.toLowerCase() || ''
      if (msg.includes('already') || msg.includes('exists')) {
        return jsonResponse({ ok: false, error: 'El email ya existe en autenticación.' }, 409)
      }
      return jsonResponse({ ok: false, error: updateAuthError.message || 'No se pudo actualizar el usuario auth.' }, 400)
    }

    const { error: upsertUsuarioError } = await adminClient
      .from('usuarios')
      .upsert({ id: user.id, nombre, email, rol: 'cliente' })

    if (upsertUsuarioError) {
      return jsonResponse({ ok: false, error: upsertUsuarioError.message || 'No se pudo guardar en usuarios.' }, 500)
    }

    const { error: updateClienteError } = await adminClient
      .from('clientes')
      .update({
        usuario_id: user.id,
        nombre,
        telefono,
      })
      .eq('id', cliente.id)

    if (updateClienteError) {
      return jsonResponse({ ok: false, error: updateClienteError.message || 'No se pudo guardar en clientes.' }, 500)
    }

    return jsonResponse({
      ok: true,
      message: 'Registro completado correctamente.',
      userId: user.id,
      email,
      clienteId: cliente.id,
    })
  } catch (error: any) {
    console.error('[completar-registro-cliente] fatal error', error)
    return jsonResponse({ ok: false, error: error?.message || 'Error interno del servidor.' }, 500)
  }
})
