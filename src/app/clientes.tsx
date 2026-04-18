import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type ClienteListado = {
  id: string
  nombre: string
  dni: string | null
  telefono: string | null
  usuarios?: {
    email: string | null
  } | null
  prestamos?: {
    id: string
    estado: string | null
    total_a_pagar: number | null
  }[]
}

function formatearMoneda(valor: number) {
  return `$${Number(valor || 0).toLocaleString('es-AR')}`
}

export default function ClientesScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clientes, setClientes] = useState<ClienteListado[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargarClientes = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefreshing(true)
    else setLoading(true)

    setError(null)

    const { data, error: queryError } = await supabase
      .from('clientes')
      .select(`
        id,
        nombre,
        dni,
        telefono,
        usuarios(email),
        prestamos (
          id,
          estado,
          total_a_pagar
        )
      `)
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message || 'No se pudieron cargar los clientes')
      setClientes([])
    } else {
      setClientes((data as ClienteListado[]) || [])
    }

    if (esRefresh) setRefreshing(false)
    else setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void cargarClientes()
    }, [cargarClientes])
  )

  const clientesUI = useMemo(() => {
    return clientes.map((cliente) => {
      const tienePrestamo = cliente.prestamos?.some((p) => p.estado === 'activo')
      const prestamoActivo = (cliente.prestamos || []).find((p) => p.estado === 'activo')

      return {
        ...cliente,
        tienePrestamo: Boolean(tienePrestamo),
        deudaActiva: Number(prestamoActivo?.total_a_pagar || 0),
      }
    })
  }, [clientes])

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
      <View style={styles.header}>
        <Text style={styles.title}>Todos los clientes</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => cargarClientes(true)}
            tintColor="#3B82F6"
          />
        }
      >
        {clientesUI.map((cliente) => (
          <View key={cliente.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>{cliente.nombre}</Text>
                <Text style={styles.meta}>DNI: {cliente.dni || '—'}</Text>
                <Text style={styles.meta}>Email: {cliente.usuarios?.email || 'Sin correo'}</Text>
                <Text style={styles.metaMuted}>Teléfono: {cliente.telefono || 'Sin teléfono'}</Text>
              </View>

              <View
                style={[
                  styles.badge,
                  cliente.tienePrestamo ? styles.badgeVerde : styles.badgeGris,
                ]}
              >
                <Text style={styles.badgeText}>
                  {cliente.tienePrestamo ? 'Con préstamo' : 'Sin préstamo'}
                </Text>
              </View>
            </View>

            <View style={styles.cardBottom}>
              <Text style={styles.metaMuted}>Préstamos: {cliente.prestamos?.length || 0}</Text>
              <Text style={styles.metaMuted}>
                Deuda activa: {formatearMoneda(cliente.deudaActiva)}
              </Text>
            </View>
          </View>
        ))}
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
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  backButton: {
    backgroundColor: '#111827',
    borderColor: '#1E293B',
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
  badgeVerde: {
    backgroundColor: '#14532D',
    borderColor: '#22C55E',
  },
  badgeGris: {
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
    backgroundColor: '#020817',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#CBD5E1',
    fontSize: 14,
  },
  errorText: {
    color: '#FCA5A5',
    marginBottom: 12,
    fontSize: 13,
  },
})
