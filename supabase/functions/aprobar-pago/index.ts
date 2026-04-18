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

function extraerTokenBearer(authHeader: string | null) {
  if (!authHeader) return null
  const limpio = authHeader.trim()
  if (!limpio) return null
  if (limpio.toLowerCase().startsWith('bearer ')) {
    return limpio.slice(7).trim()
  }
  return limpio
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno de Supabase' }, 500)
    }

    const token = extraerTokenBearer(req.headers.get('Authorization'))

    if (!token) {
      return jsonResponse({ error: 'Authorization header requerido' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido o usuario no autenticado' }, 401)
    }

    const { data: usuarioRol, error: rolError } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', user.id)
      .maybeSingle()

    if (rolError) {
      return jsonResponse({ error: rolError.message }, 500)
    }

    if (!usuarioRol || !['admin', 'empleado'].includes(String(usuarioRol.rol || '').toLowerCase())) {
      return jsonResponse({ error: 'No autorizado para aprobar/rechazar pagos' }, 403)
    }

    const body = await req.json()
    const pagoId = String(body?.pago_id || '').trim()
    const accion = String(body?.accion || '').trim().toLowerCase()
    const observacionRevision = String(body?.observacion_revision || '').trim() || null

    if (!pagoId || !['aprobar', 'rechazar'].includes(accion)) {
      return jsonResponse({ error: 'Input inválido. Requerido: pago_id y accion (aprobar|rechazar)' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, estado, impactado, metodo')
      .eq('id', pagoId)
      .maybeSingle()

    if (pagoError) {
      return jsonResponse({ error: pagoError.message }, 500)
    }

    if (!pago) {
      return jsonResponse({ error: 'Pago no encontrado' }, 404)
    }

    if (accion === 'rechazar') {
      if (pago.estado === 'aprobado' || pago.impactado) {
        return jsonResponse({ error: 'El pago ya está aprobado y no puede rechazarse.' }, 409)
      }

      if (pago.estado === 'rechazado') {
        return jsonResponse({ ok: true, estado: 'rechazado', pago_id: pago.id, idempotente: true })
      }

      const { data: pagoRechazado, error: rechazarError } = await supabase
        .from('pagos')
        .update({
          estado: 'rechazado',
          rechazado_por: user.id,
          rechazado_at: new Date().toISOString(),
          observacion_revision: observacionRevision,
          impactado: false,
        })
        .eq('id', pago.id)
        .eq('estado', 'pendiente_aprobacion')
        .eq('impactado', false)
        .select('id')
        .maybeSingle()

      if (rechazarError) {
        return jsonResponse({ error: rechazarError.message }, 500)
      }
      if (!pagoRechazado) {
        return jsonResponse({ error: 'El pago ya no está pendiente para rechazar.' }, 409)
      }

      await supabase.from('pagos_logs').insert({
        pago_id: pago.id,
        accion: 'rechazar',
        actor_id: user.id,
        detalle: { metodo: pago.metodo, estado_anterior: pago.estado },
      })

      return jsonResponse({ ok: true, estado: 'rechazado', pago_id: pago.id })
    }

    const { data: resultado, error: rpcError } = await supabase.rpc('aprobar_pago_pendiente', {
      p_pago_id: pago.id,
      p_actor_id: user.id,
      p_observacion: observacionRevision,
    })

    if (rpcError) {
      return jsonResponse({ error: rpcError.message }, 500)
    }

    const status = String(resultado?.status || '')

    if (status === 'already_approved') {
      return jsonResponse({
        ok: true,
        estado: 'aprobado',
        pago_id: pago.id,
        idempotente: true,
        saldo_restante: Number(resultado?.saldo_restante || 0),
      })
    }

    if (!resultado?.ok) {
      const errorMsg = String(resultado?.error || 'No se pudo aprobar el pago')
      if (status === 'already_rejected' || status === 'invalid_state') {
        return jsonResponse({ error: errorMsg }, 409)
      }
      return jsonResponse({ error: errorMsg }, 400)
    }

    return jsonResponse({
      ok: true,
      estado: 'aprobado',
      pago_id: pago.id,
      cuotas_impactadas: resultado?.cuotas_impactadas || [],
      total_aplicado: Number(resultado?.total_aplicado || 0),
      saldo_restante: Number(resultado?.saldo_restante || 0),
      prestamo_estado: resultado?.prestamo_estado || null,
      detalle_aplicacion: resultado?.detalle_aplicacion || [],
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error interno' },
      500
    )
  }
})
