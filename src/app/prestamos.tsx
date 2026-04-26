import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { useAppTheme } from '../context/AppThemeContext'
import { HistorialPrestamoItem, fetchAdminPanelData } from '../lib/admin-dashboard'
import { badgePrestamo } from '../lib/statuses'
import { supabase } from '../lib/supabase'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function formatDate(value?: string) {
  if (!value || value === '—') return '—'
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export default function PrestamosScreen() {
  const { theme } = useAppTheme()
  const colors = theme.colors
  const { width } = useWindowDimensions()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('admin')
  const [items, setItems] = useState<HistorialPrestamoItem[]>([])
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<'todos' | 'activos' | 'vencidos' | 'pagados'>('todos')

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

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.id) {
        const { data: usuarioData } = await supabase.from('usuarios').select('nombre, rol').eq('id', user.id).maybeSingle()
        setAdminName(usuarioData?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(usuarioData?.rol || 'admin')
      }

      const data = await fetchAdminPanelData()
      setItems(data.historial)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()

    return items.filter((row) => {
      const estado = String(row.estado || '').toLowerCase()
      const activeMatch =
        stateFilter === 'todos' ||
        (stateFilter === 'activos' && ['activo', 'pendiente', 'en_mora', 'atrasado'].includes(estado)) ||
        (stateFilter === 'vencidos' && ['vencido', 'en_mora', 'atrasado'].includes(estado)) ||
        (stateFilter === 'pagados' && ['pagado', 'cancelado'].includes(estado))

      if (!activeMatch) return false
      if (!t) return true

      return (
        row.cliente.toLowerCase().includes(t) ||
        row.dni.toLowerCase().includes(t) ||
        row.prestamoId.toLowerCase().includes(t)
      )
    })
  }, [items, search, stateFilter])

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {!mobile ? (
        <AdminSidebar active="prestamos" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={[styles.mobileTopBar, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setShowMobileMenu(true)}>
            <Ionicons name="menu" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.mobileTitle, { color: colors.textPrimary }]}>Préstamos</Text>
          <View style={{ width: 24 }} />
        </View>
      )}
      <View style={styles.main}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#3B82F6" size="large" />
            <Text style={styles.loadingText}>Cargando préstamos...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, mobile && { paddingTop: 72 }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Préstamos</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Vista operativa con detalle de estado, fechas y saldos.</Text>

            <View style={[styles.filtersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.surfaceSoft, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Buscar por cliente, DNI o ID de préstamo"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
              />
              <View style={styles.filterRow}>
                {(['todos', 'activos', 'vencidos', 'pagados'] as const).map((filter) => (
                  <TouchableOpacity key={filter} onPress={() => setStateFilter(filter)} style={[styles.filterChip, filter === stateFilter && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, { color: colors.textSecondary }, filter === stateFilter && styles.filterChipTextActive]}>{filter}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {filtered.map((loan) => (
              <TouchableOpacity
                key={loan.prestamoId}
                style={[styles.loanCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: `/cliente/${loan.clienteId}`,
                    params: { prestamo_id: loan.prestamoId },
                  } as any)
                }
              >
                {(() => {
                  const badge = badgePrestamo(loan.estado)
                  return (
                <View style={styles.rowBetween}>
                <Text style={[styles.loanTitle, { color: colors.textPrimary }]}>{loan.cliente}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                  )
                })()}
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Cliente DNI: {loan.dni}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Monto: {money(loan.monto)} · Interés: {loan.interes}%</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Total a pagar: {money(loan.total)} · Restante: {money(loan.restante)}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  Modalidad: {loan.modalidad === 'diario' ? 'Diario' : loan.modalidad === 'mensual' ? 'Mensual' : '—'} · Cuotas: {loan.cuotasPlan || '—'}
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Fecha inicio: {formatDate(loan.fechaInicio)} · Fecha límite: {formatDate(loan.fechaLimite)} · Fecha mora: {formatDate(loan.fechaMora)}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  Cuotas pagadas: {loan.cuotasPagadas} · Pendientes: {loan.cuotasPendientes} · Próxima: {loan.proximaCuotaNumero ? `#${loan.proximaCuotaNumero} (${formatDate(loan.proximaCuotaVencimiento)})` : '—'}
                </Text>
                <View style={styles.cardLinkRow}>
                  <Ionicons name="open-outline" size={14} color={colors.primary} />
                  <Text style={[styles.cardLinkText, { color: colors.primary }]}>Ver detalle del cliente / préstamo</Text>
                </View>
                {loan.comprobantePagoId ? (
                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() => router.push(`/pago-aprobado?id=${loan.comprobantePagoId}` as any)}
                  >
                    <Text style={styles.receiptButtonText}>Ver comprobante</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            ))}

            {filtered.length === 0 ? <Text style={[styles.empty, { color: colors.textSecondary }]}>No se encontraron préstamos para el filtro actual.</Text> : null}
          </ScrollView>
        )}
      </View>

      <Modal visible={showMobileMenu} transparent animationType="fade" onRequestClose={() => setShowMobileMenu(false)}>
        <View style={styles.modalWrap}>
          <AdminSidebar
            active="prestamos"
            adminName={adminName}
            adminRole={adminRole}
            onNavigate={onNavigate}
            onLogout={onLogout}
            mobile
            onCloseMobile={() => setShowMobileMenu(false)}
          />
          <Pressable style={styles.overlay} onPress={() => setShowMobileMenu(false)} />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#020817' },
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#CBD5E1', marginTop: 10 },
  content: { padding: 16, gap: 10, paddingBottom: 30 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  filtersCard: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, padding: 12, gap: 10 },
  searchInput: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#020817', color: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { borderWidth: 1, borderColor: '#334155', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipActive: { borderColor: '#2563EB', backgroundColor: '#1E3A8A' },
  filterChipText: { color: '#CBD5E1', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#DBEAFE', fontWeight: '700' },
  loanCard: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, padding: 12, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loanTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  badge: { backgroundColor: '#172554', borderColor: '#1D4ED8', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#BFDBFE', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { color: '#94A3B8', fontSize: 12 },
  cardLinkRow: { marginTop: 6, flexDirection: 'row', gap: 5, alignItems: 'center' },
  cardLinkText: { color: '#93C5FD', fontWeight: '700', fontSize: 12 },
  receiptButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#0E1A35',
  },
  receiptButtonText: { color: '#DBEAFE', fontWeight: '700', fontSize: 12 },
  empty: { color: '#94A3B8' },
  modalWrap: { flex: 1, flexDirection: 'row' },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)' },
})
