import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 🔑 CLIENTE CON JWT DEL USUARIO (ESTO SOLUCIONA TU ERROR)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    // 🔒 VALIDAR USUARIO
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 🧠 CLIENTE ADMIN (para escribir en DB)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { prestamo_id, cliente_id, monto, metodo } = await req.json()

    if (!prestamo_id || !cliente_id || !monto || !metodo) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const montoNumero = Number(monto)

    // obtener préstamo
    const { data: prestamo, error: prestamoError } = await supabaseAdmin
      .from('prestamos')
      .select('*')
      .eq('id', prestamo_id)
      .single()

    if (prestamoError || !prestamo) {
      return new Response(JSON.stringify({ error: 'Préstamo no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const deudaActual = Number(prestamo.total_a_pagar || 0)

    if (montoNumero > deudaActual) {
      return new Response(JSON.stringify({ error: 'Monto mayor a deuda' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const nuevoSaldo = deudaActual - montoNumero

    // guardar pago
    await supabaseAdmin.from('pagos').insert({
      prestamo_id,
      cliente_id,
      monto: montoNumero,
      metodo,
      creado_por: user.id,
    })

    // actualizar préstamo
    await supabaseAdmin
      .from('prestamos')
      .update({
        total_a_pagar: nuevoSaldo,
        estado: nuevoSaldo <= 0 ? 'pagado' : 'activo',
      })
      .eq('id', prestamo_id)

    return new Response(
      JSON.stringify({
        ok: true,
        saldo_restante: nuevoSaldo,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})