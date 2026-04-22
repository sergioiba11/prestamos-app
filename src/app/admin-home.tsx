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
import { AdminNotificationsPanel, AdminNotification } from '../components/admin/AdminNotificationsPanel'
import { AdminQuickAction } from '../components/admin/AdminQuickAction'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { AdminStatCard } from '../components/admin/AdminStatCard'
import { ClientePrestamoActivo, fetchAdminPanelData, PagoPendienteItem } from '../lib/admin-dashboard'
import { supabase } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function formatDate(value: string) {
  if (!value || value === '—') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
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
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [kpis, setKpis] = useState({
    cobrarHoy: 0,
    clientesActivos: 0,
    prestamosVencidos: 0,
    pagosPendientes: 0,
  })
  const [activeClients, setActiveClients] = useState<ClientePrestamoActivo[]>([])
  const [pendingPayments, setPendingPayments] = useState<PagoPendienteItem[]>([])

  const loadNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id,titulo,descripcion,leida,created_at')
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) {
      console.error('admin-home notificaciones error', error)
      return
    }

    setNotifications((data || []) as AdminNotification[])
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.id) {
        const { data: userRow, error: userRowError } = await supabase
          .from('usuarios')
          .select('nombre, rol')
          .eq('id', user.id)
          .maybeSingle()

        if (userRowError) console.error('admin-home usuario/rol error', userRowError)

        setAdminName(userRow?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(userRow?.rol || 'Administrador')
      }

      const data = await fetchAdminPanelData()
      setKpis(data.kpis)
      setActiveClients(data.activosCards)
      setPendingPayments(data.pagosPendientesList)
      await loadNotifications()
    } catch (err: any) {
      console.error('admin-home loadData error', err)
      Alert.alert('Error', err?.message || 'No se pudo cargar el panel admin.')
    } finally {
      setLoading(false)
    }
  }, [loadNotifications])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

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

  const markAllRead = async () => {
    await supabase.from('notificaciones').update({ leida: true }).eq('leida', false)
    await loadNotifications()
  }

  const updatePendingPayment = async (pagoId: string, accion: 'aprobar' | 'rechazar') => {
    const { error } = await supabase.functions.invoke('aprobar-pago', { body: { pago_id: pagoId, accion } })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    await loadData()
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

  const unreadCount = notifications.filter((n) => !n.leida).length

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
          <Text style={styles.mobileTitle}>Admin</Text>
          <TouchableOpacity style={styles.mobileBellBtn} onPress={() => setNotificationsOpen((prev) => !prev)}>
            <Ionicons name="notifications-outline" size={20} color="#DBEAFE" />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainWrap}>
        <ScrollView contentContainerStyle={[styles.content, isMobile && { paddingTop: 78 }]}> 
          <View style={styles.pageTopRow}>
            <View>
              <Text style={styles.pageTitle}>Panel de administración</Text>
              <Text style={styles.pageSubtitle}>Hola, {adminName}. Resumen financiero en tiempo real.</Text>
            </View>
            {!isMobile ? (
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notificationsBtn} onPress={() => setNotificationsOpen((prev) => !prev)}>
                  <Ionicons name="mail-unread-outline" size={16} color="#C7D2FE" />
                  <Text style={styles.notificationsText}>Notificaciones</Text>
                  {unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{unreadCount}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                {notificationsOpen ? (
                  <AdminNotificationsPanel notifications={notifications} onMarkAllRead={markAllRead} />
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.kpiGrid}>
            <AdminStatCard label="A cobrar hoy" subtitle={kpis.cobrarHoy > 0 ? 'Cuotas con vencimiento hoy' : 'Sin vencimientos hoy'} value={money(kpis.cobrarHoy)} icon="calendar-outline" tone="blue" />
            <AdminStatCard label="Clientes activos" subtitle="Con préstamos vigentes" value={String(kpis.clientesActivos)} icon="people-outline" tone="violet" />
            <AdminStatCard label="Préstamos vencidos" subtitle="Requieren atención" value={String(kpis.prestamosVencidos)} icon="alert-circle-outline" tone="orange" />
            <AdminStatCard label="Pagos pendientes" subtitle="Por aprobar" value={String(kpis.pagosPendientes)} icon="cash-outline" tone="teal" />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <View style={styles.actionsGrid}>
              <AdminQuickAction label="Nuevo préstamo" subtitle="Crear préstamo" icon="wallet-outline" onPress={() => router.push('/nuevo-prestamo' as any)} />
              <AdminQuickAction label="Registrar pago" subtitle="Registrar abono" icon="cash-outline" onPress={() => router.push('/cargar-pago' as any)} />
              <AdminQuickAction label="Nuevo cliente" subtitle="Agregar cliente" icon="person-add-outline" onPress={() => router.push('/nuevo-cliente' as any)} />
              <AdminQuickAction label="Ver clientes" subtitle="Lista completa" icon="people-outline" onPress={() => router.push('/clientes' as any)} />
              <AdminQuickAction label="Ver préstamos" subtitle="Estado completo" icon="document-text-outline" onPress={() => router.push('/prestamos' as any)} />
              <AdminQuickAction label="Pagos pendientes" subtitle="Aprobación/rechazo" icon="hourglass-outline" onPress={() => router.push('/pagos-pendientes' as any)} />
              <AdminQuickAction label="Historial" subtitle="Préstamos históricos" icon="time-outline" onPress={() => router.push('/historial-prestamos' as any)} />
              <AdminQuickAction label="Actividad" subtitle="Auditoría base" icon="pulse-outline" onPress={() => router.push('/actividad' as any)} />
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumen del sistema</Text>
              <Text style={styles.summaryItem}>Clientes activos: {kpis.clientesActivos}</Text>
              <Text style={styles.summaryItem}>Préstamos vencidos: {kpis.prestamosVencidos}</Text>
              <Text style={styles.summaryItem}>Pagos pendientes: {kpis.pagosPendientes}</Text>
            </View>
            <TouchableOpacity style={[styles.summaryCard, styles.summaryClickable]} onPress={() => router.push('/configuraciones' as any)}>
              <Text style={styles.summaryTitle}>Configuración y branding</Text>
              <Text style={styles.summaryItem}>Accedé a negocio, medios de cobro y preferencias.</Text>
              <Text style={styles.historyLink}>Abrir configuración</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.twoColumns}>
            <View style={[styles.sectionCard, styles.pendingSection]}>
              <Text style={styles.sectionTitle}>Pagos pendientes de aprobación</Text>
              {pendingPayments.length === 0 ? (
                <View style={styles.pendingEmptyWrap}>
                  <View style={styles.pendingSuccessIcon}>
                    <Ionicons name="checkmark" size={22} color="#16A34A" />
                  </View>
                  <Text style={styles.pendingEmptyTitle}>No hay pagos pendientes por ahora.</Text>
                  <Text style={styles.pendingEmptySubtitle}>Los pagos registrados aparecerán aquí para su aprobación.</Text>
                </View>
              ) : (
                pendingPayments.map((p) => (
                  <View key={p.id} style={styles.pendingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingClient}>{p.cliente} · DNI {p.dni}</Text>
                      <Text style={styles.pendingMeta}>{p.metodo} · {formatDate(p.createdAt)}</Text>
                      <Text style={styles.pendingMeta}>Estado: {p.estadoValidacion || 'pendiente'}</Text>
                      {p.prestamoId ? <Text style={styles.pendingMeta}>Préstamo: {p.prestamoId}</Text> : null}
                    </View>
                    <View style={styles.pendingActions}>
                      <Text style={styles.pendingAmount}>{money(p.monto)}</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity style={styles.approveBtn} onPress={() => updatePendingPayment(p.id, 'aprobar')}>
                          <Text style={styles.smallBtnText}>Aprobar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.rejectBtn} onPress={() => updatePendingPayment(p.id, 'rechazar')}>
                          <Text style={styles.smallBtnText}>Rechazar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={[styles.sectionCard, styles.historyCard]} onPress={() => router.push('/historial-prestamos' as any)}>
              <View style={styles.historyIconWrap}>
                <Ionicons name="time-outline" size={24} color="#A5B4FC" />
              </View>
              <Text style={styles.historyTitle}>Historial de préstamos</Text>
              <Text style={styles.historySubtitle}>Ver todos los préstamos</Text>
              <View style={styles.historyLinkRow}>
                <Text style={styles.historyLink}>Abrir historial</Text>
                <Ionicons name="arrow-forward" size={14} color="#93C5FD" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Clientes con préstamo activo</Text>
              <View style={styles.viewButtons}>
                <View style={styles.viewBtn}><Ionicons name="list" size={14} color="#BFDBFE" /></View>
                <View style={styles.viewBtn}><Ionicons name="grid" size={14} color="#64748B" /></View>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#64748B" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nombre, DNI, email o teléfono"
                placeholderTextColor="#64748B"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {filteredClients.length === 0 ? (
              <Text style={styles.emptyText}>No hay clientes con préstamos activos</Text>
            ) : (
              <AdminClientsTable
                rows={filteredClients}
                onView={(row) => router.push({ pathname: '/cliente-detalle', params: { cliente_id: row.clienteId } } as any)}
                onEdit={(row) => router.push({ pathname: '/clientes', params: { cliente_id: row.clienteId } } as any)}
                onHistory={(row) => router.push({ pathname: '/historial-prestamos', params: { cliente_id: row.clienteId } } as any)}
              />
            )}

            <Text style={styles.tableCounter}>Mostrando {filteredClients.length} de {activeClients.length} clientes</Text>
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
  content: { padding: 20, gap: 16, paddingBottom: 34, backgroundColor: '#020817' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#94A3B8', marginTop: 10 },
  pageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pageTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 26 },
  pageSubtitle: { color: '#94A3B8', marginTop: 5, fontSize: 13 },
  headerActions: { position: 'relative' },
  notificationsBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  notificationsText: { color: '#CBD5E1', fontWeight: '700', fontSize: 12 },
  mobileTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, height: 56, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B',
    backgroundColor: '#020817', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  mobileTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 16 },
  mobileBellBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  unreadBadge: { position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 999, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  sectionCard: { borderRadius: 18, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#0B1220', padding: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  actionsGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { flex: 1, minWidth: 280, borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', padding: 14, backgroundColor: '#0B1220' },
  summaryClickable: { justifyContent: 'space-between' },
  summaryTitle: { color: '#E2E8F0', fontWeight: '800', marginBottom: 8 },
  summaryItem: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  pendingSection: { flex: 2, minWidth: 320 },
  pendingEmptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 22 },
  pendingSuccessIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.8)',
    backgroundColor: 'rgba(22,163,74,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pendingEmptyTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  pendingEmptySubtitle: { color: '#94A3B8', marginTop: 6, fontSize: 12, textAlign: 'center' },
  pendingRow: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, padding: 12, backgroundColor: '#0F172A', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 },
  pendingClient: { color: '#fff', fontWeight: '700' },
  pendingMeta: { color: '#94A3B8', marginTop: 2, fontSize: 12 },
  pendingActions: { alignItems: 'flex-end', gap: 6 },
  pendingAmount: { color: '#BFDBFE', fontWeight: '800' },
  approveBtn: { backgroundColor: '#065F46', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  rejectBtn: { backgroundColor: '#7F1D1D', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  historyCard: { flex: 1, minWidth: 260, justifyContent: 'center' },
  historyIconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#312E81', borderWidth: 1, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  historyTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  historySubtitle: { color: '#94A3B8', marginTop: 5, fontSize: 13 },
  historyLinkRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyLink: { color: '#93C5FD', fontWeight: '700', fontSize: 12 },
  viewButtons: { flexDirection: 'row', gap: 8 },
  viewBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020817',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#fff', paddingVertical: 10 },
  emptyText: { color: '#94A3B8', paddingBottom: 8 },
  tableCounter: { color: '#64748B', marginTop: 10, fontSize: 12 },
  footer: { textAlign: 'center', color: '#64748B', marginTop: 6, marginBottom: 12, fontSize: 12 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
