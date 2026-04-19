import { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type IdentitySource = 'supabase' | 'edge-start-registration'
export type RegistrationStatus = 'new' | 'pending' | 'active'

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
  identity: IdentityData
}

const AR_PHONE_REGEX = /^\+549\d{10}$/

export function normalizeDni(value: string | null | undefined): string {
  return String(value || '').replace(/[.\s-]/g, '').replace(/\D/g, '')
}

export function normalizePhoneAR(value: string | null | undefined): string {
  const raw = String(value || '').trim()

  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith('54')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith('9') && digits.length === 11) {
    digits = digits.slice(1)
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  if (digits.length !== 10) {
    return ''
  }

  return `+549${digits}`
}

export function isValidPhoneAR(value: string | null | undefined): boolean {
  return AR_PHONE_REGEX.test(normalizePhoneAR(value))
}

export function maskPhone(value: string | null | undefined): string {
  const normalized = normalizePhoneAR(value)

  if (!normalized) {
    return 'tu número registrado'
  }

  return `${normalized.slice(0, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 12)} ${normalized.slice(12)}`
}

export async function startRegistrationByDni(dni: string): Promise<RegistrationLookupResult> {
  const cleanDni = normalizeDni(dni)

  if (cleanDni.length < 7 || cleanDni.length > 8) {
    throw new Error('Ingresá un DNI válido de 7 u 8 dígitos.')
  }

  const { data, error } = await supabase.functions.invoke('iniciar-registro', {
    body: { dni: cleanDni },
  })

  if (error) {
    throw new Error('No pudimos iniciar el registro. Intentá nuevamente.')
  }

  const payload = data as
    | {
        ok?: boolean
        status?: RegistrationStatus
        identity?: Partial<IdentityData>
        error?: string
      }
    | null

  if (!payload?.ok || !payload.identity || !payload.status) {
    throw new Error(payload?.error || 'No pudimos iniciar el registro.')
  }

  return {
    status: payload.status,
    identity: {
      dni: cleanDni,
      nombre: payload.identity.nombre || 'Cliente',
      apellido: payload.identity.apellido || null,
      telefono: payload.identity.telefono || null,
      email: payload.identity.email || null,
      clienteId: payload.identity.clienteId || null,
      usuarioId: payload.identity.usuarioId || null,
      source: 'edge-start-registration',
    },
  }
}

export async function sendPhoneOtp(phone: string) {
  const normalizedPhone = normalizePhoneAR(phone)

  if (!normalizedPhone) {
    throw new Error('Ingresá un teléfono válido en formato Argentina (+549...).')
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
    options: {
      shouldCreateUser: true,
    },
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

  if (!normalizedPhone) {
    throw new Error('Ingresá un teléfono válido para verificar.')
  }

  if (!/^\d{4}$/.test(token)) {
    throw new Error('Ingresá el código completo de 4 dígitos.')
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token,
    type: 'sms',
  })

  if (error) {
    const message = error.message.toLowerCase()

    if (message.includes('expired')) {
      throw new Error('Código expirado')
    }

    if (message.includes('token') || message.includes('invalid')) {
      throw new Error('Código incorrecto')
    }

    throw new Error(error.message)
  }

  if (!data.session) {
    throw new Error('No se pudo confirmar la sesión luego de verificar el código.')
  }

  return data.session
}

export async function registerUserFromOnboarding(params: {
  dni: string
  nombre: string
  apellido?: string
  password: string
  email?: string
  phone: string
}) {
  const dni = normalizeDni(params.dni)
  const normalizedPhone = normalizePhoneAR(params.phone)
  const email = (params.email || `${dni}@creditodo.app`).trim().toLowerCase()
  const displayName = [params.nombre?.trim(), params.apellido?.trim()].filter(Boolean).join(' ').trim()

  if (!normalizedPhone) {
    throw new Error('El teléfono verificado no es válido.')
  }

  const {
    data: { user: authUser },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !authUser) {
    throw new Error('Tu sesión de verificación expiró. Solicitá un nuevo código.')
  }

  if (!authUser.phone_confirmed_at) {
    throw new Error('Primero verificá tu teléfono por SMS para continuar.')
  }

  const { data: clienteByDni, error: clienteError } = await supabase
    .from('clientes')
    .select('id, dni, telefono, usuario_id')
    .eq('dni', dni)
    .maybeSingle()

  if (clienteError || !clienteByDni) {
    throw new Error('No encontramos un registro para el DNI ingresado.')
  }

  if (clienteByDni.usuario_id && clienteByDni.usuario_id !== authUser.id) {
    throw new Error('Este DNI ya tiene una cuenta activa. Iniciá sesión o recuperá tu cuenta.')
  }

  const { data: samePhoneClients, error: phoneError } = await supabase
    .from('clientes')
    .select('id, dni')
    .eq('telefono', normalizedPhone)

  if (phoneError) {
    throw new Error('No pudimos validar el teléfono en este momento.')
  }

  const isPhoneUsedByAnotherDni = (samePhoneClients || []).some((row) => normalizeDni(row.dni) !== dni)

  if (isPhoneUsedByAnotherDni) {
    throw new Error('El teléfono ya está asociado a otro cliente.')
  }

  const { error: updateAuthError } = await supabase.auth.updateUser({
    email,
    password: params.password,
    data: {
      dni,
      role: 'cliente',
      full_name: displayName || params.nombre,
    },
  })

  if (updateAuthError) {
    if (updateAuthError.message.toLowerCase().includes('already')) {
      throw new Error('El email ingresado ya está registrado.')
    }

    throw updateAuthError
  }

  const { error: usuarioError } = await supabase.from('usuarios').upsert({
    id: authUser.id,
    nombre: displayName || params.nombre,
    email,
    rol: 'cliente',
  })

  if (usuarioError) throw usuarioError

  const { error: clienteUpdateError } = await supabase
    .from('clientes')
    .update({ usuario_id: authUser.id, telefono: normalizedPhone })
    .eq('id', clienteByDni.id)

  if (clienteUpdateError) throw clienteUpdateError

  return { userId: authUser.id, email }
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: params.password,
  })

  if (error) {
    const normalized = error.message.toLowerCase()

    if (normalized.includes('invalid login credentials')) {
      throw new Error('Credenciales incorrectas. Revisá los datos ingresados.')
    }

    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Usuario no encontrado.')
  }

  return data.user
}
