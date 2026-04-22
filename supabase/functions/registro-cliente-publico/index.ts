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

type RollbackState = {
  userId: string | null
  insertedUsuario: boolean
  clienteId: string | null
  createdCliente: boolean
  previousCliente: ClienteRow | null
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function businessError(error: string, code: string) {
  return jsonResponse({ ok: false, error, code }, 200)
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
    return jsonResponse({ ok: true, code: 'OPTIONS_OK' }, 200)
  }

  if (req.method !== 'POST') {
    console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'ERROR',
      message: 'Método no permitido',
      code: 'METHOD_NOT_ALLOWED',
    })
    return businessError('Método no permitido', 'METHOD_NOT_ALLOWED')
  }

  const rollback: RollbackState = {
    userId: null,
    insertedUsuario: false,
    clienteId: null,
    createdCliente: false,
    previousCliente: null,
  }

  const runRollback = async (context: string, state: RollbackState) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey || !state.userId) return

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'rollback_compensatorio',
      status: 'OK',
      message: 'Iniciando rollback compensatorio',
      context,
      hasInsertedUsuario: state.insertedUsuario,
      hasClienteId: Boolean(state.clienteId),
      createdCliente: state.createdCliente,
    })

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (state.insertedUsuario) {
      const { error: deleteUsuarioError } = await admin.from('usuarios').delete().eq('id', state.userId)
      if (deleteUsuarioError) {
        console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
          stage: 'rollback_compensatorio',
          status: 'ERROR',
          message: 'Falló eliminación en usuarios durante rollback',
          detail: deleteUsuarioError.message,
        })
      }
    }

    if (state.clienteId) {
      if (state.createdCliente) {
        const { error: deleteClienteError } = await admin.from('clientes').delete().eq('id', state.clienteId)
        if (deleteClienteError) {
          console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
            stage: 'rollback_compensatorio',
            status: 'ERROR',
            message: 'Falló eliminación de cliente creado durante rollback',
            detail: deleteClienteError.message,
          })
        }
      } else {
        const { error: restoreClienteError } = await admin
          .from('clientes')
          .update({
            usuario_id: state.previousCliente?.usuario_id ?? null,
            nombre: state.previousCliente?.nombre ?? null,
            telefono: state.previousCliente?.telefono ?? null,
            dni: state.previousCliente?.dni ?? null,
          })
          .eq('id', state.clienteId)

        if (restoreClienteError) {
          console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
            stage: 'rollback_compensatorio',
            status: 'ERROR',
            message: 'Falló restauración de cliente existente durante rollback',
            detail: restoreClienteError.message,
          })
        }
      }
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(state.userId)
    if (deleteAuthError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'rollback_compensatorio',
        status: 'ERROR',
        message: 'Falló eliminación en Auth durante rollback',
        detail: deleteAuthError.message,
      })
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'rollback_compensatorio',
      status: 'OK',
      message: 'Rollback compensatorio finalizado',
      context,
    })
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
      return businessError('Faltan variables de entorno de Supabase.', 'MISSING_ENV')
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
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
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_correo',
        status: 'ERROR',
        message: 'Correo ya registrado',
        code: 'EMAIL_ALREADY_REGISTERED',
      })
      return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'chequeo_duplicado_correo_auth',
      status: 'OK',
      message: 'Verificando correo en Auth antes de createUser',
    })
    const { data: authDuplicatedEmail, error: authDuplicatedEmailError } = await supabase.auth.admin.getUserByEmail(email)

    if (authDuplicatedEmailError) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_correo_auth',
        status: 'ERROR',
        message: 'Error al verificar correo en Auth',
        detail: authDuplicatedEmailError.message,
      })
      throw new Error(authDuplicatedEmailError.message)
    }

    if (authDuplicatedEmail?.user?.id) {
      console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'chequeo_duplicado_correo_auth',
        status: 'ERROR',
        message: 'Correo ya registrado en Auth',
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
        return businessError('No se pudo crear el cliente base.', 'CLIENTE_CREATE_FAILED')
      }

      cliente = created
      rollback.createdCliente = true
      console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
        stage: 'insercion_clientes',
        status: 'OK',
        message: 'Cliente base creado',
      })
    }

    rollback.clienteId = cliente.id
    rollback.previousCliente = {
      id: cliente.id,
      dni: cliente.dni,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      usuario_id: cliente.usuario_id,
    }

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
        code: 'AUTH_CREATE_FAILED',
      })
      return businessError('No se pudo crear la cuenta', 'AUTH_CREATE_FAILED')
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
      await runRollback('insercion_usuarios', rollback)
      return businessError('No se pudo crear el usuario interno.', 'USUARIOS_INSERT_FAILED')
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
      await runRollback('vinculacion_clientes', rollback)
      return businessError('No se pudo vincular el cliente.', 'CLIENTE_UPDATE_FAILED')
    }

    console.log('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'OK',
      message: 'Registro completado correctamente',
      code: 'REGISTER_OK',
    })
    return jsonResponse({ ok: true, userId: authData.user.id, clienteId: cliente.id })
  } catch (err: any) {
    console.error('ERROR_REGISTRO', err)
    console.error('REGISTRO_CLIENTE_PUBLICO_UNHANDLED', {
      message: err?.message || 'Unhandled error',
      stack: err?.stack || null,
    })

    try {
      await runRollback('catch_unhandled', rollback)
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

    console.error('REGISTRO_CLIENTE_PUBLICO_STAGE', {
      stage: 'respuesta_final',
      status: 'ERROR',
      message: 'Error interno no controlado',
      code: 'INTERNAL_ERROR',
    })
    return jsonResponse({ ok: false, error: 'Error interno del servidor', code: 'INTERNAL_ERROR' }, 500)
  }
})
