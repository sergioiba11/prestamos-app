import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Método no permitido' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Faltan variables de entorno de Supabase',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta token de autorización' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const body = await req.json()
    const nombre = String(body?.nombre || '').trim()
    const email = String(body?.email || '')
      .trim()
      .toLowerCase()
    const password = String(body?.password || '').trim()
    const adminPassword = String(body?.adminPassword || '').trim()
    const telefono = String(body?.telefono || '').trim()

    if (!nombre) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El nombre es obligatorio' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Email inválido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'La contraseña del administrador debe tener al menos 6 caracteres',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!adminPassword) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'La contraseña del admin actual es obligatoria',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
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
      return new Response(
        JSON.stringify({ ok: false, error: 'Sesión inválida o expirada' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[crear-admin] Usuario autenticado:', user.id)

    const { data: adminRow, error: adminRowError } = await adminClient
      .from('usuarios')
      .select('id, email, rol, nombre')
      .eq('id', user.id)
      .maybeSingle()

    if (adminRowError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo validar el rol del usuario',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!adminRow || adminRow.rol !== 'admin') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No tenés permisos para crear administradores',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[crear-admin] Admin autorizado:', adminRow.id)

    const adminEmailForReauth = String(user.email || adminRow.email || '').trim()
    if (!adminEmailForReauth) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo validar la identidad del admin actual',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
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
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'La contraseña del admin actual es incorrecta',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: existingUsuario } = await adminClient
      .from('usuarios')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (existingUsuario) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Ya existe un usuario con ese email',
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
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
      return new Response(
        JSON.stringify({
          ok: false,
          error: createAuthError?.message || 'No se pudo crear el auth user',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const adminId = createdAuth.user.id
    console.log('[crear-admin] Auth user creado:', adminId)

    const { error: insertUsuarioError } = await adminClient
      .from('usuarios')
      .insert({
        id: adminId,
        nombre,
        email,
        telefono: telefono || null,
        rol: 'admin',
      })

    if (insertUsuarioError) {
      await adminClient.auth.admin.deleteUser(adminId)

      return new Response(
        JSON.stringify({
          ok: false,
          error:
            insertUsuarioError.message ||
            'No se pudo guardar el administrador en usuarios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Administrador creado correctamente',
        admin: {
          id: adminId,
          nombre,
          email,
          telefono: telefono || null,
          rol: 'admin',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Error interno del servidor',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
