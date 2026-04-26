import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ViewStyle } from 'react-native'
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
import { buildAprobacionRedirect, invocarAprobarPago } from '../lib/aprobar-pago'
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

function GradientCard({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return (
    <LinearGradient colors={['#0F172A', '#020617']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sectionCard, style]}>
      {children}
    </LinearGradient>
  )
}

export default function AdminHome() {
  const { width } = useWindowDimensions()
  const isMobile = width < 1024
  const isDesktop = !isMobile

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

      const result = await invocarAprobarPago({
        pago_id: pagoId,
        accion,
      })

      await loadData()

      if (accion === 'aprobar') {
        router.push(buildAprobacionRedirect(result, pagoId) as any)
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
        <ScrollView contentContainerStyle={[styles.content, isMobile ? styles.mobileContent : styles.desktopContent]}>
          <View style={[styles.pageTopRow, isDesktop && styles.pageTopRowDesktop]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, isDesktop && styles.pageTitleDesktop]}>Bienvenido, {adminName}</Text>
              <Text style={[styles.pageSubtitle, isDesktop && styles.pageSubtitleDesktop]}>Dashboard financiero · {todayLabel}</Text>
            </View>
            {!isMobile ? (
              <View style={styles.headerActions}>
                <View
                  collapsable={false}
                  ref={(node) => {
                    notificationsButtonRef.current = node
                  }}
                >
                  <TouchableOpacity style={[styles.notificationsBtn, styles.notificationsBtnDesktop]} onPress={() => setNotificationsOpen((prev) => !prev)}>
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

          <View style={[styles.kpiGrid, isDesktop && styles.kpiGridDesktop]}>
            <AdminStatCard label="A cobrar hoy" subtitle="Cuotas con vencimiento hoy" value={money(kpis.cobrarHoy)} icon="calendar-outline" tone="blue" />
            <AdminStatCard label="Clientes activos" subtitle="Con préstamos vigentes" value={String(kpis.clientesActivos)} icon="people-outline" tone="violet" />
            <AdminStatCard label="Préstamos vencidos" subtitle="Requieren atención" value={String(kpis.prestamosVencidos)} icon="alert-circle-outline" tone="orange" />
            <AdminStatCard label="Pagos pendientes" subtitle="Por aprobar" value={String(kpis.pagosPendientes)} icon="cash-outline" tone="teal" />
            {isMobile ? <AdminStatCard label="No leídas" subtitle="Notificaciones" value={String(unreadCount)} icon="notifications-outline" tone="teal" /> : null}
          </View>

          <GradientCard style={isDesktop ? styles.sectionCardDesktopCompact : undefined}>
            <Text style={styles.sectionTitle}>Acciones rápidas</Text>
            <View style={[styles.featureActionsWrap, isMobile && { flexDirection: 'column' }, isDesktop && styles.featureActionsWrapDesktop]}>
              <Pressable
                onPress={() => router.push('/nuevo-prestamo' as any)}
                style={({ hovered }) => [styles.featureActionCard, isDesktop && styles.featureActionCardDesktop, hovered && styles.cardHover]}
              >
                <LinearGradient colors={['#2563EB', '#1E3A8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featureGradient, isDesktop && styles.featureGradientDesktop]}>
                  <Ionicons name="wallet-outline" size={isDesktop ? 22 : 24} color="#DBEAFE" />
                  <Text style={[styles.featureTitle, isDesktop && styles.featureTitleDesktop]}>Nuevo préstamo</Text>
                  <Text style={[styles.featureSubtitle, isDesktop && styles.featureSubtitleDesktop]}>Crear préstamo y plan de cuotas</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => router.push('/cargar-pago' as any)}
                style={({ hovered }) => [styles.featureActionCard, isDesktop && styles.featureActionCardDesktop, hovered && styles.cardHover]}
              >
                <LinearGradient colors={['#7C3AED', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featureGradient, isDesktop && styles.featureGradientDesktop]}>
                  <Ionicons name="cash-outline" size={isDesktop ? 22 : 24} color="#EDE9FE" />
                  <Text style={[styles.featureTitle, isDesktop && styles.featureTitleDesktop]}>Registrar pago</Text>
                  <Text style={[styles.featureSubtitle, isDesktop && styles.featureSubtitleDesktop]}>Cargar abono recibido del cliente</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <View style={[styles.smallActionGrid, isDesktop && styles.smallActionGridDesktop]}>
              <Pressable
                style={({ hovered }) => [styles.smallAction, isDesktop && styles.smallActionDesktop, hovered && styles.cardHover]}
                onPress={() => router.push('/nuevo-cliente' as any)}
              >
                <Ionicons name="person-add-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Nuevo cliente</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [styles.smallAction, isDesktop && styles.smallActionDesktop, hovered && styles.cardHover]}
                onPress={() => router.push('/clientes' as any)}
              >
                <Ionicons name="people-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Ver clientes</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [styles.smallAction, isDesktop && styles.smallActionDesktop, hovered && styles.cardHover]}
                onPress={() => router.push('/prestamos' as any)}
              >
                <Ionicons name="document-text-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Ver préstamos</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [styles.smallAction, isDesktop && styles.smallActionDesktop, hovered && styles.cardHover]}
                onPress={() => router.push('/historial-prestamos' as any)}
              >
                <Ionicons name="time-outline" size={16} color="#93C5FD" />
                <Text style={styles.smallActionText}>Historial</Text>
              </Pressable>
            </View>
          </GradientCard>

          <View style={[styles.mainGrid, isDesktop && styles.mainGridDesktop]}>
            <GradientCard style={[styles.pendingCard, isDesktop && styles.mainGridCardDesktop]}>
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
                <ScrollView
                  style={[styles.pendingList, isDesktop && styles.pendingListDesktop]}
                  contentContainerStyle={styles.pendingListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
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
                            <TouchableOpacity disabled={processing} style={[styles.btnBase, processing && styles.btnDisabled]} onPress={() => updatePendingPayment(p.id, 'aprobar')}>
                              <LinearGradient colors={['#22C55E', '#16A34A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
                                <Text style={styles.smallBtnText}>Aprobar</Text>
                              </LinearGradient>
                            </TouchableOpacity>
                            <TouchableOpacity disabled={processing} style={[styles.btnBase, processing && styles.btnDisabled]} onPress={() => updatePendingPayment(p.id, 'rechazar')}>
                              <LinearGradient colors={['#EF4444', '#DC2626']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
                                <Text style={styles.smallBtnText}>Rechazar</Text>
                              </LinearGradient>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </ScrollView>
              )}
            </GradientCard>

            <GradientCard style={[styles.clientsCard, isDesktop && styles.mainGridCardDesktop]}>
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
                <ScrollView style={[styles.clientListScroll, isDesktop && styles.clientListScrollDesktop]} contentContainerStyle={styles.clientList}>
                  {activeClients.slice(0, 6).map((client) => (
                    <Pressable
                      key={client.clienteId}
                      style={({ hovered }) => [styles.clientRow, hovered && styles.cardHover]}
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
                        <Text style={styles.statusChip}>Activo</Text>
                        <Text style={styles.clientAmount}>{money(client.prestamoActivo)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </GradientCard>
          </View>

          <View style={[styles.bottomStatsGrid, isDesktop && styles.bottomStatsGridDesktop]}>
            <GradientCard style={[styles.bottomStatCard, isDesktop && styles.bottomStatCardDesktop]}>
              <Text style={styles.bottomLabel}>Cuotas pendientes</Text>
              <Text style={[styles.bottomValue, isDesktop && styles.bottomValueDesktop]}>{dashboardStats.cuotasPendientes}</Text>
            </GradientCard>
            <GradientCard style={[styles.bottomStatCard, isDesktop && styles.bottomStatCardDesktop]}>
              <Text style={styles.bottomLabel}>Monto pendiente</Text>
              <Text style={[styles.bottomValue, isDesktop && styles.bottomValueDesktop]}>{money(dashboardStats.totalMontoPendiente)}</Text>
            </GradientCard>
            <GradientCard style={[styles.bottomStatCard, isDesktop && styles.bottomStatCardDesktop]}>
              <Text style={styles.bottomLabel}>Próximos vencimientos</Text>
              <Text style={[styles.bottomValue, isDesktop && styles.bottomValueDesktop]}>{dashboardStats.upcoming}</Text>
            </GradientCard>
            <GradientCard style={[styles.bottomStatCard, isDesktop && styles.bottomStatCardDesktop]}>
              <Text style={styles.bottomLabel}>Préstamos activos</Text>
              <Text style={[styles.bottomValue, isDesktop && styles.bottomValueDesktop]}>{dashboardStats.prestamosActivos}</Text>
            </GradientCard>
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
  content: { padding: 24, gap: 22, paddingBottom: 40, backgroundColor: '#020817' },
  desktopContent: { padding: 16, gap: 12, paddingBottom: 18 },
  mobileContent: { paddingTop: 78 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#94A3B8', marginTop: 10 },
  pageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pageTopRowDesktop: { marginBottom: 2 },
  pageTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 28 },
  pageTitleDesktop: { fontSize: 28, lineHeight: 32 },
  pageSubtitle: { color: '#94A3B8', marginTop: 6, fontSize: 13, textTransform: 'capitalize' },
  pageSubtitleDesktop: { marginTop: 2, fontSize: 12 },
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
  notificationsBtnDesktop: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10 },
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
  kpiGridDesktop: { flexWrap: 'nowrap', gap: 10, alignItems: 'stretch' },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#020617',
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sectionCardDesktopCompact: { padding: 14, borderRadius: 14 },
  cardHover: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  sectionTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 16 },
  featureActionsWrap: { flexDirection: 'row', gap: 12, marginTop: 12 },
  featureActionsWrapDesktop: { marginTop: 10, gap: 10 },
  featureActionCard: {
    flex: 1,
    minHeight: 144,
    borderRadius: 16,
    overflow: 'hidden',
  },
  featureActionCardDesktop: { minHeight: 100 },
  featureGradient: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    padding: 18,
    justifyContent: 'space-between',
  },
  featureGradientDesktop: { borderRadius: 14, padding: 12, minHeight: 98 },
  featureTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 18, marginTop: 10 },
  featureTitleDesktop: { fontSize: 16, marginTop: 6 },
  featureSubtitle: { color: '#DBEAFE', marginTop: 6, fontSize: 12 },
  featureSubtitleDesktop: { marginTop: 3, fontSize: 11 },
  smallActionGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  smallActionGridDesktop: { marginTop: 10, gap: 8 },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020617',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  smallActionDesktop: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, gap: 6 },
  smallActionText: { color: '#E2E8F0', fontWeight: '700', fontSize: 12 },
  mainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mainGridDesktop: { flexWrap: 'nowrap', gap: 10 },
  pendingCard: { flex: 1.2, minWidth: 320 },
  clientsCard: { flex: 1, minWidth: 320 },
  mainGridCardDesktop: { flex: 1, minWidth: 0, maxWidth: '50%', minHeight: 262, maxHeight: 262, padding: 14 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  linkText: { color: '#93C5FD', fontWeight: '700', fontSize: 12 },
  errorText: { color: '#FCA5A5', fontSize: 12 },
  emptyWrap: {
    minHeight: 96,
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
  pendingListDesktop: { maxHeight: 206 },
  pendingListContent: { paddingRight: 4, paddingBottom: 2 },
  pendingRow: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 11,
    backgroundColor: '#020617',
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
  btnBase: { borderRadius: 8, overflow: 'hidden' },
  btnGradient: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  btnDisabled: { opacity: 0.65 },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  clientListScroll: { maxHeight: 350 },
  clientListScrollDesktop: { maxHeight: 206 },
  clientList: { gap: 8, paddingRight: 4, paddingBottom: 2 },
  clientRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#020617',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  clientName: { color: '#E2E8F0', fontWeight: '600', fontSize: 14 },
  clientMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  clientAmount: { color: '#C7D2FE', fontWeight: '800', fontSize: 14 },
  statusChip: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(22,163,74,0.2)',
    color: '#86EFAC',
  },
  bottomStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bottomStatsGridDesktop: { flexWrap: 'nowrap', gap: 8 },
  bottomStatCard: {
    flex: 1,
    minWidth: 170,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: 'transparent',
    padding: 14,
  },
  bottomStatCardDesktop: { minWidth: 0, padding: 10, borderRadius: 12 },
  bottomLabel: { color: '#94A3B8', fontSize: 12 },
  bottomValue: { color: '#E2E8F0', fontWeight: '800', fontSize: 18, marginTop: 8 },
  bottomValueDesktop: { fontSize: 16, marginTop: 6 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
