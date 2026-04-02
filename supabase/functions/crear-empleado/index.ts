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

    if (!nombre || !email || !password || !adminPassword) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan datos obligatorios' }),
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
          error: 'La contraseña del empleado debe tener al menos 6 caracteres',
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
          error: 'No tenés permisos para crear empleados',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!adminRow.email) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'El admin no tiene email registrado en usuarios',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const reauthClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: reauthError } = await reauthClient.auth.signInWithPassword({
      email: adminRow.email,
      password: adminPassword,
    })

    if (reauthError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'La contraseña del admin es incorrecta',
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
          rol: 'empleado',
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

    const empleadoId = createdAuth.user.id

    const { error: insertUsuarioError } = await adminClient
      .from('usuarios')
      .insert({
        id: empleadoId,
        nombre,
        email,
        rol: 'empleado',
      })

    if (insertUsuarioError) {
      await adminClient.auth.admin.deleteUser(empleadoId)

      return new Response(
        JSON.stringify({
          ok: false,
          error:
            insertUsuarioError.message ||
            'No se pudo guardar el empleado en usuarios',
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
        message: 'Empleado creado correctamente',
        empleado: {
          id: empleadoId,
          nombre,
          email,
          rol: 'empleado',
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