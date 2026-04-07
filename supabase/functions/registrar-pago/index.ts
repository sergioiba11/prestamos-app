import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CuotaRow = {
  id: string
  prestamo_id: string
  cliente_id: string
  numero_cuota: number
  monto_cuota: number | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  estado: string
}

type DetallePago = {
  cuota_id: string
  numero: number
  aplicado: number
}

type DenoLike = {
  env?: {
    get: (key: string) => string | undefined
  }
}

function getEnv(key: string): string | undefined {
  const denoGlobal = globalThis as typeof globalThis & { Deno?: DenoLike }
  return denoGlobal.Deno?.env?.get(key)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function redondear(valor: number): number {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

function normalizarMetodoPago(metodo: unknown): string {
  const valor = String(metodo || '').trim().toLowerCase()

  if (['mp', 'mercado_pago', 'mercado-pago'].includes(valor)) {
    return 'mercadopago'
  }

  if (['efectivo', 'transferencia', 'mercadopago'].includes(valor)) {
    return valor
  }

  return ''
}

function extraerTokenBearer(authHeader: string | null): string | null {
  if (!authHeader) return null

  const limpio = authHeader.trim()
  if (!limpio) return null

  if (limpio.toLowerCase().startsWith('bearer ')) {
    return limpio.slice(7).trim()
  }

  return limpio
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL')
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Faltan variables de entorno' }, 500)
    }

    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization')

    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse({ error: 'Token requerido' }, 401)
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Token inválido' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const body = await req.json()

    const prestamo_id = body?.prestamo_id as string | undefined
    const cliente_id = body?.cliente_id as string | undefined
    const metodo = normalizarMetodoPago(body?.metodo)
    const montoIngresado = redondear(Number(body?.monto))

    if (!prestamo_id || !cliente_id || !metodo) {
      return jsonResponse(
        { error: 'Faltan datos: prestamo_id, cliente_id y metodo' },
        400
      )
    }

    if (Number.isNaN(montoIngresado) || montoIngresado <= 0) {
      return jsonResponse({ error: 'Monto inválido' }, 400)
    }

    const { data: cuotas, error: cuotasError } = await supabase
      .from('cuotas')
      .select(
        'id, prestamo_id, cliente_id, numero_cuota, monto_cuota, monto_pagado, saldo_pendiente, estado'
      )
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasError) {
      return jsonResponse({ error: cuotasError.message }, 500)
    }

    const cuotasTipadas = (cuotas ?? []) as CuotaRow[]

    if (cuotasTipadas.length === 0) {
      return jsonResponse({ error: 'Sin cuotas pendientes' }, 400)
    }

    let restante = montoIngresado
    const detalle: DetallePago[] = []

    for (const cuota of cuotasTipadas) {
      if (restante <= 0) break

      const saldo = redondear(Number(cuota.saldo_pendiente || 0))
      if (saldo <= 0) continue

      const aplicar = redondear(Math.min(restante, saldo))
      const nuevoSaldo = redondear(saldo - aplicar)
      const nuevoPagado = redondear(Number(cuota.monto_pagado || 0) + aplicar)

      const { error: updateError } = await supabase
        .from('cuotas')
        .update({
          monto_pagado: nuevoPagado,
          saldo_pendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? 'pagada' : 'parcial',
          fecha_pago: new Date().toISOString(),
        })
        .eq('id', cuota.id)

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500)
      }

      detalle.push({
        cuota_id: cuota.id,
        numero: cuota.numero_cuota,
        aplicado: aplicar,
      })

      restante = redondear(restante - aplicar)
    }

    const totalAplicado = redondear(
      detalle.reduce(
        (acc: number, item: DetallePago) => acc + item.aplicado,
        0
      )
    )

    if (totalAplicado <= 0) {
      return jsonResponse({ error: 'No se pudo aplicar el pago' }, 400)
    }

    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto: totalAplicado,
        metodo,
        registrado_por: user.id,
      })
      .select()
      .single()

    if (pagoError) {
      return jsonResponse({ error: pagoError.message }, 500)
    }

    return jsonResponse({
      ok: true,
      pago,
      detalle,
      total_aplicado: totalAplicado,
      monto_ingresado: montoIngresado,
      vuelto: redondear(montoIngresado - totalAplicado),
    })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error interno'
    return jsonResponse({ error: mensaje }, 500)
  }
})