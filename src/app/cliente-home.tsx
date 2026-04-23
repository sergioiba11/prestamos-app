import { router, Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  obtenerClientePorUsuario,
  obtenerPrestamoActivoConDetalle,
  type PrestamoDetalle,
} from '../lib/prestamos'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  direccion: string | null
  dni: string | null
  usuario_id: string | null
}

function formatearMoneda(value: number) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`
}

function formatearFecha(value?: string | null) {
  if (!value) return '—'
  const [yyyy, mm, dd] = value.slice(0, 10).split('-')
  if (!yyyy || !mm || !dd) return value
  return `${dd}/${mm}/${yyyy}`
}

function estadoGeneral(detalle: PrestamoDetalle) {
  if (detalle.totalPendienteRevision > 0) return 'Pendiente de aprobación'
  if (detalle.cuotasVencidas > 0) return 'Atrasado'
  return 'Al día'
}

function formatCurrency(value: number) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`
}

export default function ClienteHome() {
  const [loading, setLoading] = useState(true)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [detalle, setDetalle] = useState<PrestamoDetalle | null>(null)

  useEffect(() => {
    void cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const userId = authData.user?.id
      if (!userId) throw new Error('No se encontró la sesión del cliente')

      const clienteData = await obtenerClientePorUsuario(userId)
      if (!clienteData) {
        setCliente(null)
        setDetalle(null)
        return
      }

      setCliente(clienteData as Cliente)
      const detallePrestamo = await obtenerPrestamoActivoConDetalle(clienteData.id)
      setDetalle(detallePrestamo)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar tu panel')
    } finally {
      setLoading(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#020817" />

      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>CrediTodo</Text>
            <Text style={styles.title}>Hola {cliente?.nombre || 'cliente'}</Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={cargarDatos}>
            <Text style={styles.headerButtonText}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Cargando tu préstamo...</Text>
          </View>
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={styles.content}>
            {!detalle ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Estado del préstamo</Text>
                <Text style={styles.emptyMain}>No tenés préstamos activos</Text>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Préstamo activo</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.kpiLabel}>Estado general</Text>
                    <Text style={styles.badge}>{estadoGeneral(detalle)}</Text>
                  </View>
                  <View style={styles.grid}>
                    <View style={styles.metricItem}>
                      <Text style={styles.kpiLabel}>Total a pagar</Text>
                      <Text style={styles.kpiValue}>{formatearMoneda(detalle.prestamo.total_a_pagar || 0)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.kpiLabel}>Total pagado</Text>
                      <Text style={styles.kpiValue}>{formatearMoneda(detalle.totalPagadoAprobado)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.kpiLabel}>Saldo pendiente</Text>
                      <Text style={styles.kpiValue}>{formatearMoneda(detalle.saldoCalculado)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.kpiLabel}>Pendiente aprobación</Text>
                      <Text style={styles.kpiValue}>{formatearMoneda(detalle.totalPendienteRevision)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Próxima cuota</Text>
                  {detalle.proximaCuota ? (
                    <>
                      <Text style={styles.mainLine}>Cuota #{detalle.proximaCuota.numero_cuota}</Text>
                      <Text style={styles.infoLine}>Vence: {formatearFecha(detalle.proximaCuota.fecha_vencimiento)}</Text>
                      <Text style={styles.infoLine}>Monto: {formatearMoneda(detalle.proximaCuota.monto_cuota || 0)}</Text>
                      <Text style={styles.infoLine}>Estado: {detalle.proximaCuota.estado || 'pendiente'}</Text>
                    </>
                  ) : (
                    <Text style={styles.emptyText}>No hay próximas cuotas pendientes.</Text>
                  )}
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Cuotas</Text>
                  {detalle.cuotas.slice(0, 8).map((cuota) => (
                    <View key={cuota.id} style={styles.listRow}>
                      <Text style={styles.listTitle}>#{cuota.numero_cuota}</Text>
                      <Text style={styles.listMeta}>{formatearFecha(cuota.fecha_vencimiento)}</Text>
                      <Text style={styles.listMeta}>{formatearMoneda(cuota.monto_cuota || 0)}</Text>
                      <Text style={styles.listMeta}>{formatearMoneda(cuota.saldo_pendiente || 0)}</Text>
                      <Text style={styles.listMeta}>{cuota.estado || 'pendiente'}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Historial de pagos</Text>
                  {detalle.pagos.length === 0 ? (
                    <Text style={styles.emptyText}>Todavía no registrás pagos.</Text>
                  ) : (
                    detalle.pagos.slice(0, 12).map((pago) => (
                      <View key={pago.id} style={styles.listRow}>
                        <Text style={styles.listTitle}>{formatearFecha(pago.created_at)}</Text>
                        <Text style={styles.listMeta}>{formatearMoneda(pago.monto || 0)}</Text>
                        <Text style={styles.listMeta}>{pago.metodo || '—'}</Text>
                        <Text style={styles.listMeta}>{pago.estado || 'pendiente'}</Text>
                      </View>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.push(`/cliente/${cliente?.id || ''}` as any)}
                >
                  <Text style={styles.primaryButtonText}>Consultar préstamo</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.secondaryButton} onPress={cerrarSesion}>
              <Text style={styles.secondaryButtonText}>Salir</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020817' },
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 18,
    backgroundColor: '#0B1220',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { color: '#60A5FA', fontWeight: '800', fontSize: 14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 2 },
  headerButton: {
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerButtonText: { color: '#fff', fontWeight: '700' },
  body: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#CBD5E1' },
  card: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  badge: { color: '#BFDBFE', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricItem: {
    width: '48%',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  kpiLabel: { color: '#94A3B8', fontSize: 12 },
  kpiValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 3 },
  mainLine: { color: '#fff', fontWeight: '800', fontSize: 18 },
  infoLine: { color: '#CBD5E1', marginTop: 4 },
  listRow: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 8,
  },
  listTitle: { color: '#fff', fontWeight: '700' },
  listMeta: { color: '#94A3B8', marginTop: 3, fontSize: 12 },
  emptyText: { color: '#94A3B8' },
  emptyMain: { color: '#E2E8F0', fontSize: 16 },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#fff', fontWeight: '700' },
})
