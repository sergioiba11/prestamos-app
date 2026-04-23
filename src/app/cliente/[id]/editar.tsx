import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { ClienteEditableAdmin, fetchClienteEditableById, updateClienteEditableByAdmin } from '../../../lib/admin-clientes'
import { createSystemActivity } from '../../../lib/activity'

type FormState = {
  nombre: string
  apellido: string
  dni: string
  telefono: string
  direccion: string
}

function normalizeDni(raw: string) {
  return String(raw || '').trim().replace(/\s+/g, '')
}

function isValidDni(raw: string) {
  const cleaned = normalizeDni(raw)
  return /^\d{6,12}$/.test(cleaned)
}

export default function ClienteEditScreen() {
  const params = useLocalSearchParams()
  const clienteId = useMemo(() => {
    const raw = params.id
    if (Array.isArray(raw)) return raw[0] || ''
    return typeof raw === 'string' ? raw : ''
  }, [params.id])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cliente, setCliente] = useState<ClienteEditableAdmin | null>(null)
  const [form, setForm] = useState<FormState>({ nombre: '', apellido: '', dni: '', telefono: '', direccion: '' })
  const [initialSnapshot, setInitialSnapshot] = useState('')

  const applyClienteToForm = (data: ClienteEditableAdmin) => {
    const next: FormState = {
      nombre: data.nombre || '',
      apellido: data.apellido || '',
      dni: data.dni || '',
      telefono: data.telefono || '',
      direccion: data.direccion || '',
    }
    setForm(next)
    setInitialSnapshot(JSON.stringify({ ...next, dni: normalizeDni(next.dni) }))
  }

  const loadCliente = useCallback(async () => {
    if (!clienteId) {
      setError('ID de cliente inválido.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      console.log('[cliente-edit] opening edit for cliente id', clienteId)
      const data = await fetchClienteEditableById(clienteId)
      setCliente(data)
      applyClienteToForm(data)
    } catch (err: any) {
      console.error('[cliente-edit] load error', err)
      setError(err?.message || 'No se pudo cargar el cliente.')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useFocusEffect(
    useCallback(() => {
      void loadCliente()
    }, [loadCliente])
  )

  const onSave = async () => {
    if (!cliente) return

    const nombre = form.nombre.trim()
    const apellido = form.apellido.trim()
    const dni = normalizeDni(form.dni)
    const telefono = form.telefono.trim()
    const direccion = form.direccion.trim()

    setSuccess('')
    setError('')

    if (!nombre) return setError('El nombre es obligatorio.')
    if (!dni) return setError('El DNI es obligatorio.')
    if (!isValidDni(dni)) return setError('El DNI debe ser numérico y tener entre 6 y 12 dígitos.')

    const currentSnapshot = JSON.stringify({ nombre, apellido, dni, telefono, direccion })
    if (currentSnapshot === initialSnapshot) {
      setError('No hay cambios para guardar.')
      return
    }

    try {
      setSaving(true)
      console.log('[cliente-edit] save start', { clienteId: cliente.id, nombre, apellido, dni, telefono, direccion })
      const result = await updateClienteEditableByAdmin({
        clienteId: cliente.id,
        nombre,
        apellido,
        dni,
        telefono,
        direccion,
      })
      console.log('[cliente-edit] save result', result)

      const dniCambio = normalizeDni(cliente.dni) !== dni

      await createSystemActivity({
        tipo: 'cliente_editado',
        titulo: 'Cliente editado',
        descripcion: `Se actualizó el cliente ${nombre}${apellido ? ` ${apellido}` : ''}`.trim(),
        entidad_tipo: 'cliente',
        entidad_id: cliente.id,
        prioridad: 'normal',
        visible_en_notificaciones: true,
        metadata: {
          cambios: { nombre, apellido, telefono, direccion },
          route: `/cliente/${cliente.id}` ,
        },
      })

      if (dniCambio) {
        await createSystemActivity({
          tipo: 'dni_editado',
          titulo: 'DNI de cliente editado',
          descripcion: `Se modificó el DNI del cliente ${nombre}${apellido ? ` ${apellido}` : ''}`.trim(),
          entidad_tipo: 'cliente',
          entidad_id: cliente.id,
          prioridad: 'alta',
          visible_en_notificaciones: true,
          metadata: { dni_nuevo: dni, route: `/cliente/${cliente.id}` },
        })
      }

      await loadCliente()
      setSuccess('Cliente actualizado correctamente.')
      Alert.alert('Éxito', 'Cliente actualizado correctamente.')
    } catch (err: any) {
      console.error('[cliente-edit] save error', err)
      setError(err?.message || 'No se pudo guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loading}>Cargando cliente...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>Editar cliente</Text>
        <Text style={styles.subtitle}>Atención: el DNI solo puede modificarse una vez.</Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={form.nombre} onChangeText={(value) => setForm((prev) => ({ ...prev, nombre: value }))} placeholder="Nombre" placeholderTextColor="#64748B" />

        <Text style={styles.label}>Apellido (si aplica)</Text>
        <TextInput style={styles.input} value={form.apellido} onChangeText={(value) => setForm((prev) => ({ ...prev, apellido: value }))} placeholder="Apellido" placeholderTextColor="#64748B" />

        <Text style={styles.label}>DNI</Text>
        <TextInput
          style={cliente?.dniEditado ? styles.inputDisabled : styles.input}
          value={form.dni}
          onChangeText={(value) => setForm((prev) => ({ ...prev, dni: value }))}
          placeholder="DNI"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          editable={!cliente?.dniEditado}
        />
        <Text style={styles.helpText}>El DNI solo puede modificarse una vez.</Text>
        {cliente?.dniEditado ? <Text style={styles.blockedText}>Este DNI ya fue modificado y quedó bloqueado.</Text> : null}

        <Text style={styles.label}>Teléfono</Text>
        <TextInput style={styles.input} value={form.telefono} onChangeText={(value) => setForm((prev) => ({ ...prev, telefono: value }))} placeholder="Teléfono" placeholderTextColor="#64748B" keyboardType="phone-pad" />

        <Text style={styles.label}>Dirección</Text>
        <TextInput style={styles.input} value={form.direccion} onChangeText={(value) => setForm((prev) => ({ ...prev, direccion: value }))} placeholder="Dirección" placeholderTextColor="#64748B" />

        <Text style={styles.label}>Email (solo lectura)</Text>
        <TextInput style={styles.inputDisabled} value={cliente?.email || ''} editable={false} placeholder="Email" placeholderTextColor="#64748B" autoCapitalize="none" />

        <Text style={styles.label}>Rol / Estado</Text>
        <TextInput style={styles.inputDisabled} value={cliente?.rol || 'cliente'} editable={false} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Guardar cambios</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, backgroundColor: '#020817', alignItems: 'center', justifyContent: 'center' },
  loading: { color: '#94A3B8', marginTop: 10 },
  backBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0B1220' },
  backBtnText: { color: '#E2E8F0', fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, backgroundColor: '#0B1220', padding: 14, gap: 8 },
  title: { color: '#F8FAFC', fontWeight: '800', fontSize: 22 },
  subtitle: { color: '#FBBF24', fontSize: 13, marginBottom: 4 },
  label: { color: '#CBD5E1', fontWeight: '700', marginTop: 6 },
  input: { borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#020817', color: '#F8FAFC', paddingHorizontal: 11, paddingVertical: 10 },
  inputDisabled: { borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#111827', color: '#94A3B8', paddingHorizontal: 11, paddingVertical: 10 },
  helpText: { color: '#FBBF24', fontSize: 12 },
  blockedText: { color: '#FCA5A5', fontSize: 12 },
  error: { color: '#FCA5A5', marginTop: 8 },
  success: { color: '#86EFAC', marginTop: 8 },
  saveBtn: { marginTop: 10, borderRadius: 10, backgroundColor: '#2563EB', paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800' },
})
