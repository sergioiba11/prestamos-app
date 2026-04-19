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
    const telefono = String(body?.telefono || '').trim()
    const direccion = String(body?.direccion || '').trim()
    const dni = String(body?.dni || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '').trim()

    if (!nombre || !email || !password) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Completá nombre, email y contraseña',
        }),
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
          error: 'La contraseña debe tener al menos 6 caracteres',
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

    console.log('USER VALIDATION:', { userId: user?.id, userError })

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

    console.log('ADMIN ROW:', { adminRow, adminRowError })

    if (adminRowError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo validar el rol del usuario',
          detalle: adminRowError.message,
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
          error: 'No tenés permisos para crear clientes',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: existingUsuario, error: existingUsuarioError } =
      await adminClient
        .from('usuarios')
        .select('id, email')
        .eq('email', email)
        .maybeSingle()

    console.log('EXISTING USUARIO:', {
      existingUsuario,
      existingUsuarioError,
    })

    if (existingUsuarioError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo verificar si el email ya existe',
          detalle: existingUsuarioError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

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

    console.log('INTENTANDO CREAR AUTH USER:', { nombre, email })

    const { data: createdAuth, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nombre,
          rol: 'cliente',
        },
      })

    console.log('RESULTADO CREATE USER:', {
      createdAuth,
      createAuthError,
    })

    if (createAuthError || !createdAuth.user) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: createAuthError?.message || 'No se pudo crear el auth user',
          detalle: createAuthError,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const clienteId = createdAuth.user.id

    console.log('INTENTANDO INSERT EN USUARIOS:', {
      id: clienteId,
      nombre,
      email,
      telefono,
      direccion,
      dni,
      rol: 'cliente',
    })

    const { error: insertUsuarioError } = await adminClient
  .from('usuarios')
  .insert({
    id: clienteId,
    nombre,
    email,
    rol: 'cliente',
  })

console.log('RESULTADO INSERT USUARIOS:', {
  insertUsuarioError,
})

if (insertUsuarioError) {
  await adminClient.auth.admin.deleteUser(clienteId)

  return new Response(
    JSON.stringify({
      ok: false,
      error:
        insertUsuarioError.message ||
        'No se pudo guardar el cliente en usuarios',
      detalle: insertUsuarioError,
    }),
    {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

const { error: insertClienteError } = await adminClient
  .from('clientes')
  .insert({
    usuario_id: clienteId,
    nombre,
    telefono: telefono || null,
    direccion: direccion || null,
    dni: dni || null,
  })

console.log('RESULTADO INSERT CLIENTES:', {
  insertClienteError,
})

if (!insertClienteError) {
  await adminClient.from('notificaciones').insert({
    tipo: 'nuevo_cliente',
    titulo: 'Nuevo cliente creado',
    descripcion: `Se creó el cliente ${nombre}`,
    cliente_id: clienteId,
    metadata: { creado_por: user.id },
  })
}

if (insertClienteError) {
  await adminClient.from('usuarios').delete().eq('id', clienteId)
  await adminClient.auth.admin.deleteUser(clienteId)

  return new Response(
    JSON.stringify({
      ok: false,
      error:
        insertClienteError.message ||
        'No se pudo guardar el cliente en clientes',
      detalle: insertClienteError,
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
        message: 'Cliente creado correctamente',
        cliente: {
          id: clienteId,
          nombre,
          email,
          telefono,
          direccion,
          dni,
          rol: 'cliente',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.log('ERROR INTERNO CREAR CLIENTE:', error)

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