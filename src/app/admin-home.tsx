import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Prestamo = {
  id: string
  cliente_id: string | null
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  fecha_inicio: string | null
  fecha_limite: string | null
  fecha_inicio_mora: string | null
  estado: string | null
  modalidad: 'mensual' | 'diario' | null
  cuotas: number | null
  dias_plazo: number | null
  clientes?: {
    nombre: string | null
    telefono: string | null
    dni: string | null
  } | null
}

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  dni: string | null
  direccion?: string | null
}

type Empleado = {
  id: string
  nombre: string | null
  email: string | null
  rol: string | null
}

type ClienteConPrestamo = {
  id: string
  nombre: string
  telefono: string | null
  dni: string | null
  prestamo?: Prestamo | null
  estadoVisual: {
    texto: string
    tipo: 'aldia' | 'venceHoy' | 'mora' | 'pagado'
  }
  deudaActual: number
  proximoPago: string | null
}

function formatearMoneda(valor: number) {
  return `$${Number(valor || 0).toLocaleString('es-AR')}`
}

function formatearFecha(fecha?: string | null) {
  if (!fecha) return '—'
  const limpia = fecha.slice(0, 10)
  const partes = limpia.split('-')
  if (partes.length !== 3) return limpia
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

function normalizarEstado(estado?: string | null) {
  if (!estado) return 'pendiente'
  return estado.toLowerCase()
}

function calcularEstadoVisual(prestamo?: Prestamo | null) {
  if (!prestamo) {
    return { texto: 'Sin préstamo', tipo: 'pagado' as const }
  }

  const estado = normalizarEstado(prestamo.estado)

  if (estado === 'pagado' || estado === 'cancelado') {
    return { texto: 'Pagado', tipo: 'pagado' as const }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  if (prestamo.fecha_inicio_mora) {
    const mora = new Date(prestamo.fecha_inicio_mora + 'T00:00:00')
    mora.setHours(0, 0, 0, 0)

    if (hoy.getTime() >= mora.getTime()) {
      return { texto: 'En mora', tipo: 'mora' as const }
    }
  }

  if (prestamo.fecha_limite) {
    const limite = new Date(prestamo.fecha_limite + 'T00:00:00')
    limite.setHours(0, 0, 0, 0)

    if (hoy.getTime() === limite.getTime()) {
      return { texto: 'Vence hoy', tipo: 'venceHoy' as const }
    }
  }

  return { texto: 'Al día', tipo: 'aldia' as const }
}

export default function AdminHome() {
  const { width } = useWindowDimensions()

  const esDesktop = width >= 1180
  const esMobile = width < 820
  const esWeb = Platform.OS === 'web'

  const [loading, setLoading] = useState(true)
  const [nombreAdmin, setNombreAdmin] = useState('Administrador')
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])

  const cargarTodo = useCallback(async () => {
    try {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const emailAuth = authData?.user?.email || ''

      if (emailAuth) {
        setNombreAdmin(emailAuth.split('@')[0])
      }

      const [prestamosRes, clientesRes, empleadosRes] = await Promise.all([
        supabase
          .from('prestamos')
          .select(`
            id,
            cliente_id,
            monto,
            interes,
            total_a_pagar,
            fecha_inicio,
            fecha_limite,
            fecha_inicio_mora,
            estado,
            modalidad,
            cuotas,
            dias_plazo,
            clientes (
              nombre,
              telefono,
              dni
            )
          `)
          .order('fecha_inicio', { ascending: false }),

        supabase
          .from('clientes')
          .select('id, nombre, telefono, dni, direccion')
          .order('nombre', { ascending: true }),

        supabase
          .from('usuarios')
          .select('id, nombre, email, rol')
          .eq('rol', 'empleado')
          .order('nombre', { ascending: true }),
      ])

      if (prestamosRes.error) console.log('ERROR prestamos:', prestamosRes.error)
      if (clientesRes.error) console.log('ERROR clientes:', clientesRes.error)
      if (empleadosRes.error) console.log('ERROR empleados:', empleadosRes.error)

      setPrestamos((prestamosRes.data as unknown as Prestamo[]) || [])
      setClientes((clientesRes.data as Cliente[]) || [])
      setEmpleados((empleadosRes.data as Empleado[]) || [])
    } catch (error) {
      console.log('ERROR cargarTodo:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      cargarTodo()
    }, [cargarTodo])
  )

  const resumenHoy = useMemo(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    let montoCobrarHoy = 0
    let clientesHoy = 0
    let vencidos = 0

    for (const prestamo of prestamos) {
      const estado = normalizarEstado(prestamo.estado)
      const total = Number(prestamo.total_a_pagar || 0)

      if (estado === 'pagado' || estado === 'cancelado') continue

      if (prestamo.fecha_limite) {
        const fechaLimite = new Date(prestamo.fecha_limite + 'T00:00:00')
        fechaLimite.setHours(0, 0, 0, 0)

        if (
          fechaLimite.getFullYear() === hoy.getFullYear() &&
          fechaLimite.getMonth() === hoy.getMonth() &&
          fechaLimite.getDate() === hoy.getDate()
        ) {
          clientesHoy += 1
          montoCobrarHoy += total
        }
      }

      if (prestamo.fecha_inicio_mora) {
        const fechaMora = new Date(prestamo.fecha_inicio_mora + 'T00:00:00')
        fechaMora.setHours(0, 0, 0, 0)

        if (hoy.getTime() >= fechaMora.getTime()) {
          vencidos += 1
        }
      }
    }

    return {
      montoCobrarHoy,
      clientesHoy,
      vencidos,
    }
  }, [prestamos])

  const resumenGeneral = useMemo(() => {
    let totalCalle = 0
    let activos = 0

    for (const prestamo of prestamos) {
      const estado = normalizarEstado(prestamo.estado)

      if (estado !== 'pagado' && estado !== 'cancelado') {
        activos += 1
        totalCalle += Number(prestamo.total_a_pagar || 0)
      }
    }

    return {
      totalCalle,
      activos,
      clientesActivos: clientes.length,
      empleadosActivos: empleados.length,
    }
  }, [prestamos, clientes, empleados])

  const clientesConPrestamo = useMemo<ClienteConPrestamo[]>(() => {
  const mapaPrestamos = new Map<string, Prestamo>()

  for (const prestamo of prestamos) {
    if (!prestamo.cliente_id) continue

    const actual = mapaPrestamos.get(prestamo.cliente_id)

    if (!actual) {
      mapaPrestamos.set(prestamo.cliente_id, prestamo)
      continue
    }

    const actualFecha = actual.fecha_inicio || ''
    const nuevaFecha = prestamo.fecha_inicio || ''

    if (nuevaFecha > actualFecha) {
      mapaPrestamos.set(prestamo.cliente_id, prestamo)
    }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const lista = clientes.map((cliente) => {
    const prestamo = mapaPrestamos.get(cliente.id) || null
    const estadoVisual = calcularEstadoVisual(prestamo)

    let prioridad = 4 // default (los últimos)

    if (prestamo) {
      const estado = normalizarEstado(prestamo.estado)

      if (estado === 'pagado' || estado === 'cancelado') {
        prioridad = 4
      } else if (prestamo.fecha_inicio_mora) {
        const mora = new Date(prestamo.fecha_inicio_mora + 'T00:00:00')
        mora.setHours(0, 0, 0, 0)

        if (hoy.getTime() >= mora.getTime()) {
          prioridad = 1 // 🔴 mora (máxima prioridad)
        }
      }

      if (prestamo.fecha_limite) {
        const limite = new Date(prestamo.fecha_limite + 'T00:00:00')
        limite.setHours(0, 0, 0, 0)

        if (
          limite.getFullYear() === hoy.getFullYear() &&
          limite.getMonth() === hoy.getMonth() &&
          limite.getDate() === hoy.getDate()
        ) {
          prioridad = 2 // 🟡 vence hoy
        }
      }

      if (prioridad === 4) {
        prioridad = 3 // 🟢 al día
      }
    }

    return {
      id: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      dni: cliente.dni,
      prestamo,
      estadoVisual,
      prioridad,
      deudaActual:
        prestamo && normalizarEstado(prestamo.estado) !== 'pagado'
          ? Number(prestamo.total_a_pagar || 0)
          : 0,
      proximoPago: prestamo?.fecha_limite || null,
    }
  })

  // 🔥 ORDEN PRO FINAL
  return lista.sort((a, b) => {
    // 1. prioridad
    if (a.prioridad !== b.prioridad) {
      return a.prioridad - b.prioridad
    }

    // 2. por fecha (más urgente primero)
    const fechaA = a.proximoPago ? new Date(a.proximoPago).getTime() : Infinity
    const fechaB = b.proximoPago ? new Date(b.proximoPago).getTime() : Infinity

    return fechaA - fechaB
  })
}, [clientes, prestamos])
  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const irNuevoPrestamo = () => router.push('/nuevo-prestamo' as any)
  const irNuevoCliente = () => router.push('/nuevo-cliente' as any)
  const irNuevoEmpleado = () => router.push('/nuevo-empleado' as any)
  const irConfiguraciones = () => router.push('/configuraciones' as any)

  const verCliente = (clienteId: string) =>
    router.push({ pathname: '/cliente-detalle', params: { id: clienteId } } as any)

  const cargarPago = (clienteId: string) =>
    router.push({ pathname: '/cargar-pago', params: { cliente_id: clienteId } } as any)

  const BadgeEstado = ({
    texto,
    tipo,
  }: {
    texto: string
    tipo: 'aldia' | 'venceHoy' | 'mora' | 'pagado'
  }) => {
    return (
      <View
        style={[
          styles.badge,
          tipo === 'aldia' && styles.badgeVerde,
          tipo === 'venceHoy' && styles.badgeAmarillo,
          tipo === 'mora' && styles.badgeRojo,
          tipo === 'pagado' && styles.badgeGris,
        ]}
      >
        <Text style={styles.badgeText}>{texto}</Text>
      </View>
    )
  }

  const Sidebar = () => (
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
  )

  const Header = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoCircleText}>C</Text>
        </View>

        <View>
          <Text style={styles.headerTitle}>Hola, {nombreAdmin}</Text>
          <Text style={styles.headerSub}>Control rápido de cobros, clientes y empleados</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutIconButton} onPress={cerrarSesion}>
        <Text style={styles.logoutIconText}>↗</Text>
      </TouchableOpacity>
    </View>
  )

  const BloqueHoy = () => (
    <View style={[styles.hoyCard, esDesktop && styles.hoyCardDesktop]}>
      <Text style={styles.sectionEyebrow}>HOY</Text>

      <View style={styles.hoyMainRow}>
        <View style={styles.hoyMainBlock}>
          <Text style={styles.hoyMainLabel}>A cobrar hoy</Text>
          <Text style={styles.hoyMainValue}>{formatearMoneda(resumenHoy.montoCobrarHoy)}</Text>
        </View>
      </View>

      <View style={[styles.hoyStatsRow, esMobile && styles.hoyStatsColumn]}>
        <View style={styles.hoyMiniCard}>
          <Text style={styles.hoyMiniNumber}>{resumenHoy.clientesHoy}</Text>
          <Text style={styles.hoyMiniLabel}>Clientes hoy</Text>
        </View>

        <View style={styles.hoyMiniCard}>
          <Text style={[styles.hoyMiniNumber, { color: '#F87171' }]}>{resumenHoy.vencidos}</Text>
          <Text style={styles.hoyMiniLabel}>Vencidos</Text>
        </View>
      </View>
    </View>
  )

  const AccionesRapidas = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Acciones rápidas</Text>
      <Text style={styles.sectionSub}>Lo más usado para cobrar y cargar movimientos</Text>

      <View style={[styles.actionsGrid, esMobile && styles.actionsGridMobile]}>
        <TouchableOpacity style={[styles.actionCard, styles.actionPrimary]} onPress={irNuevoPrestamo}>
          <Text style={styles.actionTitle}>➕ Nuevo préstamo</Text>
          <Text style={styles.actionSub}>Crear crédito nuevo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/cargar-pago' as any)}
        >
          <Text style={styles.actionTitle}>💵 Cargar pago</Text>
          <Text style={styles.actionSub}>Registrar cobro</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={irNuevoCliente}>
          <Text style={styles.actionTitle}>👤 Nuevo cliente</Text>
          <Text style={styles.actionSub}>Agregar cliente</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={irNuevoEmpleado}>
          <Text style={styles.actionTitle}>🧑‍💼 Nuevo empleado</Text>
          <Text style={styles.actionSub}>Agregar empleado al sistema</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const ResumenGeneral = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Resumen general</Text>
      <Text style={styles.sectionSub}>Panorama rápido del negocio</Text>

      <View style={styles.summaryStack}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total en la calle</Text>
          <Text style={styles.summaryValue}>{formatearMoneda(resumenGeneral.totalCalle)}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Préstamos activos</Text>
          <Text style={styles.summaryValue}>{resumenGeneral.activos}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Clientes activos</Text>
          <Text style={styles.summaryValue}>{resumenGeneral.clientesActivos}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Empleados</Text>
          <Text style={styles.summaryValue}>{resumenGeneral.empleadosActivos}</Text>
        </View>
      </View>
    </View>
  )

  const ListaEmpleados = () => (
    <View style={styles.panel}>
      <View style={styles.panelHeaderTop}>
        <View>
          <Text style={styles.sectionTitle}>Empleados</Text>
          <Text style={styles.sectionSub}>Usuarios empleados creados desde admin</Text>
        </View>

        <TouchableOpacity style={styles.reloadButton} onPress={cargarTodo}>
          <Text style={styles.reloadButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {empleados.length === 0 ? (
        <Text style={styles.emptyText}>No hay empleados cargados todavía.</Text>
      ) : (
        <View style={styles.clientsList}>
          {empleados.map((empleado) => (
            <View key={empleado.id} style={[styles.clientCard, esMobile && styles.clientCardMobile]}>
              <View style={styles.clientTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{empleado.nombre || 'Sin nombre'}</Text>
                  <Text style={styles.clientMeta}>
                    Email: {empleado.email || 'Sin email'}
                  </Text>
                  <Text style={styles.clientMeta}>
                    Rol: {empleado.rol || 'Sin rol'}
                  </Text>
                </View>

                <View style={[styles.badge, styles.badgeAzul]}>
                  <Text style={styles.badgeText}>Empleado</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )

  const ListaClientes = () => (
    <View style={styles.panel}>
      <View style={styles.panelHeaderTop}>
        <View>
          <Text style={styles.sectionTitle}>Clientes</Text>
          <Text style={styles.sectionSub}>Estado actual para cobrar rápido</Text>
        </View>

        <TouchableOpacity style={styles.reloadButton} onPress={cargarTodo}>
          <Text style={styles.reloadButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {clientesConPrestamo.length === 0 ? (
        <Text style={styles.emptyText}>No hay clientes cargados todavía.</Text>
      ) : (
        <View style={styles.clientsList}>
          {clientesConPrestamo.map((cliente) => (
            <View key={cliente.id} style={[styles.clientCard, esMobile && styles.clientCardMobile]}>
              <View style={styles.clientTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{cliente.nombre}</Text>
                  <Text style={styles.clientMeta}>DNI: {cliente.dni || '—'}</Text>
                  <Text style={styles.clientMeta}>{cliente.telefono || 'Sin teléfono'}</Text>
                </View>

                <BadgeEstado
                  texto={cliente.estadoVisual.texto}
                  tipo={cliente.estadoVisual.tipo}
                />
              </View>

              <View style={[styles.clientInfoGrid, esMobile && styles.clientInfoGridMobile]}>
                <View style={styles.clientInfoBox}>
                  <Text style={styles.clientInfoLabel}>Deuda actual</Text>
                  <Text style={styles.clientInfoValue}>
                    {formatearMoneda(cliente.deudaActual)}
                  </Text>
                </View>

                <View style={styles.clientInfoBox}>
                  <Text style={styles.clientInfoLabel}>Próximo pago</Text>
                  <Text style={styles.clientInfoValue}>
                    {formatearFecha(cliente.proximoPago)}
                  </Text>
                </View>
              </View>

              <View style={[styles.clientButtonsRow, esMobile && styles.clientButtonsColumn]}>
                <TouchableOpacity
                  style={[styles.clientButton, styles.clientButtonPrimary]}
                  onPress={() => cargarPago(cliente.id)}
                >
                  <Text style={styles.clientButtonPrimaryText}>Cargar pago</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.clientButton}
                  onPress={() => verCliente(cliente.id)}
                >
                  <Text style={styles.clientButtonText}>Ver detalle</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Cargando panel...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.layout, esDesktop ? styles.layoutDesktop : styles.layoutMobile]}>
        <Sidebar />

        <View style={styles.main}>
          <Header />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {esDesktop ? (
              <>
                <View style={styles.topGridDesktop}>
                  <View style={styles.topLeftDesktop}>
                    <BloqueHoy />
                  </View>

                  <View style={styles.topRightDesktop}>
                    <AccionesRapidas />
                  </View>
                </View>

                <View style={styles.bottomGridDesktop}>
                  <View style={styles.bottomLeftDesktop}>
                    <ListaClientes />
                    <ListaEmpleados />
                  </View>

                  <View style={styles.bottomRightDesktop}>
                    <ResumenGeneral />
                  </View>
                </View>
              </>
            ) : (
              <>
                <BloqueHoy />
                <AccionesRapidas />
                <ResumenGeneral />
                <ListaEmpleados />
                <ListaClientes />
              </>
            )}

            {esWeb && <View style={{ height: 10 }} />}
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

  layout: {
    flex: 1,
  },

  layoutDesktop: {
    flexDirection: 'row',
  },

  layoutMobile: {
    flexDirection: 'column',
  },

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
    paddingTop: 14,
    paddingBottom: 14,
  },

  brandBlock: {
    marginBottom: 8,
  },

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
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },

  sideItemText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 14,
  },

  sideItemTextActive: {
    color: '#FFFFFF',
  },

  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  scrollContent: {
    paddingBottom: 28,
  },

  header: {
    minHeight: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  logoCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoCircleText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },

  headerSub: {
    color: '#94A3B8',
    marginTop: 2,
    fontSize: 13,
  },

  logoutIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutIconText: {
    color: '#F87171',
    fontSize: 18,
    fontWeight: '900',
  },

  topGridDesktop: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
    marginBottom: 16,
  },

  topLeftDesktop: {
    flex: 1.3,
  },

  topRightDesktop: {
    flex: 1,
  },

  bottomGridDesktop: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },

  bottomLeftDesktop: {
    flex: 1.4,
  },

  bottomRightDesktop: {
    flex: 0.8,
  },

  hoyCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },

  hoyCardDesktop: {
    minHeight: 220,
    justifyContent: 'space-between',
  },

  sectionEyebrow: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },

  hoyMainRow: {
    marginBottom: 18,
  },

  hoyMainBlock: {
    backgroundColor: '#0B1220',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 18,
  },

  hoyMainLabel: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 8,
  },

  hoyMainValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },

  hoyStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },

  hoyStatsColumn: {
    flexDirection: 'column',
  },

  hoyMiniCard: {
    flex: 1,
    backgroundColor: '#0B1220',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
  },

  hoyMiniNumber: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },

  hoyMiniLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6,
  },

  panel: {
    backgroundColor: '#0F172A',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    marginBottom: 16,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },

  sectionSub: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },

  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },

  actionsGridMobile: {
    flexDirection: 'column',
  },

  actionCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
  },

  actionPrimary: {
    backgroundColor: '#1D4ED8',
    borderColor: '#3B82F6',
  },

  actionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  actionSub: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 8,
  },

  summaryStack: {
    gap: 12,
  },

  summaryRow: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
  },

  summaryLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 6,
  },

  summaryValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },

  panelHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 8,
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

  clientsList: {
    marginTop: 6,
  },

  clientCard: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },

  clientCardMobile: {
    padding: 16,
  },

  clientTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },

  clientName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  clientMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },

  clientInfoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },

  clientInfoGridMobile: {
    flexDirection: 'column',
  },

  clientInfoBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
  },

  clientInfoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 6,
  },

  clientInfoValue: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },

  clientButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },

  clientButtonsColumn: {
    flexDirection: 'column',
  },

  clientButton: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },

  clientButtonPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },

  clientButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 14,
  },

  clientButtonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  badgeVerde: {
    backgroundColor: '#14532D',
    borderColor: '#22C55E',
  },

  badgeAmarillo: {
    backgroundColor: '#713F12',
    borderColor: '#F59E0B',
  },

  badgeRojo: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
  },

  badgeGris: {
    backgroundColor: '#334155',
    borderColor: '#64748B',
  },

  badgeAzul: {
    backgroundColor: '#1D4ED8',
    borderColor: '#60A5FA',
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