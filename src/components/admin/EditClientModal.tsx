import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { esNombreCompletoValido, normalizarNombreCompleto } from '../../lib/nombre'
import { supabase } from '../../lib/supabase'

type ClientEditable = {
  id: string
  usuario_id?: string
  nombre: string
  dni: string
  dni_editado?: boolean
  telefono: string
  direccion: string
  email: string
}

export function EditClientModal({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean
  client: ClientEditable | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [dni, setDni] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!client) return
    setNombre(client.nombre || '')
    setDni(client.dni || '')
    setTelefono(client.telefono || '')
    setDireccion(client.direccion || '')
    setEmail(client.email || '')
    setMsg('')
  }, [client])

  const save = async () => {
    if (!client) return

    try {
      setLoading(true)
      setMsg('')

      const dniNormalizado = dni.trim()
      const nombreNormalizado = normalizarNombreCompleto(nombre)
      const telefonoNormalizado = telefono.trim()
      const direccionNormalizada = direccion.trim()

      if (!nombreNormalizado) {
        setMsg('El nombre y apellido es obligatorio')
        return
      }

      if (!esNombreCompletoValido(nombreNormalizado)) {
        setMsg('Ingresar nombre completo')
        return
      }

      const { data: clienteActual, error: clienteActualError } = await supabase
        .from('clientes')
        .select('dni,dni_editado')
        .eq('id', client.id)
        .single()

      if (clienteActualError) throw clienteActualError

      const dniEditado = Boolean(clienteActual?.dni_editado)
      const dniActual = String(clienteActual?.dni || '').trim()
      const dniRealmenteCambio = dniNormalizado !== dniActual

      if (dniRealmenteCambio && dniEditado) {
        setMsg('El DNI solo puede modificarse una vez.')
        return
      }

      const payload: Record<string, any> = {
        nombre: nombreNormalizado,
        telefono: telefonoNormalizado || null,
        direccion: direccionNormalizada || null,
      }

      if (dniRealmenteCambio) {
        payload.dni = dniNormalizado
        payload.dni_editado = true
      }

      const { error: clienteError } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', client.id)

      if (clienteError) throw clienteError

      onSaved()
      onClose()
    } catch (err: any) {
      setMsg(err?.message || 'No se pudo guardar el cliente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Editar cliente</Text>

          <TextInput style={styles.input} placeholder="Nombre completo" placeholderTextColor="#64748B" value={nombre} onChangeText={setNombre} />
          <TextInput
            style={client?.dni_editado ? styles.inputDisabled : styles.input}
            placeholder="DNI"
            placeholderTextColor="#64748B"
            value={dni}
            onChangeText={setDni}
            editable={!client?.dni_editado}
          />
          {client?.dni_editado ? <Text style={styles.helper}>El DNI solo puede modificarse una vez.</Text> : null}
          <TextInput style={styles.input} placeholder="Teléfono" placeholderTextColor="#64748B" value={telefono} onChangeText={setTelefono} />
          <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor="#64748B" value={direccion} onChangeText={setDireccion} />
          <TextInput style={styles.inputDisabled} placeholder="Email" placeholderTextColor="#64748B" value={email} editable={false} autoCapitalize="none" />

          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose} disabled={loading}><Text style={styles.btnGhostText}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={save} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  card: { width: '100%', maxWidth: 460, borderRadius: 14, backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', padding: 16, gap: 9 },
  title: { color: '#fff', fontWeight: '800', fontSize: 18, marginBottom: 4 },
  input: { borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#020817', color: '#fff', paddingHorizontal: 11, paddingVertical: 10 },
  inputDisabled: { borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#111827', color: '#94A3B8', paddingHorizontal: 11, paddingVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btnGhost: { borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, paddingVertical: 10 },
  btnGhostText: { color: '#E2E8F0', fontWeight: '700' },
  btn: { borderRadius: 10, backgroundColor: '#1D4ED8', paddingHorizontal: 14, paddingVertical: 10, minWidth: 96, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  msg: { color: '#FCA5A5', fontSize: 12 },
  helper: { color: '#FBBF24', fontSize: 12, marginTop: -2 },
})
