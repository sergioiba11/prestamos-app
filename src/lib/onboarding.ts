import { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type IdentitySource = 'supabase' | 'edge-start-registration'
export type RegistrationStatus = 'new' | 'existing' | 'active'

export type IdentityData = {
  dni: string
  nombre: string
  apellido?: string | null
  telefono?: string | null
  email?: string | null
  clienteId?: string | null
  usuarioId?: string | null
  source: IdentitySource
}

export type RegistrationLookupResult = {
  status: RegistrationStatus
  cliente: IdentityData | null
}

const AR_PHONE_REGEX = /^\+549\d{10}$/

export function normalizeDni(value: string | null | undefined): string {
  return String(value || '').replace(/[.\s-]/g, '').replace(/\D/g, '')
}

export function normalizePhoneAR(value: string | null | undefined): string {
  const raw = String(value || '').trim()

  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length !== 10) return ''

  return `+549${digits}`
}

export function isValidPhoneAR(value: string | null | undefined): boolean {
  return AR_PHONE_REGEX.test(normalizePhoneAR(value))
}

export function maskPhone(value: string | null | undefined): string {
  const normalized = normalizePhoneAR(value)
  if (!normalized) return 'tu número registrado'
  return `${normalized.slice(0, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 12)} ${normalized.slice(12)}`
}

export async function startRegistrationByDni(dni: string): Promise<RegistrationLookupResult> {
  const cleanDni = normalizeDni(dni)

  if (cleanDni.length < 7 || cleanDni.length > 8) {
    throw new Error('Ingresá un DNI válido de 7 u 8 dígitos.')
  }

  console.log('[onboarding] iniciar-registro payload', { dni: cleanDni })

  const { data, error } = await supabase.functions.invoke('iniciar-registro', {
    body: { dni: cleanDni },
  })

  console.log('[onboarding] iniciar-registro response', data)

  if (error) {
    console.error('[onboarding] iniciar-registro invoke error', error)
    throw new Error(error.message || 'No pudimos iniciar el registro. Intentá nuevamente.')
  }

  const payload = data as
    | {
        ok?: boolean
        status?: RegistrationStatus
        cliente?: {
          id?: string | null
          dni?: string | null
          nombre?: string | null
          telefono?: string | null
          usuario_id?: string | null
          email?: string | null
        } | null
        error?: string
      }
    | null

  if (!payload?.ok || !payload.status || !['new', 'existing', 'active'].includes(payload.status)) {
    console.error('[onboarding] iniciar-registro invalid payload', payload)
    throw new Error(payload?.error || 'No pudimos iniciar el registro.')
  }

  if (payload.status === 'active') {
    return { status: 'active', cliente: null }
  }

  if (!payload.cliente?.id) {
    throw new Error('No pudimos preparar el cliente para continuar el registro.')
  }

  return {
    status: payload.status,
    cliente: {
      clienteId: payload.cliente.id,
      dni: payload.cliente.dni || cleanDni,
      nombre: payload.cliente.nombre || 'Cliente',
      telefono: payload.cliente.telefono || null,
      usuarioId: payload.cliente.usuario_id || null,
      email: payload.cliente.email || null,
      source: 'edge-start-registration',
    },
  }
}

export async function sendPhoneOtp(phone: string) {
  const normalizedPhone = normalizePhoneAR(phone)
  if (!normalizedPhone) throw new Error('Ingresá un teléfono válido en formato Argentina (+549...).')

  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
    options: { shouldCreateUser: true },
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('sms') || message.includes('phone')) {
      throw new Error('No pudimos enviar el SMS. Revisá el número e intentá nuevamente.')
    }
    throw new Error(error.message)
  }

  return normalizedPhone
}

export async function verifyPhoneOtp(params: { phone: string; token: string }): Promise<Session> {
  const normalizedPhone = normalizePhoneAR(params.phone)
  const token = params.token.trim()

  if (!normalizedPhone) throw new Error('Ingresá un teléfono válido para verificar.')
  if (!/^\d{4}$/.test(token)) throw new Error('Ingresá el código completo de 4 dígitos.')

  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token,
    type: 'sms',
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('expired')) throw new Error('Código expirado')
    if (message.includes('token') || message.includes('invalid')) throw new Error('Código incorrecto')
    throw new Error(error.message)
  }

  if (!data.session) throw new Error('No se pudo confirmar la sesión luego de verificar el código.')
  return data.session
}

export async function registerUserFromOnboarding(params: {
  dni: string
  nombre: string
  password: string
  email?: string
  phone: string
  clienteId?: string | null
  direccion?: string | null
}) {
  const dni = normalizeDni(params.dni)
  const nombre = params.nombre?.trim() || 'Cliente'
  const email = (params.email || `${dni}@creditodo.app`).trim().toLowerCase()
  const telefono = normalizePhoneAR(params.phone)
  const clienteId = params.clienteId || null
  const direccion = params.direccion?.trim() || null

  if (dni.length < 7 || dni.length > 8) throw new Error('Ingresá un DNI válido de 7 u 8 dígitos.')
  if (!nombre) throw new Error('Falta el nombre del cliente.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresá un email válido.')
  if (!telefono) throw new Error('Ingresá un teléfono válido de Argentina (+549...).')
  if (!params.password || params.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')

  const payload = { dni, nombre, email, telefono, clienteId, direccion }
  console.log('[onboarding] registerUserFromOnboarding payload', payload)

  try {
    const { data: clienteByDni, error: clienteError } = await supabase
      .from('clientes')
      .select('id, dni, usuario_id')
      .eq('dni', dni)
      .maybeSingle()

    if (clienteError) {
      console.error('[onboarding] error buscando cliente por dni', clienteError)
      throw new Error('No se pudo validar el DNI en este momento.')
    }

    if (clienteByDni?.usuario_id) {
      throw new Error('Ese DNI ya tiene una cuenta activa')
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    let authUserId = currentUser?.id || null

    if (!authUserId) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: params.password,
        phone: telefono,
        options: {
          data: {
            dni,
            role: 'cliente',
            full_name: nombre,
          },
        },
      })

      console.log('[onboarding] signUp response', { userId: signUpData.user?.id })

      if (signUpError || !signUpData.user?.id) {
        console.error('[onboarding] signUp error', signUpError)
        const msg = signUpError?.message?.toLowerCase() || ''
        if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('email')) {
          throw new Error('El email ya está registrado.')
        }
        if (msg.includes('password')) {
          throw new Error('Error de auth: la contraseña no cumple los requisitos.')
        }
        throw new Error(signUpError?.message || 'Error de auth al crear el usuario.')
      }

      authUserId = signUpData.user.id
    } else {
      const { error: authUpdateError } = await supabase.auth.updateUser({
        email,
        password: params.password,
        data: {
          dni,
          role: 'cliente',
          full_name: nombre,
        },
      })

      if (authUpdateError) {
        console.error('[onboarding] updateUser error', authUpdateError)
        const msg = authUpdateError.message.toLowerCase()
        if (msg.includes('already')) throw new Error('El email ya está registrado.')
        throw new Error(authUpdateError.message || 'Error de auth al actualizar el usuario.')
      }
    }

    if (!authUserId) {
      throw new Error('Error de auth: no se pudo obtener el usuario creado.')
    }

    const { error: usuarioError } = await supabase.from('usuarios').upsert({
      id: authUserId,
      nombre,
      email,
      rol: 'cliente',
    })

    if (usuarioError) {
      console.error('[onboarding] usuarios upsert error', usuarioError)
      if (usuarioError.message.toLowerCase().includes('duplicate')) {
        throw new Error('El email ya está registrado.')
      }
      throw new Error('Error al guardar en usuarios.')
    }

    const targetClienteId = clienteId || clienteByDni?.id || null

    const clientePayload: Record<string, unknown> = {
      usuario_id: authUserId,
      nombre,
      telefono,
      dni,
    }

    if (direccion) clientePayload.direccion = direccion

    if (targetClienteId) {
      const { error: updateClienteError } = await supabase
        .from('clientes')
        .update(clientePayload)
        .eq('id', targetClienteId)

      if (updateClienteError) {
        console.error('[onboarding] clientes update error', updateClienteError)
        throw new Error('Error al guardar en clientes.')
      }
    } else {
      const { error: createClienteError } = await supabase.from('clientes').insert(clientePayload)

      if (createClienteError) {
        console.error('[onboarding] clientes insert error', createClienteError)
        throw new Error('Error al guardar en clientes.')
      }
    }

    const result = { ok: true, userId: authUserId }
    console.log('[onboarding] registerUserFromOnboarding response', result)
    return result
  } catch (error: any) {
    console.error('[onboarding] registerUserFromOnboarding error', error)
    throw new Error(error?.message || 'No se pudo completar el registro.')
  }
}

export async function signInWithEmailOrDni(params: {
  identifier: string
  password: string
  mode?: 'email' | 'dni' | 'auto'
}) {
  const rawIdentifier = params.identifier.trim()
  const normalizedMode = params.mode || 'auto'
  let email = rawIdentifier.toLowerCase()

  const shouldTryDni =
    normalizedMode === 'dni' ||
    (normalizedMode === 'auto' && !rawIdentifier.includes('@') && /^\d{7,8}$/.test(normalizeDni(rawIdentifier)))

  if (shouldTryDni) {
    const dni = normalizeDni(rawIdentifier)

    const { data, error } = await supabase
      .from('clientes')
      .select('usuarios(email)')
      .eq('dni', dni)
      .maybeSingle()

    if (error) {
      throw new Error('No se pudo validar el DNI en este momento.')
    }

    const usuario = Array.isArray(data?.usuarios) ? data?.usuarios[0] : data?.usuarios

    if (!usuario?.email) {
      throw new Error('Usuario no encontrado para el DNI ingresado.')
    }

    email = usuario.email
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: params.password })

  if (error) {
    const normalized = error.message.toLowerCase()
    if (normalized.includes('invalid login credentials')) {
      throw new Error('Credenciales incorrectas. Revisá los datos ingresados.')
    }
    throw new Error(error.message)
  }

  if (!data.user) throw new Error('Usuario no encontrado.')
  return data.user
}
