import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DNI_REGEX = /^\d{7,8}$/

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'Falta token de autorización.' }, 401)
  }

  const token = authHeader.replace('Bearer ', '').trim()

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let authUserId: string | null = null
  let usuarioInserted = false

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ ok: false, error: 'Sesión inválida o expirada.' }, 401)
    }

    const { data: adminRow, error: adminRowError } = await adminClient
      .from('usuarios')
      .select('id,rol')
      .eq('id', user.id)
      .maybeSingle()

    if (adminRowError) {
      console.error('[crear-cliente] admin role lookup error', adminRowError)
      return jsonResponse({ ok: false, error: 'No se pudo validar el rol del usuario.' }, 500)
    }

    if (!adminRow || adminRow.rol !== 'admin') {
      return jsonResponse({ ok: false, error: 'No tenés permisos para crear clientes.' }, 403)
    }

    const body = await req.json().catch(() => ({}))

    const nombre = String(body?.nombre || '').trim()
    const telefono = String(body?.telefono || '').trim()
    const direccion = String(body?.direccion || '').trim()
    const dni = normalizeDni(body?.dni)
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '').trim()

    if (!nombre || !email || !password) {
      return jsonResponse({ ok: false, error: 'Completá nombre, email y contraseña.' }, 400)
    }

    if (password.length < 6) {
      return jsonResponse({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' }, 400)
    }

    if (!DNI_REGEX.test(dni)) {
      return jsonResponse({ ok: false, error: 'Ingresá un DNI válido de 7 u 8 dígitos.' }, 400)
    }

    const { data: existingUsuario, error: existingUsuarioError } = await adminClient
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUsuarioError) {
      console.error('[crear-cliente] existing usuario lookup error', existingUsuarioError)
      return jsonResponse({ ok: false, error: 'No se pudo verificar el email.' }, 500)
    }

    if (existingUsuario) {
      return jsonResponse({ ok: false, error: 'Ya existe un usuario con ese email.' }, 409)
    }

    const { data: sameDniCliente, error: sameDniError } = await adminClient
      .from('clientes')
      .select('id,usuario_id')
      .eq('dni', dni)
      .maybeSingle()

    if (sameDniError) {
      console.error('[crear-cliente] existing dni lookup error', sameDniError)
      return jsonResponse({ ok: false, error: 'No se pudo verificar el DNI.' }, 500)
    }

    if (sameDniCliente?.usuario_id) {
      return jsonResponse({ ok: false, error: 'Ese DNI ya tiene una cuenta activa.' }, 409)
    }

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol: 'cliente', dni },
    })

    if (createAuthError || !createdAuth.user) {
      console.error('[crear-cliente] auth user create error', createAuthError)
      return jsonResponse({ ok: false, error: createAuthError?.message || 'No se pudo crear el usuario de autenticación.' }, 400)
    }

    authUserId = createdAuth.user.id

    const { error: insertUsuarioError } = await adminClient
      .from('usuarios')
      .insert({ id: authUserId, nombre, email, rol: 'cliente' })

    if (insertUsuarioError) {
      console.error('[crear-cliente] usuarios insert error', insertUsuarioError)
      throw new Error(insertUsuarioError.message || 'No se pudo guardar en usuarios.')
    }

    usuarioInserted = true

    if (sameDniCliente?.id) {
      const { error: updateClienteError } = await adminClient
        .from('clientes')
        .update({
          usuario_id: authUserId,
          nombre,
          telefono: telefono || null,
          direccion: direccion || null,
        })
        .eq('id', sameDniCliente.id)

      if (updateClienteError) {
        console.error('[crear-cliente] update placeholder cliente error', updateClienteError)
        throw new Error(updateClienteError.message || 'No se pudo completar el cliente existente.')
      }
    } else {
      const { error: insertClienteError } = await adminClient
        .from('clientes')
        .insert({
          usuario_id: authUserId,
          nombre,
          telefono: telefono || null,
          direccion: direccion || null,
          dni,
        })

      if (insertClienteError) {
        console.error('[crear-cliente] clientes insert error', insertClienteError)
        throw new Error(insertClienteError.message || 'No se pudo guardar en clientes.')
      }
    }

    await adminClient.from('actividad_sistema').insert({
      tipo: 'cliente_creado',
      titulo: 'Nuevo cliente creado',
      descripcion: `Se creó el cliente ${nombre}`,
      entidad_tipo: 'cliente',
      entidad_id: authUserId,
      usuario_id: user.id,
      prioridad: 'normal',
      visible_en_notificaciones: true,
      metadata: { creado_por: user.id, email, dni },
    })

    await adminClient.from('notificaciones').insert({
      tipo: 'nuevo_cliente',
      titulo: 'Nuevo cliente creado',
      descripcion: `Se creó el cliente ${nombre}`,
      cliente_id: authUserId,
      metadata: { creado_por: user.id },
    })

    return jsonResponse({
      ok: true,
      message: 'Cliente creado correctamente.',
      cliente: {
        id: authUserId,
        nombre,
        email,
        telefono,
        direccion,
        dni,
        rol: 'cliente',
      },
    })
  } catch (error: any) {
    console.error('[crear-cliente] fatal error', error)

    if (authUserId) {
      if (usuarioInserted) {
        await adminClient.from('usuarios').delete().eq('id', authUserId)
      }
      await adminClient.auth.admin.deleteUser(authUserId)
    }

    return jsonResponse({ ok: false, error: error?.message || 'Error interno del servidor.' }, 500)
  }
})
