import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { badgePago, badgePrestamo } from '../../lib/statuses'
import { fetchClienteDetalleConsolidado, type ClienteDetalleConsolidado } from '../../lib/admin-dashboard'
import { safeGoBack } from '../../lib/navigation'

function money(v: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(v || 0))
}

function date(value?: string | null) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(value)
}

function shortId(value?: string | null) {
  if (!value) return '—'
  return `#${String(value).slice(0, 8)}`
}

const OVERDUE_LOAN_STATES = new Set(['vencido', 'atrasado', 'en_mora'])
const PENDING_PAYMENT_STATES = new Set(['pendiente_aprobacion'])

function hasDatePassed(value?: string | null) {
  if (!value || value === '—') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayYmd = today.toISOString().slice(0, 10)
  return String(value).slice(0, 10) < todayYmd
}

export default function ClienteDetalleUnificadoScreen() {
  const params = useLocalSearchParams()
  const scrollRef = useRef<ScrollView | null>(null)
  const [showGoTop, setShowGoTop] = useState(false)

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
  const [visiblePayments, setVisiblePayments] = useState(8)
  const prestamosPagados = detalle?.historialPrestamos.filter((prestamo) => prestamo.estado === 'pagado') || []
  const pagosCliente = detalle?.pagosCliente || []

  const resumenCliente = useMemo(() => {
    const activos = detalle?.prestamosActivos || []
    const saldoPendienteTotal = activos.reduce((acc, prestamo) => acc + Number(prestamo.saldoPendiente || 0), 0)
    const prestamosDemorados = activos.filter((prestamo) => {
      if (Number(prestamo.saldoPendiente || 0) <= 0) return false
      if (OVERDUE_LOAN_STATES.has(prestamo.estado)) return true
      return hasDatePassed(prestamo.fechaLimite) || hasDatePassed(prestamo.proximaCuota)
    })
    const pendingPaymentsCount = pagosCliente.filter((pago) => PENDING_PAYMENT_STATES.has(String(pago.estado || '').toLowerCase())).length

    let estadoGeneral: 'Al día' | 'Demorado' | 'Con pagos pendientes' = 'Al día'
    if (prestamosDemorados.length > 0 || Boolean(detalle?.cliente?.tienePrestamoVencido)) {
      estadoGeneral = 'Demorado'
    } else if (pendingPaymentsCount > 0) {
      estadoGeneral = 'Con pagos pendientes'
    }

    return {
      estadoGeneral,
      saldoPendienteTotal,
      prestamosDemorados: prestamosDemorados.length,
      pendingPaymentsCount,
      ultimoPago: pagosCliente[0]?.createdAt || null,
    }
  }, [detalle, pagosCliente])

  useEffect(() => {
    setVisiblePayments(8)
  }, [clienteId, detalle?.cliente?.clienteId])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextVisible = event.nativeEvent.contentOffset.y > 280
    setShowGoTop((prev) => (prev !== nextVisible ? nextVisible : prev))
  }, [])

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

  const isWeb = Platform.OS === 'web'

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={[styles.maxWrap, isWeb && styles.maxWrapWeb]}>
          <View style={styles.topNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => safeGoBack('admin')}>
              <Text style={styles.backBtnText}>← Volver</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerCard}>
            <Text style={styles.title}>{detalle.cliente.nombre}</Text>
            <View style={styles.chipsRow}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>DNI: {detalle.cliente.dni || '—'}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>Tel: {detalle.cliente.telefono || '—'}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>Email: {detalle.cliente.email || '—'}</Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{resumenCliente.estadoGeneral}</Text>
                <Text style={styles.metricLabel}>Estado general</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{money(resumenCliente.saldoPendienteTotal)}</Text>
                <Text style={styles.metricLabel}>Saldo pendiente total</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{resumenCliente.prestamosDemorados}</Text>
                <Text style={styles.metricLabel}>Préstamos demorados</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{date(resumenCliente.ultimoPago)}</Text>
                <Text style={styles.metricLabel}>Último pago</Text>
              </View>
            </View>
            {resumenCliente.pendingPaymentsCount > 0 ? (
              <Text style={styles.pendingNote}>Tiene {resumenCliente.pendingPaymentsCount} pago(s) pendientes de aprobación.</Text>
            ) : null}
          </View>

          <View style={[styles.mainLayout, isWeb && styles.mainLayoutWeb]}>
            <View style={[styles.leftColumn, isWeb && styles.leftColumnWeb]}>
              <View style={styles.actionsCard}>
                <Text style={styles.sectionTitle}>Acciones</Text>
                <View style={styles.actionsGrid}>
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
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Préstamos activos</Text>
                {detalle.prestamosActivos.length === 0 ? (
                  <Text style={styles.empty}>No hay préstamos activos para este cliente.</Text>
                ) : (
                  detalle.prestamosActivos.map((prestamo) => {
                    const badge = badgePrestamo(prestamo.estado)
                    const sinSaldo = Number(prestamo.saldoPendiente || 0) <= 0
                    const isDemorado =
                      !sinSaldo &&
                      (OVERDUE_LOAN_STATES.has(prestamo.estado) || hasDatePassed(prestamo.fechaLimite) || hasDatePassed(prestamo.proximaCuota))
                    const estadoPrestamoTexto = sinSaldo ? 'Pagado / Sin saldo' : isDemorado ? 'Demorado' : 'Activo'
                    const referenciaDemora = hasDatePassed(prestamo.proximaCuota) ? prestamo.proximaCuota : prestamo.fechaLimite
                    return (
                      <View key={prestamo.id} style={styles.loanCard}>
                        <View style={styles.itemTopRow}>
                          <Text style={styles.itemTitle}>Préstamo {shortId(prestamo.id)}</Text>
                          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}> 
                            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)}</Text>
                        <Text style={styles.itemMeta}>Total: {money(prestamo.totalAPagar)}</Text>
                        <Text style={styles.itemMeta}>Restante: {money(prestamo.saldoPendiente)}</Text>
                        <Text style={styles.itemMetaStrong}>Estado: {estadoPrestamoTexto}</Text>
                        <Text style={styles.itemMeta}>Próxima cuota: {date(prestamo.proximaCuota)}</Text>
                        {isDemorado ? (
                          <Text style={styles.itemMetaAlert}>Mora desde: {date(referenciaDemora)}</Text>
                        ) : (
                          <Text style={styles.itemMeta}>Vence: {date(prestamo.fechaLimite)}</Text>
                        )}
                        {isDemorado ? (
                          <Text style={styles.loanWarnText}>
                            Este préstamo aparece demorado porque la fecha de pago ya venció y queda saldo pendiente.
                          </Text>
                        ) : null}
                        {sinSaldo ? (
                          <Text style={styles.loanInfoText}>Este préstamo no tiene saldo pendiente. Revisar si corresponde marcarlo como pagado.</Text>
                        ) : null}
                      </View>
                    )
                  })
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Préstamos pagados</Text>
                {prestamosPagados.length === 0 ? (
                  <Text style={styles.empty}>Sin préstamos pagados registrados.</Text>
                ) : (
                  prestamosPagados.map((prestamo) => (
                    <View key={prestamo.id} style={styles.compactItem}>
                      <Text style={styles.itemTitle}>{shortId(prestamo.id)} · pagado</Text>
                      <Text style={styles.itemMeta}>Monto: {money(prestamo.monto)} · Total: {money(prestamo.totalAPagar)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>

            <View style={[styles.rightColumn, isWeb && styles.rightColumnWeb]}>
              <View style={[styles.card, styles.paymentsPanel]}>
                <Text style={styles.sectionTitle}>Pagos del cliente</Text>
                {pagosCliente.length === 0 ? (
                  <Text style={styles.empty}>Sin pagos registrados.</Text>
                ) : (
                  <>
                    <View style={[styles.paymentsScrollArea, isWeb && styles.paymentsScrollAreaWeb]}>
                      {pagosCliente.slice(0, visiblePayments).map((pago) => {
                        const badge = badgePago(pago.estado)
                        return (
                          <View key={pago.id} style={styles.paymentCard}>
                            <View style={styles.itemTopRow}>
                              <View>
                                <Text style={styles.itemTitle}>{date(pago.createdAt)}</Text>
                                <Text style={styles.paymentAmount}>{money(pago.monto)}</Text>
                              </View>
                              <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                                <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                              </View>
                            </View>

                            <Text style={styles.itemMeta}>Método: {pago.metodo || '—'}</Text>
                            <Text style={styles.itemMeta}>Préstamo: {shortId(pago.prestamoId)}</Text>

                            {pago.tieneComprobante ? (
                              <TouchableOpacity style={styles.receiptButton} onPress={() => router.push(`/pago-aprobado?id=${pago.id}` as any)}>
                                <Text style={styles.receiptButtonText}>Ver comprobante</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        )
                      })}
                    </View>
                    <View style={styles.morePaymentsRow}>
                      {visiblePayments < pagosCliente.length ? (
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setVisiblePayments((prev) => Math.min(prev + 8, pagosCliente.length))}>
                          <Text style={styles.secondaryText}>Ver más pagos</Text>
                        </TouchableOpacity>
                      ) : null}
                      {visiblePayments > 8 ? (
                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setVisiblePayments(8)}>
                          <Text style={styles.secondaryText}>Ver menos</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {showGoTop ? (
        <TouchableOpacity style={styles.goTopBtn} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
          <Text style={styles.goTopText}>↑ Arriba</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  content: { padding: 16, paddingBottom: 28 },
  maxWrap: { width: '100%', gap: 12 },
  maxWrapWeb: { maxWidth: 1180, alignSelf: 'center' },
  center: { flex: 1, backgroundColor: '#020817', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loading: { color: '#94A3B8', marginTop: 10 },
  error: { color: '#FCA5A5', textAlign: 'center' },
  retryBtn: { marginTop: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1D4ED8' },
  retryText: { color: '#fff', fontWeight: '700' },

  topNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0B1220' },
  backBtnText: { color: '#E2E8F0', fontWeight: '700' },

  headerCard: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 18, padding: 16, gap: 12 },
  title: { color: '#F8FAFC', fontWeight: '800', fontSize: 30, lineHeight: 36 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#020817', paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricItem: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#020817', paddingVertical: 12, paddingHorizontal: 10 },
  metricValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  metricLabel: { color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  pendingNote: { color: '#FDE68A', fontWeight: '600', fontSize: 12 },

  mainLayout: { gap: 12 },
  mainLayoutWeb: { flexDirection: 'row', alignItems: 'flex-start' },
  leftColumn: { gap: 12 },
  leftColumnWeb: { flex: 1.05 },
  rightColumn: { gap: 12 },
  rightColumnWeb: { flex: 0.95 },

  card: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 18, padding: 14, gap: 10 },
  sectionTitle: { color: '#F8FAFC', fontWeight: '800', fontSize: 16 },
  empty: { color: '#94A3B8' },

  actionsCard: { backgroundColor: '#0B1220', borderWidth: 1, borderColor: '#1E293B', borderRadius: 18, padding: 14, gap: 10 },
  actionsGrid: { gap: 8 },
  primaryBtn: { borderRadius: 12, backgroundColor: '#2563EB', paddingVertical: 11, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0B1220', paddingVertical: 11, alignItems: 'center' },
  secondaryText: { color: '#E2E8F0', fontWeight: '800' },

  loanCard: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 16, backgroundColor: '#020817', padding: 12, gap: 4 },
  compactItem: { borderWidth: 1, borderColor: '#1E293B', borderRadius: 16, backgroundColor: '#020817', padding: 12, gap: 3 },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  itemTitle: { color: '#F8FAFC', fontWeight: '700' },
  itemMeta: { color: '#94A3B8' },
  itemMetaStrong: { color: '#E2E8F0', fontWeight: '700', marginTop: 2 },
  itemMetaAlert: { color: '#FCA5A5', fontWeight: '700' },
  loanWarnText: { color: '#FCA5A5', fontSize: 12, lineHeight: 18, marginTop: 2 },
  loanInfoText: { color: '#93C5FD', fontSize: 12, lineHeight: 18, marginTop: 2 },
  paymentAmount: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginTop: 1 },

  paymentsPanel: { gap: 8 },
  paymentsScrollArea: { gap: 8 },
  paymentsScrollAreaWeb: { maxHeight: 620, overflowY: 'auto' as any, paddingRight: 4 },
  paymentCard: { borderLeftWidth: 2, borderLeftColor: '#1E293B', borderWidth: 1, borderColor: '#1E293B', borderRadius: 16, backgroundColor: '#020817', padding: 12, gap: 5 },
  morePaymentsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  badge: { borderWidth: 1, borderRadius: 999, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontWeight: '700', fontSize: 11, textTransform: 'capitalize' },

  receiptButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#0E1A35',
  },
  receiptButtonText: { color: '#DBEAFE', fontWeight: '700', fontSize: 12 },

  goTopBtn: {
    position: 'absolute',
    right: 18,
    bottom: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goTopText: { color: '#F8FAFC', fontWeight: '700' },
})
