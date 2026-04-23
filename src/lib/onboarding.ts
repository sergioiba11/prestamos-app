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

  const { data, error } = await supabase.functions.invoke('iniciar-registro', {
    body: { dni: cleanDni },
  })

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
}) {
  const payload = {
    dni: normalizeDni(params.dni),
    nombre: params.nombre?.trim() || 'Cliente',
    email: (params.email || `${normalizeDni(params.dni)}@creditodo.app`).trim().toLowerCase(),
    password: params.password,
    telefono: normalizePhoneAR(params.phone),
    clienteId: params.clienteId || null,
  }

  if (!payload.telefono) throw new Error('El teléfono verificado no es válido.')

  console.log('[onboarding] registro-cliente-publico payload', payload)

  const { data, error } = await supabase.functions.invoke('registro-cliente-publico', {
    body: payload,
  })

  console.log('[onboarding] registro-cliente-publico response', data)

  if (error) {
    console.error('[onboarding] registro-cliente-publico invoke error', error)
    if (error.message === 'Failed to send a request to the Edge Function') {
      throw new Error('No se pudo conectar con el servidor de registro. Revisá conexión o deploy.')
    }
    throw new Error(error.message || 'No se pudo crear la cuenta.')
  }

  const response = data as { ok?: boolean; userId?: string; clienteId?: string; error?: string } | null

  if (!response?.ok) {
    console.error('[onboarding] registro-cliente-publico business error', response)
    throw new Error(response?.error || 'No se pudo crear la cuenta.')
  }

  return { userId: response.userId, clienteId: response.clienteId, email: payload.email }
}

export async function signInWithEmailOrDni(params: {
  identifier: string
  password: string
  mode?: 'email' | 'dni' | 'auto'
}) {
  const rawIdentifier = params.identifier.trim()
  const normalizedMode = params.mode || 'auto'

  if (!rawIdentifier) {
    throw new Error('Ingresá DNI o correo.')
  }

  if (!params.password.trim()) {
    throw new Error('Ingresá tu contraseña.')
  }

  let email = rawIdentifier.toLowerCase()

  const shouldResolveWithBackend =
    normalizedMode === 'dni' ||
    (normalizedMode === 'auto' && !rawIdentifier.includes('@'))

  if (shouldResolveWithBackend) {
    const { data, error } = await supabase.functions.invoke('resolver-identificador-login', {
      body: { identifier: rawIdentifier },
    })

    if (error) {
      throw new Error('No se pudo validar el DNI o correo en este momento.')
    }

    const payload = data as { ok?: boolean; email?: string; error?: string } | null

    if (!payload?.ok || !payload.email) {
      throw new Error(payload?.error || 'No se pudo resolver la cuenta para iniciar sesión.')
    }

    email = payload.email
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: params.password,
  })

  if (error) {
    const normalized = error.message.toLowerCase()
    if (normalized.includes('invalid login credentials')) {
      throw new Error('Usuario o contraseña incorrectos.')
    }
    throw new Error('No se pudo iniciar sesión. Intentá nuevamente.')
  }

  if (!data.user) throw new Error('No se pudo iniciar sesión. Intentá nuevamente.')

  return { user: data.user, email }
}
