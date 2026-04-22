import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
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
import { badgeCuota, badgePago, badgePrestamo } from '../lib/statuses'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  direccion: string | null
  dni: string | null
  usuario_id: string | null
}

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function date(v?: string | null) {
  if (!v) return '—'
  const [y, m, d] = v.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : v
}

export default function ClienteDetalle() {
  const params = useLocalSearchParams()

  const clienteIdParam = useMemo(() => {
    const raw = params.cliente_id
    if (Array.isArray(raw)) return raw[0]
    return typeof raw === 'string' ? raw : ''
  }, [params])

  const [loading, setLoading] = useState(true)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [detalle, setDetalle] = useState<PrestamoDetalle | null>(null)
  const [esClienteFinal, setEsClienteFinal] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const userId = authData.user?.id
      if (!userId) throw new Error('Sesión inválida')

      const { data: userData } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', userId)
        .maybeSingle()

      const rol = String(userData?.rol || '').toLowerCase()
      const esCliente = rol === 'cliente'
      setEsClienteFinal(esCliente)

      let clienteId = clienteIdParam

      if (esCliente || !clienteId) {
        const cli = await obtenerClientePorUsuario(userId)
        if (!cli) {
          setCliente(null)
          setDetalle(null)
          return
        }
        setCliente(cli as Cliente)
        clienteId = cli.id
      } else {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nombre, telefono, direccion, dni, usuario_id')
          .eq('id', clienteId)
          .maybeSingle()

        if (error) throw error
        if (!data) {
          setCliente(null)
          setDetalle(null)
          return
        }

        setCliente(data as Cliente)
      }

      const d = await obtenerPrestamoActivoConDetalle(clienteId)
      setDetalle(d)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar el detalle')
    } finally {
      setLoading(false)
    }
  }, [clienteIdParam])

  useFocusEffect(
    useCallback(() => {
      void cargar()
    }, [cargar])
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loading}>Cargando detalle...</Text>
      </View>
    )
  }

  if (!cliente) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Cliente no encontrado</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>Detalle de préstamo</Text>
        <Text style={styles.meta}>Cliente: {cliente.nombre}</Text>
        <Text style={styles.meta}>DNI: {cliente.dni || '—'}</Text>
        <Text style={styles.meta}>Teléfono: {cliente.telefono || '—'}</Text>
      </View>

      {!detalle ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No tenés préstamos activos.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resumen préstamo</Text>
            <Text style={styles.meta}>Monto inicial: {money(detalle.prestamo.monto || 0)}</Text>
            <Text style={styles.meta}>Interés: {Number(detalle.prestamo.interes || 0)}%</Text>
            <Text style={styles.meta}>Total a pagar: {money(detalle.prestamo.total_a_pagar || 0)}</Text>
            <Text style={styles.meta}>Saldo actual: {money(detalle.saldoCalculado)}</Text>
            <Text style={styles.meta}>Modalidad: {detalle.prestamo.modalidad || '—'}</Text>
            <Text style={styles.meta}>Fecha inicio: {date(detalle.prestamo.fecha_inicio)}</Text>
            <Text style={styles.meta}>Fecha límite: {date(detalle.prestamo.fecha_limite)}</Text>
            {(() => {
              const badge = badgePrestamo(detalle.prestamo.estado)
              return (
                <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                  <Text style={[styles.statusBadgeText, { color: badge.text }]}>Préstamo: {badge.label}</Text>
                </View>
              )
            })()}
            <Text style={styles.meta}>Pagado aprobado: {money(detalle.totalPagadoAprobado)}</Text>
            <Text style={styles.meta}>Pagos pendientes: {money(detalle.totalPendienteRevision)}</Text>
            <Text style={styles.meta}>Mora estimada: {detalle.cuotasVencidas > 0 ? 'Con atraso' : 'Al día'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Próxima cuota pendiente</Text>
            {!detalle.proximaCuota ? (
              <Text style={styles.empty}>No hay cuotas pendientes.</Text>
            ) : (
              <>
                <Text style={styles.meta}>Cuota #{detalle.proximaCuota.numero_cuota}</Text>
                <Text style={styles.meta}>Vencimiento: {date(detalle.proximaCuota.fecha_vencimiento)}</Text>
                <Text style={styles.meta}>Monto: {money(detalle.proximaCuota.monto_cuota || 0)}</Text>
                <Text style={styles.meta}>Saldo pendiente: {money(detalle.proximaCuota.saldo_pendiente || 0)}</Text>
                {(() => {
                  const badge = badgeCuota(detalle.proximaCuota.estado)
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>Estado: {badge.label}</Text>
                    </View>
                  )
                })()}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cuotas</Text>
            {detalle.cuotas.map((c) => (
              <View key={c.id} style={styles.item}>
                <Text style={styles.itemTitle}>Cuota #{c.numero_cuota}</Text>
                <Text style={styles.itemMeta}>Vencimiento: {date(c.fecha_vencimiento)}</Text>
                <Text style={styles.itemMeta}>Monto cuota: {money(c.monto_cuota || 0)}</Text>
                <Text style={styles.itemMeta}>Saldo pendiente: {money(c.saldo_pendiente || 0)}</Text>
                {(() => {
                  const badge = badgeCuota(c.estado)
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>Estado: {badge.label}</Text>
                    </View>
                  )
                })()}
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pagos aplicados / registrados</Text>
            {detalle.pagos.length === 0 ? (
              <Text style={styles.empty}>Sin pagos registrados.</Text>
            ) : (
              detalle.pagos.map((p) => (
                <View key={p.id} style={styles.item}>
                  <Text style={styles.itemTitle}>{date(p.created_at)}</Text>
                  <Text style={styles.itemMeta}>Monto: {money(p.monto || 0)}</Text>
                  <Text style={styles.itemMeta}>Método: {p.metodo || '—'}</Text>
                  {(() => {
                    const badge = badgePago(p.estado)
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>Estado: {badge.label}</Text>
                      </View>
                    )
                  })()}
                </View>
              ))
            )}
          </View>

          {!esClienteFinal && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push({ pathname: '/cargar-pago', params: { cliente_id: cliente.id } } as any)}
              >
                <Text style={styles.primaryText}>Registrar pago</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.push({ pathname: '/historial-prestamos', params: { cliente_id: cliente.id } } as any)}
              >
                <Text style={styles.secondaryText}>Ver historial</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loading: { color: '#CBD5E1', marginTop: 10 },
  backButton: { alignSelf: 'flex-start', backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  backButtonText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, padding: 12 },
  title: { color: '#fff', fontSize: 21, fontWeight: '800', marginBottom: 10 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  meta: { color: '#CBD5E1', marginBottom: 4 },
  empty: { color: '#94A3B8' },
  item: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1F2937', borderRadius: 10, padding: 10, marginBottom: 8 },
  itemTitle: { color: '#fff', fontWeight: '700' },
  itemMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  statusBadge: { marginTop: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  primaryBtn: { backgroundColor: '#1D4ED8', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#1E293B', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  secondaryText: { color: '#E2E8F0', fontWeight: '700' },
})
