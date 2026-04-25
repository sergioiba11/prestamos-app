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

function loanBadge(estado?: string | null, saldoPendiente?: number) {
  const estadoNormalizado = String(estado || '').toLowerCase()
  const saldo = Number(saldoPendiente || 0)
  const saldoSaldado = Number.isFinite(saldo) && saldo <= 0

  if (saldoSaldado) {
    return { label: 'Saldado', bg: '#052E16', border: '#166534', text: '#86EFAC', kind: 'saldado' as const }
  }

  if (estadoNormalizado === 'rechazado' || estadoNormalizado === 'cancelado') {
    return { label: 'Rechazado', bg: '#450A0A', border: '#991B1B', text: '#FCA5A5', kind: 'rechazado' as const }
  }

  if (estadoNormalizado === 'activo' && saldo > 0) {
    return { label: 'Activo', bg: '#172554', border: '#1D4ED8', text: '#93C5FD', kind: 'activo' as const }
  }

  const fallback = badgePrestamo(estado)
  return { ...fallback, kind: 'otro' as const }
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

  const prestamosActivosReales = useMemo(() => {
    if (!detalle) return []
    return detalle.prestamosActivos.filter((prestamo) => loanBadge(prestamo.estado, prestamo.saldoPendiente).kind === 'activo')
  }, [detalle])

  const historialPrestamosConSaldados = useMemo(() => {
    if (!detalle) return []
    const merged = [...detalle.historialPrestamos]
    const ids = new Set(merged.map((item) => item.id))
    for (const prestamo of detalle.prestamosActivos) {
      const kind = loanBadge(prestamo.estado, prestamo.saldoPendiente).kind
      if (kind !== 'activo' && !ids.has(prestamo.id)) {
        merged.push(prestamo)
        ids.add(prestamo.id)
      }
    }
    return merged
  }, [detalle])

  const pagosOrdenados = useMemo(() => {
    if (!detalle) return []
    return [...detalle.pagosCliente].sort((a, b) => {
      const aTime = new Date(a.createdAt || '').getTime()
      const bTime = new Date(b.createdAt || '').getTime()
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
    })
  }, [detalle])

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

      <View style={styles.clientCard}>
        <Text style={styles.title}>Cliente</Text>
        <Text style={styles.clientName}>{detalle.cliente.nombre || 'Sin nombre'}</Text>
        <View style={styles.clientGrid}>
          <View style={styles.clientCell}>
            <Text style={styles.clientLabel}>DNI</Text>
            <Text style={styles.clientValue}>{detalle.cliente.dni || 'No registrado'}</Text>
          </View>
          <View style={styles.clientCell}>
            <Text style={styles.clientLabel}>Teléfono</Text>
            <Text style={styles.clientValue}>{detalle.cliente.telefono || 'No registrado'}</Text>
          </View>
          <View style={styles.clientCell}>
            <Text style={styles.clientLabel}>Email</Text>
            <Text style={styles.clientValue}>{detalle.cliente.email || 'No registrado'}</Text>
          </View>
          <View style={styles.clientCell}>
            <Text style={styles.clientLabel}>Activos reales</Text>
            <Text style={styles.clientValue}>{prestamosActivosReales.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Préstamos activos reales</Text>
        {prestamosActivosReales.length === 0 ? (
          <Text style={styles.empty}>No hay préstamos activos para este cliente.</Text>
        ) : (
          prestamosActivosReales.map((prestamo) => {
            const badge = loanBadge(prestamo.estado, prestamo.saldoPendiente)
            return (
              <View key={prestamo.id} style={styles.itemCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>Préstamo #{prestamo.id.slice(0, 8)}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)} · Total: {money(prestamo.totalAPagar)}</Text>
                <Text style={styles.itemMeta}>Saldo pendiente: {money(prestamo.saldoPendiente)}</Text>
                <Text style={styles.itemMeta}>Inicio: {date(prestamo.fechaInicio)} · Límite: {date(prestamo.fechaLimite)}</Text>
              </View>
            )
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Historial de préstamos</Text>
        {historialPrestamosConSaldados.length === 0 ? (
          <Text style={styles.empty}>Sin préstamos registrados.</Text>
        ) : (
          historialPrestamosConSaldados.map((prestamo) => {
            const badge = loanBadge(prestamo.estado, prestamo.saldoPendiente)
            return (
              <View key={prestamo.id} style={styles.itemCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>#{prestamo.id.slice(0, 8)}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)} · Total: {money(prestamo.totalAPagar)}</Text>
                <Text style={styles.itemMeta}>Saldo: {money(prestamo.saldoPendiente)} · Inicio: {date(prestamo.fechaInicio)}</Text>
              </View>
            )
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pagos del cliente</Text>
        {pagosOrdenados.length === 0 ? (
          <Text style={styles.empty}>Sin pagos registrados.</Text>
        ) : (
          pagosOrdenados.map((pago) => {
            const badge = badgePago(pago.estado)
            const prestamoShort = pago.prestamoId ? `#${String(pago.prestamoId).slice(0, 8)}` : '—'
            const isRechazado = String(pago.estado || '').toLowerCase() === 'rechazado'
            const motivo = String(pago.observacionRevision || '').trim()
            return (
              <View key={pago.id} style={styles.itemCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemTitle}>{date(pago.createdAt)}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={styles.itemAmount}>{money(pago.monto)}</Text>
                <Text style={styles.itemMeta}>Método: {pago.metodo || '—'}</Text>
                <Text style={styles.itemMeta}>Préstamo: {prestamoShort}</Text>
                {isRechazado && motivo ? (
                  <Text style={styles.rejectReason}>Motivo de rechazo: {motivo}</Text>
                ) : null}
              </View>
            )
          })
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/cliente/${detalle.cliente.clienteId}/editar` as any)}>
          <Text style={styles.primaryText}>Editar cliente</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBlueBtn}
          onPress={() => router.push({ pathname: '/cargar-pago', params: { cliente_id: detalle.cliente.clienteId } } as any)}
        >
          <Text style={styles.secondaryBlueText}>Cargar pago</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => router.push({ pathname: '/historial-prestamos', params: { cliente_id: detalle.cliente.clienteId } } as any)}
        >
          <Text style={styles.ghostText}>Ver historial</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  content: { padding: 16, gap: 12, paddingBottom: 26, width: '100%', maxWidth: 960, alignSelf: 'center' },
  center: { flex: 1, backgroundColor: '#020817', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loading: { color: '#94A3B8', marginTop: 10 },
  error: { color: '#FCA5A5', textAlign: 'center' },
  retryBtn: { marginTop: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1D4ED8' },
  retryText: { color: '#fff', fontWeight: '700' },
  backBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0B1220' },
  backBtnText: { color: '#E2E8F0', fontWeight: '700' },
  clientCard: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 16, padding: 16, gap: 8 },
  card: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 14, padding: 14, gap: 6 },
  title: { color: '#93C5FD', fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  clientName: { color: '#F8FAFC', fontWeight: '900', fontSize: 24 },
  clientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  clientCell: { backgroundColor: '#020817', borderColor: '#1E293B', borderWidth: 1, borderRadius: 12, padding: 10, minWidth: 150, flexGrow: 1 },
  clientLabel: { color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' },
  clientValue: { color: '#E2E8F0', fontSize: 14, fontWeight: '700', marginTop: 2 },
  sectionTitle: { color: '#DBEAFE', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  meta: { color: '#CBD5E1' },
  empty: { color: '#94A3B8' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  itemCard: { borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#020817', borderRadius: 12, padding: 12, marginTop: 6, gap: 4 },
  itemTitle: { color: '#F8FAFC', fontWeight: '700' },
  itemAmount: { color: '#93C5FD', fontWeight: '900', fontSize: 22, marginTop: 2, marginBottom: 2 },
  itemMeta: { color: '#94A3B8' },
  rejectReason: { color: '#FCA5A5', fontWeight: '700', marginTop: 4 },
  badge: { borderWidth: 1, borderRadius: 999, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, marginTop: 6 },
  badgeText: { fontWeight: '700', fontSize: 11, textTransform: 'capitalize' },
  actionsRow: { gap: 8, marginTop: 2 },
  primaryBtn: { borderRadius: 12, backgroundColor: '#2563EB', paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryBlueBtn: { borderRadius: 12, borderWidth: 1, borderColor: '#1D4ED8', backgroundColor: '#1E3A8A', paddingVertical: 12, alignItems: 'center' },
  secondaryBlueText: { color: '#DBEAFE', fontWeight: '800' },
  ghostBtn: { borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0B1220', paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: '#E2E8F0', fontWeight: '800' },
})
