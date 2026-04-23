import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Faltan variables de entorno' }, 500)

    const body = await req.json().catch(() => ({}))
    const pagoId = String(body?.pago_id || '').trim()
    const actorId = String(body?.actor_id || '').trim() || null
    const observacion = String(body?.observacion_revision || '').trim() || null

    if (!pagoId) return jsonResponse({ error: 'pago_id requerido' }, 400)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id,estado,metodo')
      .eq('id', pagoId)
      .maybeSingle()

    if (pagoError) return jsonResponse({ error: pagoError.message }, 500)
    if (!pago) return jsonResponse({ error: 'Pago no encontrado' }, 404)

    const { data: rejected, error: rejectError } = await supabase
      .from('pagos')
      .update({
        estado: 'rechazado',
        estado_validacion: 'rechazado',
        observacion_validacion: observacion,
        rechazado_at: new Date().toISOString(),
        rechazado_por: actorId,
      })
      .eq('id', pagoId)
      .select('id')
      .maybeSingle()

    if (rejectError) return jsonResponse({ error: rejectError.message }, 500)
    if (!rejected) return jsonResponse({ error: 'No se pudo rechazar el pago' }, 409)

    await supabase.from('actividad_sistema').insert({
      tipo: 'pago_rechazado',
      titulo: 'Pago rechazado',
      descripcion: `Se rechazó un pago ${pago.metodo || ''}`.trim(),
      entidad_tipo: 'pago',
      entidad_id: pagoId,
      usuario_id: actorId,
      prioridad: 'alta',
      visible_en_notificaciones: true,
      metadata: { actor_id: actorId, observacion, route: '/pagos-pendientes' },
    })

    await supabase.from('notificaciones').insert({
      tipo: 'pago_rechazado',
      titulo: 'Pago rechazado',
      descripcion: `Se rechazó un pago ${pago.metodo || ''}`.trim(),
      pago_id: pagoId,
      metadata: { actor_id: actorId, observacion },
    })

    return jsonResponse({ ok: true, pago_id: pagoId, estado: 'rechazado' })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})
