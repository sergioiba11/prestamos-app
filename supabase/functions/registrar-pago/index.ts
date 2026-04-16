import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.6.0'

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

function redondear(valor: number) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

function esMontoCerrado(valor: number) {
  return Math.abs(Number(valor || 0)) <= 0.009
}

function normalizarMetodoPago(metodo: unknown) {
  const valor = String(metodo || '').trim().toLowerCase()

  if (valor === 'mp' || valor === 'mercado_pago' || valor === 'mercado-pago') {
    return 'mercadopago'
  }

  if (
    valor === 'efectivo' ||
    valor === 'transferencia' ||
    valor === 'mercadopago'
  ) {
    return valor
  }

  return ''
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

function formatearMonto(valor: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

function escaparHtml(valor: unknown) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function construirHtmlTicketPago(data: {
  clienteNombre: string
  prestamoId: string
  pagoId: string
  montoAplicado: number
  montoIngresado: number
  vuelto: number
  saldoRestante: number
  metodo: string
  fechaPago: string
  cuotasImpactadas: number[]
  proximaCuotaTexto: string
}) {
  const cuotasTexto = data.cuotasImpactadas.length
    ? data.cuotasImpactadas.map((n) => `#${n}`).join(', ')
    : 'No informado'

  return `
    <div style="font-family: Arial, sans-serif; background: #020817; padding: 24px; color: #F8FAFC;">
      <h1 style="color: #22C55E; margin: 0 0 20px 0; font-size: 24px;">✅ Pago aprobado</h1>
      <div style="background: #0F172A; border-radius: 16px; padding: 20px; border: 1px solid #1E293B;">
        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Cliente</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${escaparHtml(
          data.clienteNombre
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Monto pagado</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${formatearMonto(
          data.montoAplicado
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Monto ingresado</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${formatearMonto(
          data.montoIngresado
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Vuelto</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${formatearMonto(
          data.vuelto
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Método</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${escaparHtml(
          data.metodo
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Fecha</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${escaparHtml(
          data.fechaPago
        )}</p>

        <p style="margin: 0 0 10px 0; color: #94A3B8; font-size: 13px;">Saldo restante</p>
        <p style="margin: 0 0 14px 0; color: #F8FAFC; font-size: 18px; font-weight: 700;">${formatearMonto(
          data.saldoRestante
        )}</p>

        <hr style="border: 0; border-top: 1px solid #1E293B; margin: 12px 0;" />

        <p style="margin: 0 0 8px 0; color: #94A3B8; font-size: 13px;">Cuotas impactadas</p>
        <p style="margin: 0 0 12px 0; color: #E2E8F0; font-size: 15px; font-weight: 600;">${escaparHtml(
          cuotasTexto
        )}</p>

        <p style="margin: 0 0 8px 0; color: #94A3B8; font-size: 13px;">Próxima cuota pendiente</p>
        <p style="margin: 0 0 12px 0; color: #E2E8F0; font-size: 15px; font-weight: 600;">${escaparHtml(
          data.proximaCuotaTexto
        )}</p>

        <p style="margin: 0 0 8px 0; color: #94A3B8; font-size: 13px;">ID préstamo</p>
        <p style="margin: 0 0 12px 0; color: #E2E8F0; font-size: 15px; font-weight: 600;">${escaparHtml(
          data.prestamoId
        )}</p>

        <p style="margin: 0 0 8px 0; color: #94A3B8; font-size: 13px;">ID pago</p>
        <p style="margin: 0; color: #E2E8F0; font-size: 15px; font-weight: 600;">${escaparHtml(
          data.pagoId
        )}</p>
      </div>
    </div>
  `
}

function extraerEmailValido(valor: string | null | undefined) {
  const raw = String(valor || '').trim()
  if (!raw) return ''
  const match = raw.match(/<([^>]+)>/)
  const email = (match?.[1] || raw).trim().toLowerCase()
  const esValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return esValido ? email : ''
}

async function sendEmail({
  to,
  subject,
  html,
  label,
}: {
  to: string
  subject: string
  html: string
  label: 'cliente' | 'admin'
}) {
  console.log(`[registrar-pago] sendEmail ejecutándose para ${label}`)
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const remitente =
    Deno.env.get('RESEND_FROM_EMAIL') || Deno.env.get('FACTURAS_FROM_EMAIL')
  const fromEmail = extraerEmailValido(remitente)
  const toEmail = extraerEmailValido(to)

  if (!resendApiKey || !fromEmail || !toEmail) {
    console.error(`[registrar-pago] ${label} no enviado: faltan datos`, {
      has_api_key: Boolean(resendApiKey),
      from_value: remitente || null,
      from_email_valido: fromEmail || null,
      to_recibido: to || null,
      to_email_valido: toEmail || null,
    })
    return {
      sent: false,
      error:
        'No se envió correo: faltan RESEND_API_KEY o emails válidos en from/to',
      id: null,
      resend_response: null,
    }
  }

  try {
    // Payload compatible con Resend (exactamente from, to, subject, html)
    const payload: {
      from: string
      to: string
      subject: string
      html: string
    } = {
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const rawText = await res.text()

    if (!res.ok) {
      console.error(`[registrar-pago] ${label} fallo Resend`, {
        status: res.status,
        response: rawText,
        from: payload.from,
        to: payload.to,
      })
      return {
        sent: false,
        error: `Resend HTTP ${res.status}`,
        id: null,
        resend_response: rawText,
      }
    }

    let parsed: { id?: string } | null = null
    try {
      parsed = rawText ? JSON.parse(rawText) : null
    } catch {
      parsed = null
    }

    return { sent: true, error: null, id: parsed?.id || null, resend_response: rawText }
  } catch (error) {
    console.error(`[registrar-pago] ${label} excepción enviando correo`, error)
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
      id: null,
      resend_response: null,
    }
  }
}

async function sendPaymentReceiptToClient({
  clienteEmail,
  html,
}: {
  clienteEmail: string
  html: string
}) {
  return sendEmail({
    to: clienteEmail,
    subject: 'Pago recibido correctamente',
    html,
    label: 'cliente',
  })
}

async function sendPaymentReceiptToAdmin({
  adminEmail,
  clienteNombre,
  clienteEmail,
  montoAplicado,
  fechaPago,
  cuotasImpactadas,
  prestamoId,
  pagoId,
}: {
  adminEmail: string
  clienteNombre: string
  clienteEmail: string
  montoAplicado: number
  fechaPago: string
  cuotasImpactadas: number[]
  prestamoId: string
  pagoId: string
}) {
  const cuotasTexto = cuotasImpactadas.length
    ? cuotasImpactadas.map((cuota) => `#${cuota}`).join(', ')
    : 'Sin cuotas'

  const html = `
    <div style="font-family: Arial, sans-serif; background: #020817; padding: 24px; color: #F8FAFC;">
      <h1 style="color: #22C55E; margin: 0 0 20px 0; font-size: 24px;">Nuevo pago registrado</h1>
      <div style="background: #0F172A; border-radius: 16px; padding: 20px; border: 1px solid #1E293B;">
        <p><strong>Cliente:</strong> ${escaparHtml(clienteNombre)}</p>
        <p><strong>Email cliente:</strong> ${escaparHtml(clienteEmail || 'Sin email')}</p>
        <p><strong>Monto:</strong> ${escaparHtml(formatearMonto(montoAplicado))}</p>
        <p><strong>Fecha:</strong> ${escaparHtml(fechaPago)}</p>
        <p><strong>Cuotas impactadas:</strong> ${escaparHtml(cuotasTexto)}</p>
        <p><strong>ID préstamo:</strong> ${escaparHtml(prestamoId)}</p>
        <p><strong>ID pago:</strong> ${escaparHtml(pagoId)}</p>
      </div>
    </div>
  `

  return sendEmail({
    to: adminEmail,
    subject: 'Nuevo pago registrado',
    html,
    label: 'admin',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          error: 'Faltan variables de entorno en la función',
          detalle: {
            hasUrl: Boolean(supabaseUrl),
            hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
          },
        },
        500
      )
    }

    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization')
    console.log('[registrar-pago] Authorization header presente:', Boolean(authHeader))
    console.log('[registrar-pago] Authorization header (masked):', ocultar(authHeader))

    const token = extraerTokenBearer(authHeader)

    if (!token) {
      return jsonResponse(
        {
          error: 'Authorization header inválido',
          detalle: 'Debe venir como: Bearer TOKEN',
        },
        401
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    console.log('[registrar-pago] Resultado getUser userError:', userError?.message || null)
    console.log('[registrar-pago] Resultado getUser user:', user || null)

    if (userError || !user) {
      return jsonResponse(
        {
          error: 'Token inválido o usuario no autenticado',
          detalle: userError?.message || null,
        },
        401
      )
    }

    const body = await req.json()
    const debug = {
      has_api_key: Boolean(Deno.env.get('RESEND_API_KEY')),
      has_from_email: Boolean(
        Deno.env.get('RESEND_FROM_EMAIL') || Deno.env.get('FACTURAS_FROM_EMAIL')
      ),
      admin_email: null as string | null,
      cliente_email: null as string | null,
      resend_response_cliente: null as string | null,
      resend_response_admin: null as string | null,
    }

    const prestamo_id = body?.prestamo_id
    const cliente_id = body?.cliente_id
    const cuota_id_inicial = body?.cuota_id || null
    const numero_cuota_inicial = body?.numero_cuota || null
    const metodo = normalizarMetodoPago(body?.metodo)
    const montoEntregado = redondear(
      Number(body?.monto_entregado ?? body?.monto_ingresado ?? body?.monto)
    )
    const aplicarAMultiples = body?.aplicar_a_multiples !== false

    if (!prestamo_id || !cliente_id || !metodo) {
      return jsonResponse(
        {
          error: 'Faltan datos obligatorios: prestamo_id, cliente_id, metodo',
        },
        400
      )
    }

    if (Number.isNaN(montoEntregado) || montoEntregado <= 0) {
      return jsonResponse({ error: 'Monto inválido' }, 400)
    }

    const { data: prestamo, error: prestamoError } = await supabase
      .from('prestamos')
      .select('id, cliente_id, estado')
      .eq('id', prestamo_id)
      .single()

    if (prestamoError || !prestamo) {
      return jsonResponse({ error: 'Préstamo no encontrado' }, 404)
    }

    if (prestamo.cliente_id !== cliente_id) {
      return jsonResponse(
        { error: 'El préstamo no pertenece al cliente enviado' },
        400
      )
    }

    const { data: cuotasPendientes, error: cuotasError } = await supabase
      .from('cuotas')
      .select(`
        id,
        prestamo_id,
        cliente_id,
        numero_cuota,
        monto_cuota,
        monto_pagado,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasError) {
      return jsonResponse({ error: cuotasError.message }, 500)
    }

    if (!cuotasPendientes || cuotasPendientes.length === 0) {
      return jsonResponse(
        { error: 'El préstamo no tiene cuotas pendientes' },
        400
      )
    }

    let cuotasAProcesar = cuotasPendientes

    if (cuota_id_inicial) {
      const index = cuotasPendientes.findIndex((c) => c.id === cuota_id_inicial)

      if (index === -1) {
        return jsonResponse(
          {
            error:
              'La cuota seleccionada no pertenece a ese préstamo o no está pendiente',
          },
          404
        )
      }

      if (
        numero_cuota_inicial &&
        Number(numero_cuota_inicial) !==
          Number(cuotasPendientes[index].numero_cuota)
      ) {
        return jsonResponse(
          {
            error: 'El número de cuota no coincide con la cuota seleccionada',
          },
          400
        )
      }

      cuotasAProcesar = cuotasPendientes.slice(index)
    }

    let restante = montoEntregado
    const cuotasImpactadas: number[] = []
    const detalleAplicacion: Array<{
      cuota_id: string
      numero_cuota: number
      monto_aplicado: number
      saldo_cuota_antes: number
      saldo_cuota_despues: number
      estado_resultante: string
    }> = []

    for (const cuota of cuotasAProcesar) {
      if (restante <= 0) break

      const saldoAnterior = redondear(
        Number(cuota.saldo_pendiente ?? cuota.monto_cuota ?? 0)
      )
      const pagadoAnterior = redondear(Number(cuota.monto_pagado ?? 0))

      if (saldoAnterior <= 0) continue

      const montoAplicado = redondear(
        aplicarAMultiples
          ? Math.min(restante, saldoAnterior)
          : Math.min(montoEntregado, saldoAnterior)
      )

      if (montoAplicado <= 0) continue

      const nuevoSaldo = redondear(saldoAnterior - montoAplicado)
      const nuevoMontoPagado = redondear(pagadoAnterior + montoAplicado)
      const nuevoEstado = esMontoCerrado(nuevoSaldo) ? 'pagada' : 'parcial'
      const saldoPersistido = esMontoCerrado(nuevoSaldo) ? 0 : nuevoSaldo

      const { error: updateCuotaError } = await supabase
        .from('cuotas')
        .update({
          monto_pagado: nuevoMontoPagado,
          saldo_pendiente: saldoPersistido,
          estado: nuevoEstado,
          fecha_pago: new Date().toISOString(),
        })
        .eq('id', cuota.id)

      if (updateCuotaError) {
        return jsonResponse({ error: updateCuotaError.message }, 500)
      }

      cuotasImpactadas.push(Number(cuota.numero_cuota))
      detalleAplicacion.push({
        cuota_id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        monto_aplicado: montoAplicado,
        saldo_cuota_antes: saldoAnterior,
        saldo_cuota_despues: saldoPersistido,
        estado_resultante: nuevoEstado,
      })

      restante = aplicarAMultiples ? redondear(restante - montoAplicado) : 0

      if (!esMontoCerrado(saldoPersistido)) {
        // Regla de negocio: si la cuota quedó parcial, no avanzar a la siguiente.
        restante = 0
        break
      }
    }

    const totalAplicado = redondear(
      detalleAplicacion.reduce(
        (acc, item) => acc + Number(item.monto_aplicado || 0),
        0
      )
    )

    if (totalAplicado <= 0) {
      return jsonResponse(
        { error: 'No se pudo aplicar el pago a ninguna cuota' },
        400
      )
    }

    const vuelto = redondear(montoEntregado - totalAplicado)

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

    if (pagoError || !pago) {
      return jsonResponse(
        { error: pagoError?.message || 'No se pudo crear el pago' },
        500
      )
    }

    const detalleRows = detalleAplicacion.map((item) => ({
      pago_id: pago.id,
      cuota_id: item.cuota_id,
      prestamo_id,
      cliente_id,
      numero_cuota: item.numero_cuota,
      monto_aplicado: item.monto_aplicado,
      saldo_cuota_antes: item.saldo_cuota_antes,
      saldo_cuota_despues: item.saldo_cuota_despues,
    }))

    const { error: detalleError } = await supabase
      .from('pagos_detalle')
      .insert(detalleRows)

    if (detalleError) {
      return jsonResponse({ error: detalleError.message }, 500)
    }

    const { data: cuotasRestantes, error: cuotasRestantesError } = await supabase
      .from('cuotas')
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        monto_pagado,
        saldo_pendiente,
        estado,
        fecha_vencimiento
      `)
      .eq('prestamo_id', prestamo_id)
      .eq('cliente_id', cliente_id)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (cuotasRestantesError) {
      return jsonResponse({ error: cuotasRestantesError.message }, 500)
    }

    const saldoRestante = redondear(
      (cuotasRestantes || []).reduce(
        (acc, item) => acc + Number(item.saldo_pendiente || 0),
        0
      )
    )

    const nuevoEstadoPrestamo = saldoRestante <= 0 ? 'pagado' : 'activo'

    const { error: updatePrestamoError } = await supabase
      .from('prestamos')
      .update({
        estado: nuevoEstadoPrestamo,
      })
      .eq('id', prestamo_id)

    if (updatePrestamoError) {
      return jsonResponse({ error: updatePrestamoError.message }, 500)
    }

    const proximaCuota = cuotasRestantes?.[0] || null
    const estadoComprobante =
      detalleAplicacion.some((item) => item.estado_resultante === 'parcial') ? 'PARCIAL' : 'COMPLETO'
    const cuotaActualizada =
      detalleAplicacion.length > 0
        ? {
            cuota_id: detalleAplicacion[0].cuota_id,
            numero_cuota: detalleAplicacion[0].numero_cuota,
            saldo_despues: detalleAplicacion[0].saldo_cuota_despues,
            estado: detalleAplicacion[0].estado_resultante,
          }
        : null

    const { data: clienteData } = await supabase
      .from('clientes')
      .select('id, nombre, usuario_id, email')
      .eq('id', cliente_id)
      .maybeSingle()

    const clienteNombre = String(clienteData?.nombre || 'Cliente')
    const clienteUsuarioId = clienteData?.usuario_id || cliente_id
    console.log('[registrar-pago] Cliente data completo:', clienteData || null)

    const { data: usuarioClienteData } = await supabase
      .from('usuarios')
      .select('email')
      .eq('id', clienteUsuarioId)
      .maybeSingle()

    const clienteEmail = String(clienteData?.email || usuarioClienteData?.email || '')
      .trim()
      .toLowerCase()
    let adminEmail = String(user.email || '')
      .trim()
      .toLowerCase()
    if (!adminEmail) {
      const { data: adminUsuarioData } = await supabase
        .from('usuarios')
        .select('email')
        .eq('id', user.id)
        .maybeSingle()
      adminEmail = String(adminUsuarioData?.email || '')
        .trim()
        .toLowerCase()
    }
    debug.admin_email = adminEmail || null
    debug.cliente_email = clienteEmail || null

    const fechaPago = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const proximaCuotaTexto = proximaCuota
      ? `Cuota #${proximaCuota.numero_cuota} - Saldo ${formatearMonto(
          Number(proximaCuota.saldo_pendiente || proximaCuota.monto_cuota || 0)
        )}`
      : 'No informada'

    const htmlTicket = construirHtmlTicketPago({
      clienteNombre,
      prestamoId: String(prestamo_id),
      pagoId: String(pago.id),
      montoAplicado: totalAplicado,
      montoIngresado: montoEntregado,
      vuelto,
      saldoRestante,
      metodo,
      fechaPago,
      cuotasImpactadas,
      proximaCuotaTexto,
    })

    const resultadoCorreoCliente: { sent: boolean; error: string | null; id?: string | null } = {
      sent: false,
      error: 'Sin destinatario',
    }
    const resultadoCorreoAdmin: { sent: boolean; error: string | null; id?: string | null } = {
      sent: false,
      error: 'Sin destinatario',
    }

    if (clienteEmail) {
      try {
        const envioCliente = await sendPaymentReceiptToClient({
          clienteEmail,
          html: htmlTicket,
        })
        resultadoCorreoCliente.sent = envioCliente.sent
        resultadoCorreoCliente.error = envioCliente.error
        resultadoCorreoCliente.id = envioCliente.id
        debug.resend_response_cliente = envioCliente.resend_response
      } catch (error) {
        resultadoCorreoCliente.sent = false
        resultadoCorreoCliente.error =
          error instanceof Error ? error.message : 'Error desconocido al enviar correo cliente'
        console.error('[registrar-pago] Error inesperado correo cliente:', error)
      }
    } else {
      resultadoCorreoCliente.sent = false
      resultadoCorreoCliente.error = 'Cliente sin email'
      console.warn(
        `[registrar-pago] No se enviará correo al cliente para pago ${pago.id}: cliente sin email`
      )
    }

    if (adminEmail) {
      try {
        const envioAdmin = await sendPaymentReceiptToAdmin({
          adminEmail,
          clienteNombre,
          clienteEmail,
          montoAplicado: totalAplicado,
          fechaPago,
          cuotasImpactadas,
          prestamoId: String(prestamo_id),
          pagoId: String(pago.id),
        })
        resultadoCorreoAdmin.sent = envioAdmin.sent
        resultadoCorreoAdmin.error = envioAdmin.error
        resultadoCorreoAdmin.id = envioAdmin.id
        debug.resend_response_admin = envioAdmin.resend_response
      } catch (error) {
        resultadoCorreoAdmin.sent = false
        resultadoCorreoAdmin.error =
          error instanceof Error ? error.message : 'Error desconocido al enviar correo admin'
        console.error('[registrar-pago] Error inesperado correo admin:', error)
      }
    } else {
      resultadoCorreoAdmin.sent = false
      resultadoCorreoAdmin.error = 'Admin logueado sin email'
      console.warn(
        `[registrar-pago] No se enviará correo al admin para pago ${pago.id}: admin sin email`
      )
    }

    return jsonResponse({
      ok: true,
      pago,
      cuotas_impactadas: cuotasImpactadas,
      cuotas_impactadas_detalle: detalleAplicacion.map((item) => ({
        numero_cuota: item.numero_cuota,
        estado: item.estado_resultante,
        monto_aplicado: item.monto_aplicado,
        saldo_antes: item.saldo_cuota_antes,
        saldo_despues: item.saldo_cuota_despues,
      })),
      detalle_aplicacion: detalleAplicacion,
      estado_comprobante: estadoComprobante,
      total_aplicado: totalAplicado,
      monto_ingresado: montoEntregado,
      monto_entregado: montoEntregado,
      vuelto,
      saldo_restante: saldoRestante,
      cuota_actualizada: cuotaActualizada,
      proxima_cuota: proximaCuota,
      prestamo_estado: nuevoEstadoPrestamo,
      factura_email_cliente: resultadoCorreoCliente,
      factura_email_admin: resultadoCorreoAdmin,
      debug,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Error interno',
      },
      500
    )
  }
})
