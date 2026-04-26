import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { badgePago, badgePrestamo } from '../../lib/statuses'
import { fetchClienteDetalleConsolidado, type ClienteDetalleConsolidado } from '../../lib/admin-dashboard'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function date(value?: string | null) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(value)
}

export default function ClienteDetalleUnificadoScreen() {
  const params = useLocalSearchParams()
  const clienteId = useMemo(() => {
    const raw = params.id
    if (Array.isArray(raw)) return raw[0] || ''
    return typeof raw === 'string' ? raw : ''
  }, [params.id])

  const prestamoIdParam = useMemo(() => {
    const raw = params.prestamo_id
    if (Array.isArray(raw)) return raw[0] || ''
    return typeof raw === 'string' ? raw : ''
  }, [params.prestamo_id])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState<ClienteDetalleConsolidado | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      if (!clienteId) {
        setError('ID de cliente inválido.')
        setDetalle(null)
        return
      }

      const next = await fetchClienteDetalleConsolidado(clienteId)
      console.log('[cliente-detalle-unificado] resumen diagnostico', {
        clienteId,
        cantidadPrestamosListado: next.cliente?.cantidadPrestamos,
        cantidadPrestamosActivosListado: next.cliente?.cantidadPrestamosActivos,
        prestamosActivosDetalle: next.prestamosActivos.length,
        prestamosHistorialDetalle: next.historialPrestamos.length,
        pagosCliente: next.pagosCliente.length,
      })

      if (prestamoIdParam) {
        const foundPrestamo = next.historialPrestamos.some((prestamo) => prestamo.id === prestamoIdParam)
        if (!foundPrestamo) {
          console.warn('[cliente-detalle-unificado] prestamo_id no corresponde al cliente', { clienteId, prestamoIdParam })
        }
      }

      setDetalle(next)
    } catch (err: any) {
      console.error('[cliente-detalle-unificado] load error', err)
      setError(err?.message || 'No se pudo cargar el detalle del cliente.')
      setDetalle(null)
    } finally {
      setLoading(false)
    }
  }, [clienteId, prestamoIdParam])

  useFocusEffect(
    useCallback(() => {
      void cargar()
    }, [cargar])
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loading}>Cargando detalle del cliente...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void cargar()}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!detalle?.cliente) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Cliente no encontrado.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>Detalle de cliente</Text>
        <Text style={styles.meta}>Nombre: {detalle.cliente.nombre}</Text>
        <Text style={styles.meta}>DNI: {detalle.cliente.dni}</Text>
        <Text style={styles.meta}>Teléfono: {detalle.cliente.telefono}</Text>
        <Text style={styles.meta}>Email: {detalle.cliente.email}</Text>
        <Text style={styles.meta}>Préstamos activos (panel): {detalle.cliente.cantidadPrestamosActivos}</Text>
        <Text style={styles.meta}>Préstamos activos (detalle): {detalle.prestamosActivos.length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Préstamos activos reales</Text>
        {detalle.prestamosActivos.length === 0 ? (
          <Text style={styles.empty}>No hay préstamos activos para este cliente.</Text>
        ) : (
          detalle.prestamosActivos.map((prestamo) => {
            const badge = badgePrestamo(prestamo.estado)
            return (
              <View key={prestamo.id} style={styles.item}>
                <Text style={styles.itemTitle}>Préstamo #{prestamo.id.slice(0, 8)}</Text>
                <Text style={styles.itemMeta}>Estado: {prestamo.estado}</Text>
                <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)}</Text>
                <Text style={styles.itemMeta}>Total: {money(prestamo.totalAPagar)}</Text>
                <Text style={styles.itemMeta}>Saldo pendiente: {money(prestamo.saldoPendiente)}</Text>
                <Text style={styles.itemMeta}>Inicio: {date(prestamo.fechaInicio)} · Límite: {date(prestamo.fechaLimite)}</Text>
                <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Historial de préstamos</Text>
        {detalle.historialPrestamos.length === 0 ? (
          <Text style={styles.empty}>Sin préstamos registrados.</Text>
        ) : (
          detalle.historialPrestamos.map((prestamo) => (
            <View key={prestamo.id} style={styles.item}>
              <Text style={styles.itemTitle}>#{prestamo.id.slice(0, 8)} · {prestamo.estado}</Text>
              <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)} · Total: {money(prestamo.totalAPagar)}</Text>
              <Text style={styles.itemMeta}>Saldo: {money(prestamo.saldoPendiente)} · Inicio: {date(prestamo.fechaInicio)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pagos del cliente</Text>
        {detalle.pagosCliente.length === 0 ? (
          <Text style={styles.empty}>Sin pagos registrados.</Text>
        ) : (
          detalle.pagosCliente.map((pago) => {
            const badge = badgePago(pago.estado)
            return (
              <View key={pago.id} style={styles.item}>
                <Text style={styles.itemTitle}>{date(pago.createdAt)} · {money(pago.monto)}</Text>
                <Text style={styles.itemMeta}>Método: {pago.metodo || '—'} · Estado: {pago.estado || '—'}</Text>
                <Text style={styles.itemMeta}>Préstamo: {pago.prestamoId || '—'}</Text>
                {pago.tieneComprobante ? (
                  <TouchableOpacity style={styles.receiptButton} onPress={() => router.push(`/pago-aprobado?id=${pago.id}` as any)}>
                    <Text style={styles.receiptButtonText}>Ver comprobante</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/cliente/${detalle.cliente!.clienteId}/editar` as any)}>
          <Text style={styles.primaryText}>Editar cliente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/cargar-pago', params: { cliente_id: detalle.cliente!.clienteId } } as any)}
        >
          <Text style={styles.primaryText}>Cargar pago</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push({ pathname: '/historial-prestamos', params: { cliente_id: detalle.cliente!.clienteId } } as any)}
        >
          <Text style={styles.secondaryText}>Ver historial</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  content: { padding: 16, gap: 10, paddingBottom: 26 },
  center: { flex: 1, backgroundColor: '#020817', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loading: { color: '#94A3B8', marginTop: 10 },
  error: { color: '#FCA5A5', textAlign: 'center' },
  retryBtn: { marginTop: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1D4ED8' },
  retryText: { color: '#fff', fontWeight: '700' },
  backBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0B1220' },
  backBtnText: { color: '#E2E8F0', fontWeight: '700' },
  card: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, padding: 14, gap: 6 },
  title: { color: '#F8FAFC', fontWeight: '800', fontSize: 22 },
  sectionTitle: { color: '#DBEAFE', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  meta: { color: '#CBD5E1' },
  empty: { color: '#94A3B8' },
  item: { borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 10, marginTop: 6, gap: 3 },
  itemTitle: { color: '#F8FAFC', fontWeight: '700' },
  itemMeta: { color: '#94A3B8' },
  badge: { borderWidth: 1, borderRadius: 999, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, marginTop: 6 },
  badgeText: { fontWeight: '700', fontSize: 11, textTransform: 'capitalize' },
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
  actionsRow: { gap: 8, marginTop: 2 },
  primaryBtn: { borderRadius: 10, backgroundColor: '#2563EB', paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0B1220', paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#E2E8F0', fontWeight: '800' },
})
