import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import * as Linking from 'expo-linking'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { createSystemActivity } from '../lib/activity'
import { canManagePendingPayments, normalizeRole, UserRole } from '../lib/roles'
import { supabase } from '../lib/supabase'

type PendingPayment = {
  id: string
  cliente_id: string | null
  prestamo_id: string | null
  monto: number | null
  metodo: string | null
  estado: string | null
  estado_validacion: string | null
  impactado: boolean | null
  comprobante_url: string | null
  observacion: string | null
  observacion_validacion: string | null
  created_at: string | null
  clientes?: { nombre: string | null; dni: string | null } | null
}

type AprobarPagoResponse = {
  ok?: boolean
  estado?: string
  pago_id?: string
  cuotas_impactadas?: number[]
  total_aplicado?: number
  saldo_restante?: number
  detalle_aplicacion?: Array<{
    numero_cuota?: number
    estado_resultante?: string
    monto_aplicado?: number
    saldo_cuota_antes?: number
    saldo_cuota_despues?: number
  }>
}

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function date(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PagosPendientesScreen() {
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [adminName, setAdminName] = useState('Operador')
  const [adminRole, setAdminRole] = useState<UserRole>('unknown')
  const [items, setItems] = useState<PendingPayment[]>([])
  const [mobileMenu, setMobileMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [obsModal, setObsModal] = useState<{ open: boolean; action: 'aprobar' | 'rechazar'; payment: PendingPayment | null }>({
    open: false,
    action: 'aprobar',
    payment: null,
  })
  const [observation, setObservation] = useState('')

  const onNavigate = (key: AdminNavKey) => {
    setMobileMenu(false)
    if (key === 'inicio') return router.push('/admin-home' as any)
    if (key === 'prestamos') return router.push('/prestamos' as any)
    if (key === 'historial') return router.push('/historial-prestamos' as any)
    if (key === 'pagos-pendientes') return router.push('/pagos-pendientes' as any)
    if (key === 'nuevo-prestamo') return router.push('/nuevo-prestamo' as any)
    if (key === 'registrar-pago') return router.push('/cargar-pago' as any)
    if (key === 'clientes') return router.push('/clientes' as any)
    if (key === 'crear-cliente') return router.push('/nuevo-cliente' as any)
    if (key === 'crear-empleado') return router.push('/nuevo-empleado' as any)
    if (key === 'actividad') return router.push('/actividad' as any)
    if (key === 'config') return router.push('/configuraciones' as any)
  }

  const onLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Sesión inválida')

      const { data: user } = await supabase.from('usuarios').select('id,nombre,rol').eq('id', userId).maybeSingle()
      const role = normalizeRole(user?.rol)
      setAdminRole(role)
      setAdminName(user?.nombre || auth.user?.email?.split('@')[0] || 'Operador')

      if (!canManagePendingPayments(role)) {
        setItems([])
        return
      }

      const { data, error } = await supabase
        .from('pagos')
        .select('id,cliente_id,prestamo_id,monto,metodo,estado,estado_validacion,impactado,comprobante_url,observacion,observacion_validacion,created_at,clientes(nombre,dni)')
        .or('estado.eq.pendiente_aprobacion,estado_validacion.in.(pendiente,pendiente_aprobacion,en_revision)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setItems((data || []) as unknown as PendingPayment[])
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar pagos pendientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return items
    return items.filter((item) => {
      const nombre = String(item.clientes?.nombre || '').toLowerCase()
      const dni = String(item.clientes?.dni || '').toLowerCase()
      return nombre.includes(t) || dni.includes(t) || item.id.toLowerCase().includes(t)
    })
  }, [items, search])

  const sendDecision = async () => {
    if (!obsModal.payment) return

    try {
      setProcessingId(obsModal.payment.id)
      const payment = obsModal.payment
      const action = obsModal.action
      const currentObservation = observation.trim() || null
      const { data, error } = await supabase.functions.invoke('aprobar-pago', {
        body: {
          pago_id: payment.id,
          accion: action,
          observacion_revision: currentObservation,
        },
      })

      if (error) throw error
      const decisionResult = (data || {}) as AprobarPagoResponse

      await createSystemActivity({
        tipo: action === 'aprobar' ? 'pago_aprobado' : 'pago_rechazado',
        titulo: action === 'aprobar' ? 'Pago aprobado' : 'Pago rechazado',
        descripcion: `Pago ${payment.id} ${action === 'aprobar' ? 'aprobado' : 'rechazado'} por ${adminName}` ,
        entidad_tipo: 'pago',
        entidad_id: payment.id,
        prioridad: action === 'aprobar' ? 'normal' : 'alta',
        visible_en_notificaciones: true,
        metadata: {
          observacion_revision: currentObservation,
          cliente_id: payment.cliente_id,
          prestamo_id: payment.prestamo_id,
          route: '/pagos-pendientes',
        },
      })

      setObservation('')
      setObsModal({ open: false, action: 'aprobar', payment: null })
      await loadData()

      if (action === 'rechazar') {
        Alert.alert('Pago rechazado', 'El pago fue rechazado y no impactó cuotas ni saldo del préstamo.')
        return
      }

      const cuotasImpactadas = decisionResult.cuotas_impactadas || []
      const firstImpact = decisionResult.detalle_aplicacion?.[0] || null
      Alert.alert(
        'Pago aprobado',
        'El pago se aplicó al préstamo. Ahora podés ver el comprobante.',
        [
          { text: 'Seguir', style: 'cancel' },
          {
            text: 'Ver comprobante',
            onPress: () =>
              router.push({
                pathname: '/pago-aprobado',
                params: {
                  monto: String(Number(payment.monto || 0)),
                  monto_ingresado: String(Number(payment.monto || 0)),
                  vuelto: '0',
                  monto_cuota: String(Number(payment.monto || 0)),
                  metodo: String(payment.metodo || 'transferencia'),
                  fecha: String(new Date().toISOString()),
                  saldo_restante: String(Number(decisionResult.saldo_restante || 0)),
                  saldo_restante_cuota: String(Number(firstImpact?.saldo_cuota_despues || 0)),
                  cuota_id: '',
                  numero_cuota: firstImpact?.numero_cuota ? String(firstImpact.numero_cuota) : '',
                  cuotas_impactadas: JSON.stringify(cuotasImpactadas),
                  cuotas_impactadas_detalle: JSON.stringify(
                    (decisionResult.detalle_aplicacion || []).map((item) => ({
                      numero_cuota: Number(item.numero_cuota || 0),
                      estado: String(item.estado_resultante || ''),
                      monto_aplicado: Number(item.monto_aplicado || 0),
                      saldo_antes: Number(item.saldo_cuota_antes || 0),
                      saldo_despues: Number(item.saldo_cuota_despues || 0),
                    }))
                  ),
                  estado_comprobante: 'COMPLETO',
                  proxima_cuota: '',
                  prestamo_id: String(payment.prestamo_id || ''),
                  cliente_id: String(payment.cliente_id || ''),
                  cliente_nombre: String(payment.clientes?.nombre || ''),
                  cliente_apellido: '',
                  cliente_dni: String(payment.clientes?.dni || ''),
                  cliente_email: '',
                  cliente_telefono: '',
                  pago_id: String(decisionResult.pago_id || payment.id),
                  identificador_interno_pago: String(decisionResult.pago_id || payment.id),
                  observaciones: currentObservation || '',
                },
              } as any),
          },
        ]
      )
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo actualizar el pago')
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3B82F6" size="large" />
        <Text style={styles.loadingText}>Cargando pendientes...</Text>
      </View>
    )
  }

  if (!canManagePendingPayments(adminRole)) {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedTitle}>Sin permisos</Text>
        <Text style={styles.deniedText}>Solo admin o empleado pueden aprobar/rechazar pagos pendientes.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/cliente-home' as any)}>
          <Text style={styles.backBtnText}>Ir a inicio</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <AdminSidebar active="pagos-pendientes" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      <View style={styles.main}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Pagos pendientes</Text>
          <Text style={styles.subtitle}>Aprobá o rechazá pagos de transferencia. El saldo impacta solo al aprobar.</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder="Buscar por cliente, DNI o ID"
            placeholderTextColor="#64748B"
          />

          {filtered.length === 0 ? <Text style={styles.empty}>No hay pagos pendientes para validar.</Text> : null}

          {filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.clientes?.nombre || 'Cliente'}</Text>
                <Text style={styles.amount}>{money(Number(item.monto || 0))}</Text>
              </View>
              <Text style={styles.meta}>DNI: {item.clientes?.dni || '—'} · Método: {item.metodo || '—'}</Text>
              <Text style={styles.meta}>Fecha: {date(item.created_at)} · Estado: {item.estado || item.estado_validacion || 'pendiente'}</Text>
              <Text style={styles.meta}>Préstamo: {item.prestamo_id || '—'}</Text>
              {item.comprobante_url ? (
                <TouchableOpacity onPress={() => Linking.openURL(item.comprobante_url || '')}>
                  <Text style={[styles.meta, styles.linkText]}>Ver comprobante</Text>
                </TouchableOpacity>
              ) : null}
              {item.observacion ? <Text style={styles.meta}>Obs. carga: {item.observacion}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  disabled={processingId === item.id}
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => setObsModal({ open: true, action: 'aprobar', payment: item })}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#DCFCE7" />
                  <Text style={styles.actionText}>Aprobar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={processingId === item.id}
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => setObsModal({ open: true, action: 'rechazar', payment: item })}
                >
                  <Ionicons name="close-circle" size={16} color="#FEE2E2" />
                  <Text style={styles.actionText}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <Modal visible={obsModal.open} transparent animationType="fade" onRequestClose={() => setObsModal({ open: false, action: 'aprobar', payment: null })}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.overlay} onPress={() => setObsModal({ open: false, action: 'aprobar', payment: null })} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{obsModal.action === 'aprobar' ? 'Aprobar pago' : 'Rechazar pago'}</Text>
            <TextInput
              style={styles.observationInput}
              value={observation}
              onChangeText={setObservation}
              placeholder="Observación (opcional)"
              placeholderTextColor="#64748B"
              multiline
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={sendDecision}>
              <Text style={styles.confirmText}>{processingId ? 'Procesando...' : 'Confirmar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#020817' },
  main: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  searchInput: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', color: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  card: { backgroundColor: '#0F172A', borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', padding: 12, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  amount: { color: '#60A5FA', fontWeight: '800', fontSize: 16 },
  meta: { color: '#94A3B8', fontSize: 12 },
  linkText: { color: '#93C5FD', textDecorationLine: 'underline' },
  actions: { marginTop: 6, flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  approveBtn: { borderColor: '#166534', backgroundColor: '#052E16' },
  rejectBtn: { borderColor: '#991B1B', backgroundColor: '#450A0A' },
  actionText: { color: '#E2E8F0', fontWeight: '700' },
  empty: { color: '#94A3B8', marginTop: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817', padding: 20 },
  loadingText: { color: '#CBD5E1', marginTop: 8 },
  deniedTitle: { color: '#fff', fontWeight: '800', fontSize: 22 },
  deniedText: { color: '#94A3B8', textAlign: 'center', marginTop: 8 },
  backBtn: { marginTop: 16, backgroundColor: '#1D4ED8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  backBtnText: { color: '#fff', fontWeight: '700' },
  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.72)' },
  modalCard: { width: '90%', maxWidth: 450, backgroundColor: '#0F172A', borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', padding: 14, gap: 10 },
  modalTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  observationInput: { minHeight: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 10, color: '#E2E8F0', backgroundColor: '#020817' },
  confirmBtn: { backgroundColor: '#1D4ED8', borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  confirmText: { color: '#fff', fontWeight: '700' },
})
