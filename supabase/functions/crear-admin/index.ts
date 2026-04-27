import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'Método no permitido' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(500, {
        ok: false,
        error: 'Faltan variables de entorno de Supabase',
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(401, { ok: false, error: 'Falta token de autorización' })
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const body = await req.json().catch(() => null)
    const nombre = String(body?.nombre || '').trim()
    const email = String(body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(body?.password || '').trim()
    const adminPassword = String(body?.adminPassword || '').trim()
    const telefono = String(body?.telefono || '').trim()

    if (!nombre || !email || !password || !adminPassword) {
      return jsonResponse(400, { ok: false, error: 'Faltan datos obligatorios' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return jsonResponse(400, { ok: false, error: 'Email inválido' })
    }

    if (password.length < 6) {
      return jsonResponse(400, {
        ok: false,
        error: 'La contraseña del administrador debe tener al menos 6 caracteres',
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse(401, { ok: false, error: 'Sesión inválida o expirada' })
    }

    console.log('[crear-admin] Usuario autenticado:', user.id)

    const { data: adminRow, error: adminRowError } = await adminClient
      .from('usuarios')
      .select('id, usuario_id, email, rol, nombre')
      .or(`id.eq.${user.id},usuario_id.eq.${user.id}`)
      .maybeSingle()

    if (adminRowError) {
      return jsonResponse(500, {
        ok: false,
        error: 'No se pudo validar el rol del usuario',
        detalle: adminRowError.message,
      })
    }

    if (!adminRow || adminRow.rol !== 'admin') {
      return jsonResponse(403, {
        ok: false,
        error: 'No tenés permisos para crear administradores',
      })
    }

    console.log('[crear-admin] Admin autorizado:', adminRow.id)

    const adminEmailForReauth = String(user.email || adminRow.email || '').trim()
    if (!adminEmailForReauth) {
      return jsonResponse(400, {
        ok: false,
        error: 'No se pudo validar la identidad del admin actual',
      })
    }

    const authValidationClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data: reauthData, error: reauthError } =
      await authValidationClient.auth.signInWithPassword({
        email: adminEmailForReauth,
        password: adminPassword,
      })

    const isWrongAdminPassword =
      !!reauthError || !reauthData?.user || reauthData.user.id !== user.id

    await authValidationClient.auth.signOut()

    if (isWrongAdminPassword) {
      return jsonResponse(401, {
        ok: false,
        error: 'La contraseña del admin actual es incorrecta',
      })
    }

    const { data: existingUsuario } = await adminClient
      .from('usuarios')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle()

    if (existingUsuario) {
      return jsonResponse(409, {
        ok: false,
        error: 'Ya existe un usuario con ese email',
      })
    }

    const { data: createdAuth, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nombre,
          telefono,
          rol: 'admin',
        },
      })

    if (createAuthError || !createdAuth.user) {
      const authErrorMessage = String(createAuthError?.message || '')
      const alreadyExistsInAuth =
        authErrorMessage.toLowerCase().includes('already') &&
        authErrorMessage.toLowerCase().includes('registered')
      return jsonResponse(400, {
        ok: false,
        error: alreadyExistsInAuth
          ? 'Ya existe un usuario con ese email'
          : createAuthError?.message || 'No se pudo crear el auth user',
        detalle: createAuthError?.message || null,
      })
    }

    const adminId = createdAuth.user.id
    console.log('[crear-admin] Auth user creado:', adminId)

    const { error: insertUsuarioError } = await adminClient
      .from('usuarios')
      .insert({
        id: adminId,
        usuario_id: adminId,
        nombre,
        email,
        telefono: telefono || null,
        rol: 'admin',
      })

    if (insertUsuarioError) {
      const mayNotHaveUsuarioIdColumn =
        insertUsuarioError.code === 'PGRST204' &&
        String(insertUsuarioError.message || '')
          .toLowerCase()
          .includes('usuario_id')
      if (mayNotHaveUsuarioIdColumn) {
        const { error: fallbackInsertError } = await adminClient
          .from('usuarios')
          .insert({
            id: adminId,
            nombre,
            email,
            telefono: telefono || null,
            rol: 'admin',
          })

        if (!fallbackInsertError) {
          return jsonResponse(200, {
            ok: true,
            message: 'Administrador creado correctamente',
            admin: {
              id: adminId,
              nombre,
              email,
              telefono: telefono || null,
              rol: 'admin',
            },
          })
        }
      }

      await adminClient.auth.admin.deleteUser(adminId)

      return jsonResponse(400, {
        ok: false,
        error:
          insertUsuarioError.message ||
          'No se pudo guardar el administrador en usuarios',
        detalle: insertUsuarioError.message,
      })
    }

    return jsonResponse(200, {
      ok: true,
      message: 'Administrador creado correctamente',
      admin: {
        id: adminId,
        nombre,
        email,
        telefono: telefono || null,
        rol: 'admin',
      },
    })
  } catch (error: any) {
    return jsonResponse(500, {
      ok: false,
      error: error?.message || 'Error interno del servidor',
    })
  }
})
