import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_TOKEN')
    const token = req.headers.get('x-webhook-token')

    if (secret && token !== secret) {
      return jsonResponse({ error: 'Webhook no autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json()
    const preferenceId = String(body?.mp_preference_id || body?.data?.id || '').trim()

    if (!preferenceId) {
      return jsonResponse({ error: 'Falta mp_preference_id' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, estado, metodo, impactado')
      .eq('mp_preference_id', preferenceId)
      .eq('metodo', 'mercado_pago')
      .maybeSingle()

    if (pagoError) return jsonResponse({ error: pagoError.message }, 500)
    if (!pago) return jsonResponse({ error: 'Pago no encontrado para esa preferencia' }, 404)
    if (pago.estado === 'aprobado' || pago.estado === 'rechazado') {
      return jsonResponse({ ok: true, estado: pago.estado, pago_id: pago.id })
    }

    const { error: pagoUpdateError } = await supabase
      .from('pagos')
      .update({
        estado: 'pendiente_aprobacion',
        impactado: false,
      })
      .eq('id', pago.id)

    if (pagoUpdateError) return jsonResponse({ error: pagoUpdateError.message }, 500)

    await supabase.from('pagos_logs').insert({
      pago_id: pago.id,
      accion: 'webhook_mp_confirmado_pendiente_revision',
      detalle: { mp_preference_id: preferenceId },
    })
    return jsonResponse({
      ok: true,
      pago_id: pago.id,
      estado: 'pendiente_aprobacion',
      impactado: false,
      requiere_validacion_admin: true,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
