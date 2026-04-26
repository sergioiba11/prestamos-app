import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { AdminNotificationsPanel, AdminNotification } from '../components/admin/AdminNotificationsPanel'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { AdminStatCard } from '../components/admin/AdminStatCard'
import { ClienteAdminListadoItem, ClientePrestamoActivo, PagoPendienteItem, fetchAdminPanelData } from '../lib/admin-dashboard'
import {
  getTopNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../lib/activity'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function formatDate(value: string) {
  if (!value || value === '—') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function stateTone(status: string) {
  const s = String(status || '').toLowerCase()
  if (s.includes('venc') || s.includes('mora') || s.includes('atras')) return styles.statusDanger
  if (s.includes('activo') || s.includes('vigente')) return styles.statusOk
  return styles.statusNeutral
}

export default function AdminHome() {
  const { width } = useWindowDimensions()
  const isMobile = width < 1024

  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('Administrador')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null)
  const [kpis, setKpis] = useState({
    cobrarHoy: 0,
    clientesActivos: 0,
    prestamosVencidos: 0,
    pagosPendientes: 0,
  })
  const [activeClients, setActiveClients] = useState<ClientePrestamoActivo[]>([])
  const [pendingPayments, setPendingPayments] = useState<PagoPendienteItem[]>([])
  const [pendingPaymentsError, setPendingPaymentsError] = useState<string | null>(null)
  const notificationsButtonRef = useRef<View | null>(null)

  const loadNotifications = useCallback(async () => {
    try {
      const [top, unread] = await Promise.all([getTopNotifications(12), getUnreadNotificationsCount()])
      setNotifications(top as AdminNotification[])
      setUnreadCount(unread)
    } catch (error) {
      console.error('admin-home notificaciones error', error)
    }
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
      const clientesById = new Map<string, ClienteAdminListadoItem>(
        data.clientesListado.map((cliente) => [cliente.clienteId, cliente]),
      )

      const { data: pendingPaymentsData, error: pendingPaymentsErrorResponse } = await supabase
        .from('pagos')
        .select('id, cliente_id, prestamo_id, monto, metodo, created_at, estado')
        .eq('estado', 'pendiente_aprobacion')
        .order('created_at', { ascending: false })

      console.log('lista pagos pendientes:', pendingPaymentsData)
      console.log('error lista pagos pendientes:', pendingPaymentsErrorResponse)

      if (pendingPaymentsErrorResponse) {
        setPendingPaymentsError(pendingPaymentsErrorResponse.message)
        setPendingPayments([])
      } else {
        setPendingPaymentsError(null)
        const pendingItems = (pendingPaymentsData || []).map((pago: any) => {
          const cliente = clientesById.get(String(pago.cliente_id || ''))
          return {
            id: String(pago.id),
            clienteId: String(pago.cliente_id || ''),
            cliente: cliente?.nombre || String(pago.cliente_id || 'Cliente sin identificar'),
            dni: cliente?.dni || '—',
            monto: Number(pago.monto || 0),
            metodo: String(pago.metodo || 'Sin método'),
            createdAt: String(pago.created_at || ''),
            estadoValidacion: String(pago.estado || 'pendiente_aprobacion'),
            prestamoId: pago.prestamo_id ? String(pago.prestamo_id) : undefined,
            telefono: cliente?.telefono || undefined,
          } as PagoPendienteItem
        })
        setPendingPayments(pendingItems)
      }

      const totalPagosPendientes = pendingPaymentsData?.length || 0

      setKpis({
        ...data.kpis,
        pagosPendientes: totalPagosPendientes,
      })
      setActiveClients(data.activosCards)
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
    }, [loadData]),
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
    await markAllNotificationsAsRead()
    await loadNotifications()
  }

  const updatePendingPayment = async (pagoId: string, accion: 'aprobar' | 'rechazar') => {
    try {
      setProcessingPaymentId(pagoId)

      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      const token = sessionData.session?.access_token
      if (!token) throw new Error('No hay sesión activa')

      const response = await fetch(`${supabaseUrl}/functions/v1/aprobar-pago`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          pago_id: pagoId,
          accion,
        }),
      })

      let json: any = null
      try {
        json = await response.json()
      } catch {
        json = null
      }

      console.log('aprobar status:', response.status)
      console.log('respuesta:', json)

      if (!response.ok) {
        throw new Error(json?.error || `Error HTTP ${response.status}`)
      }

      await loadData()

      if (accion === 'aprobar') {
        router.push(`/pago-aprobado?id=${encodeURIComponent(String(pagoId))}` as any)
      }
    } catch (error: any) {
      console.error(error)
      Alert.alert('Error', error?.message || 'No se pudo procesar el pago')
    } finally {
      setProcessingPaymentId(null)
    }
  }

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('es-AR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    [],
  )

  const dashboardStats = useMemo(() => {
    const totalMontoPendiente = activeClients.reduce((acc, item) => acc + Number(item.prestamoActivo || 0), 0)
    const cuotasPendientes = activeClients.filter((item) => item.estado !== 'cancelado').length
    const upcoming = activeClients.filter((item) => {
      if (!item.proximoPago || item.proximoPago === '—') return false
      const d = new Date(item.proximoPago)
      if (Number.isNaN(d.getTime())) return false
      const diff = d.getTime() - Date.now()
      const days = diff / (1000 * 60 * 60 * 24)
      return days >= 0 && days <= 7
    }).length

    return {
      cuotasPendientes,
      totalMontoPendiente,
      upcoming,
      prestamosActivos: activeClients.length,
    }
  }, [activeClients])

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
        <AdminSidebar active="inicio" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>Admin</Text>
          <View
            collapsable={false}
            ref={(node) => {
              notificationsButtonRef.current = node
            }}
          >
            <TouchableOpacity style={styles.mobileBellBtn} onPress={() => setNotificationsOpen((prev) => !prev)}>
              <Ionicons name="notifications-outline" size={20} color="#DBEAFE" />
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.mainWrap}>
        <ScrollView contentContainerStyle={[styles.content, isMobile && { paddingTop: 78 }]}>
          <View style={styles.pageTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>Bienvenido, {adminName}</Text>
              <Text style={styles.pageSubtitle}>Dashboard financiero · {todayLabel}</Text>
            </View>
            {!isMobile ? (
              <View style={styles.headerActions}>
                <View
                  collapsable={false}
                  ref={(node) => {
                    notificationsButtonRef.current = node
                  }}
                >
                  <TouchableOpacity style={styles.notificationsBtn} onPress={() => setNotificationsOpen((prev) => !prev)}>
                    <Ionicons name="mail-unread-outline" size={16} color="#C7D2FE" />
                    <Text style={styles.notificationsText}>Notificaciones</Text>
                    {unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          <AdminNotificationsPanel
            visible={notificationsOpen}
            notifications={notifications}
            onMarkAllRead={markAllRead}
            anchorRef={notificationsButtonRef.current}
            onClose={() => setNotificationsOpen(false)}
            onOpenItem={async (item) => {
              if (!item.leida) await markNotificationAsRead(item.id)
              await loadNotifications()
              const route = item.metadata?.route
              if (typeof route === 'string' && route.startsWith('/')) {
                setNotificationsOpen(false)
                router.push(route as any)
              }
            }}
          />

          <View style={styles.kpiGrid}>
            <AdminStatCard label="A cobrar hoy" subtitle="Cuotas con vencimiento hoy" value={money(kpis.cobrarHoy)} icon="calendar-outline" tone="blue" />
            <AdminStatCard label="Clientes activos" subtitle="Con préstamos vigentes" value={String(kpis.clientesActivos)} icon="people-outline" tone="violet" />
            <AdminStatCard label="Préstamos vencidos" subtitle="Requieren atención" value={String(kpis.prestamosVencidos)} icon="alert-circle-outline" tone="orange" />
            <AdminStatCard label="Pagos pendientes" subtitle="Por aprobar" value={String(kpis.pagosPendientes)} icon="cash-outline" tone="teal" />
            <AdminStatCard label="No leídas" subtitle="Notificaciones" value={String(unreadCount)} icon="notifications-outline" tone="teal" />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <View style={[styles.featureActionsWrap, isMobile && { flexDirection: 'column' }]}>
              <TouchableOpacity style={[styles.featureActionCard, styles.featureBlue]} onPress={() => router.push('/nuevo-prestamo' as any)}>
                <Ionicons name="wallet-outline" size={24} color="#BFDBFE" />
                <Text style={styles.featureTitle}>Nuevo préstamo</Text>
                <Text style={styles.featureSubtitle}>Crear préstamo y plan de cuotas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.featureActionCard, styles.featureViolet]} onPress={() => router.push('/cargar-pago' as any)}>
                <Ionicons name="cash-outline" size={24} color="#DDD6FE" />
                <Text style={styles.featureTitle}>Registrar pago</Text>
                <Text style={styles.featureSubtitle}>Cargar abono recibido del cliente</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.smallActionGrid}>
              <TouchableOpacity style={styles.smallAction} onPress={() => router.push('/nuevo-cliente' as any)}>
                <Ionicons name="person-add-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Nuevo cliente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallAction} onPress={() => router.push('/clientes' as any)}>
                <Ionicons name="people-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Ver clientes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallAction} onPress={() => router.push('/prestamos' as any)}>
                <Ionicons name="document-text-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Ver préstamos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallAction} onPress={() => router.push('/historial-prestamos' as any)}>
                <Ionicons name="time-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Historial</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.mainGrid}>
            <View style={[styles.sectionCard, styles.pendingCard]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionTitle}>Pagos pendientes</Text>
                <TouchableOpacity onPress={() => router.push('/pagos-pendientes' as any)}>
                  <Text style={styles.linkText}>Ver todos</Text>
                </TouchableOpacity>
              </View>

              {pendingPaymentsError ? (
                <Text style={styles.errorText}>No se pudo cargar: {pendingPaymentsError}</Text>
              ) : pendingPayments.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                  <Text style={styles.emptyTitle}>✔ No hay pagos pendientes</Text>
                </View>
              ) : (
                <ScrollView style={styles.pendingList} nestedScrollEnabled showsVerticalScrollIndicator>
                  {pendingPayments.map((p) => {
                    const processing = processingPaymentId === p.id
                    return (
                      <View key={p.id} style={styles.pendingRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pendingClient}>{p.cliente}</Text>
                          <Text style={styles.pendingMeta}>DNI: {p.dni} · {p.metodo}</Text>
                          <Text style={styles.pendingMeta}>{formatDate(p.createdAt)}</Text>
                        </View>
                        <View style={styles.pendingActions}>
                          <Text style={styles.pendingAmount}>{money(p.monto)}</Text>
                          <View style={styles.pendingBtnsRow}>
                            <TouchableOpacity
                              disabled={processing}
                              style={[styles.approveBtn, processing && styles.btnDisabled]}
                              onPress={() => updatePendingPayment(p.id, 'aprobar')}
                            >
                              <Text style={styles.smallBtnText}>Aprobar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={processing}
                              style={[styles.rejectBtn, processing && styles.btnDisabled]}
                              onPress={() => updatePendingPayment(p.id, 'rechazar')}
                            >
                              <Text style={styles.smallBtnText}>Rechazar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </ScrollView>
              )}
            </View>

            <View style={[styles.sectionCard, styles.clientsCard]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.sectionTitle}>Clientes con préstamos activos</Text>
                <TouchableOpacity onPress={() => router.push('/clientes' as any)}>
                  <Text style={styles.linkText}>Ver todos</Text>
                </TouchableOpacity>
              </View>

              {activeClients.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="people" size={20} color="#475569" />
                  <Text style={styles.emptySubtle}>Todavía no hay clientes activos.</Text>
                </View>
              ) : (
                <View style={styles.clientList}>
                  {activeClients.slice(0, 6).map((client) => (
                    <TouchableOpacity
                      key={client.clienteId}
                      style={styles.clientRow}
                      onPress={() => router.push(`/cliente/${client.clienteId}` as any)}
                    >
                      <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>{client.nombre?.charAt(0)?.toUpperCase() || '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.clientName}>{client.nombre}</Text>
                        <Text style={styles.clientMeta}>{client.email}</Text>
                        <Text style={styles.clientMeta}>DNI: {client.dni}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Text style={[styles.statusChip, stateTone(client.estado)]}>{client.estado || 'activo'}</Text>
                        <Text style={styles.clientAmount}>{money(client.prestamoActivo)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.bottomStatsGrid}>
            <View style={styles.bottomStatCard}>
              <Text style={styles.bottomLabel}>Cuotas pendientes</Text>
              <Text style={styles.bottomValue}>{dashboardStats.cuotasPendientes}</Text>
            </View>
            <View style={styles.bottomStatCard}>
              <Text style={styles.bottomLabel}>Monto pendiente</Text>
              <Text style={styles.bottomValue}>{money(dashboardStats.totalMontoPendiente)}</Text>
            </View>
            <View style={styles.bottomStatCard}>
              <Text style={styles.bottomLabel}>Próximos vencimientos</Text>
              <Text style={styles.bottomValue}>{dashboardStats.upcoming}</Text>
            </View>
            <View style={styles.bottomStatCard}>
              <Text style={styles.bottomLabel}>Préstamos activos</Text>
              <Text style={styles.bottomValue}>{dashboardStats.prestamosActivos}</Text>
            </View>
          </View>
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
  pageTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 28 },
  pageSubtitle: { color: '#94A3B8', marginTop: 6, fontSize: 13, textTransform: 'capitalize' },
  headerActions: { position: 'relative', zIndex: 100, overflow: 'visible' },
  notificationsBtn: {
    minHeight: 42,
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
  mobileBellBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 16 },
  featureActionsWrap: { flexDirection: 'row', gap: 12, marginTop: 12 },
  featureActionCard: {
    flex: 1,
    minHeight: 118,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    justifyContent: 'space-between',
  },
  featureBlue: { backgroundColor: '#0B214A' },
  featureViolet: { backgroundColor: '#2E1065' },
  featureTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 18, marginTop: 10 },
  featureSubtitle: { color: '#BFDBFE', marginTop: 6, fontSize: 12 },
  smallActionGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallActionText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12 },
  mainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pendingCard: { flex: 1.2, minWidth: 320 },
  clientsCard: { flex: 1, minWidth: 320 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  linkText: { color: '#93C5FD', fontWeight: '700', fontSize: 12 },
  errorText: { color: '#FCA5A5', fontSize: 12 },
  emptyWrap: {
    minHeight: 130,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  emptyTitle: { color: '#D1FAE5', fontWeight: '700' },
  emptySubtle: { color: '#94A3B8' },
  pendingList: { maxHeight: 350 },
  pendingRow: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  pendingClient: { color: '#F8FAFC', fontWeight: '700' },
  pendingMeta: { color: '#94A3B8', marginTop: 2, fontSize: 12 },
  pendingActions: { alignItems: 'flex-end', gap: 7 },
  pendingBtnsRow: { flexDirection: 'row', gap: 6 },
  pendingAmount: { color: '#BFDBFE', fontWeight: '800' },
  approveBtn: { backgroundColor: '#166534', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  rejectBtn: { backgroundColor: '#991B1B', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  btnDisabled: { opacity: 0.65 },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  clientList: { gap: 10 },
  clientRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarText: { color: '#E2E8F0', fontWeight: '800' },
  clientName: { color: '#E2E8F0', fontWeight: '700', fontSize: 13 },
  clientMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  clientAmount: { color: '#C7D2FE', fontWeight: '800', fontSize: 12 },
  statusChip: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  statusOk: { backgroundColor: 'rgba(22,163,74,0.2)', color: '#86EFAC' },
  statusDanger: { backgroundColor: 'rgba(220,38,38,0.2)', color: '#FDA4AF' },
  statusNeutral: { backgroundColor: 'rgba(71,85,105,0.3)', color: '#CBD5E1' },
  bottomStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bottomStatCard: {
    flex: 1,
    minWidth: 170,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    padding: 14,
  },
  bottomLabel: { color: '#94A3B8', fontSize: 12 },
  bottomValue: { color: '#E2E8F0', fontWeight: '800', fontSize: 18, marginTop: 8 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
