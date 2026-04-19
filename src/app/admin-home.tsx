import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Prestamo = {
  id: string
  cliente_id: string | null
  total_a_pagar: number | null
  fecha_limite: string | null
  fecha_inicio_mora: string | null
  estado: string | null
}

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  usuario_id?: string | null
  email?: string | null
  dni: string | null
  usuarios?: {
    email: string | null
  } | null
  prestamos?: {
    id: string
    estado: string | null
    total_a_pagar: number | null
    fecha_limite?: string | null
    fecha_inicio?: string | null
  }[]
}

type ClienteConPrestamo = {
  id: string
  nombre: string
  dni: string | null
  email: string
  prestamoId: string
  deudaActual: number
  fechaLimite: string | null
  estadoCobro: 'AL DÍA' | 'ATRASADO'
}

type PagoPendiente = {
  id: string
  monto: number | null
  metodo: string | null
  estado: string | null
  created_at: string | null
  cliente: {
    nombre: string | null
  } | null
}

function formatearMoneda(valor: number) {
  return `$${Number(valor || 0).toLocaleString('es-AR')}`
}

function normalizarEstado(estado?: string | null) {
  if (!estado) return 'pendiente'
  return estado.toLowerCase()
}

export default function AdminHome() {
  const { width } = useWindowDimensions()

  const esDesktop = width >= 1024
  const esMobile = width < 820

  const [loading, setLoading] = useState(true)
  const [nombreAdmin, setNombreAdmin] = useState('Administrador')
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clientesError, setClientesError] = useState<string | null>(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendiente[]>([])
  const [aprobandoPagoId, setAprobandoPagoId] = useState<string | null>(null)

  const cargarClientes = useCallback(async () => {
    setClientesError(null)

    const { data, error } = await supabase
      .from('clientes')
      .select(`
        id,
        nombre,
        dni,
        telefono,
        usuario_id,
        usuarios:usuario_id (email),
        prestamos (
          id,
          estado,
          total_a_pagar,
          fecha_limite,
          fecha_inicio
        )
      `)
      .order('created_at', { ascending: false })

    let clientesData = data

    if (error) {
      const puedeSerColumna = (error.message || '').toLowerCase().includes('created_at')
      if (puedeSerColumna) {
        const fallback = await supabase
          .from('clientes')
          .select(`
            id,
            nombre,
            dni,
            telefono,
            usuario_id,
            usuarios:usuario_id (email),
            prestamos (
              id,
              estado,
              total_a_pagar,
              fecha_limite,
              fecha_inicio
            )
          `)
          .order('id', { ascending: false })

        if (fallback.error) {
          setClientesError(fallback.error.message || 'Error al leer clientes')
          setClientes([])
          return
        }

        clientesData = fallback.data
      } else {
        setClientesError(error.message || 'Error al leer clientes')
        setClientes([])
        return
      }
    }

    const baseClientes = (clientesData as Cliente[]) || []
    const normalizados = baseClientes.map((cliente) => ({
      ...cliente,
      email: cliente.usuarios?.email || null,
      prestamos: Array.isArray(cliente.prestamos) ? cliente.prestamos : [],
    }))

    setClientes(normalizados)
  }, [])


  const cargarPagosPendientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('pagos')
      .select(`
        id,
        monto,
        metodo,
        estado,
        created_at,
        cliente:cliente_id (
          nombre
        )
      `)
      .in('estado', ['pendiente', 'pendiente_aprobacion'])
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      console.log('ERROR pagos pendientes:', error)
      setPagosPendientes([])
      return
    }

    setPagosPendientes((data as PagoPendiente[]) || [])
  }, [])

  const cargarTodo = useCallback(async () => {
    try {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const emailAuth = authData?.user?.email || ''

      if (emailAuth) {
        setNombreAdmin(emailAuth.split('@')[0])
      }

      const prestamosRes = await supabase
        .from('prestamos')
        .select(`
          id,
          cliente_id,
          total_a_pagar,
          fecha_limite,
          fecha_inicio_mora,
          estado
        `)
        .order('fecha_limite', { ascending: true })

      if (prestamosRes.error) {
        console.log('ERROR prestamos:', prestamosRes.error)
      }

      setPrestamos((prestamosRes.data as Prestamo[]) || [])
      await Promise.all([cargarClientes(), cargarPagosPendientes()])
    } catch (error) {
      console.log('ERROR cargarTodo:', error)
    } finally {
      setLoading(false)
    }
  }, [cargarClientes, cargarPagosPendientes])

  useFocusEffect(
    useCallback(() => {
      void cargarTodo()
    }, [cargarTodo])
  )

  useEffect(() => {
    void cargarTodo()
  }, [cargarTodo])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBusquedaDebounced(busquedaCliente.trim().toLowerCase())
    }, 300)

    return () => clearTimeout(timeout)
  }, [busquedaCliente])

  const resumenHoy = useMemo(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    let montoCobrarHoy = 0
    let vencidos = 0

    for (const prestamo of prestamos) {
      const estado = normalizarEstado(prestamo.estado)
      if (estado === 'pagado' || estado === 'cancelado') continue

      if (prestamo.fecha_limite) {
        const fechaLimite = new Date(`${prestamo.fecha_limite}T00:00:00`)
        fechaLimite.setHours(0, 0, 0, 0)

        if (fechaLimite.getTime() === hoy.getTime()) {
          montoCobrarHoy += Number(prestamo.total_a_pagar || 0)
        }
      }

      if (prestamo.fecha_inicio_mora) {
        const fechaMora = new Date(`${prestamo.fecha_inicio_mora}T00:00:00`)
        fechaMora.setHours(0, 0, 0, 0)
        if (hoy.getTime() >= fechaMora.getTime()) vencidos += 1
      }
    }

    return { montoCobrarHoy, vencidos }
  }, [prestamos])

  const clientesConPrestamo = useMemo<ClienteConPrestamo[]>(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    return clientes
      .map((cliente) => {
        const prestamoActivo = (cliente.prestamos || [])
          .filter((p) => normalizarEstado(p.estado) === 'activo')
          .sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || '')))[0]

        if (!prestamoActivo) return null

        const fechaLimite = prestamoActivo.fecha_limite || null
        const fechaLimiteDate = fechaLimite ? new Date(`${fechaLimite}T00:00:00`) : null
        const estadoCobro =
          fechaLimiteDate && fechaLimiteDate.getTime() < hoy.getTime() ? 'ATRASADO' : 'AL DÍA'

        return {
          id: cliente.id,
          nombre: cliente.nombre,
          dni: cliente.dni || null,
          email: cliente.email || cliente.usuarios?.email || 'Sin email',
          prestamoId: prestamoActivo.id,
          deudaActual: Number(prestamoActivo.total_a_pagar || 0),
          fechaLimite,
          estadoCobro,
        }
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.deudaActual) - Number(a.deudaActual)) as ClienteConPrestamo[]
  }, [clientes])

  const clientesFiltrados = useMemo(() => {
    const termino = busquedaDebounced
    if (!termino) return clientesConPrestamo

    return clientesConPrestamo.filter((cliente) => {
      return (
        cliente.nombre.toLowerCase().includes(termino) ||
        (cliente.dni || '').toLowerCase().includes(termino) ||
        (cliente.email || '').toLowerCase().includes(termino)
      )
    })
  }, [busquedaDebounced, clientesConPrestamo])


  const aprobarPagoPendiente = async (pagoId: string) => {
    if (aprobandoPagoId) return

    try {
      setAprobandoPagoId(pagoId)
      const { data, error } = await supabase.functions.invoke('aprobar-pago', {
        body: { pago_id: pagoId, accion: 'aprobar' },
      })

      if (error || data?.error) {
        Alert.alert('No se pudo aprobar', error?.message || data?.error || 'Intentá nuevamente')
        return
      }

      await cargarPagosPendientes()
      await cargarTodo()
      Alert.alert('Pago aprobado', 'El pago fue acreditado correctamente.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo aprobar el pago')
    } finally {
      setAprobandoPagoId(null)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const verCliente = (clienteId: string) =>
    router.push({ pathname: '/cliente-detalle', params: { cliente_id: clienteId } } as any)

  const irNuevoPrestamo = () => router.push('/nuevo-prestamo' as any)
  const irNuevoCliente = () => router.push('/nuevo-cliente' as any)
  const irRegistrarPago = () => router.push('/cargar-pago' as any)
  const irConfiguraciones = () => router.push('/configuraciones' as any)

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Cargando panel...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.layout, esDesktop ? styles.layoutDesktop : styles.layoutMobile]}>
        <View style={[styles.sidebar, esMobile && styles.sidebarMobile]}>
          <View style={styles.brandBlock}>
            <Text style={styles.logoMini}>CréditoPro</Text>
            <Text style={styles.logoSub}>Administrador</Text>
          </View>

          <View style={[styles.sidebarMenu, esMobile && styles.sidebarMenuMobile]}>
            <Pressable style={[styles.sideItem, styles.sideItemActive]}>
              <Text style={[styles.sideItemText, styles.sideItemTextActive]}>Home</Text>
            </Pressable>

            <Pressable style={styles.sideItem} onPress={irConfiguraciones}>
              <Text style={styles.sideItemText}>Configuraciones</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Hola, {nombreAdmin}</Text>
              <Text style={styles.headerSub}>Panel de control diario</Text>
            </View>

            <TouchableOpacity style={styles.logoutIconButton} onPress={cerrarSesion}>
              <Text style={styles.logoutIconText}>Salir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
            <View style={[styles.kpiGrid, esMobile && styles.kpiGridMobile]}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>A cobrar hoy</Text>
                <Text style={styles.kpiValue}>{formatearMoneda(resumenHoy.montoCobrarHoy)}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Clientes activos</Text>
                <Text style={styles.kpiValue}>{clientesConPrestamo.length}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Préstamos vencidos</Text>
                <Text style={[styles.kpiValue, { color: '#FCA5A5' }]}>{resumenHoy.vencidos}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Acciones rápidas</Text>
              <View style={[styles.actionsGrid, esMobile && styles.actionsGridMobile]}>
                <Pressable
                  style={({ hovered, pressed }) => [
                    styles.actionCard,
                    styles.actionPrimary,
                    hovered && Platform.OS === 'web' && styles.actionCardHovered,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={irNuevoPrestamo}
                >
                  <Text style={styles.actionIcon}>💸</Text>
                  <Text style={styles.actionTitle}>Nuevo préstamo</Text>
                </Pressable>

                <Pressable
                  style={({ hovered, pressed }) => [
                    styles.actionCard,
                    hovered && Platform.OS === 'web' && styles.actionCardHovered,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={irRegistrarPago}
                >
                  <Text style={styles.actionIcon}>✅</Text>
                  <Text style={styles.actionTitle}>Registrar pago</Text>
                </Pressable>

                <Pressable
                  style={({ hovered, pressed }) => [
                    styles.actionCard,
                    hovered && Platform.OS === 'web' && styles.actionCardHovered,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={irNuevoCliente}
                >
                  <Text style={styles.actionIcon}>👤</Text>
                  <Text style={styles.actionTitle}>Nuevo cliente</Text>
                </Pressable>
              </View>
            </View>


            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.sectionTitle}>Pagos pendientes</Text>
                <Text style={styles.pendingCount}>{pagosPendientes.length}</Text>
              </View>

              {pagosPendientes.length === 0 ? (
                <Text style={styles.emptyText}>No hay pagos pendientes para aprobar.</Text>
              ) : (
                <View style={[styles.clientsList, !esMobile && styles.clientsGrid]}>
                  {pagosPendientes.map((pago) => (
                    <View key={pago.id} style={styles.clientCard}>
                      <View style={styles.clientTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.clientName}>{pago.cliente?.nombre || 'Cliente'}</Text>
                          <Text style={styles.clientDebt}>Método: {pago.metodo || '—'} · Monto: {formatearMoneda(Number(pago.monto || 0))}</Text>
                        </View>
                        <View style={[styles.statusBadge, styles.badgePending]}>
                          <Text style={styles.statusText}>PENDIENTE</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.clientButton, styles.clientButtonPrimary]}
                        onPress={() => aprobarPagoPendiente(pago.id)}
                        disabled={aprobandoPagoId === pago.id}
                      >
                        <Text style={styles.clientButtonPrimaryText}>
                          {aprobandoPagoId === pago.id ? 'Aprobando...' : 'Aprobar pago'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.sectionTitle}>Clientes con préstamos activos</Text>
                <TouchableOpacity style={styles.reloadButton} onPress={cargarTodo}>
                  <Text style={styles.reloadButtonText}>Actualizar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={busquedaCliente}
                  onChangeText={setBusquedaCliente}
                  placeholder="Buscar por nombre, DNI o email"
                  placeholderTextColor="#64748B"
                  blurOnSubmit={false}
                />
              </View>

              {clientesError ? (
                <Text style={styles.emptyText}>Error al cargar clientes: {clientesError}</Text>
              ) : clientesFiltrados.length === 0 ? (
                <Text style={styles.emptyText}>No hay clientes con préstamos activos.</Text>
              ) : (
                <View style={[styles.clientsList, !esMobile && styles.clientsGrid]}>
                  {clientesFiltrados.map((cliente) => (
                    <View key={cliente.id} style={[styles.clientCard, !esMobile && styles.clientCardDesktop, esMobile && styles.clientCardMobile]}>
                      <View style={styles.clientTop}>
                        <View>
                          <Text style={styles.clientName}>{cliente.nombre}</Text>
                          <Text style={styles.clientDebt}>DNI: {cliente.dni || '—'} · {cliente.email}</Text>
                          <Text style={styles.clientDebt}>Saldo restante: {formatearMoneda(cliente.deudaActual)}</Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            cliente.estadoCobro === 'AL DÍA' ? styles.badgeOk : styles.badgeLate,
                          ]}
                        >
                          <Text style={styles.statusText}>{cliente.estadoCobro}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.clientButton, styles.clientButtonPrimary]}
                        onPress={() => verCliente(cliente.id)}
                      >
                        <Text style={styles.clientButtonPrimaryText}>Ver más</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
  },
  layout: { flex: 1 },
  layoutDesktop: { flexDirection: 'row' },
  layoutMobile: { flexDirection: 'column' },

  sidebar: {
    width: 220,
    backgroundColor: '#0B1220',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  sidebarMobile: {
    width: '100%',
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 14,
  },
  brandBlock: { marginBottom: 8 },
  logoMini: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  logoSub: {
    color: '#94A3B8',
    marginTop: 4,
    fontSize: 12,
  },
  sidebarMenu: {
    marginTop: 24,
    gap: 10,
  },
  sidebarMenuMobile: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sideItem: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sideItemActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  sideItemText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 14,
  },
  sideItemTextActive: { color: '#FFFFFF' },

  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 28,
    gap: 16,
  },

  header: {
    backgroundColor: '#020817',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
  },
  headerSub: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 13,
  },
  logoutIconButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutIconText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },

  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiGridMobile: {
    flexDirection: 'column',
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 18,
    shadowColor: '#020617',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 8,
  },
  kpiValue: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
  },

  panel: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  actionsGridMobile: {
    flexDirection: 'column',
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  actionPrimary: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  actionCardHovered: {
    transform: [{ translateY: -2 }],
    borderColor: '#818CF8',
  },
  actionCardPressed: {
    opacity: 0.9,
  },
  actionIcon: {
    fontSize: 26,
    marginBottom: 10,
  },
  actionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },

  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  reloadButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  reloadButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },

  searchContainer: {
    marginTop: 12,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    color: '#E2E8F0',
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 14,
  },

  pendingCount: {
    color: '#FCD34D',
    fontWeight: '800',
    fontSize: 14,
  },

  clientsList: { gap: 12 },
  clientsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clientCard: {
    width: '100%',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
  },
  clientCardMobile: {
    padding: 15,
  },
  clientCardDesktop: {
    width: '49%',
  },
  clientTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  clientName: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  clientDebt: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgeOk: {
    backgroundColor: '#052E16',
    borderColor: '#22C55E',
  },
  badgePending: {
    backgroundColor: '#78350F',
    borderColor: '#F59E0B',
  },
  badgeLate: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  clientButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clientButtonPrimary: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  clientButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#020817',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  loadingText: {
    color: '#CBD5E1',
    marginTop: 12,
    fontSize: 15,
  },
})
