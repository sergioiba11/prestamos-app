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
  apellido: string | null
  telefono: string | null
  usuario_id: string | null
  usuarios?: { id?: string | null; email?: string | null } | Array<{ id?: string | null; email?: string | null }> | null
}

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/[.\s-]/g, '').replace(/\D/g, '')
}

function pickUsuario(row: ClienteRow) {
  if (!row.usuarios) return null
  return Array.isArray(row.usuarios) ? row.usuarios[0] ?? null : row.usuarios
}

async function findClienteByDni(adminClient: ReturnType<typeof createClient>, dni: string) {
  const exact = await adminClient
    .from('clientes')
    .select('id,dni,nombre,apellido,telefono,usuario_id,usuarios(id,email)')
    .eq('dni', dni)
    .maybeSingle<ClienteRow>()

  if (!exact.error && exact.data) {
    return exact.data
  }

  const fallback = await adminClient
    .from('clientes')
    .select('id,dni,nombre,apellido,telefono,usuario_id,usuarios(id,email)')
    .not('dni', 'is', null)
    .limit(5000)

  if (fallback.error || !fallback.data?.length) return null

  return fallback.data.find((row) => normalizeDni(row.dni) === dni) ?? null
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
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ ok: false, error: 'Configuración incompleta de Supabase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const dni = normalizeDni(body?.dni)

    if (dni.length < 7 || dni.length > 8) {
      return new Response(JSON.stringify({ ok: false, error: 'DNI inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let cliente = await findClienteByDni(adminClient, dni)

    let wasCreated = false

    if (!cliente) {
      const { data: created, error: insertError } = await adminClient
        .from('clientes')
        .insert({
          dni,
          nombre: `Cliente ${dni}`,
        })
        .select('id,dni,nombre,apellido,telefono,usuario_id,usuarios(id,email)')
        .single<ClienteRow>()

      if (insertError || !created) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No pudimos iniciar el registro del cliente.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      cliente = created
      wasCreated = true
    }

    const usuario = pickUsuario(cliente)
    const status = cliente.usuario_id ? 'active' : wasCreated ? 'new' : 'pending'

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        identity: {
          dni,
          nombre: cliente.nombre || `Cliente ${dni}`,
          apellido: cliente.apellido,
          telefono: cliente.telefono,
          email: usuario?.email || null,
          clienteId: cliente.id,
          usuarioId: cliente.usuario_id,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'No pudimos iniciar el registro.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
