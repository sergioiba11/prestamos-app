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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function businessError(error: string, code: string, status = 200) {
  return jsonResponse({ ok: false, error, code }, status)
}

function normalizeDni(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizePhoneAR(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length !== 10) return ''
  return `+549${digits}`
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

Deno.serve(async (req) => {
  console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
    stage: 'inicio_funcion',
    status: 'OK',
    message: 'Invocación recibida',
    method: req.method,
  })

  if (req.method === 'OPTIONS') {
    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'OK',
      message: 'Preflight OPTIONS respondido',
      code: 'OPTIONS_OK',
    })
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'ERROR',
      message: 'Método no permitido',
      code: 'METHOD_NOT_ALLOWED',
    })
    return jsonResponse({ ok: false, error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' }, 405)
  }

  const rollback = {
    userId: null as string | null,
    insertedUsuario: false,
    clienteId: null as string | null,
  }

  try {
    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'lectura_validacion_body',
      status: 'OK',
      message: 'Iniciando lectura de body',
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'lectura_validacion_body',
        status: 'ERROR',
        message: 'Variables de entorno faltantes',
        code: 'MISSING_ENV',
      })
      return jsonResponse({ ok: false, error: 'Faltan variables de entorno de Supabase.', code: 'MISSING_ENV' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const dni = normalizeDni(body?.dni)
    const nombre = String(body?.nombre ?? '').trim() || 'Cliente'
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const telefono = normalizePhoneAR(body?.telefono)
    const clienteId = body?.clienteId ? String(body.clienteId) : null

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'lectura_validacion_body',
      status: 'OK',
      message: 'Body leído y normalizado',
      hasClienteId: Boolean(clienteId),
    })

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'validacion_nombre',
      status: 'OK',
      message: 'Nombre normalizado',
      nombreLength: nombre.length,
    })

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'validacion_dni',
      status: 'OK',
      message: 'Validando formato de DNI',
      dniLength: dni.length,
    })
    if (dni.length < 7 || dni.length > 8) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'validacion_dni',
        status: 'ERROR',
        message: 'DNI inválido',
        code: 'DNI_INVALID',
      })
      return businessError('DNI inválido. Debe tener 7 u 8 dígitos.', 'DNI_INVALID')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'validacion_email',
      status: 'OK',
      message: 'Validando formato de correo',
    })
    if (!isValidEmail(email)) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'validacion_email',
        status: 'ERROR',
        message: 'Correo inválido',
        code: 'EMAIL_INVALID',
      })
      return businessError('Ingresá un correo válido.', 'EMAIL_INVALID')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'validacion_password',
      status: 'OK',
      message: 'Validando longitud de contraseña',
      passwordLength: password.length,
    })
    if (password.length < 8) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'validacion_password',
        status: 'ERROR',
        message: 'Contraseña demasiado corta',
        code: 'PASSWORD_TOO_SHORT',
      })
      return businessError('La contraseña debe tener al menos 8 caracteres.', 'PASSWORD_TOO_SHORT')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'validacion_telefono',
      status: 'OK',
      message: 'Validando formato de teléfono',
    })
    if (!/^\+549\d{10}$/.test(telefono)) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'validacion_telefono',
        status: 'ERROR',
        message: 'Teléfono inválido',
        code: 'PHONE_INVALID',
      })
      return businessError('Teléfono inválido. Debe ser de Argentina (+549...).', 'PHONE_INVALID')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let cliente: ClienteRow | null = null

    if (clienteId) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_dni',
        status: 'OK',
        message: 'Buscando cliente por clienteId',
      })
      const { data } = await supabase
        .from('clientes')
        .select('id,dni,nombre,telefono,usuario_id')
        .eq('id', clienteId)
        .maybeSingle<ClienteRow>()
      if (data && normalizeDni(data.dni) === dni) cliente = data
    }

    if (!cliente) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_dni',
        status: 'OK',
        message: 'Buscando cliente por DNI normalizado',
      })
      const { data } = await supabase.from('clientes').select('id,dni,nombre,telefono,usuario_id').not('dni', 'is', null)
      const rows = (data || []) as ClienteRow[]
      cliente = rows.find((row) => normalizeDni(row.dni) === dni) || null
    }

    if (cliente?.usuario_id) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_dni',
        status: 'ERROR',
        message: 'DNI ya vinculado a usuario',
        code: 'DNI_ALREADY_REGISTERED',
      })
      return businessError('Ese DNI ya pertenece a un cliente.', 'DNI_ALREADY_REGISTERED')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'chequeo_duplicado_dni',
      status: 'OK',
      message: 'Chequeo de DNI completado',
    })

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'chequeo_duplicado_correo',
      status: 'OK',
      message: 'Verificando correo en usuarios',
    })
    const { data: duplicatedEmail, error: duplicatedEmailError } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (duplicatedEmailError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_correo',
        status: 'ERROR',
        message: 'Error al verificar correo duplicado',
        detail: duplicatedEmailError.message,
      })
      throw new Error(duplicatedEmailError.message)
    }

    if (duplicatedEmail?.id) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_correo',
        status: 'ERROR',
        message: 'Correo ya registrado',
        code: 'EMAIL_ALREADY_REGISTERED',
      })
      return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'chequeo_duplicado_correo',
      status: 'OK',
      message: 'Chequeo de correo completado',
    })

    if (!cliente) {
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'insercion_clientes',
        status: 'OK',
        message: 'Creando cliente base sin usuario',
      })
      const { data: created, error: createClienteError } = await supabase
        .from('clientes')
        .insert({ dni, nombre, telefono, usuario_id: null })
        .select('id,dni,nombre,telefono,usuario_id')
        .maybeSingle<ClienteRow>()

      if (createClienteError || !created) {
        console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
          stage: 'insercion_clientes',
          status: 'ERROR',
          message: 'Falló creación inicial de cliente',
          detail: createClienteError?.message || 'No se pudo crear el cliente.',
        })
        throw new Error(createClienteError?.message || 'No se pudo crear el cliente.')
      }

      cliente = created
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'insercion_clientes',
        status: 'OK',
        message: 'Cliente base creado',
      })
    }

    rollback.clienteId = cliente.id

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'creacion_auth_user',
      status: 'OK',
      message: 'Creando usuario auth',
    })
    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        dni,
        rol: 'cliente',
      },
    })

    if (createAuthError || !authData.user) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'creacion_auth_user',
        status: 'ERROR',
        message: 'Falló createUser en Auth',
        detail: createAuthError?.message || 'Usuario auth no creado',
      })
      const authMessage = String(createAuthError?.message || '').toLowerCase()
      if (authMessage.includes('already') || authMessage.includes('registered') || authMessage.includes('exists')) {
        console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
          stage: 'respuesta_final',
          status: 'ERROR',
          message: 'Error de negocio por correo duplicado en Auth',
          code: 'EMAIL_ALREADY_REGISTERED',
        })
        return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
      }
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'respuesta_final',
        status: 'ERROR',
        message: 'No se pudo crear el usuario de acceso',
        code: 'AUTH_USER_CREATE_FAILED',
      })
      return jsonResponse({ ok: false, error: 'No se pudo crear el usuario de acceso.', code: 'AUTH_USER_CREATE_FAILED' }, 500)
    }

    rollback.userId = authData.user.id

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'insercion_usuarios',
      status: 'OK',
      message: 'Insertando fila en usuarios',
    })
    const { error: usuarioError } = await supabase.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol: 'cliente',
    })

    if (usuarioError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'insercion_usuarios',
        status: 'ERROR',
        message: 'Falló inserción en usuarios',
        detail: usuarioError.message,
      })
      throw new Error(usuarioError.message)
    }
    rollback.insertedUsuario = true

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'vinculacion_clientes',
      status: 'OK',
      message: 'Actualizando cliente con usuario_id',
    })
    const { error: clienteUpdateError } = await supabase
      .from('clientes')
      .update({
        usuario_id: authData.user.id,
        nombre,
        telefono,
        dni,
      })
      .eq('id', cliente.id)

    if (clienteUpdateError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'vinculacion_clientes',
        status: 'ERROR',
        message: 'Falló vinculación en clientes',
        detail: clienteUpdateError.message,
      })
      throw new Error(clienteUpdateError.message)
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'OK',
      message: 'Registro completado correctamente',
      code: 'REGISTER_OK',
    })
    return jsonResponse({ ok: true, userId: authData.user.id, clienteId: cliente.id })
  } catch (error: any) {
    console.error('REGISTRO_CLIENTE_PUBLICO_UNHANDLED', {
      message: error?.message || 'Unhandled error',
      stack: error?.stack || null,
    })

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceRoleKey && rollback.userId) {
        console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
          stage: 'rollback_compensatorio',
          status: 'OK',
          message: 'Iniciando rollback compensatorio',
          hasInsertedUsuario: rollback.insertedUsuario,
          hasClienteId: Boolean(rollback.clienteId),
        })
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        if (rollback.insertedUsuario) {
          await admin.from('usuarios').delete().eq('id', rollback.userId)
        }

        if (rollback.clienteId) {
          await admin
            .from('clientes')
            .update({ usuario_id: null })
            .eq('id', rollback.clienteId)
        }

        await admin.auth.admin.deleteUser(rollback.userId)
        console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
          stage: 'rollback_compensatorio',
          status: 'OK',
          message: 'Rollback compensatorio finalizado',
        })
      }
    } catch (rollbackError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'rollback_compensatorio',
        status: 'ERROR',
        message: 'Error durante rollback compensatorio',
        detail:
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
      })
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'ERROR',
      message: 'Error interno no controlado',
      code: 'INTERNAL_ERROR',
    })
    return jsonResponse({ ok: false, error: 'No se pudo completar el registro', code: 'INTERNAL_ERROR' }, 500)
  }
})
