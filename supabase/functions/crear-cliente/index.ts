import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Faltan variables de entorno en la función" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace("Bearer ", "").trim()

    if (!token) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const body = await req.json()

    const nombre = body?.nombre?.trim?.() || ""
    const telefono = body?.telefono?.trim?.() || ""
    const direccion = body?.direccion?.trim?.() || ""
    const dni = body?.dni?.trim?.() || ""
    const email = body?.email?.trim?.().toLowerCase?.() || ""
    const password = body?.password?.trim?.() || ""

    if (!nombre || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Completá nombre, email y contraseña" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Sesión inválida o expirada. Volvé a iniciar sesión como admin.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { data: usuarioActual, error: rolError } = await supabaseAdmin
      .from("usuarios")
      .select("id, rol")
      .eq("id", user.id)
      .single()

    if (rolError || !usuarioActual) {
      return new Response(
        JSON.stringify({ error: "No se pudo verificar el rol del usuario" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    if (usuarioActual.rol !== "admin") {
      return new Response(
        JSON.stringify({ error: "Solo un admin puede crear clientes" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { data: usuariosAuth, error: listError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      return new Response(
        JSON.stringify({ error: `No se pudo verificar usuarios auth: ${listError.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const yaExiste = usuariosAuth.users.find(
      (u) => (u.email || "").toLowerCase() === email
    )

    if (yaExiste) {
      return new Response(
        JSON.stringify({ error: "Ese email ya está registrado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { data: nuevoAuth, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nombre,
          rol: "cliente",
        },
      })

    if (createUserError) {
      return new Response(
        JSON.stringify({
          error: createUserError.message || "No se pudo crear el usuario auth",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const userId = nuevoAuth.user?.id

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "No se pudo obtener el id del usuario creado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { error: errorUsuario } = await supabaseAdmin
      .from("usuarios")
      .insert({
        id: userId,
        nombre,
        email,
        rol: "cliente",
      })

    if (errorUsuario) {
      await supabaseAdmin.auth.admin.deleteUser(userId)

      return new Response(
        JSON.stringify({ error: `Error en usuarios: ${errorUsuario.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const { data: clienteInsertado, error: errorCliente } = await supabaseAdmin
      .from("clientes")
      .insert({
        nombre,
        telefono: telefono || null,
        direccion: direccion || null,
        dni: dni || null,
        usuario_id: userId,
      })
      .select()
      .single()

    if (errorCliente) {
      await supabaseAdmin.from("usuarios").delete().eq("id", userId)
      await supabaseAdmin.auth.admin.deleteUser(userId)

      return new Response(
        JSON.stringify({ error: `Error en clientes: ${errorCliente.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Cliente creado correctamente",
        user_id: userId,
        cliente: clienteInsertado,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})