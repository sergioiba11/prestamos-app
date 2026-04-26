import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan variables de entorno de Supabase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta token de autorización' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    const { data: userData, error: getUserError } = await userClient.auth.getUser(token)
    const currentUser = userData?.user

    if (getUserError || !currentUser) {
      return new Response(JSON.stringify({ ok: false, error: 'Sesión inválida o expirada' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: currentUserRow, error: currentUserRowError } = await adminClient
      .from('usuarios')
      .select('rol')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (currentUserRowError) {
      return new Response(JSON.stringify({ ok: false, error: 'No se pudo validar el rol actual' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!currentUserRow || String(currentUserRow.rol || '').toLowerCase() !== 'admin') {
      return new Response(JSON.stringify({ ok: false, error: 'No tenés permisos para crear administradores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const nombre = String(body?.nombre || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const telefonoRaw = String(body?.telefono || '').trim()
    const password = String(body?.password || '').trim()

    if (!nombre || !email || !password) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan datos obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!email.includes('@')) {
      return new Response(JSON.stringify({ ok: false, error: 'Email inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ ok: false, error: 'La contraseña temporal debe tener al menos 6 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: existingUsuario } = await adminClient
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUsuario) {
      return new Response(JSON.stringify({ ok: false, error: 'Ya existe un usuario con ese email' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        rol: 'admin',
      },
    })

    const createdUser = createdAuth?.user
    if (createAuthError || !createdUser) {
      return new Response(JSON.stringify({ ok: false, error: createAuthError?.message || 'No se pudo crear el usuario en Auth' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: insertUsuarioError } = await adminClient.from('usuarios').insert({
      id: createdUser.id,
      nombre,
      email,
      telefono: telefonoRaw || null,
      rol: 'admin',
    })

    if (insertUsuarioError) {
      await adminClient.auth.admin.deleteUser(createdUser.id)
      return new Response(JSON.stringify({ ok: false, error: insertUsuarioError.message || 'No se pudo registrar el admin en usuarios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      message: 'Administrador creado correctamente',
      admin: {
        id: createdUser.id,
        nombre,
        email,
        telefono: telefonoRaw || null,
        rol: 'admin',
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error?.message || 'Error interno del servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
