import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('REGISTRAR-PAGO HIT')

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Método no permitido' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Faltan variables de entorno de Supabase',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const authHeader = req.headers.get('Authorization')
    console.log('AUTH HEADER PRESENTE:', !!authHeader)

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta token de autorización' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    console.log('USER VALIDATION:', { userId: user?.id, userError })

    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Sesión inválida o expirada' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: usuario, error: usuarioError } = await adminClient
      .from('usuarios')
      .select('id, rol, nombre, email')
      .eq('id', user.id)
      .maybeSingle()

    console.log('USUARIO ROW:', { usuario, usuarioError })

    if (usuarioError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo validar el rol del usuario',
          detalle: usuarioError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'empleado')) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No tenés permisos para registrar pagos',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const body = await req.json()
    console.log('BODY:', body)

    const prestamo_id = String(body?.prestamo_id || '').trim()
    const cliente_id = String(body?.cliente_id || '').trim()
    const metodo = String(body?.metodo || '').trim()
    const monto = Number(body?.monto)

    if (!prestamo_id || !cliente_id || !metodo || !monto) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan datos obligatorios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (Number.isNaN(monto) || monto <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El monto debe ser mayor a 0' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: prestamo, error: prestamoError } = await adminClient
      .from('prestamos')
      .select('id, cliente_id, total_a_pagar, estado')
      .eq('id', prestamo_id)
      .maybeSingle()

    console.log('PRESTAMO:', { prestamo, prestamoError })

    if (prestamoError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo buscar el préstamo',
          detalle: prestamoError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!prestamo) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Préstamo no existe' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (String(prestamo.cliente_id) !== cliente_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Cliente incorrecto. Esperado: ${prestamo.cliente_id} / Recibido: ${cliente_id}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const deudaActual = Number(prestamo.total_a_pagar || 0)

    if (deudaActual <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El préstamo ya está saldado' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (monto > deudaActual) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Pago mayor a deuda' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const nuevoSaldo = Number((deudaActual - monto).toFixed(2))
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'activo'

    const { data: pagoInsertado, error: pagoError } = await adminClient
      .from('pagos')
      .insert({
        prestamo_id,
        cliente_id,
        monto,
        metodo,
        fecha_pago: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    console.log('PAGO INSERTADO:', { pagoInsertado, pagoError })

    if (pagoError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo registrar el pago',
          detalle: pagoError.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { error: updateError } = await adminClient
      .from('prestamos')
      .update({
        total_a_pagar: nuevoSaldo,
        estado: nuevoEstado,
      })
      .eq('id', prestamo_id)

    console.log('UPDATE PRESTAMO:', { updateError, nuevoSaldo, nuevoEstado })

    if (updateError) {
      if (pagoInsertado?.id) {
        await adminClient.from('pagos').delete().eq('id', pagoInsertado.id)
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No se pudo actualizar el préstamo',
          detalle: updateError.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Pago registrado correctamente',
        pago: pagoInsertado,
        prestamo_actualizado: {
          id: prestamo_id,
          total_a_pagar: nuevoSaldo,
          estado: nuevoEstado,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.log('ERROR INTERNO REGISTRAR-PAGO:', error)

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Error interno del servidor',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})