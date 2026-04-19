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
  return String(value ?? '').replace(/\D/g, '')
}

async function fetchClienteByNormalizedDni(
  supabase: ReturnType<typeof createClient>,
  cleanDni: string
): Promise<ClienteRow | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('id,dni,nombre,telefono,usuario_id')
    .not('dni', 'is', null)

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data || []) as ClienteRow[]
  return rows.find((row) => normalizeDni(row.dni) === cleanDni) || null
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const cleanDni = normalizeDni(body?.dni)

    if (cleanDni.length < 7 || cleanDni.length > 8) {
      return jsonResponse({ ok: false, error: 'DNI inválido' }, 400)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let cliente = await fetchClienteByNormalizedDni(supabase, cleanDni)

    if (!cliente) {
      const { data: created, error: createError } = await supabase
        .from('clientes')
        .insert({
          dni: cleanDni,
          nombre: 'Cliente',
          telefono: null,
          usuario_id: null,
        })
        .select('id,dni,nombre,telefono,usuario_id')
        .maybeSingle<ClienteRow>()

      if (createError || !created) {
        console.error('[iniciar-registro] error creating cliente:', createError)

        // Evita duplicados por carrera: si otro proceso lo creó, lo buscamos de nuevo.
        const retry = await fetchClienteByNormalizedDni(supabase, cleanDni)
        if (!retry) {
          throw new Error(createError?.message || 'No se pudo crear el cliente para ese DNI.')
        }
        cliente = retry
      } else {
        cliente = created
        return jsonResponse({
          ok: true,
          status: 'new',
          cliente,
        })
      }
    }

    const status = cliente.usuario_id ? 'active' : 'existing'

    return jsonResponse({
      ok: true,
      status,
      cliente,
    })
  } catch (error: any) {
    console.error('[iniciar-registro] fatal error:', error)

    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'No pudimos iniciar el registro.',
      },
      500
    )
  }
})
