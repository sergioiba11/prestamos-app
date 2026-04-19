import { supabase } from './supabase'

export type IdentitySource = 'supabase' | 'mock-temporal'

export type IdentityData = {
  dni: string
  nombre: string
  telefono?: string | null
  email?: string | null
  clienteId?: string | null
  usuarioId?: string | null
  source: IdentitySource
}

const mockByDni: Record<string, IdentityData> = {
  '30111222': {
    dni: '30111222',
    nombre: 'Martina Pérez (mock temporal)',
    telefono: '+5491155512233',
    email: 'martina.mock@creditodo.local',
    source: 'mock-temporal',
  },
}

export async function lookupIdentityByDni(dni: string): Promise<IdentityData | null> {
  const cleanDni = dni.replace(/\D/g, '')

  const { data, error } = await supabase
    .from('clientes')
    .select('id,nombre,telefono,dni,usuario_id,usuarios(id,email)')
    .eq('dni', cleanDni)
    .maybeSingle()

  if (!error && data) {
    const usuario = Array.isArray(data.usuarios) ? data.usuarios[0] : data.usuarios

    return {
      dni: data.dni,
      nombre: data.nombre,
      telefono: data.telefono,
      email: usuario?.email || null,
      clienteId: data.id,
      usuarioId: data.usuario_id,
      source: 'supabase',
    }
  }

  return mockByDni[cleanDni] || null
}

export async function registerUserFromOnboarding(params: {
  dni: string
  nombre: string
  password: string
  email?: string
}) {
  const dni = params.dni.replace(/\D/g, '')
  const email = (params.email || `${dni}@creditodo.app`).trim().toLowerCase()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: params.password,
  })

  if (authError) throw authError

  const userId = authData.user?.id

  if (!userId) {
    throw new Error('No se pudo crear el usuario en auth.users')
  }

  const { error: usuarioError } = await supabase.from('usuarios').upsert({
    id: userId,
    nombre: params.nombre,
    email,
    rol: 'cliente',
  })

  if (usuarioError) throw usuarioError

  const { error: clienteUpdateError } = await supabase
    .from('clientes')
    .update({ usuario_id: userId })
    .eq('dni', dni)

  if (clienteUpdateError) throw clienteUpdateError

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: params.password,
  })

  if (signInError) throw signInError

  return { userId, email }
}

export async function signInWithEmailOrDni(params: {
  identifier: string
  password: string
  mode: 'email' | 'dni'
}) {
  let email = params.identifier.trim().toLowerCase()

  if (params.mode === 'dni') {
    const dni = params.identifier.replace(/\D/g, '')

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
