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

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/[.\s-]/g, '').replace(/\D/g, '')
}

async function findClienteByDni(adminClient: ReturnType<typeof createClient>, dni: string) {
  const exact = await adminClient
    .from('clientes')
    .select('id,dni,nombre,telefono,usuario_id')
    .eq('dni', dni)
    .maybeSingle<ClienteRow>()

  if (!exact.error && exact.data) {
    return exact.data
  }

  const fallback = await adminClient
    .from('clientes')
    .select('id,dni,nombre,telefono,usuario_id')
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

    if (!cliente) {
      const { data: created, error: insertError } = await adminClient
        .from('clientes')
        .insert({
          dni,
          nombre: 'Cliente',
          telefono: null,
          usuario_id: null,
        })
        .select('id,dni,nombre,telefono,usuario_id')
        .maybeSingle<ClienteRow>()

      if (insertError || !created) {
        const retryCliente = await findClienteByDni(adminClient, dni)

        if (!retryCliente) {
          return new Response(
            JSON.stringify({ ok: false, error: 'No pudimos iniciar el registro del cliente.' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        cliente = retryCliente
      } else {
        cliente = created
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'new',
            cliente,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    if (cliente.usuario_id) {
      return new Response(JSON.stringify({ ok: true, status: 'active' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'existing',
        cliente,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'No pudimos iniciar el registro.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
