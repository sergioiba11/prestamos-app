import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useAppTheme } from '../context/AppThemeContext'
import { DetalleMoraData, PrestamoMoraDetalleItem, fetchDetalleMoraData } from '../lib/admin-dashboard'

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function statusLabel(status: string) {
  const value = String(status || '').toLowerCase()
  if (value === 'vencido' || value === 'atrasado' || value === 'en_mora') return 'Demorado'
  if (value === 'activo' || value === 'pendiente') return 'Activo'
  return value || '—'
}

export default function DetalleMoraScreen() {
  const { theme } = useAppTheme()
  const colors = theme.colors
  const { width } = useWindowDimensions()
  const isMobile = width < 900

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<DetalleMoraData>({
    totalMoraEstimada: 0,
    clientesConMora: 0,
    prestamosDemoradosOVencidos: 0,
    prestamos: [],
  })

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true)
      else setLoading(true)
      const next = await fetchDetalleMoraData()
      setData(next)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando detalle de mora...</Text>
      </View>
    )
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <Ionicons name="arrow-back-outline" size={16} color={colors.textPrimary} />
          <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Volver</Text>
        </Pressable>

        <View style={[styles.heroCard, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
          <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Mora estimada total</Text>
          <Text style={[styles.heroValue, { color: colors.warning }]}>
            {data.totalMoraEstimada > 0 ? money(data.totalMoraEstimada) : 'Sin mora actual'}
          </Text>
          <Text style={[styles.heroNote, { color: colors.textSecondary }]}>
            Esta mora se calcula sobre préstamos con saldo pendiente y fecha vencida. La tasa aplicada depende de los días de atraso configurados en Configuraciones {'>'} Mora por atraso.
          </Text>
        </View>

        <View style={styles.kpisWrap}>
          <View style={[styles.kpiCard, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Clientes con mora</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{data.clientesConMora}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Préstamos demorados/vencidos</Text>
            <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{data.prestamosDemoradosOVencidos}</Text>
          </View>
        </View>

        {data.prestamos.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sin mora actual</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {data.prestamos.map((prestamo) => (
              <PrestamoMoraCard key={prestamo.prestamoId} prestamo={prestamo} isMobile={isMobile} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function PrestamoMoraCard({ prestamo, isMobile }: { prestamo: PrestamoMoraDetalleItem; isMobile: boolean }) {
  const { theme } = useAppTheme()
  const colors = theme.colors

  const fields = [
    ['Cliente', prestamo.cliente],
    ['DNI', prestamo.dni],
    ['ID préstamo', prestamo.prestamoIdCorto],
    ['Monto original', money(prestamo.montoOriginal)],
    ['Total a pagar', money(prestamo.totalAPagar)],
    ['Saldo pendiente', money(prestamo.saldoPendiente)],
    ['Fecha de inicio', prestamo.fechaInicio],
    ['Fecha límite / mora', prestamo.fechaLimiteOMora],
    ['Días de atraso', String(prestamo.diasAtraso)],
    ['Porcentaje aplicado', `${prestamo.porcentajeAplicado}% diario`],
    ['Regla aplicada', prestamo.razonMora],
    ['Mora calculada', money(prestamo.moraCalculada)],
    ['Total con mora', money(prestamo.totalConMora)],
    ['Estado actual', statusLabel(prestamo.estadoActual)],
  ]

  return (
    <View style={[styles.loanCard, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
      <View style={styles.loanHeader}>
        <Text style={[styles.loanTitle, { color: colors.textPrimary }]}>{prestamo.cliente}</Text>
        <Text style={[styles.loanAmount, { color: colors.warning }]}>{money(prestamo.moraCalculada)}</Text>
      </View>

      <View style={[styles.fieldGrid, isMobile && styles.fieldGridMobile]}>
        {fields.map(([label, value]) => (
          <View key={`${prestamo.prestamoId}-${label}`} style={[styles.fieldItem, isMobile && styles.fieldItemMobile, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8 },
  content: { padding: 14, gap: 10 },
  backBtn: {
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backBtnText: { fontWeight: '700' },
  heroCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  heroLabel: { fontSize: 13, fontWeight: '600' },
  heroValue: { fontSize: 30, fontWeight: '800' },
  heroNote: { fontSize: 12, lineHeight: 18 },
  kpisWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kpiCard: { flex: 1, minWidth: 180, borderWidth: 1, borderRadius: 12, padding: 10 },
  kpiLabel: { fontSize: 12 },
  kpiValue: { fontSize: 24, fontWeight: '800', marginTop: 3 },
  empty: { borderWidth: 1, borderRadius: 12, padding: 18, alignItems: 'center', gap: 8 },
  emptyText: { fontWeight: '600' },
  listWrap: { gap: 8 },
  loanCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  loanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  loanTitle: { fontSize: 16, fontWeight: '800' },
  loanAmount: { fontSize: 18, fontWeight: '800' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldGridMobile: { gap: 0 },
  fieldItem: { width: '32%', minWidth: 170, paddingBottom: 7, borderBottomWidth: 1 },
  fieldItemMobile: { width: '100%', minWidth: 0 },
  fieldLabel: { fontSize: 11 },
  fieldValue: { marginTop: 2, fontSize: 13, fontWeight: '700' },
})
