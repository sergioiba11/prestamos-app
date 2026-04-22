import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ClienteRow = {
  id: string
  dni: string | null
  nombre: string | null
  telefono: string | null
  usuario_id: string | null
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

function normalizePhoneAR(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length !== 10) return ''
  return `+549${digits}`
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  const rollback = {
    userId: null as string | null,
    insertedUsuario: false,
    clienteId: null as string | null,
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.', code: 'MISSING_ENV' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const dni = normalizeDni(body?.dni)
    const nombre = String(body?.nombre ?? '').trim() || 'Cliente'
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const telefono = normalizePhoneAR(body?.telefono)
    const clienteId = body?.clienteId ? String(body.clienteId) : null

    if (dni.length < 7 || dni.length > 8) {
      return businessError('DNI inválido. Debe tener 7 u 8 dígitos.', 'DNI_INVALID')
    }
    if (!isValidEmail(email)) {
      return businessError('Ingresá un correo válido.', 'EMAIL_INVALID')
    }
    if (password.length < 8) {
      return businessError('La contraseña debe tener al menos 8 caracteres.', 'PASSWORD_TOO_SHORT')
    }
    if (!/^\+549\d{10}$/.test(telefono)) {
      return businessError('Teléfono inválido. Debe ser de Argentina (+549...).', 'PHONE_INVALID')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let cliente: ClienteRow | null = null

    if (clienteId) {
      const { data } = await supabase
        .from('clientes')
        .select('id,dni,nombre,telefono,usuario_id')
        .eq('id', clienteId)
        .maybeSingle<ClienteRow>()
      if (data && normalizeDni(data.dni) === dni) cliente = data
    }

    if (!cliente) {
      const { data } = await supabase.from('clientes').select('id,dni,nombre,telefono,usuario_id').not('dni', 'is', null)
      const rows = (data || []) as ClienteRow[]
      cliente = rows.find((row) => normalizeDni(row.dni) === dni) || null
    }

    if (cliente?.usuario_id) {
      return businessError('Ese DNI ya pertenece a un cliente.', 'DNI_ALREADY_REGISTERED')
    }

    const { data: duplicatedEmail, error: duplicatedEmailError } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (duplicatedEmailError) {
      throw new Error(duplicatedEmailError.message)
    }

    if (duplicatedEmail?.id) {
      return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
    }

    if (!cliente) {
      const { data: created, error: createClienteError } = await supabase
        .from('clientes')
        .insert({ dni, nombre, telefono, usuario_id: null })
        .select('id,dni,nombre,telefono,usuario_id')
        .maybeSingle<ClienteRow>()

      if (createClienteError || !created) {
        throw new Error(createClienteError?.message || 'No se pudo crear el cliente.')
      }

      cliente = created
    }

    rollback.clienteId = cliente.id

    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        dni,
        rol: 'cliente',
      },
    })

    if (createAuthError || !authData.user) {
      const authMessage = String(createAuthError?.message || '').toLowerCase()
      if (authMessage.includes('already') || authMessage.includes('registered') || authMessage.includes('exists')) {
        return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
      }
      return jsonResponse({ ok: false, error: 'No se pudo crear el usuario de acceso.', code: 'AUTH_USER_CREATE_FAILED' }, 500)
    }

    rollback.userId = authData.user.id

    const { error: usuarioError } = await supabase.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol: 'cliente',
    })

    if (usuarioError) throw new Error(usuarioError.message)
    rollback.insertedUsuario = true

    const { error: clienteUpdateError } = await supabase
      .from('clientes')
      .update({
        usuario_id: authData.user.id,
        nombre,
        telefono,
        dni,
      })
      .eq('id', cliente.id)

    if (clienteUpdateError) throw new Error(clienteUpdateError.message)

    return jsonResponse({ ok: true, userId: authData.user.id, clienteId: cliente.id })
  } catch (error: any) {
    console.error('[registro-cliente-publico] fatal error', error)

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceRoleKey && rollback.userId) {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        if (rollback.insertedUsuario) {
          await admin.from('usuarios').delete().eq('id', rollback.userId)
        }

        if (rollback.clienteId) {
          await admin
            .from('clientes')
            .update({ usuario_id: null })
            .eq('id', rollback.clienteId)
        }

        await admin.auth.admin.deleteUser(rollback.userId)
      }
    } catch (rollbackError) {
      console.error('[registro-cliente-publico] rollback error', rollbackError)
    }

    return jsonResponse({ ok: false, error: error?.message || 'No se pudo crear la cuenta.', code: 'INTERNAL_ERROR' }, 500)
  }
})
