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

function mapEdgeInvokeError(rawMessage: string, functionName: string): string {
  const normalized = rawMessage.toLowerCase()

  if (normalized.includes('failed to send a request to the edge function')) {
    return `No se pudo contactar la función '${functionName}'. Verificá deploy, nombre y conectividad.`
  }

  if (normalized.includes('functions') && normalized.includes('not found')) {
    return `La función '${functionName}' no existe o no está deployada.`
  }

  if (normalized.includes('fetch')) {
    return `No se pudo conectar con la función '${functionName}'. Revisá URL de Supabase y red.`
  }

  return rawMessage
}

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
  const functionName = 'iniciar-registro'
  const payloadToSend = { dni: cleanDni }

  if (cleanDni.length < 7 || cleanDni.length > 8) {
    throw new Error('Ingresá un DNI válido de 7 u 8 dígitos.')
  }

  console.log('[onboarding] invoking function', { functionName })
  console.log('[onboarding] payload', payloadToSend)

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payloadToSend,
  })

  console.log('[onboarding] function response', { functionName, data })

  if (error) {
    console.error('[onboarding] function invoke error', { functionName, error })
    throw new Error(mapEdgeInvokeError(error.message || 'No pudimos iniciar el registro.', functionName))
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
    console.error('[onboarding] invalid payload from function', { functionName, payload })
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
}) {
  const dni = normalizeDni(params.dni)
  const normalizedPhone = normalizePhoneAR(params.phone)
  const email = (params.email || `${dni}@creditodo.app`).trim().toLowerCase()
  const displayName = params.nombre?.trim() || 'Cliente'
  const functionName = 'completar-registro-cliente'

  if (!normalizedPhone) throw new Error('El teléfono verificado no es válido.')

  const payload = {
    dni,
    nombre: displayName,
    email,
    password: params.password,
    telefono: normalizedPhone,
  }

  console.log('[onboarding] invoking function', { functionName })
  console.log('[onboarding] payload', payload)

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
  })

  console.log('[onboarding] function response', { functionName, data })

  if (error) {
    console.error('[onboarding] function invoke error', { functionName, error })
    throw new Error(mapEdgeInvokeError(error.message || 'No se pudo completar el registro.', functionName))
  }

  const response = data as
    | {
        ok?: boolean
        error?: string
        message?: string
        userId?: string
        email?: string
      }
    | null

  if (!response?.ok) {
    const responseError = response?.error || 'No se pudo completar el registro.'
    console.error('[onboarding] function business error', { functionName, responseError, response })
    throw new Error(responseError)
  }

  if (!response.userId) {
    throw new Error('No se recibió el usuario creado al finalizar el registro.')
  }

  return {
    userId: response.userId,
    email: response.email || email,
    message: response.message || 'Cuenta creada correctamente.',
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
