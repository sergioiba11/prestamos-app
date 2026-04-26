import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
import { HistorialPrestamoItem, fetchAdminPanelData } from '../lib/admin-dashboard'
import { supabase } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function fecha(v?: string) {
  if (!v || v === '—') return '—'
  const [yy, mm, dd] = v.split('-')
  return yy && mm && dd ? `${dd}/${mm}/${yy}` : v
}

const filterStates = ['todos', 'activo', 'pagado', 'vencido', 'cancelado'] as const

export default function HistorialPrestamosScreen() {
  const { width } = useWindowDimensions()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('admin')
  const [items, setItems] = useState<HistorialPrestamoItem[]>([])
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<(typeof filterStates)[number]>('todos')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.id) {
        const { data: usuarioData } = await supabase
          .from('usuarios')
          .select('nombre, rol')
          .eq('id', user.id)
          .maybeSingle()

        setAdminName(usuarioData?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(usuarioData?.rol || 'admin')
      }

      const dashboard = await fetchAdminPanelData()
      setItems(dashboard.historial)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

  const onNavigate = (key: AdminNavKey) => {
    setShowMobileMenu(false)

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

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase()

    return items.filter((item) => {
      const matchesText =
        !t || item.cliente.toLowerCase().includes(t) || item.dni.toLowerCase().includes(t) || item.prestamoId.toLowerCase().includes(t)

      const stateNorm = item.estado.toLowerCase()
      const matchesState = stateFilter === 'todos' || stateNorm === stateFilter

      return matchesText && matchesState
    })
  }, [items, query, stateFilter])

  return (
    <View style={styles.page}>
      {!mobile ? (
        <AdminSidebar active="historial" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={() => setShowMobileMenu(true)}>
            <Ionicons name="menu" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>Historial</Text>
          <View style={{ width: 24 }} />
        </View>
      )}

      <View style={styles.main}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#3B82F6" size="large" />
            <Text style={styles.loadingText}>Cargando historial...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, mobile && { paddingTop: 72 }]}>
            <Text style={styles.title}>Historial de préstamos</Text>
            <Text style={styles.subtitle}>Activos, pagados, vencidos y cancelados</Text>

            <View style={styles.filterCard}>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por cliente, DNI o ID de préstamo"
                placeholderTextColor="#64748B"
                value={query}
                onChangeText={setQuery}
              />

              <View style={styles.filtersRow}>
                {filterStates.map((state) => (
                  <TouchableOpacity
                    key={state}
                    style={[styles.filterChip, stateFilter === state && styles.filterChipActive]}
                    onPress={() => setStateFilter(state)}
                  >
                    <Text style={[styles.filterChipText, stateFilter === state && styles.filterChipTextActive]}>{state}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.listWrap}>
              {filtered.map((item) => (
                <View key={item.prestamoId} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.cliente}</Text>
                  <Text style={styles.itemMeta}>DNI: {item.dni}</Text>
                  <Text style={styles.itemMeta}>Monto: {money(item.monto)} · Interés: {item.interes}%</Text>
                  <Text style={styles.itemMeta}>Total: {money(item.total)} · Pagado: {money(item.pagado)}</Text>
                  <Text style={styles.itemMeta}>Restante: {money(item.restante)} · Estado: {item.estado}</Text>
                  <Text style={styles.itemMeta}>Inicio: {fecha(item.fechaInicio)} · Límite: {fecha(item.fechaLimite)}</Text>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() =>
                        router.push(`/cliente/${item.clienteId}?prestamo_id=${item.prestamoId}` as any)
                      }
                    >
                      <Text style={styles.actionButtonText}>Ver detalle</Text>
                    </TouchableOpacity>
                    {item.comprobantePagoId ? (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.receiptButton]}
                        onPress={() => router.push(`/pago-aprobado?id=${item.comprobantePagoId}` as any)}
                      >
                        <Text style={styles.receiptButtonText}>Ver comprobante</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}

              {filtered.length === 0 ? <Text style={styles.empty}>No hay préstamos para ese filtro.</Text> : null}
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={showMobileMenu} transparent animationType="fade" onRequestClose={() => setShowMobileMenu(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.overlay} onPress={() => setShowMobileMenu(false)} />
          <AdminSidebar
            active="historial"
            adminName={adminName}
            adminRole={adminRole}
            onNavigate={onNavigate}
            onLogout={onLogout}
            mobile
            onCloseMobile={() => setShowMobileMenu(false)}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#020817', flexDirection: 'row' },
  main: { flex: 1 },
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
    backgroundColor: '#0B1220',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 16 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  filterCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
    gap: 10,
  },
  searchInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020817',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#2563EB',
  },
  filterChipText: { color: '#CBD5E1', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#DBEAFE', fontWeight: '700' },
  listWrap: { gap: 10 },
  itemCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
  },
  itemTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  itemMeta: { color: '#94A3B8', marginTop: 4, fontSize: 12 },
  actionsRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  actionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
  },
  actionButtonText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12 },
  receiptButton: { backgroundColor: '#1E3A8A', borderColor: '#2563EB' },
  receiptButtonText: { color: '#DBEAFE', fontWeight: '700', fontSize: 12 },
  empty: { color: '#94A3B8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#CBD5E1', marginTop: 10 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
