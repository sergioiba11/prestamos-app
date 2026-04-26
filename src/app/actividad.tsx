import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { ActivityFeedFilter, ActivityItem, getActivityFeed } from '../lib/activity'
import { supabase } from '../lib/supabase'

function formatDate(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-AR')
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function iconByType(tipo: string) {
  if (tipo.includes('cliente') || tipo.includes('dni')) return 'person-outline'
  if (tipo.includes('prestamo') || tipo.includes('solicitud')) return 'wallet-outline'
  if (tipo.includes('pago')) return 'cash-outline'
  if (tipo.includes('login')) return 'log-in-outline'
  return 'pulse-outline'
}

function priorityLabel(priority: string) {
  if (priority === 'critica') return 'Crítica'
  if (priority === 'alta') return 'Alta'
  return 'Normal'
}

const FILTERS: Array<{ key: ActivityFeedFilter; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'prestamos', label: 'Préstamos' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'solicitudes', label: 'Solicitudes' },
  { key: 'logins', label: 'Logins' },
]

function Section({ title, items }: { title: string; items: ActivityItem[] }) {
  if (!items.length) return null

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item.id} style={[styles.row, item.prioridad === 'alta' && styles.rowHigh, item.prioridad === 'critica' && styles.rowCritical]}>
          <View style={styles.rowHeader}>
            <View style={styles.rowHeaderLeft}>
              <Ionicons name={iconByType(item.tipo) as any} size={15} color="#93C5FD" />
              <Text style={styles.rowType}>{String(item.tipo || 'evento').replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.flagsWrap}>
              <Text style={styles.priorityTag}>{priorityLabel(item.prioridad)}</Text>
              {item.fijada ? <Ionicons name="pin" size={12} color="#F59E0B" /> : null}
            </View>
          </View>
          <Text style={styles.rowTitle}>{item.titulo}</Text>
          <Text style={styles.rowDesc}>{item.descripcion || 'Sin descripción'}</Text>
          {item.usuario_nombre ? <Text style={styles.rowUser}>Usuario: {item.usuario_nombre}</Text> : null}
          <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
        </View>
      ))}
    </View>
  )
}

export default function ActividadScreen() {
  const { width } = useWindowDimensions()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('admin')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [filter, setFilter] = useState<ActivityFeedFilter>('todos')

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
        const { data: userData } = await supabase.from('usuarios').select('nombre, rol').eq('id', user.id).maybeSingle()
        setAdminName(userData?.nombre || user.email?.split('@')[0] || 'Administrador')
        setAdminRole(userData?.rol || 'admin')
      }

      const feed = await getActivityFeed({ filter, limit: 300 })
      setItems(feed)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const grouped = useMemo(() => {
    const pinned = items.filter((item) => item.fijada)
    const unread = items.filter((item) => !item.leida && !item.fijada)
    const today = items.filter((item) => !item.fijada && item.leida && isToday(item.created_at))
    const previous = items.filter((item) => !item.fijada && item.leida && !isToday(item.created_at))
    return { pinned, unread, today, previous }
  }, [items])

  return (
    <View style={styles.page}>
      {!mobile ? (
        <AdminSidebar active="actividad" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      ) : (
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={() => setShowMobileMenu(true)}>
            <Ionicons name="menu" size={24} color="#E2E8F0" />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>Actividad</Text>
          <View style={{ width: 24 }} />
        </View>
      )}
      <View style={styles.main}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Cargando actividad...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, mobile && { paddingTop: 72 }]}>
            <Text style={styles.title}>Actividad del sistema</Text>
            <Text style={styles.subtitle}>Historial completo de clientes, préstamos, pagos y accesos.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.key} style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]} onPress={() => setFilter(f.key)}>
                  <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Section title="Fijadas" items={grouped.pinned} />
            <Section title="No leídas" items={grouped.unread} />
            <Section title="Hoy" items={grouped.today} />
            <Section title="Anteriores" items={grouped.previous} />

            {items.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Todavía no hay actividad registrada.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/admin-home' as any)}>
                  <Text style={styles.emptyBtnText}>Volver al panel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>

      <Modal visible={showMobileMenu} transparent animationType="fade" onRequestClose={() => setShowMobileMenu(false)}>
        <View style={styles.modalWrap}>
          <AdminSidebar
            active="actividad"
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#CBD5E1', marginTop: 8 },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  filtersRow: { gap: 8, paddingVertical: 6 },
  filterBtn: { borderRadius: 999, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0B1220', paddingHorizontal: 12, paddingVertical: 7 },
  filterBtnActive: { borderColor: '#2563EB', backgroundColor: '#0E1A35' },
  filterText: { color: '#CBD5E1', fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#DBEAFE' },
  sectionWrap: { gap: 8 },
  sectionTitle: { color: '#E2E8F0', fontWeight: '800', fontSize: 14, marginTop: 4 },
  row: { backgroundColor: '#0B1220', borderColor: '#1E293B', borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  rowHigh: { borderColor: '#D97706' },
  rowCritical: { borderColor: '#DC2626', backgroundColor: '#1F1117' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flagsWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityTag: { color: '#94A3B8', fontSize: 11, textTransform: 'uppercase' },
  rowType: { color: '#93C5FD', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  rowTitle: { color: '#E2E8F0', fontWeight: '800' },
  rowDesc: { color: '#E2E8F0', fontWeight: '500' },
  rowUser: { color: '#93C5FD', fontSize: 12 },
  rowDate: { color: '#64748B', fontSize: 12 },
  emptyBox: { borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, alignItems: 'center', gap: 10 },
  emptyText: { color: '#94A3B8' },
  emptyBtn: { backgroundColor: '#1D4ED8', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  modalWrap: { flex: 1, flexDirection: 'row' },
  overlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)' },
})
