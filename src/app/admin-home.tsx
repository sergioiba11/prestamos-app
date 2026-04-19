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
import { AdminClientsTable } from '../components/admin/AdminClientsTable'
import { AdminQuickAction } from '../components/admin/AdminQuickAction'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { AdminStatCard } from '../components/admin/AdminStatCard'
import { fetchAdminPanelData, PagoPendienteItem } from '../lib/admin-dashboard'
import { supabase } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function formatDate(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminHome() {
  const { width } = useWindowDimensions()
  const isMobile = width < 1024

  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('Administrador')
  const [search, setSearch] = useState('')

  const [kpis, setKpis] = useState({
    cobrarHoy: 0,
    clientesActivos: 0,
    prestamosVencidos: 0,
    pagosPendientes: 0,
  })
  const [activeClients, setActiveClients] = useState<any[]>([])
  const [pendingPayments, setPendingPayments] = useState<PagoPendienteItem[]>([])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.id) {
        const { data: userRow } = await supabase
          .from('usuarios')
          .select('nombre, rol')
          .eq('id', user.id)
          .maybeSingle()

        setAdminName(userRow?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(userRow?.rol || 'Administrador')
      }

      const data = await fetchAdminPanelData()
      setKpis(data.kpis)
      setActiveClients(data.activosCards)
      setPendingPayments(data.pagosPendientesList)
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo cargar el panel admin.')
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
    setMenuOpen(false)
    if (key === 'inicio') return router.push('/admin-home' as any)
    if (key === 'nuevo-prestamo') return router.push('/nuevo-prestamo' as any)
    if (key === 'registrar-pago') return router.push('/cargar-pago' as any)
    if (key === 'clientes') return router.push('/clientes' as any)
    if (key === 'usuarios') return router.push('/nuevo-empleado' as any)
    if (key === 'config') return router.push('/configuraciones' as any)
  }

  const onLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const filteredClients = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return activeClients

    return activeClients.filter((row) => {
      return (
        row.nombre.toLowerCase().includes(t) ||
        row.dni.toLowerCase().includes(t) ||
        row.email.toLowerCase().includes(t) ||
        row.telefono.toLowerCase().includes(t)
      )
    })
  }, [activeClients, search])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3B82F6" size="large" />
        <Text style={styles.loadingText}>Cargando panel admin...</Text>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      {!isMobile ? (
        <AdminSidebar
          active="inicio"
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
          <Text style={styles.mobileTitle}>CrediTodo Admin</Text>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={22} color="#E2E8F0" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainWrap}>
        <ScrollView contentContainerStyle={[styles.content, isMobile && { paddingTop: 72 }]}>
          <View style={styles.headerBlock}>
            <View>
              <Text style={styles.headerEyebrow}>Panel de administración</Text>
              <Text style={styles.headerTitle}>¡Bienvenido, {adminName}!</Text>
              <Text style={styles.headerSubtitle}>Gestioná tus préstamos de forma rápida y segura.</Text>
            </View>

            <View style={styles.headerRight}>
              <View style={styles.dateBadge}>
                <Ionicons name="calendar-outline" size={16} color="#93C5FD" />
                <Text style={styles.dateBadgeText}>{formatDate(new Date().toISOString())}</Text>
              </View>
              <TouchableOpacity style={styles.bellBtn}>
                <Ionicons name="notifications-outline" size={18} color="#DBEAFE" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <AdminStatCard label="A cobrar hoy" value={money(kpis.cobrarHoy)} icon="calendar-outline" tone="blue" />
            <AdminStatCard label="Clientes activos" value={String(kpis.clientesActivos)} icon="people-outline" tone="violet" />
            <AdminStatCard label="Préstamos vencidos" value={String(kpis.prestamosVencidos)} icon="alert-circle-outline" tone="orange" />
            <AdminStatCard label="Pagos pendientes" value={String(kpis.pagosPendientes)} icon="cash-outline" tone="teal" />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <View style={styles.actionsGrid}>
              <AdminQuickAction label="Nuevo préstamo" icon="wallet-outline" onPress={() => router.push('/nuevo-prestamo' as any)} />
              <AdminQuickAction label="Registrar pago" icon="cash-outline" onPress={() => router.push('/cargar-pago' as any)} />
              <AdminQuickAction label="Nuevo cliente" icon="person-add-outline" onPress={() => router.push('/nuevo-cliente' as any)} />
              <AdminQuickAction label="Ver clientes" icon="people-outline" onPress={() => router.push('/clientes' as any)} />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Pagos pendientes de aprobación</Text>
            {pendingPayments.length === 0 ? (
              <Text style={styles.emptyText}>No hay pagos pendientes por ahora.</Text>
            ) : (
              pendingPayments.map((p) => (
                <View key={p.id} style={styles.pendingRow}>
                  <View>
                    <Text style={styles.pendingClient}>{p.cliente}</Text>
                    <Text style={styles.pendingMeta}>{p.metodo} · {formatDate(p.createdAt)}</Text>
                  </View>
                  <Text style={styles.pendingAmount}>{money(p.monto)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Clientes con préstamo activo</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, DNI, email o teléfono"
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
            />

            {filteredClients.length === 0 ? (
              <Text style={styles.emptyText}>No hay clientes con préstamo activo para mostrar.</Text>
            ) : (
              <AdminClientsTable
                rows={filteredClients}
                onView={(clienteId) =>
                  router.push({ pathname: '/cliente-detalle', params: { cliente_id: clienteId } } as any)
                }
              />
            )}
          </View>

          <Text style={styles.footer}>© 2026 CrediTodo. Todos los derechos reservados.</Text>
        </ScrollView>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)} />
          <AdminSidebar
            active="inicio"
            adminName={adminName}
            adminRole={adminRole}
            onNavigate={onNavigate}
            onLogout={onLogout}
            mobile
            onCloseMobile={() => setMenuOpen(false)}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#020817' },
  mainWrap: { flex: 1 },
  content: { padding: 18, gap: 14, paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#94A3B8', marginTop: 10 },
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
    backgroundColor: '#0A1120',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 16 },
  headerBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerEyebrow: { color: '#60A5FA', fontSize: 12, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  headerSubtitle: { color: '#94A3B8', marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateBadgeText: { color: '#DBEAFE', fontWeight: '600', fontSize: 12 },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
  },
  kpiGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 14,
  },
  sectionTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  actionsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pendingRow: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  pendingClient: { color: '#fff', fontWeight: '700' },
  pendingMeta: { color: '#94A3B8', marginTop: 2, fontSize: 12 },
  pendingAmount: { color: '#BFDBFE', fontWeight: '800' },
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
  emptyText: { color: '#94A3B8' },
  footer: { textAlign: 'center', color: '#64748B', marginTop: 6, marginBottom: 12, fontSize: 12 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
