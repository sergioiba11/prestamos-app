import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AdminNavKey, AdminSidebar } from '../components/admin/AdminSidebar'
import { supabase } from '../lib/supabase'

type ActivityRow = {
  id: string
  tipo: string | null
  descripcion: string | null
  created_at: string | null
}

function formatDate(v?: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleString('es-AR')
}

export default function ActividadScreen() {
  const [loading, setLoading] = useState(true)
  const [adminName, setAdminName] = useState('Administrador')
  const [adminRole, setAdminRole] = useState('admin')
  const [items, setItems] = useState<ActivityRow[]>([])

  const onNavigate = (key: AdminNavKey) => {
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

      const fromActividad = await supabase
        .from('actividad')
        .select('id,tipo,descripcion,created_at')
        .order('created_at', { ascending: false })
        .limit(30)

      if (!fromActividad.error) {
        setItems((fromActividad.data || []) as ActivityRow[])
        return
      }

      const fromNotificaciones = await supabase
        .from('notificaciones')
        .select('id,tipo,descripcion,created_at')
        .order('created_at', { ascending: false })
        .limit(30)

      setItems((fromNotificaciones.data || []) as ActivityRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  return (
    <View style={styles.page}>
      <AdminSidebar active="actividad" adminName={adminName} adminRole={adminRole} onNavigate={onNavigate} onLogout={onLogout} />
      <View style={styles.main}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Cargando actividad...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Actividad del sistema</Text>
            <Text style={styles.subtitle}>Base de auditoría para clientes, préstamos y pagos.</Text>

            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.rowType}>{String(item.tipo || 'evento').replaceAll('_', ' ')}</Text>
                <Text style={styles.rowDesc}>{item.descripcion || 'Sin descripción'}</Text>
                <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
              </View>
            ))}

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
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#020817', flexDirection: 'row' },
  main: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#CBD5E1', marginTop: 8 },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#94A3B8' },
  row: { backgroundColor: '#0B1220', borderColor: '#1E293B', borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  rowType: { color: '#93C5FD', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  rowDesc: { color: '#E2E8F0', fontWeight: '600' },
  rowDate: { color: '#64748B', fontSize: 12 },
  emptyBox: { borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, alignItems: 'center', gap: 10 },
  emptyText: { color: '#94A3B8' },
  emptyBtn: { backgroundColor: '#1D4ED8', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
})
