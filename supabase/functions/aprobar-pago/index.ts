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

function redondear(valor: number) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

type PagoPreview = {
  total_aplicado: number
  saldo_restante: number
  cuotas_impactadas: number[]
}

type ReglaMora = {
  tramo: string
  dias_desde: number
  dias_hasta: number | null
  porcentaje_diario: number
}

const REGLAS_MORA_DEFAULT: ReglaMora[] = [
  { tramo: 'gracia', dias_desde: 1, dias_hasta: 3, porcentaje_diario: 0 },
  { tramo: 'mora_normal', dias_desde: 4, dias_hasta: 10, porcentaje_diario: 1 },
  { tramo: 'mora_alta', dias_desde: 11, dias_hasta: null, porcentaje_diario: 2 },
]

function parseFechaLocal(fecha?: string | null) {
  if (!fecha) return null
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function calcularMoraCuota(saldo: number, fechaVto: string | null | undefined, hoy: Date, reglas: ReglaMora[]) {
  if (saldo <= 0) return 0
  const vto = parseFechaLocal(fechaVto)
  if (!vto) return 0
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const vtoLocal = new Date(vto.getFullYear(), vto.getMonth(), vto.getDate())
  const diasAtraso = Math.max(0, Math.floor((hoyLocal.getTime() - vtoLocal.getTime()) / 86400000))
  if (diasAtraso <= 0) return 0
  let porcentaje = 0
  for (const regla of reglas) {
    const desde = Math.max(1, Number(regla.dias_desde || 0))
    const hasta = regla.dias_hasta == null ? diasAtraso : Math.min(diasAtraso, Number(regla.dias_hasta || 0))
    if (hasta < desde) continue
    porcentaje += (hasta - desde + 1) * Number(regla.porcentaje_diario || 0)
  }
  return redondear((saldo * porcentaje) / 100)
}

async function calcularPreviewAplicacion(
  supabase: ReturnType<typeof createClient>,
  pago: { id: string; prestamo_id: string | null; cliente_id: string | null; monto: number | null; cuota_id?: string | null; created_at?: string | null },
) : Promise<PagoPreview> {
  if (!pago.prestamo_id || !pago.cliente_id) {
    return { total_aplicado: 0, saldo_restante: 0, cuotas_impactadas: [] }
  }

  const { data: cuotas, error } = await supabase
    .from('cuotas')
    .select('id, numero_cuota, monto_cuota, saldo_pendiente, estado, fecha_vencimiento')
    .eq('prestamo_id', pago.prestamo_id)
    .eq('cliente_id', pago.cliente_id)
    .in('estado', ['pendiente', 'parcial'])
    .order('numero_cuota', { ascending: true })

  if (error || !cuotas) {
    throw new Error(error?.message || 'No se pudieron leer cuotas para previsualizar pago')
  }

  const cuotaBase = pago.cuota_id
    ? cuotas.find((item) => item.id === pago.cuota_id)?.numero_cuota || 1
    : 1

  let restante = redondear(Number(pago.monto || 0))
  let totalAplicado = 0
  const cuotasImpactadas: number[] = []
  let reglasMora = REGLAS_MORA_DEFAULT
  const { data: configMoraRows, error: configMoraError } = await supabase
    .from('config_mora')
    .select('tramo, dias_desde, dias_hasta, porcentaje_diario, activo')
    .eq('activo', true)
    .order('dias_desde', { ascending: true })
  if (!configMoraError && configMoraRows && configMoraRows.length > 0) {
    reglasMora = (configMoraRows as any[]).map((item) => ({
      tramo: String(item?.tramo || ''),
      dias_desde: Number(item?.dias_desde || 0),
      dias_hasta: item?.dias_hasta == null ? null : Number(item?.dias_hasta),
      porcentaje_diario: Number(item?.porcentaje_diario || 0),
    }))
  }

  const cuotasFiltradas = cuotas.filter((item) => Number(item.numero_cuota || 0) >= cuotaBase)
  for (const cuota of cuotasFiltradas) {
    if (restante <= 0) break
    const saldo = redondear(Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0))
    if (saldo <= 0) continue
    const mora = cuotasImpactadas.length === 0
      ? calcularMoraCuota(
        saldo,
        (cuota as any).fecha_vencimiento || null,
        pago.created_at ? new Date(String(pago.created_at)) : new Date(),
        reglasMora
      )
      : 0
    const deudaConMora = redondear(saldo + mora)
    const aplicado = Math.min(restante, deudaConMora)
    if (aplicado <= 0) continue
    totalAplicado = redondear(totalAplicado + aplicado)
    restante = redondear(restante - aplicado)
    cuotasImpactadas.push(Number(cuota.numero_cuota))
    if (aplicado < saldo) break
  }

  const saldoOriginal = cuotasFiltradas.reduce(
    (acc, cuota) => acc + redondear(Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0)),
    0
  )
  const saldoRestante = redondear(Math.max(saldoOriginal - totalAplicado, 0))

  return {
    total_aplicado: totalAplicado,
    saldo_restante: Math.max(saldoRestante, 0),
    cuotas_impactadas: cuotasImpactadas,
  }
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
    const supabaseAdmin = supabase

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
    const pago_id = String(body?.pago_id || '').trim()
    const accion = String(body?.accion || '').trim().toLowerCase()
    const observacionRevision = String(body?.observacion_revision || '').trim() || null

    console.log('Metodo:', req.method)
    console.log('Accion:', accion)
    console.log('Pago:', pago_id)

    if (!pago_id || !['aprobar', 'rechazar'].includes(accion)) {
      return jsonResponse({ error: 'Input inválido. Requerido: pago_id y accion (aprobar|rechazar)' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, estado, impactado, metodo, monto, prestamo_id, cliente_id, cuota_id, created_at, dias_mora, porcentaje_mora, monto_mora, total_con_mora')
      .eq('id', pago_id)
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

      await supabase.from('actividad_sistema').insert({
        tipo: 'pago_rechazado',
        titulo: 'Pago rechazado',
        descripcion: `Se rechazó un pago ${pago.metodo || ''}`.trim(),
        entidad_tipo: 'pago',
        entidad_id: pago.id,
        usuario_id: user.id,
        prioridad: 'alta',
        visible_en_notificaciones: true,
        metadata: { actor_id: user.id, observacion: observacionRevision, route: '/pagos-pendientes' },
      })

      await supabase.from('notificaciones').insert({
        tipo: 'pago_rechazado',
        titulo: 'Pago rechazado',
        descripcion: `Se rechazó un pago ${pago.metodo || ''}`.trim(),
        pago_id: pago.id,
        metadata: { actor_id: user.id, observacion: observacionRevision },
      })

      return jsonResponse({ ok: true, estado: 'rechazado', pago_id: pago.id })
    }

    const { data: resultado, error: rpcError } = await supabaseAdmin.rpc('aprobar_pago_pendiente', {
      pago_id_input: pago_id,
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
        redirect_to: `/pago-aprobado?id=${pago_id}`,
        mora: {
          dias_mora: Number((pago as any).dias_mora || 0),
          porcentaje_mora: Number((pago as any).porcentaje_mora || 0),
          monto_mora: Number((pago as any).monto_mora || 0),
          total_con_mora: Number((pago as any).total_con_mora || pago.monto || 0),
        },
      })
    }

    if (!resultado?.ok) {
      const errorMsg = String(resultado?.error || 'No se pudo aprobar el pago')
      if (status === 'already_rejected' || status === 'invalid_state') {
        return jsonResponse({ error: errorMsg }, 409)
      }
      if (status === 'preview_mismatch') {
        return jsonResponse(
          {
            error: errorMsg,
            code: 'preview_mismatch',
            preview_esperado: resultado?.preview_esperado ?? null,
            impacto_real: resultado?.impacto_real_calculado ?? null,
          },
          409
        )
      }
      return jsonResponse({ error: errorMsg }, 400)
    }

    await supabase.from('actividad_sistema').insert({
      tipo: 'pago_aprobado',
      titulo: 'Pago aprobado',
      descripcion: 'Se aprobó un pago pendiente',
      entidad_tipo: 'pago',
      entidad_id: pago.id,
      usuario_id: user.id,
      prioridad: 'normal',
      visible_en_notificaciones: true,
      metadata: { actor_id: user.id, resultado, route: '/pagos-pendientes' },
    })

    await supabase.from('notificaciones').insert({
      tipo: 'pago_aprobado',
      titulo: 'Pago aprobado',
      descripcion: 'Se aprobó un pago pendiente',
      pago_id: pago.id,
      metadata: { actor_id: user.id, resultado },
    })

    return jsonResponse({
      ok: true,
      estado: 'aprobado',
      pago_id: pago.id,
      cuotas_impactadas: resultado?.cuotas_impactadas || [],
      total_aplicado: Number(resultado?.total_aplicado || 0),
      saldo_restante: Number(resultado?.saldo_restante || 0),
      prestamo_estado: resultado?.prestamo_estado || null,
      detalle_aplicacion: resultado?.detalle_aplicacion || [],
      redirect_to: `/pago-aprobado?id=${pago_id}`,
      mora: {
        dias_mora: Number((pago as any).dias_mora || 0),
        porcentaje_mora: Number((pago as any).porcentaje_mora || 0),
        monto_mora: Number((pago as any).monto_mora || 0),
        total_con_mora: Number((pago as any).total_con_mora || pago.monto || 0),
      },
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error interno' },
      500
    )
  }
})
