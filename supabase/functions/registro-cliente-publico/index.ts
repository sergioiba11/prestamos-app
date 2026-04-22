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

type LogContext = {
  step: string
  message: string
  email?: string | null
  dni?: string | null
  code?: string
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

function logInfo(ctx: LogContext) {
  console.log(ctx.step, {
    step: ctx.step,
    message: ctx.message,
    email: ctx.email ?? null,
    dni: ctx.dni ?? null,
    ...(ctx.code ? { code: ctx.code } : {}),
  })
}

function logError(ctx: LogContext) {
  console.error(ctx.step, {
    step: ctx.step,
    message: ctx.message,
    email: ctx.email ?? null,
    dni: ctx.dni ?? null,
    ...(ctx.code ? { code: ctx.code } : {}),
  })
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
  let logEmail: string | null = null
  let logDni: string | null = null

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

    if (!supabaseUrl || !serviceRoleKey) {
      logError({
        step: 'ROLLBACK_ERROR',
        message: `Rollback omitido (${context}) por estado incompleto`,
        email: logEmail,
        dni: logDni,
        code: 'ROLLBACK_SKIPPED',
      })
      return
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
      if (state.insertedUsuario) {
        const { error: deleteUsuarioError } = await admin.from('usuarios').delete().eq('id', state.userId)
        if (deleteUsuarioError) {
          console.error('ROLLBACK_DELETE_USUARIO_ERROR', deleteUsuarioError)
          throw deleteUsuarioError
        }
      }

      if (state.clienteId) {
        if (state.createdCliente) {
          const { error: deleteClienteError } = await admin.from('clientes').delete().eq('id', state.clienteId)
          if (deleteClienteError) {
            console.error('ROLLBACK_DELETE_CLIENTE_ERROR', deleteClienteError)
            throw deleteClienteError
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
            console.error('ROLLBACK_RESTORE_CLIENTE_ERROR', restoreClienteError)
            throw restoreClienteError
          }
        }
      }

      if (state.userId) {
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(state.userId)
        if (deleteAuthError) {
          console.error('ROLLBACK_DELETE_AUTH_ERROR', deleteAuthError)
          throw deleteAuthError
        }
      }

      logInfo({
        step: 'ROLLBACK_OK',
        message: `Rollback completado (${context})`,
        email: logEmail,
        dni: logDni,
      })
    } catch (rollbackErr) {
      logError({
        step: 'ROLLBACK_ERROR',
        message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        email: logEmail,
        dni: logDni,
        code: 'ROLLBACK_FAILED',
      })
    }
  }

  try {
    logInfo({ step: 'FUNCTION_START', message: 'Inicio de registro-cliente-publico', email: null, dni: null })

    if (req.method === 'OPTIONS') {
      return jsonResponse({ ok: true, code: 'OPTIONS_OK' }, 200)
    }

    if (req.method !== 'POST') {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Método no permitido',
        email: null,
        dni: null,
        code: 'METHOD_NOT_ALLOWED',
      })
      return businessError('Método no permitido', 'METHOD_NOT_ALLOWED')
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Body inválido o JSON malformado',
        email: null,
        dni: null,
        code: 'INVALID_JSON',
      })
      return businessError('Body inválido. Enviá JSON válido.', 'INVALID_JSON')
    }

    const dni = normalizeDni((body as Record<string, unknown>)?.dni)
    const nombre = String((body as Record<string, unknown>)?.nombre ?? '').trim() || 'Cliente'
    const email = String((body as Record<string, unknown>)?.email ?? '').trim().toLowerCase()
    const password = String((body as Record<string, unknown>)?.password ?? '')
    const telefono = normalizePhoneAR((body as Record<string, unknown>)?.telefono)
    const clienteId = (body as Record<string, unknown>)?.clienteId
      ? String((body as Record<string, unknown>).clienteId)
      : null

    logEmail = email || null
    logDni = dni || null

    logInfo({
      step: 'BODY_PARSED',
      message: 'Body parseado correctamente',
      email: logEmail,
      dni: logDni,
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Faltan variables de entorno',
        email: logEmail,
        dni: logDni,
        code: 'MISSING_ENV',
      })
      return businessError('Servicio no disponible en este momento.', 'MISSING_ENV')
    }

    logInfo({ step: 'ENV_OK', message: 'Variables de entorno presentes', email: logEmail, dni: logDni })

    if (dni.length < 7 || dni.length > 8) {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'DNI inválido',
        email: logEmail,
        dni: logDni,
        code: 'DNI_INVALID',
      })
      return businessError('DNI inválido. Debe tener 7 u 8 dígitos.', 'DNI_INVALID')
    }

    if (!isValidEmail(email)) {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Correo inválido',
        email: logEmail,
        dni: logDni,
        code: 'EMAIL_INVALID',
      })
      return businessError('Ingresá un correo válido.', 'EMAIL_INVALID')
    }

    if (password.length < 8) {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Contraseña demasiado corta',
        email: logEmail,
        dni: logDni,
        code: 'PASSWORD_TOO_SHORT',
      })
      return businessError('La contraseña debe tener al menos 8 caracteres.', 'PASSWORD_TOO_SHORT')
    }

    if (!/^\+549\d{10}$/.test(telefono)) {
      logError({
        step: 'VALIDATION_ERROR',
        message: 'Teléfono inválido',
        email: logEmail,
        dni: logDni,
        code: 'PHONE_INVALID',
      })
      return businessError('Teléfono inválido. Debe ser de Argentina (+549...).', 'PHONE_INVALID')
    }

    logInfo({ step: 'VALIDATION_OK', message: 'Validaciones de entrada superadas', email: logEmail, dni: logDni })

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let cliente: ClienteRow | null = null

    try {
      if (clienteId) {
        const { data, error } = await supabase
          .from('clientes')
          .select('id,dni,nombre,telefono,usuario_id')
          .eq('id', clienteId)
          .maybeSingle<ClienteRow>()
        if (error) {
          console.error('DUPLICATE_DNI_STEP_ERROR', error)
          throw error
        }
        if (data && normalizeDni(data.dni) === dni) cliente = data
      }

      if (!cliente) {
        const { data, error } = await supabase.from('clientes').select('id,dni,nombre,telefono,usuario_id').not('dni', 'is', null)
        if (error) {
          console.error('DUPLICATE_DNI_STEP_ERROR', error)
          throw error
        }
        const rows = (data || []) as ClienteRow[]
        cliente = rows.find((row) => normalizeDni(row.dni) === dni) || null
      }

      if (cliente?.usuario_id) {
        logError({
          step: 'DUPLICATE_DNI_CHECK_ERROR',
          message: 'DNI ya registrado',
          email: logEmail,
          dni: logDni,
          code: 'DNI_ALREADY_REGISTERED',
        })
        return businessError('Ese DNI ya pertenece a un cliente.', 'DNI_ALREADY_REGISTERED')
      }

      logInfo({
        step: 'DUPLICATE_DNI_CHECK_OK',
        message: 'Chequeo de DNI completado',
        email: logEmail,
        dni: logDni,
      })
    } catch (err) {
      logError({
        step: 'DUPLICATE_DNI_CHECK_ERROR',
        message: err instanceof Error ? err.message : String(err),
        email: logEmail,
        dni: logDni,
        code: 'DNI_CHECK_FAILED',
      })
      throw err
    }

    try {
      const { data: duplicatedEmail, error: duplicatedEmailError } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (duplicatedEmailError) {
        console.error('DUPLICATE_EMAIL_STEP_ERROR', duplicatedEmailError)
        throw duplicatedEmailError
      }

      if (duplicatedEmail?.id) {
        logError({
          step: 'DUPLICATE_EMAIL_CHECK_ERROR',
          message: 'Correo duplicado en usuarios',
          email: logEmail,
          dni: logDni,
          code: 'EMAIL_ALREADY_REGISTERED',
        })
        return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
      }

      const { data: authDuplicatedEmail, error: authDuplicatedEmailError } = await supabase.auth.admin.getUserByEmail(email)
      if (authDuplicatedEmailError) {
        console.error('DUPLICATE_EMAIL_STEP_ERROR', authDuplicatedEmailError)
        throw authDuplicatedEmailError
      }

      if (authDuplicatedEmail?.user?.id) {
        logError({
          step: 'DUPLICATE_EMAIL_CHECK_ERROR',
          message: 'Correo duplicado en auth',
          email: logEmail,
          dni: logDni,
          code: 'EMAIL_ALREADY_REGISTERED',
        })
        return businessError('Ese correo ya está registrado.', 'EMAIL_ALREADY_REGISTERED')
      }

      logInfo({
        step: 'DUPLICATE_EMAIL_CHECK_OK',
        message: 'Chequeo de correo completado',
        email: logEmail,
        dni: logDni,
      })
    } catch (err) {
      logError({
        step: 'DUPLICATE_EMAIL_CHECK_ERROR',
        message: err instanceof Error ? err.message : String(err),
        email: logEmail,
        dni: logDni,
        code: 'EMAIL_CHECK_FAILED',
      })
      throw err
    }

    if (!cliente) {
      const { data: created, error: createClienteError } = await supabase
        .from('clientes')
        .insert({ dni, nombre, telefono, usuario_id: null })
        .select('id,dni,nombre,telefono,usuario_id')
        .maybeSingle<ClienteRow>()

      if (createClienteError || !created) {
        console.error('CREATE_CLIENTE_ERROR', createClienteError)
        logError({
          step: 'CLIENTE_INSERT_ERROR',
          message: createClienteError?.message || 'No se pudo crear cliente base',
          email: logEmail,
          dni: logDni,
          code: 'CLIENTE_CREATE_FAILED',
        })
        return businessError('No se pudo crear el cliente base.', 'CLIENTE_CREATE_FAILED')
      }

      cliente = created
      rollback.createdCliente = true
      logInfo({ step: 'CLIENTE_INSERT_OK', message: 'Cliente base creado', email: logEmail, dni: logDni })
    }

    rollback.clienteId = cliente.id
    rollback.previousCliente = {
      id: cliente.id,
      dni: cliente.dni,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      usuario_id: cliente.usuario_id,
    }

    logInfo({ step: 'AUTH_CREATE_START', message: 'Creando usuario en Auth', email: logEmail, dni: logDni })

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
      console.error('CREATE_AUTH_ERROR', createAuthError)
      logError({
        step: 'AUTH_CREATE_ERROR',
        message: createAuthError?.message || 'No se pudo crear cuenta auth',
        email: logEmail,
        dni: logDni,
        code: 'AUTH_CREATE_FAILED',
      })
      await runRollback('AUTH_CREATE_ERROR', rollback)
      return businessError('No se pudo crear la cuenta.', 'AUTH_CREATE_FAILED')
    }

    rollback.userId = authData.user.id
    logInfo({ step: 'AUTH_CREATE_OK', message: 'Usuario auth creado', email: logEmail, dni: logDni })

    console.log('INSERT_USUARIO_DATA', {
      id: authData.user.id,
      nombre,
      email,
      rol: 'cliente',
    })

    const { error: usuarioError } = await supabase.from('usuarios').insert({
      id: authData.user.id,
      nombre,
      email,
      rol: 'cliente',
    })

    if (usuarioError) {
      console.error('USUARIO_ERROR', usuarioError)
      logError({
        step: 'USUARIO_INSERT_ERROR',
        message: usuarioError.message,
        email: logEmail,
        dni: logDni,
        code: 'USUARIOS_INSERT_FAILED',
      })
      logError({
        step: 'ROL_ASSIGN_ERROR',
        message: 'No se pudo persistir rol del usuario',
        email: logEmail,
        dni: logDni,
        code: 'ROL_ASSIGN_FAILED',
      })
      await runRollback('USUARIO_INSERT_ERROR', rollback)
      return businessError('No se pudo crear el usuario interno.', 'USUARIOS_INSERT_FAILED')
    }

    rollback.insertedUsuario = true
    logInfo({ step: 'USUARIO_INSERT_OK', message: 'Usuario interno creado', email: logEmail, dni: logDni })
    logInfo({ step: 'ROL_ASSIGN_OK', message: 'Rol cliente asignado', email: logEmail, dni: logDni })

    console.log('UPDATE_CLIENTE', {
      clienteId: cliente.id,
      userId: authData.user.id,
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
      console.error('CLIENTE_UPDATE_ERROR', clienteUpdateError)
      logError({
        step: 'CLIENTE_INSERT_ERROR',
        message: clienteUpdateError.message,
        email: logEmail,
        dni: logDni,
        code: 'CLIENTE_UPDATE_FAILED',
      })
      await runRollback('CLIENTE_INSERT_ERROR', rollback)
      return businessError('No se pudo vincular el cliente.', 'CLIENTE_UPDATE_FAILED')
    }

    logInfo({ step: 'CLIENTE_INSERT_OK', message: 'Cliente vinculado al usuario', email: logEmail, dni: logDni })
    logInfo({ step: 'FUNCTION_SUCCESS', message: 'Registro completado', email: logEmail, dni: logDni })

    return jsonResponse({ ok: true, userId: authData.user.id, clienteId: cliente.id }, 200)
  } catch (err: any) {
    logError({
      step: 'FUNCTION_UNHANDLED_ERROR',
      message: err?.message ?? String(err),
      email: logEmail,
      dni: logDni,
      code: 'INTERNAL_ERROR',
    })

    await runRollback('FUNCTION_UNHANDLED_ERROR', rollback)

    return jsonResponse({
      ok: false,
      error: err?.message || 'Error interno',
      code: 'INTERNAL_ERROR',
    }, 200)
  }
})
