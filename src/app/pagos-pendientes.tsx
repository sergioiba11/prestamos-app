import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { createSystemActivity } from '../lib/activity'
import { canManagePendingPayments, normalizeRole, UserRole } from '../lib/roles'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

type PendingPayment = {
  id: string
  cliente_id: string | null
  cliente_nombre?: string | null
  cliente_dni?: string | null
  prestamo_id: string | null
  monto: number | null
  metodo: string | null
  estado: string | null
  impactado: boolean | null
  created_at: string | null
}

type ClienteLite = {
  id: string
  nombre?: string | null
  apellido?: string | null
  nombre_completo?: string | null
  dni?: string | null
  documento?: string | null
  numero_documento?: string | null
  cedula?: string | null
}

type FunctionResponse = {
  ok?: boolean
  pago_id?: string
  error?: string
}

function money(v: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0)
}

function date(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

async function callAprobarPago(body: {
  pago_id: string
  accion: 'aprobar' | 'rechazar'
  observacion_revision?: string | null
}) {
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) throw refreshError

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  const token = sessionData.session?.access_token
  if (!token) throw new Error('No hay sesión activa')

  const url = `${supabaseUrl}/functions/v1/aprobar-pago`

  console.log('SUPABASE URL:', url)
  console.log('Invocando aprobar-pago:', url)
  console.log('Tiene token:', !!token)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  })

  let json: FunctionResponse | null = null

  try {
    json = await response.json()
  } catch {
    json = null
  }

  console.log('Status aprobar-pago:', response.status)
  console.log('Respuesta:', json)

  if (!response.ok) {
    throw new Error(json?.error || `Error HTTP ${response.status}`)
  }

  return json || {}
}

export default function PagosPendientesScreen() {
  const { width } = useWindowDimensions()
  const isMobile = width < 1024

  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminName, setAdminName] = useState('Operador')
  const [adminRole, setAdminRole] = useState<UserRole>('unknown')
  const [items, setItems] = useState<PendingPayment[]>([])
  const [search, setSearch] = useState('')
  const [queryError, setQueryError] = useState<string | null>(null)
  const [obsModal, setObsModal] = useState<{ open: boolean; payment: PendingPayment | null }>({
    open: false,
    payment: null,
  })
  const [currentObservation, setCurrentObservation] = useState('')

  const onNavigate = (key: AdminNavKey) => {
    setMenuOpen(false)
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

  const closeObservationModal = () => {
    setObsModal({ open: false, payment: null })
    setCurrentObservation('')
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('Sesión inválida')

      const { data: user } = await supabase
        .from('usuarios')
        .select('id,nombre,rol')
        .eq('id', userId)
        .maybeSingle()

      const role = normalizeRole(user?.rol)
      setAdminRole(role)
      setAdminName(user?.nombre || auth.user?.email?.split('@')[0] || 'Operador')

      if (!canManagePendingPayments(role)) {
        setItems([])
        return
      }

      setQueryError(null)

      const { data, error } = await supabase
        .from('pagos')
        .select('id, prestamo_id, cliente_id, monto, metodo, estado, impactado, created_at')
        .eq('estado', 'pendiente_aprobacion')
        .order('created_at', { ascending: false })

      console.log('lista pagos pendientes:', data)
      console.log('error lista pagos pendientes:', error)

      if (error) {
        setQueryError(error.message)
        setItems([])
        return
      }

      const pagos = (data || []) as PendingPayment[]
      const clienteIds = Array.from(
        new Set(pagos.map((item) => item.cliente_id).filter(Boolean) as string[])
      )

      let clientesById = new Map<string, ClienteLite>()
      if (clienteIds.length > 0) {
        const { data: clientesData, error: clientesError } = await supabase
          .from('clientes')
          .select('id,nombre,apellido,nombre_completo,dni,documento,numero_documento,cedula')
          .in('id', clienteIds)

        if (clientesError) {
          console.error('error clientes pagos pendientes:', clientesError)
        } else {
          clientesById = new Map(((clientesData || []) as ClienteLite[]).map((cliente) => [cliente.id, cliente]))
        }
      }

      const pagosConCliente = pagos.map((item) => {
        const cliente = item.cliente_id ? clientesById.get(item.cliente_id) : null
        const nombreCompleto = String(cliente?.nombre_completo || '').trim()
        const nombre = String(cliente?.nombre || '').trim()
        const apellido = String(cliente?.apellido || '').trim()
        const clienteNombre = nombreCompleto || [nombre, apellido].filter(Boolean).join(' ').trim() || null
        const clienteDni = String(
          cliente?.dni ||
          cliente?.documento ||
          cliente?.numero_documento ||
          cliente?.cedula ||
          ''
        ).trim()

        return {
          ...item,
          cliente_nombre: clienteNombre,
          cliente_dni: clienteDni || null,
        }
      })

      setItems(pagosConCliente)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar pagos pendientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData]),
  )

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return items
    return items.filter((item) => {
      const metodo = String(item.metodo || '').toLowerCase()
      return metodo.includes(t) || item.id.toLowerCase().includes(t)
    })
  }, [items, search])

  const handleAprobar = async (pagoId: string) => {
    try {
      setProcessingId(pagoId)
      console.log('Aprobando pago:', pagoId)

      const result = await callAprobarPago({
        pago_id: pagoId,
        accion: 'aprobar',
      })

      const payment = items.find((item) => item.id === pagoId) || null

      if (payment) {
        await createSystemActivity({
          tipo: 'pago_aprobado',
          titulo: 'Pago aprobado',
          descripcion: `Pago ${payment.id} aprobado por ${adminName}`,
          entidad_tipo: 'pago',
          entidad_id: payment.id,
          prioridad: 'normal',
          visible_en_notificaciones: true,
          metadata: {
            cliente_id: payment.cliente_id,
            prestamo_id: payment.prestamo_id,
            route: '/pagos-pendientes',
          },
        })
      }

      await loadData()
      Alert.alert('Pago aprobado')
      router.push(`/pago-aprobado?pago_id=${encodeURIComponent(String(result.pago_id || pagoId))}` as any)
    } catch (error: any) {
      console.error(error)
      Alert.alert('Error al aprobar', error?.message || 'No se pudo aprobar el pago')
    } finally {
      setProcessingId(null)
    }
  }

  const handleConfirmReject = async () => {
    try {
      const pago = obsModal.payment
      if (!pago) return

      setProcessingId(pago.id)
      console.log('Rechazando pago:', pago.id)
      console.log('Observación rechazo:', currentObservation)

      await callAprobarPago({
        pago_id: pago.id,
        accion: 'rechazar',
        observacion_revision: currentObservation.trim() || null,
      })

      await createSystemActivity({
        tipo: 'pago_rechazado',
        titulo: 'Pago rechazado',
        descripcion: `Pago ${pago.id} rechazado por ${adminName}`,
        entidad_tipo: 'pago',
        entidad_id: pago.id,
        prioridad: 'alta',
        visible_en_notificaciones: true,
        metadata: {
          observacion_revision: currentObservation.trim() || null,
          cliente_id: pago.cliente_id,
          prestamo_id: pago.prestamo_id,
          route: '/pagos-pendientes',
        },
      })

      Alert.alert('Pago rechazado correctamente')
      closeObservationModal()
      await loadData()
    } catch (error: any) {
      console.error(error)
      Alert.alert('Error al rechazar pago', error?.message || 'No se pudo rechazar el pago')
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
      {!isMobile ? (
        <AdminSidebar
          active="pagos-pendientes"
          adminName={adminName}
          adminRole={adminRole}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      ) : (
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>Pagos pendientes</Text>
          <View style={styles.mobileTopBarSpacer} />
        </View>
      )}

      <View style={styles.mainWrap}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            !isMobile && styles.contentDesktop,
            isMobile && styles.contentMobile,
          ]}
        >
          <Text style={styles.title}>Pagos pendientes</Text>
          <Text style={styles.subtitle}>Aprobá o rechazá pagos de transferencia. El saldo impacta solo al aprobar.</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder="Buscar por método o ID"
            placeholderTextColor="#64748B"
          />

          {queryError ? <Text style={styles.errorText}>Error al cargar pagos: {queryError}</Text> : null}
          {filtered.length === 0 ? <Text style={styles.empty}>No hay pagos pendientes para validar.</Text> : null}

          {filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.titleBlock}>
                  <Text style={styles.cardTitle}>Pago pendiente</Text>
                  {item.estado === 'pendiente_aprobacion' ? (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>Pendiente aprobación</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.amount}>{money(Number(item.monto || 0))}</Text>
              </View>

              <Text style={styles.clientMeta}>Cliente: {item.cliente_nombre || 'Cliente no informado'}</Text>
              <Text style={styles.clientMeta}>DNI: {item.cliente_dni || 'No registrado'}</Text>
              <Text style={styles.meta}>Método: {item.metodo || '—'}</Text>
              <Text style={styles.meta}>Fecha: {date(item.created_at)}</Text>
              <Text style={styles.meta}>Préstamo: {item.prestamo_id || '—'}</Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  disabled={processingId === item.id}
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => void handleAprobar(item.id)}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#DCFCE7" />
                  <Text style={styles.actionText}>
                    {processingId === item.id ? 'Procesando...' : '✔ Aprobar'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={processingId === item.id}
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => setObsModal({ open: true, payment: item })}
                >
                  <Ionicons name="close-circle" size={16} color="#FEE2E2" />
                  <Text style={styles.actionText}>✖ Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalWrapMenu}>
          <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)} />
          <AdminSidebar
            active="pagos-pendientes"
            adminName={adminName}
            adminRole={adminRole}
            onNavigate={onNavigate}
            onLogout={onLogout}
            mobile
            onCloseMobile={() => setMenuOpen(false)}
          />
        </View>
      </Modal>

      <Modal visible={obsModal.open} transparent animationType="fade" onRequestClose={closeObservationModal}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.overlay} onPress={closeObservationModal} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rechazar pago</Text>

            <TextInput
              style={styles.observationInput}
              value={currentObservation}
              onChangeText={setCurrentObservation}
              placeholder="Observación (opcional)"
              placeholderTextColor="#64748B"
              multiline
            />

            <TouchableOpacity
              style={styles.confirmBtn}
              disabled={!!processingId}
              onPress={() => void handleConfirmReject()}
            >
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
  mainWrap: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    padding: 20,
    gap: 16,
  },
  contentDesktop: {
    marginLeft: 260,
  },
  contentMobile: {
    marginLeft: 0,
    paddingTop: 84,
  },
  mobileTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    height: 56,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#020817',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 16 },
  mobileTopBarSpacer: { width: 24, height: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  searchInput: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    color: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleBlock: {
    flex: 1,
    gap: 8,
    paddingRight: 10,
  },
  cardTitle: { color: '#CBD5E1', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  amount: { color: '#93C5FD', fontWeight: '900', fontSize: 28, lineHeight: 32, textAlign: 'right', flexShrink: 1 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  statusBadgeText: { color: '#92400E', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  clientMeta: { color: '#E2E8F0', fontSize: 13, fontWeight: '700' },
  meta: { color: '#94A3B8', fontSize: 12 },
  actions: { marginTop: 6, flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  approveBtn: { borderColor: '#166534', backgroundColor: '#052E16' },
  rejectBtn: { borderColor: '#991B1B', backgroundColor: '#450A0A' },
  actionText: { color: '#E2E8F0', fontWeight: '700' },
  errorText: { color: '#FCA5A5', marginTop: 8 },
  empty: { color: '#94A3B8', marginTop: 8 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020817',
    padding: 20,
  },
  loadingText: { color: '#CBD5E1', marginTop: 8 },
  deniedTitle: { color: '#fff', fontWeight: '800', fontSize: 22 },
  deniedText: { color: '#94A3B8', textAlign: 'center', marginTop: 8 },
  backBtn: {
    marginTop: 16,
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtnText: { color: '#fff', fontWeight: '700' },
  modalWrapMenu: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.72)' },
  modalCard: {
    width: '90%',
    maxWidth: 450,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    gap: 10,
  },
  modalTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  observationInput: {
    minHeight: 90,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    color: '#E2E8F0',
    backgroundColor: '#020817',
  },
  confirmBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  confirmText: { color: '#fff', fontWeight: '700' },
})
