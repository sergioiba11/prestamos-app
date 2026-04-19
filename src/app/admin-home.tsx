import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type PrestamoActivo = {
  id: string
  cliente_id: string
  estado: string | null
  total_a_pagar: number | null
  saldo_pendiente: number | null
}

type ClienteRow = {
  id: string
  nombre: string
  dni: string | null
  telefono: string | null
  usuarios?: { email: string | null } | null
}

type Cuota = {
  prestamo_id: string
  cliente_id: string
  numero_cuota: number
  fecha_vencimiento: string | null
  saldo_pendiente: number | null
  estado: string | null
}

type PagoPendiente = {
  id: string
  cliente_id: string
  prestamo_id: string
  monto: number | null
  metodo: string | null
  estado: string | null
  created_at: string | null
}

type ClienteActivoCard = {
  clienteId: string
  nombre: string
  email: string
  dni: string
  prestamoId: string
  saldoPendiente: number
  estado: string
  proximaCuota: string
}

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

function fecha(v?: string | null) {
  if (!v) return '—'
  const [yy, mm, dd] = v.slice(0, 10).split('-')
  return yy && mm && dd ? `${dd}/${mm}/${yy}` : v
}

function lower(v?: string | null) {
  return String(v || '').toLowerCase()
}

export default function AdminHome() {
  const { width } = useWindowDimensions()
  const desktop = width >= 980

  const [loading, setLoading] = useState(true)
  const [nombreAdmin, setNombreAdmin] = useState('Admin')
  const [clientesActivos, setClientesActivos] = useState<ClienteActivoCard[]>([])
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendiente[]>([])
  const [aprobandoPagoId, setAprobandoPagoId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  const [kpi, setKpi] = useState({
    cobrarHoy: 0,
    activos: 0,
    vencidos: 0,
    pendientes: 0,
  })

  const cargarTodo = useCallback(async () => {
    try {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      if (authData?.user?.email) setNombreAdmin(authData.user.email.split('@')[0])

      const [clientesRes, prestamosRes, cuotasRes, pagosRes] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre, dni, telefono, usuarios:usuario_id (email)')
          .order('nombre', { ascending: true }),
        supabase
          .from('prestamos')
          .select('id, cliente_id, estado, total_a_pagar, saldo_pendiente')
          .in('estado', ['activo', 'pendiente', 'en_mora']),
        supabase
          .from('cuotas')
          .select('prestamo_id, cliente_id, numero_cuota, fecha_vencimiento, saldo_pendiente, estado')
          .in('estado', ['pendiente', 'parcial', 'vencida']),
        supabase
          .from('pagos')
          .select('id, cliente_id, prestamo_id, monto, metodo, estado, created_at')
          .in('estado', ['pendiente', 'pendiente_aprobacion'])
          .order('created_at', { ascending: false }),
      ])

      if (clientesRes.error) throw clientesRes.error
      if (prestamosRes.error) throw prestamosRes.error
      if (cuotasRes.error) throw cuotasRes.error
      if (pagosRes.error) throw pagosRes.error

      const clientes = (clientesRes.data || []) as ClienteRow[]
      const prestamos = (prestamosRes.data || []) as PrestamoActivo[]
      const cuotas = (cuotasRes.data || []) as Cuota[]
      const pendientes = (pagosRes.data || []) as PagoPendiente[]

      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const hoyKey = hoy.toISOString().slice(0, 10)

      let cobrarHoy = 0
      let vencidos = 0

      const cuotaPorPrestamo = new Map<string, Cuota[]>()
      for (const cuota of cuotas) {
        const list = cuotaPorPrestamo.get(cuota.prestamo_id) || []
        list.push(cuota)
        cuotaPorPrestamo.set(cuota.prestamo_id, list)

        if ((cuota.fecha_vencimiento || '').slice(0, 10) === hoyKey) {
          cobrarHoy += Number(cuota.saldo_pendiente || 0)
        }

        if (cuota.fecha_vencimiento) {
          const vto = new Date(`${cuota.fecha_vencimiento}T00:00:00`)
          if (vto.getTime() < hoy.getTime()) vencidos += 1
        }
      }

      const byCliente = new Map(clientes.map((c) => [c.id, c]))
      const cards: ClienteActivoCard[] = prestamos.map((prestamo) => {
        const c = byCliente.get(prestamo.cliente_id)
        const cuotasPrestamo = (cuotaPorPrestamo.get(prestamo.id) || []).sort((a, b) => a.numero_cuota - b.numero_cuota)
        const prox = cuotasPrestamo[0]

        return {
          clienteId: prestamo.cliente_id,
          nombre: c?.nombre || 'Cliente',
          email: c?.usuarios?.email || 'Sin email',
          dni: c?.dni || '—',
          prestamoId: prestamo.id,
          saldoPendiente: Number(prestamo.saldo_pendiente || prestamo.total_a_pagar || 0),
          estado: lower(prestamo.estado) || 'activo',
          proximaCuota: prox
            ? `#${prox.numero_cuota} · ${fecha(prox.fecha_vencimiento)} · ${money(Number(prox.saldo_pendiente || 0))}`
            : 'Sin cuotas pendientes',
        }
      })

      setClientesActivos(cards)
      setPagosPendientes(pendientes)
      setKpi({
        cobrarHoy,
        activos: prestamos.length,
        vencidos,
        pendientes: pendientes.length,
      })
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cargar el panel admin')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void cargarTodo()
    }, [cargarTodo])
  )

  const listaFiltrada = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    if (!t) return clientesActivos
    return clientesActivos.filter((c) => c.nombre.toLowerCase().includes(t) || c.dni.toLowerCase().includes(t) || c.email.toLowerCase().includes(t))
  }, [clientesActivos, filtro])

  const gestionarPago = async (pagoId: string, accion: 'aprobar' | 'rechazar') => {
    if (aprobandoPagoId) return
    try {
      setAprobandoPagoId(pagoId)
      const { data, error } = await supabase.functions.invoke('aprobar-pago', {
        body: { pago_id: pagoId, accion },
      })

      if (error || data?.error) {
        Alert.alert('Error', error?.message || data?.error || `No se pudo ${accion} el pago`)
        return
      }

      await cargarTodo()
      Alert.alert('OK', accion === 'aprobar' ? 'Pago aprobado y acreditado.' : 'Pago rechazado.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo actualizar el pago')
    } finally {
      setAprobandoPagoId(null)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Cargando panel admin...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>CrediTodo</Text>
          <Text style={styles.title}>Panel admin · {nombreAdmin}</Text>
        </View>
        <TouchableOpacity style={styles.secondaryBtn} onPress={cerrarSesion}>
          <Text style={styles.secondaryText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.kpiGrid, desktop && styles.kpiGridDesktop]}>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>A cobrar hoy</Text><Text style={styles.kpiValue}>{money(kpi.cobrarHoy)}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>Clientes activos</Text><Text style={styles.kpiValue}>{kpi.activos}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>Préstamos vencidos</Text><Text style={styles.kpiValue}>{kpi.vencidos}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>Pagos pendientes</Text><Text style={styles.kpiValue}>{kpi.pendientes}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <View style={[styles.actionsRow, desktop && styles.actionsRowDesktop]}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/nuevo-prestamo' as any)}><Text style={styles.primaryText}>Nuevo préstamo</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/cargar-pago' as any)}><Text style={styles.primaryText}>Registrar pago</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/nuevo-cliente' as any)}><Text style={styles.primaryText}>Nuevo cliente</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/clientes' as any)}><Text style={styles.primaryText}>Ver clientes</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pagos pendientes de aprobación</Text>
          {pagosPendientes.length === 0 ? <Text style={styles.empty}>Sin pagos pendientes.</Text> : pagosPendientes.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.cardTitle}>Pago {p.metodo || '—'} · {money(Number(p.monto || 0))}</Text>
              <Text style={styles.cardMeta}>Cliente: {p.cliente_id} · Fecha: {fecha(p.created_at)}</Text>
              <View style={styles.rowBtns}>
                <TouchableOpacity style={styles.successBtn} onPress={() => gestionarPago(p.id, 'aprobar')} disabled={aprobandoPagoId === p.id}>
                  <Text style={styles.buttonText}>{aprobandoPagoId === p.id ? 'Procesando...' : 'Aprobar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dangerBtn} onPress={() => gestionarPago(p.id, 'rechazar')} disabled={aprobandoPagoId === p.id}>
                  <Text style={styles.buttonText}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clientes con préstamo activo</Text>
          <TextInput
            style={styles.search}
            placeholder="Buscar por nombre, DNI o email"
            placeholderTextColor="#64748B"
            value={filtro}
            onChangeText={setFiltro}
          />

          {listaFiltrada.length === 0 ? <Text style={styles.empty}>No hay clientes activos.</Text> : (
            <View style={[styles.clientGrid, desktop && styles.clientGridDesktop]}>
              {listaFiltrada.map((item) => (
                <View key={`${item.clienteId}-${item.prestamoId}`} style={styles.card}>
                  <Text style={styles.cardTitle}>{item.nombre}</Text>
                  <Text style={styles.cardMeta}>DNI: {item.dni}</Text>
                  <Text style={styles.cardMeta}>Email: {item.email}</Text>
                  <Text style={styles.cardMeta}>Estado préstamo: {item.estado}</Text>
                  <Text style={styles.cardMeta}>Saldo: {money(item.saldoPendiente)}</Text>
                  <Text style={styles.cardMeta}>Próxima cuota: {item.proximaCuota}</Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => router.push({ pathname: '/cliente-detalle', params: { cliente_id: item.clienteId } } as any)}
                  >
                    <Text style={styles.primaryText}>Ver detalle</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020817' },
  topBar: {
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0B1220',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { color: '#60A5FA', fontWeight: '800', fontSize: 13 },
  title: { color: '#fff', fontWeight: '700', fontSize: 18, marginTop: 3 },
  content: { padding: 14, gap: 12, paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020817' },
  loadingText: { color: '#CBD5E1', marginTop: 10 },
  kpiGrid: { gap: 10 },
  kpiGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  kpiCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    minWidth: 160,
    flex: 1,
  },
  kpiLabel: { color: '#94A3B8', fontSize: 12 },
  kpiValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 5 },
  section: { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1E293B' },
  sectionTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  actionsRow: { gap: 8 },
  actionsRowDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  primaryBtn: { backgroundColor: '#1D4ED8', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  secondaryBtn: { backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  secondaryText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1F2937', padding: 10, marginBottom: 8 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cardMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  successBtn: { backgroundColor: '#166534', paddingVertical: 9, borderRadius: 8, flex: 1, alignItems: 'center' },
  dangerBtn: { backgroundColor: '#991B1B', paddingVertical: 9, borderRadius: 8, flex: 1, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  search: {
    backgroundColor: '#020817',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#fff',
  },
  empty: { color: '#94A3B8' },
  clientGrid: { gap: 8, marginTop: 10 },
  clientGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
})
