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
import { ClientePrestamoActivo, fetchAdminPanelData } from '../lib/admin-dashboard'
import { supabase } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function fecha(v?: string) {
  if (!v || v === '—') return '—'
  const [yy, mm, dd] = v.split('-')
  return yy && mm && dd ? `${dd}/${mm}/${yy}` : v
}

export default function AdminHome() {
  const { width } = useWindowDimensions()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('admin')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [filtro, setFiltro] = useState('')

  const [kpis, setKpis] = useState({
    cobrarHoy: 0,
    clientesActivos: 0,
    prestamosVencidos: 0,
    pagosPendientes: 0,
  })

  const [activosCards, setActivosCards] = useState<ClientePrestamoActivo[]>([])

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
      setKpis(dashboard.kpis)
      setActivosCards(dashboard.activosCards)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No pudimos cargar el panel admin')
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
    if (key === 'prestamos') return router.push('/nuevo-prestamo' as any)
    if (key === 'pagos') return router.push('/cargar-pago' as any)
    if (key === 'clientes') return router.push('/clientes' as any)
    if (key === 'historial') return router.push('/historial-prestamos' as any)
    if (key === 'config') return router.push('/configuraciones' as any)
  }

  const onLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const filtrados = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    if (!t) return activosCards
    return activosCards.filter(
      (item) =>
        item.nombre.toLowerCase().includes(t) || item.dni.toLowerCase().includes(t) || item.telefono.toLowerCase().includes(t)
    )
  }, [activosCards, filtro])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Cargando panel admin...</Text>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      {!mobile ? (
        <AdminSidebar active="inicio" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={() => setShowMobileMenu(true)}>
            <Ionicons name="menu" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>Panel admin</Text>
          <View style={{ width: 24 }} />
        </View>
      )}

      <View style={styles.main}>
        <ScrollView contentContainerStyle={[styles.content, mobile && { paddingTop: 72 }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.heading}>Inicio</Text>
              <Text style={styles.subheading}>Resumen operativo de CrediTodo</Text>
            </View>
            <TouchableOpacity style={styles.historyBtn} onPress={() => router.push('/historial-prestamos' as any)}>
              <Text style={styles.historyBtnText}>Ver historial de préstamos</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.kpiGrid}>
            <KpiCard label="A cobrar hoy" value={money(kpis.cobrarHoy)} icon="calendar-outline" />
            <KpiCard label="Clientes activos" value={String(kpis.clientesActivos)} icon="people-outline" />
            <KpiCard label="Préstamos vencidos" value={String(kpis.prestamosVencidos)} icon="warning-outline" />
            <KpiCard label="Pagos pendientes" value={String(kpis.pagosPendientes)} icon="cash-outline" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <View style={styles.actionsWrap}>
              <ActionButton label="Nuevo préstamo" onPress={() => router.push('/nuevo-prestamo' as any)} />
              <ActionButton label="Registrar pago" onPress={() => router.push('/cargar-pago' as any)} />
              <ActionButton label="Nuevo cliente" onPress={() => router.push('/nuevo-cliente' as any)} />
              <ActionButton label="Ver clientes" onPress={() => router.push('/clientes' as any)} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clientes con préstamo activo</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, DNI o teléfono"
              placeholderTextColor="#64748B"
              value={filtro}
              onChangeText={setFiltro}
            />

            {filtrados.length === 0 ? (
              <Text style={styles.empty}>No encontramos préstamos activos para mostrar.</Text>
            ) : (
              <View style={styles.cardsGrid}>
                {filtrados.map((item) => (
                  <View key={item.prestamoId} style={styles.card}>
                    <Text style={styles.cardTitle}>{item.nombre}</Text>
                    <Text style={styles.cardMeta}>DNI: {item.dni}</Text>
                    <Text style={styles.cardMeta}>Teléfono: {item.telefono}</Text>
                    <Text style={styles.cardMeta}>Monto: {money(item.monto)}</Text>
                    <Text style={styles.cardMeta}>Estado: {item.estado}</Text>
                    <Text style={styles.cardMeta}>Próxima fecha: {fecha(item.proximaFecha)}</Text>
                    <TouchableOpacity
                      style={styles.cardButton}
                      onPress={() =>
                        router.push({ pathname: '/cliente-detalle', params: { cliente_id: item.clienteId } } as any)
                      }
                    >
                      <Text style={styles.cardButtonText}>Ver cliente</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <Modal visible={showMobileMenu} transparent animationType="fade" onRequestClose={() => setShowMobileMenu(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.overlay} onPress={() => setShowMobileMenu(false)} />
          <AdminSidebar
            active="inicio"
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

function KpiCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiIcon}>
        <Ionicons name={icon} size={16} color="#93C5FD" />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  )
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
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
  content: { padding: 16, paddingTop: 20, gap: 14, paddingBottom: 30 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subheading: { color: '#94A3B8', marginTop: 4 },
  historyBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  historyBtnText: { color: '#fff', fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    minWidth: 190,
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    padding: 14,
  },
  kpiIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: { color: '#94A3B8', fontSize: 12 },
  kpiValue: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 4 },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    padding: 14,
  },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  actionsWrap: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: {
    borderRadius: 10,
    backgroundColor: '#1E40AF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: '#fff', fontWeight: '700' },
  searchInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020817',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    marginBottom: 12,
  },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    minWidth: 240,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#111827',
    padding: 12,
  },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardMeta: { color: '#94A3B8', marginTop: 4, fontSize: 12 },
  cardButton: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
    paddingVertical: 9,
    alignItems: 'center',
  },
  cardButtonText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#94A3B8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#CBD5E1', marginTop: 10 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
