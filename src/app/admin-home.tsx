import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppState, type AppStateStatus, type ViewStyle } from 'react-native'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { useAppTheme } from '../context/AppThemeContext'
import {
  ClienteDemoradoItem,
  ClientePrestamoActivo,
  PagoPendienteItem,
  ResumenCaja,
  fetchAdminPanelData,
} from '../lib/admin-dashboard'
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

function GradientCard({
  children,
  style,
  isLight,
  surfaceColor,
  borderColor,
}: {
  children: ReactNode
  style?: ViewStyle | ViewStyle[]
  isLight: boolean
  surfaceColor: string
  borderColor: string
}) {
  if (isLight) {
    return <View style={[styles.sectionCard, style, { backgroundColor: surfaceColor, borderColor }]}>{children}</View>
  }
  return (
    <LinearGradient colors={['#0F172A', '#020617']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sectionCard, style]}>
      {children}
    </LinearGradient>
  )
}

export default function AdminHome() {
  const { theme } = useAppTheme()
  const colors = theme.colors
  const { width } = useWindowDimensions()
  const isMobile = width < 1024
  const isDesktop = !isMobile
  const isCompactMobile = width < 768
  const kpiGridWebStyle = isDesktop && Platform.OS === 'web'
    ? ({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 } as const)
    : null

  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('Administrador')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null)
  const [kpis, setKpis] = useState({
    cobrarHoy: 0,
    cobrarSemana: 0,
    clientesActivos: 0,
    clientesDemorados: 0,
    prestamosVencidos: 0,
    pagosPendientes: 0,
  })
  const [resumenCaja, setResumenCaja] = useState<ResumenCaja>({
    cobradoHoy: 0,
    cobradoSemana: 0,
    pendienteTotal: 0,
    moraEstimada: 0,
  })
  const [activeClients, setActiveClients] = useState<ClientePrestamoActivo[]>([])
  const [lateClients, setLateClients] = useState<ClienteDemoradoItem[]>([])
  const [lateClientsIds, setLateClientsIds] = useState<string[]>([])
  const [pendingPayments, setPendingPayments] = useState<PagoPendienteItem[]>([])
  const [pendingPaymentsError, setPendingPaymentsError] = useState<string | null>(null)
  const [lateClientsExpanded, setLateClientsExpanded] = useState(false)
  const notificationsButtonRef = useRef<View | null>(null)
  const hasLoadedOnceRef = useRef(false)
  const loadingDashboardRef = useRef(false)

  const loadNotifications = useCallback(async () => {
    try {
      const [top, unread] = await Promise.all([getTopNotifications(12), getUnreadNotificationsCount()])
      setNotifications(top as AdminNotification[])
      setUnreadCount(unread)
    } catch (error) {
      console.error('admin-home notificaciones error', error)
    }
  }, [])

  const loadDashboardData = useCallback(async () => {
    if (loadingDashboardRef.current) return
    loadingDashboardRef.current = true

    try {
      if (!hasLoadedOnceRef.current) {
        setLoading(true)
      } else {
        setRefetching(true)
      }

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
      setPendingPaymentsError(null)
      setPendingPayments(data.pagosPendientesList || [])
      setKpis(data.kpis)
      setResumenCaja(data.resumenCaja)
      setActiveClients(data.activosCards)
      setLateClients(data.clientesDemorados)
      setLateClientsIds(data.clientesDemoradosIds)
      await loadNotifications()
      hasLoadedOnceRef.current = true
    } catch (err: any) {
      console.error('admin-home loadDashboardData error', err)
      Alert.alert('Error', err?.message || 'No se pudo cargar el panel admin.')
    } finally {
      setLoading(false)
      setRefetching(false)
      loadingDashboardRef.current = false
    }
  }, [loadNotifications])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnceRef.current) return undefined
      void loadDashboardData()
      return undefined
    }, [loadDashboardData]),
  )

  useEffect(() => {
    const onAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && hasLoadedOnceRef.current) {
        void loadDashboardData()
      }
    }
    const subscription = AppState.addEventListener('change', onAppStateChange)
    return () => subscription.remove()
  }, [loadDashboardData])

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

      await loadDashboardData()

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

  const pendingPaymentsPreview = isCompactMobile ? pendingPayments.slice(0, 3) : pendingPayments
  const activeClientsPreview = isCompactMobile ? activeClients.slice(0, 4) : activeClients.slice(0, 6)

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#3B82F6" size="large" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando panel admin...</Text>
      </View>
    )
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {!isMobile ? (
        <AdminSidebar active="inicio" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={[styles.mobileTopBar, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.mobileTitle, { color: colors.textPrimary }]}>Admin</Text>
          <View
            collapsable={false}
            ref={(node) => {
              notificationsButtonRef.current = node
            }}
          >
            <TouchableOpacity style={[styles.mobileBellBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setNotificationsOpen((prev) => !prev)}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
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
        <ScrollView contentContainerStyle={[styles.content, { backgroundColor: colors.background }, isMobile ? styles.mobileContent : styles.desktopContent]}>
          <View style={[styles.pageTopRow, isDesktop && styles.pageTopRowDesktop]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, isDesktop && styles.pageTitleDesktop, isCompactMobile && styles.pageTitleMobileCompact, { color: colors.textPrimary }]}>
                Bienvenido, {adminName}
              </Text>
              <View style={styles.subtitleWrap}>
                <Text style={[styles.pageSubtitle, isDesktop && styles.pageSubtitleDesktop, isCompactMobile && styles.pageSubtitleMobileCompact, { color: colors.textSecondary }]}>
                  Dashboard financiero · {todayLabel}
                </Text>
                {refetching ? <ActivityIndicator size="small" color={colors.primary} style={styles.refetchIndicator} /> : null}
              </View>
            </View>
            {!isMobile ? (
              <View style={styles.headerActions}>
                <View
                  collapsable={false}
                  ref={(node) => {
                    notificationsButtonRef.current = node
                  }}
                >
                  <TouchableOpacity
                    style={[styles.notificationsBtn, styles.notificationsBtnDesktop, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => setNotificationsOpen((prev) => !prev)}
                  >
                    <Ionicons name="mail-unread-outline" size={16} color={colors.primary} />
                    <Text style={[styles.notificationsText, { color: colors.textPrimary }]}>Notificaciones</Text>
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

          <View style={[styles.kpiGrid, isDesktop && styles.kpiGridDesktop, isCompactMobile && styles.kpiGridMobileCompact, kpiGridWebStyle as any]}>
            <AdminStatCard compact={isCompactMobile} label="A cobrar hoy" subtitle="Vence hoy" value={money(kpis.cobrarHoy)} icon="calendar-outline" tone="blue" />
            <AdminStatCard compact={isCompactMobile} label="A cobrar semana" subtitle="Próximos 7 días" value={money(kpis.cobrarSemana)} icon="time-outline" tone="teal" />
            <AdminStatCard compact={isCompactMobile} label="Clientes activos" subtitle="Con préstamos vigentes" value={String(kpis.clientesActivos)} icon="people-outline" tone="violet" />
            <AdminStatCard compact={isCompactMobile} label="Clientes demorados" subtitle="Con atraso vigente" value={String(kpis.clientesDemorados)} icon="alert-outline" tone="orange" />
            <AdminStatCard compact={isCompactMobile} label="Préstamos vencidos" subtitle="Requieren atención" value={String(kpis.prestamosVencidos)} icon="alert-circle-outline" tone="orange" />
            <AdminStatCard compact={isCompactMobile} label="Pagos pendientes" subtitle="Por aprobar" value={String(kpis.pagosPendientes)} icon="cash-outline" tone="teal" />
            <AdminStatCard compact={isCompactMobile} label="Cobrado hoy" subtitle="Ingresos del día" value={money(resumenCaja.cobradoHoy)} icon="trending-up-outline" tone="teal" />
            <AdminStatCard compact={isCompactMobile} label="Cobrado semana" subtitle="Ingresos semanales" value={money(resumenCaja.cobradoSemana)} icon="bar-chart-outline" tone="blue" />
            <AdminStatCard compact={isCompactMobile} label="Pendiente total" subtitle="Saldo por cobrar" value={money(resumenCaja.pendienteTotal)} icon="wallet-outline" tone="violet" />
            <Pressable
              onPress={() => router.push('/detalle-mora' as any)}
              style={({ hovered }) => [styles.moraCardPressable, hovered && styles.cardHover]}
            >
              <AdminStatCard compact={isCompactMobile} label="Mora estimada" subtitle="Ver detalle del cálculo" value={money(resumenCaja.moraEstimada)} icon="warning-outline" tone="orange" />
            </Pressable>
            {isMobile ? <AdminStatCard compact={isCompactMobile} label="No leídas" subtitle="Notificaciones" value={String(unreadCount)} icon="notifications-outline" tone="teal" /> : null}
          </View>

          <GradientCard
            isLight={theme.isLight}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            style={[isDesktop ? styles.sectionCardDesktopCompact : undefined, isCompactMobile && styles.sectionCardMobileCompact]}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Acciones rápidas</Text>
            <View style={[styles.featureActionsWrap, isMobile && { flexDirection: 'column' }, isDesktop && styles.featureActionsWrapDesktop, isCompactMobile && styles.featureActionsWrapMobileCompact]}>
              <Pressable
                onPress={() => router.push('/nuevo-prestamo' as any)}
                style={({ hovered }) => [styles.featureActionCard, isDesktop && styles.featureActionCardDesktop, isCompactMobile && styles.featureActionCardMobileCompact, hovered && styles.cardHover]}
              >
                <LinearGradient
                  colors={['#2563EB', '#1E3A8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.featureGradient, isDesktop && styles.featureGradientDesktop, isCompactMobile && styles.featureGradientMobileCompact]}
                >
                  <Ionicons name="wallet-outline" size={isCompactMobile ? 20 : isDesktop ? 22 : 24} color="#DBEAFE" />
                  <Text style={[styles.featureTitle, isDesktop && styles.featureTitleDesktop, isCompactMobile && styles.featureTitleMobileCompact]}>Nuevo préstamo</Text>
                  <Text style={[styles.featureSubtitle, isDesktop && styles.featureSubtitleDesktop, isCompactMobile && styles.featureSubtitleMobileCompact]}>
                    Crear préstamo y plan de cuotas
                  </Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => router.push('/cargar-pago' as any)}
                style={({ hovered }) => [styles.featureActionCard, isDesktop && styles.featureActionCardDesktop, isCompactMobile && styles.featureActionCardMobileCompact, hovered && styles.cardHover]}
              >
                <LinearGradient
                  colors={['#7C3AED', '#4C1D95']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.featureGradient, isDesktop && styles.featureGradientDesktop, isCompactMobile && styles.featureGradientMobileCompact]}
                >
                  <Ionicons name="cash-outline" size={isCompactMobile ? 20 : isDesktop ? 22 : 24} color="#EDE9FE" />
                  <Text style={[styles.featureTitle, isDesktop && styles.featureTitleDesktop, isCompactMobile && styles.featureTitleMobileCompact]}>Registrar pago</Text>
                  <Text style={[styles.featureSubtitle, isDesktop && styles.featureSubtitleDesktop, isCompactMobile && styles.featureSubtitleMobileCompact]}>
                    Cargar abono recibido del cliente
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            <View style={[styles.smallActionGrid, isDesktop && styles.smallActionGridDesktop, isCompactMobile && styles.smallActionGridMobileCompact]}>
              <Pressable
                style={({ hovered }) => [
                  styles.smallAction,
                  isDesktop && styles.smallActionDesktop,
                  isCompactMobile && styles.smallActionMobileCompact,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                  hovered && styles.cardHover,
                ]}
                onPress={() => router.push('/nuevo-cliente' as any)}
              >
                <Ionicons name="person-add-outline" size={16} color="#93C5FD" />
                <Text style={[styles.smallActionText, { color: colors.textPrimary }]}>Nuevo cliente</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [
                  styles.smallAction,
                  isDesktop && styles.smallActionDesktop,
                  isCompactMobile && styles.smallActionMobileCompact,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                  hovered && styles.cardHover,
                ]}
                onPress={() => router.push('/clientes' as any)}
              >
                <Ionicons name="people-outline" size={16} color="#93C5FD" />
                <Text style={[styles.smallActionText, { color: colors.textPrimary }]}>Ver clientes</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [
                  styles.smallAction,
                  isDesktop && styles.smallActionDesktop,
                  isCompactMobile && styles.smallActionMobileCompact,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                  hovered && styles.cardHover,
                ]}
                onPress={() => router.push('/prestamos' as any)}
              >
                <Ionicons name="document-text-outline" size={16} color="#93C5FD" />
                <Text style={[styles.smallActionText, { color: colors.textPrimary }]}>Ver préstamos</Text>
              </Pressable>
              <Pressable
                style={({ hovered }) => [
                  styles.smallAction,
                  isDesktop && styles.smallActionDesktop,
                  isCompactMobile && styles.smallActionMobileCompact,
                  { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                  hovered && styles.cardHover,
                ]}
                onPress={() => router.push('/historial-prestamos' as any)}
              >
                <Ionicons name="time-outline" size={16} color="#93C5FD" />
                <Text style={[styles.smallActionText, { color: colors.textPrimary }]}>Historial</Text>
              </Pressable>
            </View>
          </GradientCard>

          <View style={[styles.mainGrid, isDesktop && styles.mainGridDesktop]}>
            <GradientCard
              isLight={theme.isLight}
              surfaceColor={colors.surface}
              borderColor={colors.border}
              style={[styles.pendingCard, isDesktop && styles.mainGridCardDesktop, isCompactMobile && styles.listCardMobileCompact]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pagos pendientes</Text>
                <TouchableOpacity onPress={() => router.push('/pagos-pendientes' as any)}>
                  <Text style={[styles.linkText, { color: colors.primary }]}>Ver todos</Text>
                </TouchableOpacity>
              </View>

              {pendingPaymentsError ? (
                <Text style={styles.errorText}>No se pudo cargar: {pendingPaymentsError}</Text>
              ) : pendingPayments.length === 0 ? (
                <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
                  <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                  <Text style={[styles.emptyTitle, { color: colors.success }]}>✔ No hay pagos pendientes</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal={isCompactMobile}
                  style={[styles.pendingList, isDesktop && styles.pendingListDesktop, isCompactMobile && styles.pendingListMobile]}
                  contentContainerStyle={[styles.pendingListContent, isCompactMobile && styles.pendingListContentMobile]}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={!isCompactMobile}
                  showsHorizontalScrollIndicator={false}
                >
                  {pendingPaymentsPreview.map((p) => {
                    const processing = processingPaymentId === p.id
                    return (
                      <View key={p.id} style={[styles.pendingRow, isCompactMobile && styles.pendingRowMobile, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pendingClient, { color: colors.textPrimary }]}>{p.cliente}</Text>
                          <Text style={[styles.pendingMeta, { color: colors.textSecondary }]}>DNI: {p.dni} · {p.metodo}</Text>
                          <Text style={[styles.pendingMeta, { color: colors.textSecondary }]}>{formatDate(p.createdAt)}</Text>
                          <Text style={[styles.pendingLateText, { color: colors.warning }]}>Pendiente hace {p.pendingDays || 0} días</Text>
                        </View>
                        <View style={styles.pendingActions}>
                          <Text style={[styles.pendingAmount, { color: colors.primary }]}>{money(p.monto)}</Text>
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

            <GradientCard
              isLight={theme.isLight}
              surfaceColor={colors.surface}
              borderColor={colors.border}
              style={[styles.clientsCard, isDesktop && styles.mainGridCardDesktop, isCompactMobile && styles.listCardMobileCompact]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Clientes con préstamos activos</Text>
                <TouchableOpacity onPress={() => router.push('/clientes' as any)}>
                  <Text style={[styles.linkText, { color: colors.primary }]}>Ver todos</Text>
                </TouchableOpacity>
              </View>

              {activeClients.length === 0 ? (
                <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
                  <Ionicons name="people" size={20} color="#475569" />
                  <Text style={[styles.emptySubtle, { color: colors.textSecondary }]}>Todavía no hay clientes activos.</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal={isCompactMobile}
                  style={[styles.clientListScroll, isDesktop && styles.clientListScrollDesktop, isCompactMobile && styles.clientListScrollMobile]}
                  contentContainerStyle={[styles.clientList, isCompactMobile && styles.clientListMobile]}
                  showsHorizontalScrollIndicator={false}
                >
                  {activeClientsPreview.map((client) => (
                    <Pressable
                      key={client.clienteId}
                      style={({ hovered }) => [
                        styles.clientRow,
                        isCompactMobile && styles.clientRowMobile,
                        { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                        hovered && styles.cardHover,
                      ]}
                      onPress={() => router.push(`/cliente/${client.clienteId}` as any)}
                    >
                      <View style={[styles.avatarCircle, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
                        <Text style={[styles.avatarText, { color: colors.textPrimary }]}>{client.nombre?.charAt(0)?.toUpperCase() || '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.clientName, { color: colors.textPrimary }]}>{client.nombre}</Text>
                        <Text style={[styles.clientMeta, { color: colors.textSecondary }]}>{client.email}</Text>
                        <Text style={[styles.clientMeta, { color: colors.textSecondary }]}>DNI: {client.dni}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {lateClientsIds.includes(client.clienteId) ? (
                          <Text style={styles.statusChipLate}>Demorado</Text>
                        ) : (
                          <Text style={styles.statusChip}>Activo</Text>
                        )}
                        <Text style={[styles.clientAmount, { color: colors.primary }]}>{money(client.prestamoActivo)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </GradientCard>
          </View>

          <GradientCard
            isLight={theme.isLight}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            style={[isCompactMobile && styles.listCardMobileCompact]}
          >
            <Pressable style={styles.accordionHeader} onPress={() => setLateClientsExpanded((prev) => !prev)}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Clientes demorados</Text>
              <View style={styles.accordionHeaderRight}>
                <Text style={[styles.linkText, { color: colors.warning }]}>{lateClients.length} con atraso</Text>
                <Ionicons name={lateClientsExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={colors.warning} />
              </View>
            </Pressable>
            {lateClientsExpanded ? (
              lateClients.length === 0 ? (
                <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#22C55E" />
                  <Text style={[styles.emptySubtle, { color: colors.textSecondary }]}>No hay clientes demorados hoy.</Text>
                </View>
              ) : (
                <View style={styles.lateClientsWrap}>
                  {lateClients.slice(0, isCompactMobile ? 4 : 6).map((cliente) => (
                    <View key={cliente.clienteId} style={[styles.lateClientRow, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pendingClient, { color: colors.textPrimary }]}>{cliente.nombre}</Text>
                        <Text style={[styles.pendingMeta, { color: colors.textSecondary }]}>DNI: {cliente.dni} · {cliente.telefono}</Text>
                        <Text style={[styles.pendingLateText, { color: colors.warning }]}>Atraso: {cliente.diasAtraso} días</Text>
                      </View>
                      <View style={styles.lateActionsCol}>
                        <Text style={[styles.pendingAmount, { color: colors.primary }]}>{money(cliente.saldoPendiente)}</Text>
                        <View style={styles.pendingBtnsRow}>
                          <TouchableOpacity style={styles.btnBase} onPress={() => router.push('/cargar-pago' as any)}>
                            <LinearGradient colors={['#2563EB', '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
                              <Text style={styles.smallBtnText}>Registrar pago</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnBase} onPress={() => router.push(`/cliente/${cliente.clienteId}` as any)}>
                            <LinearGradient colors={['#334155', '#0F172A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGradient}>
                              <Text style={styles.smallBtnText}>Ver detalle</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )
            ) : (
              <Text style={[styles.accordionHint, { color: colors.textSecondary }]}>Expandí para ver el detalle de clientes con mora.</Text>
            )}
          </GradientCard>
        </ScrollView>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalWrap}>
          <AdminSidebar
            active="inicio"
            adminName={adminName}
            adminRole={adminRole}
            onNavigate={onNavigate}
            onLogout={onLogout}
            mobile
            onCloseMobile={() => setMenuOpen(false)}
          />
          <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)} />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#020817' },
  mainWrap: { flex: 1 },
  content: { padding: 12, gap: 10, paddingBottom: 16, backgroundColor: '#020817', width: '100%', maxWidth: 1400, alignSelf: 'center' },
  desktopContent: { padding: 10, gap: 8, paddingBottom: 10 },
  mobileContent: { paddingTop: 78 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#94A3B8', marginTop: 10 },
  pageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pageTopRowDesktop: { marginBottom: 2 },
  pageTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 24 },
  pageTitleDesktop: { fontSize: 22, lineHeight: 26 },
  pageTitleMobileCompact: { fontSize: 22, lineHeight: 26 },
  subtitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageSubtitle: { color: '#94A3B8', marginTop: 6, fontSize: 13, textTransform: 'capitalize' },
  pageSubtitleDesktop: { marginTop: 2, fontSize: 11 },
  pageSubtitleMobileCompact: { marginTop: 3, fontSize: 11 },
  refetchIndicator: { marginTop: 4 },
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
  kpiGrid: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  kpiGridDesktop: { gap: 6, alignItems: 'stretch' },
  kpiGridMobileCompact: { gap: 6 },
  moraCardPressable: { flex: 1, minWidth: 180 },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#020617',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sectionCardDesktopCompact: { padding: 12, borderRadius: 12 },
  sectionCardMobileCompact: { padding: 10, borderRadius: 12 },
  cardHover: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  sectionTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 13 },
  featureActionsWrap: { flexDirection: 'row', gap: 10, marginTop: 10 },
  featureActionsWrapDesktop: { marginTop: 8, gap: 8 },
  featureActionsWrapMobileCompact: { marginTop: 8, gap: 8 },
  featureActionCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: 14,
    overflow: 'hidden',
  },
  featureActionCardDesktop: { minHeight: 80 },
  featureActionCardMobileCompact: { minHeight: 108 },
  featureGradient: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    padding: 12,
    justifyContent: 'space-between',
  },
  featureGradientDesktop: { borderRadius: 12, padding: 9, minHeight: 80 },
  featureGradientMobileCompact: { borderRadius: 12, padding: 12, minHeight: 96 },
  featureTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 15, marginTop: 6 },
  featureTitleDesktop: { fontSize: 13, marginTop: 3 },
  featureTitleMobileCompact: { fontSize: 16, marginTop: 5 },
  featureSubtitle: { color: '#DBEAFE', marginTop: 4, fontSize: 11 },
  featureSubtitleDesktop: { marginTop: 2, fontSize: 9 },
  featureSubtitleMobileCompact: { marginTop: 3, fontSize: 10 },
  smallActionGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallActionGridDesktop: { marginTop: 8, gap: 6 },
  smallActionGridMobileCompact: { marginTop: 8, gap: 8 },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020617',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallActionDesktop: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, gap: 6 },
  smallActionMobileCompact: { width: '48%', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 9, gap: 6 },
  smallActionText: { color: '#E2E8F0', fontWeight: '700', fontSize: 10 },
  mainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mainGridDesktop: { flexWrap: 'nowrap', gap: 8 },
  pendingCard: { flex: 1.2, minWidth: 320 },
  clientsCard: { flex: 1, minWidth: 320 },
  mainGridCardDesktop: { flex: 1, minWidth: 0, maxWidth: '50%', minHeight: 262, maxHeight: 262, padding: 14 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  linkText: { color: '#93C5FD', fontWeight: '700', fontSize: 11 },
  errorText: { color: '#FCA5A5', fontSize: 12 },
  emptyWrap: {
    minHeight: 84,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  emptyTitle: { color: '#D1FAE5', fontWeight: '700' },
  emptySubtle: { color: '#94A3B8' },
  pendingList: { maxHeight: 320 },
  pendingListDesktop: { maxHeight: 206 },
  pendingListMobile: { maxHeight: undefined },
  pendingListContent: { paddingRight: 4, paddingBottom: 2 },
  pendingListContentMobile: { paddingRight: 0, paddingBottom: 0, gap: 8 },
  pendingRow: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 9,
    backgroundColor: '#020617',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  pendingRowMobile: { width: 280, marginBottom: 0, alignItems: 'flex-start' },
  pendingClient: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
  pendingMeta: { color: '#94A3B8', marginTop: 2, fontSize: 11 },
  pendingLateText: { marginTop: 2, fontSize: 10, fontWeight: '700' },
  pendingActions: { alignItems: 'flex-end', gap: 7 },
  pendingBtnsRow: { flexDirection: 'row', gap: 6 },
  pendingAmount: { color: '#BFDBFE', fontWeight: '800', fontSize: 13 },
  btnBase: { borderRadius: 8, overflow: 'hidden' },
  btnGradient: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  btnDisabled: { opacity: 0.65 },
  smallBtnText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  clientListScroll: { maxHeight: 350 },
  clientListScrollDesktop: { maxHeight: 206 },
  clientListScrollMobile: { maxHeight: undefined },
  clientList: { gap: 8, paddingRight: 4, paddingBottom: 2 },
  clientListMobile: { gap: 8, paddingRight: 0, paddingBottom: 0 },
  clientRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#020617',
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clientRowMobile: { width: 290 },
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
  clientName: { color: '#E2E8F0', fontWeight: '600', fontSize: 13 },
  clientMeta: { color: '#94A3B8', fontSize: 10, marginTop: 2 },
  clientAmount: { color: '#C7D2FE', fontWeight: '800', fontSize: 13 },
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
  statusChipLate: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(220,38,38,0.22)',
    color: '#FCA5A5',
  },
  lateClientsWrap: { gap: 8 },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accordionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accordionHint: { marginTop: 8, fontSize: 11 },
  lateClientRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lateActionsCol: { alignItems: 'flex-end', gap: 8 },
  listCardMobileCompact: { padding: 12 },
  modalWrap: { flex: 1, flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)' },
})
