import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
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
import { EditClientModal } from '../components/admin/EditClientModal'
import { ClientePrestamoActivo, fetchAdminPanelData, PagoPendienteItem } from '../lib/admin-dashboard'
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
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientePrestamoActivo | null>(null)
  const [editOpen, setEditOpen] = useState(false)

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
      console.log('admin-home auth user', user)

      if (user?.id) {
        const { data: userRow, error: userRowError } = await supabase
          .from('usuarios')
          .select('nombre, rol')
          .eq('id', user.id)
          .maybeSingle()

        if (userRowError) {
          console.error('admin-home usuario/rol error', userRowError)
        }

        console.log('admin-home auth role row', userRow)
        setAdminName(userRow?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(userRow?.rol || 'Administrador')
      }

      const data = await fetchAdminPanelData()
      console.log('admin-home fetchAdminPanelData result', data)
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
          <Text style={styles.mobileTitle}>CrediTodo Admin</Text>
          <TouchableOpacity onPress={() => setNotificationsOpen((p) => !p)}>
            <Ionicons name="notifications-outline" size={22} color="#E2E8F0" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainWrap}>
        <ScrollView contentContainerStyle={[styles.content, isMobile && { paddingTop: 72 }]}>
          <LinearGradient colors={['#0B1025', '#123A9D', '#1D66E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBlock}>
            <View style={styles.headerLeft}>
              <View style={styles.brandPill}>
                <Ionicons name="shield-checkmark" size={14} color="#DBEAFE" />
                <Text style={styles.brandPillText}>CrediTodo Admin</Text>
              </View>
              <Text style={styles.headerEyebrow}>Panel de administración</Text>
              <Text style={styles.headerTitle}>Hola, {adminName}</Text>
              <Text style={styles.headerSubtitle}>Monitoreá préstamos, cobros y clientes en tiempo real.</Text>
            </View>

            <View style={styles.headerRight}>
              <View style={styles.dateBadge}>
                <Ionicons name="calendar-outline" size={16} color="#93C5FD" />
                <Text style={styles.dateBadgeText}>{formatDate(new Date().toISOString())}</Text>
              </View>
              <TouchableOpacity style={styles.bellBtn} onPress={() => setNotificationsOpen((prev) => !prev)}>
                <Ionicons name="mail-unread-outline" size={18} color="#DBEAFE" />
                {unreadCount > 0 ? (
                  <View style={styles.unreadBadge}><Text style={styles.unreadText}>{unreadCount}</Text></View>
                ) : null}
              </TouchableOpacity>
              {notificationsOpen ? (
                <AdminNotificationsPanel notifications={notifications} onMarkAllRead={markAllRead} />
              ) : null}
            </View>
          </LinearGradient>

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
                    <Text style={styles.pendingClient}>{p.cliente} · DNI {p.dni}</Text>
                    <Text style={styles.pendingMeta}>{p.metodo} · {formatDate(p.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.pendingAmount}>{money(p.monto)}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => updatePendingPayment(p.id, 'aprobar')}><Text style={styles.smallBtnText}>Aprobar</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => updatePendingPayment(p.id, 'rechazar')}><Text style={styles.smallBtnText}>Rechazar</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Clientes con préstamo activo</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/clientes' as any)}>
                <Text style={styles.linkBtnText}>Ver clientes</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, DNI, email o teléfono"
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
            />

            {filteredClients.length === 0 ? (
              <Text style={styles.emptyText}>No hay clientes con préstamos activos</Text>
            ) : (
              <AdminClientsTable
                rows={filteredClients}
                onView={(row) => router.push({ pathname: '/cliente-detalle', params: { cliente_id: row.clienteId } } as any)}
                onEdit={(row) => {
                  setSelectedClient(row)
                  setEditOpen(true)
                }}
                onHistory={(row) => router.push({ pathname: '/cliente-detalle', params: { cliente_id: row.clienteId } } as any)}
              />
            )}
          </View>

          <Text style={styles.footer}>© 2026 CrediTodo. Todos los derechos reservados.</Text>
        </ScrollView>
      </View>

      <EditClientModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => void loadData()}
        client={selectedClient ? {
          id: selectedClient.clienteId,
          usuario_id: selectedClient.usuarioId || undefined,
          nombre: selectedClient.nombre,
          dni: selectedClient.dni,
          telefono: selectedClient.telefono,
          direccion: selectedClient.direccion,
          email: selectedClient.email,
        } : null}
      />

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
  content: { padding: 18, gap: 14, paddingBottom: 30, backgroundColor: '#020817' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#94A3B8', marginTop: 10 },
  mobileTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, height: 56, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B',
    backgroundColor: '#020817', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  mobileTitle: { color: '#E2E8F0', fontWeight: '700', fontSize: 16 },
  headerBlock: { borderRadius: 22, padding: 22, flexDirection: 'row', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderWidth: 1, borderColor: 'rgba(147,197,253,0.25)' },
  headerLeft: { gap: 6, maxWidth: 620 },
  brandPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,23,42,0.34)', borderWidth: 1, borderColor: 'rgba(147,197,253,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  brandPillText: { color: '#DBEAFE', fontWeight: '700', fontSize: 12 },
  headerEyebrow: { color: 'rgba(219,234,254,0.86)', fontSize: 12, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 2 },
  headerSubtitle: { color: 'rgba(219,234,254,0.95)', marginTop: 2, fontSize: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, position: 'relative', alignSelf: 'flex-start' },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(147,197,253,0.55)', backgroundColor: 'rgba(2,6,23,0.32)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  dateBadgeText: { color: '#DBEAFE', fontWeight: '600', fontSize: 12 },
  bellBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(147,197,253,0.45)', backgroundColor: 'rgba(2,6,23,0.38)' },
  unreadBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  sectionCard: { borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#0B1220', padding: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  linkBtn: { borderWidth: 1, borderColor: '#60A5FA', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(37,99,235,0.2)' },
  linkBtnText: { color: '#DBEAFE', fontSize: 12, fontWeight: '700' },
  actionsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pendingRow: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 10, padding: 10, backgroundColor: '#0F172A', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 },
  pendingClient: { color: '#fff', fontWeight: '700' },
  pendingMeta: { color: '#94A3B8', marginTop: 2, fontSize: 12 },
  pendingAmount: { color: '#BFDBFE', fontWeight: '800' },
  approveBtn: { backgroundColor: '#065F46', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  rejectBtn: { backgroundColor: '#7F1D1D', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  searchInput: { borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#020817', paddingHorizontal: 12, paddingVertical: 10, color: '#fff', marginBottom: 12 },
  emptyText: { color: '#94A3B8' },
  footer: { textAlign: 'center', color: '#64748B', marginTop: 6, marginBottom: 12, fontSize: 12 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
