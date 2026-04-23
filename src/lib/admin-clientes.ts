import { supabase } from './supabase'

export type ClienteEditableAdmin = {
  id: string
  usuarioId: string | null
  nombre: string
  apellido: string
  dni: string
  dniEditado: boolean
  dniEditadoAt: string | null
  telefono: string
  direccion: string
  email: string
  rol: string
}

function normalizeDni(raw: string) {
  return String(raw || '').trim().replace(/\s+/g, '')
}

function toFriendlyError(err: any) {
  const msg = String(err?.message || err?.details || 'No se pudo actualizar el cliente.')
  if (msg.toLowerCase().includes('no changes')) return 'No hay cambios para guardar.'
  if (msg.toLowerCase().includes('ya está en uso')) return 'Ese DNI ya está en uso.'
  return msg
}

export async function fetchClienteEditableById(clienteId: string): Promise<ClienteEditableAdmin> {
  let row: any = null

  const withOptionalCols = await supabase
    .from('clientes')
    .select('id,usuario_id,nombre,apellido,dni,dni_editado,dni_editado_at,telefono,direccion')
    .eq('id', clienteId)
    .maybeSingle()

  if (!withOptionalCols.error) {
    row = withOptionalCols.data
  } else {
    console.warn('[admin-cliente] fetch optional columns failed, fallback', withOptionalCols.error)
    const fallback = await supabase
      .from('clientes')
      .select('id,usuario_id,nombre,dni,dni_editado,telefono,direccion')
      .eq('id', clienteId)
      .maybeSingle()

    if (fallback.error) throw fallback.error
    row = fallback.data
  }

  if (!row) throw new Error('Cliente no encontrado.')

  let email = ''
  let rol = ''
  if (row.usuario_id) {
    const { data: usuario, error: userError } = await supabase
      .from('usuarios')
      .select('email,rol')
      .eq('id', row.usuario_id)
      .maybeSingle()

    if (userError) {
      console.error('[admin-cliente] usuario lookup error', userError)
    } else {
      email = String(usuario?.email || '')
      rol = String(usuario?.rol || '')
    }
  }

  return {
    id: String(row.id),
    usuarioId: row.usuario_id || null,
    nombre: String(row.nombre || ''),
    apellido: String((row as any).apellido || ''),
    dni: normalizeDni(String(row.dni || '')),
    dniEditado: Boolean((row as any).dni_editado),
    dniEditadoAt: (row as any).dni_editado_at ? String((row as any).dni_editado_at) : null,
    telefono: String(row.telefono || ''),
    direccion: String(row.direccion || ''),
    email,
    rol,
  }
}

export async function updateClienteEditableByAdmin(params: {
  clienteId: string
  nombre: string
  apellido: string
  dni: string
  telefono: string
  direccion: string
}) {
  const payload = {
    p_cliente_id: params.clienteId,
    p_nombre: params.nombre.trim(),
    p_apellido: params.apellido.trim() || null,
    p_dni: normalizeDni(params.dni),
    p_telefono: params.telefono.trim() || null,
    p_direccion: params.direccion.trim() || null,
  }

  console.log('[admin-cliente] update payload', payload)
  console.log('[admin-cliente] updating table', 'clientes')

  const { data, error } = await supabase.rpc('admin_update_cliente', payload)

  if (error) {
    console.error('[admin-cliente] update error', error)
    throw new Error(toFriendlyError(error))
  }

  console.log('[admin-cliente] update result', data)
  return data
}
