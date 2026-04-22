import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState, useEffect } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ClienteAdminListadoItem, fetchAdminClientesListado } from '../lib/admin-dashboard'

function formatearMoneda(valor: number) {
  return `$${Number(valor || 0).toLocaleString('es-AR')}`
}

function badgeByEstado(cliente: ClienteAdminListadoItem) {
  if (cliente.tienePrestamoVencido || String(cliente.estadoCliente).includes('venc')) {
    return { text: 'Préstamo vencido', style: styles.badgeWarn }
  }
  if (cliente.tienePrestamoActivo) {
    return { text: 'Préstamo activo', style: styles.badgeOk }
  }
  return { text: 'Sin préstamo', style: styles.badgeOff }
}

export default function ClientesScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clientes, setClientes] = useState<ClienteAdminListadoItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [tab, setTab] = useState<'activos' | 'todos'>('activos')

  const cargarClientes = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefreshing(true)
    else setLoading(true)

    setError(null)

    try {
      const listado = await fetchAdminClientesListado()
      console.log('clientes screen listado', listado)
      if (listado.length === 0) console.warn('clientes screen sin resultados')
      setClientes(listado)
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los clientes')
      setClientes([])
    } finally {
      if (esRefresh) setRefreshing(false)
      else setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void cargarClientes()
    }, [cargarClientes])
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBusquedaDebounced(busqueda.trim().toLowerCase())
    }, 250)

    return () => clearTimeout(timeout)
  }, [busqueda])

  const clientesUI = useMemo(() => {
    if (!busquedaDebounced) return clientes

    return clientes.filter((cliente) => {
      const nombre = cliente.nombre.toLowerCase()
      const dni = cliente.dni.toLowerCase()
      const email = cliente.email.toLowerCase()
      const telefono = cliente.telefono.toLowerCase()

      return (
        nombre.includes(busquedaDebounced) ||
        dni.includes(busquedaDebounced) ||
        email.includes(busquedaDebounced) ||
        telefono.includes(busquedaDebounced)
      )
    })
  }, [clientes, busquedaDebounced])

  const clientesActivos = useMemo(() => clientesUI.filter((c) => c.tienePrestamoActivo), [clientesUI])
  const clientesMostrados = tab === 'activos' ? clientesActivos : clientesUI

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#3B82F6" size="large" />
        <Text style={styles.loadingText}>Cargando clientes...</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#0F172A', '#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Administración</Text>
          <Text style={styles.title}>Listado de clientes</Text>
          <Text style={styles.subtitle}>Fuente: panel consolidado</Text>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </LinearGradient>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.searchContainer}>
        <Text style={styles.searchLabel}>Buscar por nombre, DNI, email o teléfono</Text>
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Ej: María / 30123456 / correo@dominio.com"
          placeholderTextColor="#64748B"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          blurOnSubmit={false}
        />
      </View>

      <View style={styles.segmented}>
        <TouchableOpacity style={[styles.segmentBtn, tab === 'activos' && styles.segmentBtnActive]} onPress={() => setTab('activos')}>
          <Text style={[styles.segmentText, tab === 'activos' && styles.segmentTextActive]}>Con préstamo activo ({clientesActivos.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, tab === 'todos' && styles.segmentBtnActive]} onPress={() => setTab('todos')}>
          <Text style={[styles.segmentText, tab === 'todos' && styles.segmentTextActive]}>Todos ({clientesUI.length})</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => cargarClientes(true)}
            tintColor="#3B82F6"
          />
        }
      >
        {clientesMostrados.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{busquedaDebounced ? 'No encontramos resultados' : 'No hay clientes para mostrar'}</Text>
            <Text style={styles.emptyText}>
              {busquedaDebounced
                ? 'Probá con otro criterio de búsqueda.'
                : 'Cuando existan clientes, se mostrarán acá automáticamente.'}
            </Text>
          </View>
        ) : null}

        {clientesMostrados.map((cliente) => {
          const badge = badgeByEstado(cliente)

          return (
            <View key={cliente.clienteId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{cliente.nombre}</Text>
                  <Text style={styles.meta}>DNI: {cliente.dni}</Text>
                  <Text style={styles.meta}>Email: {cliente.email}</Text>
                  <Text style={styles.metaMuted}>Teléfono: {cliente.telefono}</Text>
                </View>

                <View style={[styles.badge, badge.style]}>
                  <Text style={styles.badgeText}>{badge.text}</Text>
                </View>
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.metaMuted}>Préstamos activos: {cliente.cantidadPrestamosActivos}</Text>
                <Text style={styles.metaMuted}>Deuda activa: {formatearMoneda(cliente.deudaActiva)}</Text>
                <Text style={styles.metaMuted}>Restante: {formatearMoneda(cliente.restante)}</Text>
                <Text style={styles.metaMuted}>Próximo vencimiento: {cliente.proximoVencimiento}</Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.detailBtn}
                  onPress={() => router.push({ pathname: '/cliente-detalle', params: { cliente_id: cliente.clienteId } } as any)}
                >
                  <Text style={styles.detailBtnText}>Ver detalle</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderRadius: 16,
    padding: 16,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  subtitle: {
    color: '#BFDBFE',
    fontSize: 12,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: 'rgba(2,6,23,0.38)',
    borderColor: 'rgba(147,197,253,0.6)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#0B1220',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#E2E8F0',
    fontSize: 14,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#0B1220',
  },
  segmentBtnActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#2563EB',
  },
  segmentText: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#DBEAFE',
  },
  content: {
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    backgroundColor: '#0B1220',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
  },
  cardBottom: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 4,
  },
  cardActions: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  detailBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#60A5FA',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailBtnText: {
    color: '#EFF6FF',
    fontSize: 12,
    fontWeight: '700',
  },
  nombre: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  meta: {
    color: '#CBD5E1',
    fontSize: 14,
    marginBottom: 2,
  },
  metaMuted: {
    color: '#94A3B8',
    fontSize: 13,
  },
  badge: {
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: '#14532D',
    borderColor: '#22C55E',
  },
  badgeWarn: {
    backgroundColor: '#7C2D12',
    borderColor: '#FB923C',
  },
  badgeOff: {
    backgroundColor: '#334155',
    borderColor: '#64748B',
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020817',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#FCA5A5',
    marginBottom: 8,
    fontSize: 13,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 14,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyText: {
    color: '#94A3B8',
    textAlign: 'center',
  },
})
