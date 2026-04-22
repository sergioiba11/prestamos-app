import { useFocusEffect } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  SUPABASE_URL,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../lib/supabase'
import { logActivity } from '../lib/activity'

type Cliente = {
  id: string
  nombre: string
  apellido?: string | null
  email?: string | null
  telefono: string | null
  dni: string | null
}

type Prestamo = {
  id: string
  cliente_id: string
  monto: number | null
  interes: number | null
  total_a_pagar: number | null
  fecha_inicio: string | null
  fecha_limite: string | null
  estado: string | null
  modalidad: 'mensual' | 'diario' | null
  cuotas: number | null
  dias_plazo: number | null
}

type Cuota = {
  id: string
  prestamo_id: string
  cliente_id: string
  numero_cuota: number
  fecha_vencimiento: string | null
  monto_cuota: number | null
  saldo_pendiente: number | null
  estado: string | null
}

type MetodoPagoUi = 'efectivo' | 'transferencia' | 'mp'
type MetodoPagoApi = 'efectivo' | 'transferencia' | 'mercado_pago'

type MercadoPagoEstado = {
  connected: boolean
  aliasCuenta: string | null
  mpUserId: string | null
}

type RegistrarPagoResponse = {
  ok?: boolean
  pendiente?: boolean
  estado?: string
  error?: string
  detalle?: string
  pago?: any
  cuotas_impactadas?: number[]
  detalle_aplicacion?: Array<{
    cuota_id: string
    numero_cuota: number
    monto_aplicado: number
    saldo_cuota_antes: number
    saldo_cuota_despues: number
    estado_resultante: string
  }>
  total_aplicado?: number
  monto_ingresado?: number
  vuelto?: number
  saldo_restante?: number
  cuota_actualizada?: {
    cuota_id: string
    numero_cuota: number
    saldo_despues: number
    estado: string
  } | null
  proxima_cuota?: {
    id: string
    numero_cuota: number
    monto_cuota: number | null
    monto_pagado: number | null
    saldo_pendiente: number | null
    estado: string | null
    fecha_vencimiento: string | null
  } | null
  prestamo_estado?: string
}

type CrearPagoMpResponse = {
  ok?: boolean
  error?: string
  detalle?: string
  preference_id?: string
  init_point?: string
  qr_url?: string
  qr_base64?: string
}

function normalizarMetodoPago(metodo: MetodoPagoUi): MetodoPagoApi {
  return metodo === 'mp' ? 'mercado_pago' : metodo
}

function limpiarNumero(texto: string, maxEnteros = 9) {
  if (!texto) return ''

  let limpio = texto.replace(/[^\d,]/g, '')

  const primeraComa = limpio.indexOf(',')
  if (primeraComa !== -1) {
    const parteEntera = limpio.slice(0, primeraComa + 1)
    const parteDecimal = limpio.slice(primeraComa + 1).replace(/,/g, '')
    limpio = parteEntera + parteDecimal
  }

  const [parteEnteraRaw = '', parteDecimalRaw = ''] = limpio.split(',')
  const parteEntera = parteEnteraRaw.replace(/^0+(?=\d)/, '').slice(0, maxEnteros)
  const parteDecimal = parteDecimalRaw.slice(0, 2)

  if (limpio.includes(',')) {
    return `${parteEntera || '0'},${parteDecimal}`
  }

  return parteEntera || '0'
}

function textoAMonto(texto: string) {
  const limpio = limpiarNumero(texto)
  if (!limpio) return 0

  const partes = limpio.split(',')
  const enteros = partes[0] ? partes[0].replace(/^0+(?=\d)/, '') || '0' : '0'
  const decimales = (partes[1] || '').slice(0, 2)

  const normalizado = decimales ? `${enteros}.${decimales}` : enteros
  const numero = Number(normalizado)

  return Number.isNaN(numero) ? 0 : numero
}

function formatearMonedaInput(valor: string) {
  const limpio = limpiarNumero(valor)
  if (!limpio) return ''

  const tieneComa = limpio.includes(',')
  const [parteEnteraRaw, parteDecimalRaw = ''] = limpio.split(',')

  const parteEnteraNormalizada =
    parteEnteraRaw?.replace(/^0+(?=\d)/, '') || '0'

  const parteEnteraFormateada = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(Number(parteEnteraNormalizada))

  if (tieneComa) {
    return `$${parteEnteraFormateada},${parteDecimalRaw.slice(0, 2)}`
  }

  return `$${parteEnteraFormateada}`
}

function formatearMoneda(valor: number) {
  return (
    '$' +
    new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(valor || 0))
  )
}

function formatearFecha(fecha?: string | null) {
  if (!fecha) return '—'
  const limpia = fecha.slice(0, 10)
  const partes = limpia.split('-')
  if (partes.length !== 3) return limpia
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

function obtenerFunctionsUrl() {
  const baseUrl = supabaseUrl || SUPABASE_URL
  if (!baseUrl) {
    throw new Error('No se encontró la URL de Supabase para registrar el pago')
  }
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/registrar-pago`
}

function obtenerFunctionsUrlPorNombre(nombre: string) {
  const baseUrl = supabaseUrl || SUPABASE_URL
  if (!baseUrl) {
    throw new Error('No se encontró la URL de Supabase')
  }
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${nombre}`
}

async function obtenerAccessTokenValido() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    throw new Error('No se pudo leer la sesión actual')
  }

  if (!session?.user?.id || !session.access_token) {
    throw new Error('La sesión expiró. Volvé a iniciar sesión.')
  }

  const nowUnix = Math.floor(Date.now() / 1000)
  const expiraEnMenosDeUnMinuto =
    typeof session.expires_at === 'number' && session.expires_at - nowUnix <= 60

  if (!expiraEnMenosDeUnMinuto) {
    return session.access_token
  }

  const { data: refreshedData, error: refreshError } =
    await supabase.auth.refreshSession()

  if (refreshError || !refreshedData.session?.access_token) {
    throw new Error('La sesión expiró. Volvé a iniciar sesión.')
  }

  return refreshedData.session.access_token
}

export default function CargarPago() {
  const params = useLocalSearchParams()

  const clienteIdParam = useMemo(() => {
    const raw = params.cliente_id
    if (Array.isArray(raw)) return raw[0]
    return typeof raw === 'string' ? raw : ''
  }, [params])

  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])

  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<Prestamo | null>(null)
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<Cuota | null>(null)
  const [mostrarTodasCuotas, setMostrarTodasCuotas] = useState(false)

  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPagoUi>('efectivo')
  const [comprobante, setComprobante] = useState('')
  const [mpEstado, setMpEstado] = useState<MercadoPagoEstado>({
    connected: false,
    aliasCuenta: null,
    mpUserId: null,
  })

  const [mpCheckout, setMpCheckout] = useState<{
    preferenceId: string
    initPoint: string
    qrUrl: string | null
    qrBase64: string | null
  } | null>(null)

  useEffect(() => {
    cargarClientes()
  }, [])

  useFocusEffect(
    useCallback(() => {
      void cargarEstadoMercadoPago()
    }, [metodo])
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBusquedaDebounced(busqueda.trim().toLowerCase())
    }, 300)

    return () => clearTimeout(timeout)
  }, [busqueda])

  useEffect(() => {
    if (clienteSeleccionado?.id) {
      cargarPrestamosCliente(clienteSeleccionado.id)
    } else {
      setPrestamos([])
      setPrestamoSeleccionado(null)
      setCuotas([])
      setCuotaSeleccionada(null)
      setMonto('')
    }
  }, [clienteSeleccionado])

  useEffect(() => {
    if (prestamoSeleccionado?.id) {
      cargarCuotasPrestamo(prestamoSeleccionado.id)
    } else {
      setCuotas([])
      setCuotaSeleccionada(null)
      setMonto('')
    }
  }, [prestamoSeleccionado])

  const cargarEstadoMercadoPago = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user?.id) {
        setMpEstado({ connected: false, aliasCuenta: null, mpUserId: null })
        return
      }

      const { data, error } = await supabase
        .from('admin_settings')
        .select('connected, mp_access_token, alias_cuenta, mp_user_id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error) {
        console.log('[cargar-pago] No se pudo leer estado MP:', error)
        setMpEstado({ connected: false, aliasCuenta: null, mpUserId: null })
        return
      }

      const hasToken = Boolean(String(data?.mp_access_token || '').trim())
      const connected = Boolean(data?.connected) && hasToken

      setMpEstado({
        connected,
        aliasCuenta: data?.alias_cuenta ? String(data.alias_cuenta) : null,
        mpUserId: data?.mp_user_id ? String(data.mp_user_id) : null,
      })

      if (!connected && metodo === 'mp') {
        setMetodo('efectivo')
      }
    } catch (error) {
      console.log('[cargar-pago] Error validando estado MP:', error)
      setMpEstado({ connected: false, aliasCuenta: null, mpUserId: null })
    }
  }

  const cargarClientes = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('clientes')
        .select(`
          id,
          nombre,
          telefono,
          dni,
          usuario_id,
          usuarios:usuario_id (
            email,
            nombre
          )
        `)
        .order('nombre', { ascending: true })

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      const lista = ((data || []) as any[]).map((cliente) => ({
        ...cliente,
        email: cliente.usuarios?.email || null,
      })) as Cliente[]
      setClientes(lista)

      if (clienteIdParam) {
        const encontrado = lista.find((c) => c.id === clienteIdParam) || null
        setClienteSeleccionado(encontrado)
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }

  const cargarPrestamosCliente = async (clienteId: string) => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('prestamos')
        .select(`
          id,
          cliente_id,
          monto,
          interes,
          total_a_pagar,
          fecha_inicio,
          fecha_limite,
          estado,
          modalidad,
          cuotas,
          dias_plazo
        `)
        .eq('cliente_id', clienteId)
        .neq('estado', 'pagado')
        .order('fecha_inicio', { ascending: false })

      if (error) {
        Alert.alert('Error', error.message)
        setPrestamos([])
        setPrestamoSeleccionado(null)
        return
      }

      const lista = (data || []) as Prestamo[]
      setPrestamos(lista)
      setPrestamoSeleccionado(lista[0] || null)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar los préstamos')
      setPrestamos([])
      setPrestamoSeleccionado(null)
    } finally {
      setLoading(false)
    }
  }

  const cargarCuotasPrestamo = async (prestamoId: string) => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('cuotas')
        .select(`
          id,
          prestamo_id,
          cliente_id,
          numero_cuota,
          fecha_vencimiento,
          monto_cuota,
          saldo_pendiente,
          estado
        `)
        .eq('prestamo_id', prestamoId)
        .in('estado', ['pendiente', 'parcial'])
        .order('numero_cuota', { ascending: true })

      if (error) {
        Alert.alert('Error', error.message)
        setCuotas([])
        setCuotaSeleccionada(null)
        return
      }

      const lista = (data || []) as Cuota[]
      setCuotas(lista)
      setCuotaSeleccionada(lista[0] || null)
      setMonto('')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar las cuotas')
      setCuotas([])
      setCuotaSeleccionada(null)
    } finally {
      setLoading(false)
    }
  }

  const clientesFiltrados = useMemo(() => {
    const texto = busquedaDebounced
    if (!texto) return clientes

    return clientes.filter((cliente) => {
      return (
        cliente.nombre?.toLowerCase().includes(texto) ||
        cliente.dni?.toLowerCase().includes(texto) ||
        cliente.email?.toLowerCase().includes(texto)
      )
    })
  }, [clientes, busquedaDebounced])

  const deudaActual = Number(cuotaSeleccionada?.saldo_pendiente || 0)
  const transferenciaMontoAutomatico = Number(deudaActual.toFixed(2))
  const montoNormalizado = metodo === 'transferencia'
    ? transferenciaMontoAutomatico
    : textoAMonto(monto)
  const montoAplicado = Math.min(montoNormalizado, deudaActual)
  const vuelto = Math.max(0, montoNormalizado - deudaActual)
  const saldoLuegoDelPagoCuota = Math.max(0, deudaActual - montoAplicado)
  const cuotaPendienteValida = Boolean(cuotaSeleccionada?.id) && deudaActual > 0
  const mpDisponible = mpEstado.connected

  const volver = () => {
    if (clienteSeleccionado?.id) {
      router.replace(`/cliente-detalle?cliente_id=${clienteSeleccionado.id}` as any)
      return
    }
    router.back()
  }

  useEffect(() => {
    if (!cuotaSeleccionada) return

    if (metodo === 'transferencia') {
      setMonto(formatearMonedaInput(String(transferenciaMontoAutomatico)))
    }
  }, [metodo, cuotaSeleccionada, transferenciaMontoAutomatico])

  const limpiarTodo = () => {
    setClienteSeleccionado(null)
    setPrestamos([])
    setPrestamoSeleccionado(null)
    setCuotas([])
    setCuotaSeleccionada(null)
    setMostrarTodasCuotas(false)
    setBusqueda('')
    setMonto('')
    setMetodo('efectivo')
    setComprobante('')
    setMpCheckout(null)
  }

  const invocarFuncionConFallback = async (
    accessToken: string,
    payload: Record<string, any>
  ): Promise<RegistrarPagoResponse> => {
    const { data, error } = await supabase.functions.invoke('registrar-pago', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: payload,
    })

    console.log('RESPUESTA REGISTRAR PAGO JSON:', data)
    console.log('ERROR INVOKE REGISTRAR PAGO:', error)

    if (!error) {
      return (data || {}) as RegistrarPagoResponse
    }

    console.log('FALLBACK REGISTRAR PAGO: intento por fetch directo')

    const res = await fetch(obtenerFunctionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    let json: RegistrarPagoResponse = {}
    try {
      json = (await res.json()) as RegistrarPagoResponse
    } catch {
      json = {}
    }

    console.log('STATUS FETCH FALLBACK REGISTRAR PAGO:', res.status)
    console.log('RESPUESTA FETCH FALLBACK REGISTRAR PAGO:', json)

    if (!res.ok) {
      throw new Error(
        json?.error ||
          json?.detalle ||
          `No se pudo registrar el pago (${res.status})`
      )
    }

    return json
  }

  const crearPagoMercadoPago = async (
    accessToken: string
  ): Promise<CrearPagoMpResponse> => {
    if (!prestamoSeleccionado?.id || !clienteSeleccionado?.id || !cuotaSeleccionada?.id) {
      throw new Error('Faltan datos para iniciar Mercado Pago')
    }

    const payload = {
      prestamo_id: prestamoSeleccionado.id,
      cliente_id: clienteSeleccionado.id,
      cuota_id: cuotaSeleccionada.id,
      numero_cuota: cuotaSeleccionada.numero_cuota,
      monto: Number(montoAplicado.toFixed(2)),
      title: `Pago cuota #${cuotaSeleccionada.numero_cuota}`,
    }

    const { data, error } = await supabase.functions.invoke('crear-pago-mp', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: payload,
    })

    if (!error) return (data || {}) as CrearPagoMpResponse

    const res = await fetch(obtenerFunctionsUrlPorNombre('crear-pago-mp'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    let json: CrearPagoMpResponse = {}
    try {
      json = (await res.json()) as CrearPagoMpResponse
    } catch {
      json = {}
    }

    if (!res.ok) {
      throw new Error(
        json?.error || json?.detalle || `No se pudo crear el pago de Mercado Pago (${res.status})`
      )
    }

    return json
  }

  const registrarPago = async () => {
    if (guardando) return

    if (!clienteSeleccionado?.id) {
      Alert.alert('Error', 'Seleccioná un cliente')
      return
    }

    if (!prestamoSeleccionado?.id) {
      Alert.alert('Error', 'Seleccioná un préstamo')
      return
    }

    if (!cuotaSeleccionada?.id) {
      Alert.alert('Error', 'Seleccioná una cuota')
      return
    }

    if (!cuotaPendienteValida) {
      Alert.alert('Error', 'No hay una cuota pendiente válida para registrar este pago.')
      return
    }

    if (!montoNormalizado || montoNormalizado <= 0) {
      Alert.alert('Error', 'Ingresá un monto válido')
      return
    }

    if (metodo === 'mp' && !mpDisponible) {
      Alert.alert('Mercado Pago no disponible', 'Primero conectá Mercado Pago en Configuraciones')
      return
    }

    try {
      setGuardando(true)

      const accessToken = await obtenerAccessTokenValido()
      console.log('ACCESS TOKEN REGISTRAR PAGO (últimos 10):', accessToken.slice(-10))

      let mpData: CrearPagoMpResponse | null = null
      if (metodo === 'mp') {
        mpData = await crearPagoMercadoPago(accessToken)
        if (!mpData?.preference_id || !mpData?.init_point) {
          throw new Error('Mercado Pago no devolvió preference_id/init_point')
        }
      }

      const payload = {
        prestamo_id: prestamoSeleccionado.id,
        cliente_id: clienteSeleccionado.id,
        cuota_id: cuotaSeleccionada.id,
        numero_cuota: cuotaSeleccionada.numero_cuota,
        monto: Number(montoAplicado.toFixed(2)),
        monto_ingresado: Number(montoNormalizado.toFixed(2)),
        metodo: normalizarMetodoPago(metodo),
        comprobante_url: metodo === 'transferencia' ? comprobante.trim() || null : null,
        mp_preference_id:
          metodo === 'mp' ? mpData?.preference_id || null : null,
        aplicar_a_multiples: true,
      }

      console.log('PAYLOAD REGISTRAR PAGO:', payload)

      const json = await invocarFuncionConFallback(accessToken, payload)

      if (!json || json.error) {
        Alert.alert(
          'Error',
          json?.error || json?.detalle || 'La función respondió vacío. Intentá nuevamente.'
        )
        return
      }

      if (json?.pendiente) {
        await logActivity({
          tipo: 'pago_registrado',
          clienteId: clienteSeleccionado.id,
          prestamoId: prestamoSeleccionado.id,
          pagoId: json?.pago?.id ? String(json.pago.id) : null,
          descripcion: `Pago pendiente de aprobación (${metodo})`,
          metadata: { monto: Number(montoAplicado.toFixed(2)), cuota: cuotaSeleccionada.numero_cuota },
        })

        if (metodo === 'mp' && mpData?.preference_id && mpData?.init_point) {
          setMpCheckout({
            preferenceId: mpData.preference_id,
            initPoint: mpData.init_point,
            qrUrl: mpData.qr_url || null,
            qrBase64: mpData.qr_base64 || null,
          })
        } else {
          Alert.alert('Pago registrado', 'Pago enviado para aprobación administrativa.')
        }
        void cargarCuotasPrestamo(prestamoSeleccionado.id)
        setMonto('')
        setComprobante('')
        return
      }

      const saldoRestantePrestamo = Number(json?.saldo_restante || 0)
      const saldoRestanteCuota = Number(
        json?.cuota_actualizada?.saldo_despues ?? saldoLuegoDelPagoCuota
      )

      await logActivity({
        tipo: 'pago_registrado',
        clienteId: clienteSeleccionado.id,
        prestamoId: prestamoSeleccionado.id,
        pagoId: json?.pago?.id ? String(json.pago.id) : null,
        descripcion: `Pago aplicado en cuota #${cuotaSeleccionada.numero_cuota}`,
        metadata: { monto: Number(montoAplicado.toFixed(2)), metodo },
      })

      router.replace({
        pathname: '/pago-aprobado',
        params: {
          monto: String(Number(montoAplicado.toFixed(2))),
          monto_ingresado: String(Number(montoNormalizado.toFixed(2))),
          vuelto: String(Number(json?.vuelto ?? vuelto).toFixed(2)),
          monto_cuota: String(Number(cuotaSeleccionada.monto_cuota ?? montoAplicado)),
          metodo,
          fecha: new Date().toLocaleString('es-AR'),
          saldo_restante: String(saldoRestantePrestamo),
          saldo_restante_cuota: String(saldoRestanteCuota),
          cuota_id: cuotaSeleccionada.id,
          numero_cuota: String(cuotaSeleccionada.numero_cuota),
          cuotas_impactadas: JSON.stringify(json?.cuotas_impactadas || []),
          cuotas_impactadas_detalle: JSON.stringify(json?.detalle_aplicacion || []),
          estado_comprobante: String(json?.estado_comprobante || 'COMPLETO'),
          proxima_cuota: json?.proxima_cuota?.numero_cuota
            ? String(json.proxima_cuota.numero_cuota)
            : '',
          prestamo_id: prestamoSeleccionado.id,
          cliente_id: clienteSeleccionado.id,
          cliente_nombre: clienteSeleccionado.nombre,
          cliente_apellido: clienteSeleccionado.apellido || '',
          cliente_dni: clienteSeleccionado.dni || '',
          cliente_email: clienteSeleccionado.email || '',
          cliente_telefono: clienteSeleccionado.telefono || '',
          pago_id: json?.pago?.id ? String(json.pago.id) : '',
          identificador_interno_pago: json?.pago?.id ? String(json.pago.id) : '',
          observaciones: json?.pago?.nota ? String(json.pago.nota) : '',
        },
      })
    } catch (error: any) {
      console.log('ERROR REGISTRAR PAGO CATCH:', error)
      Alert.alert('Error', error?.message || 'No se pudo registrar el pago')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </View>
    )
  }

  return (
    <>
      <ScrollView
      keyboardShouldPersistTaps="always"
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backButton} onPress={volver}>
        <Text style={styles.backButtonText}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Cargar pago</Text>
      <Text style={styles.subtitle}>Registrá un pago por cuota</Text>

      {!clienteSeleccionado ? (
        <>
          <Text style={styles.label}>Paso 1 · Seleccioná cliente</Text>

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Nombre, DNI o email"
            placeholderTextColor="#64748B"
            style={styles.input}
          />

          <View style={styles.listBox}>
            {clientesFiltrados.length === 0 ? (
              <Text style={styles.emptyText}>No se encontraron clientes.</Text>
            ) : (
              clientesFiltrados.map((cliente) => (
                <TouchableOpacity
                  key={cliente.id}
                  style={styles.selectCard}
                  onPress={() => setClienteSeleccionado(cliente)}
                >
                  <Text style={styles.selectName}>{cliente.nombre}</Text>
                  <Text style={styles.selectMeta}>DNI: {cliente.dni || '—'}</Text>
                  <Text style={styles.selectMeta}>
                    Teléfono: {cliente.telefono || 'Sin teléfono'}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Paso 1 · Cliente seleccionado</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoName}>{clienteSeleccionado.nombre}</Text>
            <Text style={styles.infoMeta}>DNI: {clienteSeleccionado.dni || '—'}</Text>
            <Text style={styles.infoMeta}>Email: {clienteSeleccionado.email || 'Sin email'}</Text>
            <Text style={styles.infoMeta}>Teléfono: {clienteSeleccionado.telefono || 'Sin teléfono'}</Text>
          </View>

          <TouchableOpacity style={styles.changeButton} onPress={limpiarTodo}>
            <Text style={styles.changeButtonText}>Cambiar cliente</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Paso 2 · Seleccioná préstamo</Text>

          {prestamos.length === 0 ? (
            <Text style={styles.emptyText}>Este cliente no tiene préstamos activos.</Text>
          ) : (
            <View style={styles.listBox}>
              {prestamos.map((prestamo) => {
                const seleccionado = prestamoSeleccionado?.id === prestamo.id

                return (
                  <TouchableOpacity
                    key={prestamo.id}
                    style={[
                      styles.selectCard,
                      seleccionado && styles.selectCardActive,
                    ]}
                    onPress={() => {
                      setPrestamoSeleccionado(prestamo)
                      setCuotaSeleccionada(null)
                      setMonto('')
                    }}
                  >
                    <Text style={styles.selectName}>
                      {prestamo.modalidad === 'diario'
                        ? 'Préstamo diario'
                        : 'Préstamo mensual'}
                    </Text>
                    <Text style={styles.selectMeta}>
                      Total préstamo: {formatearMoneda(Number(prestamo.total_a_pagar || 0))}
                    </Text>
                    <Text style={styles.selectMeta}>
                      Fecha límite: {formatearFecha(prestamo.fecha_limite)}
                    </Text>
                    <Text style={styles.selectMeta}>
                      Estado: {prestamo.estado || 'activo'}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {prestamoSeleccionado && (
            <>
              <Text style={styles.label}>Paso 3 · Seleccioná una cuota</Text>

              {cuotas.length > 0 && (
                <View style={styles.listBox}>
                  {(mostrarTodasCuotas ? cuotas : cuotas.slice(0, 6)).map((cuota) => {
                    const selected = cuotaSeleccionada?.id === cuota.id
                    return (
                      <TouchableOpacity
                        key={cuota.id}
                        style={[styles.selectCard, selected && styles.selectCardActive]}
                        onPress={() => setCuotaSeleccionada(cuota)}
                      >
                        <Text style={styles.selectName}>Cuota #{cuota.numero_cuota}</Text>
                        <Text style={styles.selectMeta}>
                          Vencimiento: {formatearFecha(cuota.fecha_vencimiento)}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Monto: {formatearMoneda(Number(cuota.monto_cuota || 0))}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Saldo pendiente: {formatearMoneda(Number(cuota.saldo_pendiente || 0))}
                        </Text>
                        <Text style={styles.selectMeta}>Estado: {cuota.estado || 'pendiente'}</Text>
                      </TouchableOpacity>
                    )
                  })}

                  {cuotas.length > 6 && (
                    <TouchableOpacity
                      style={styles.changeButton}
                      onPress={() => setMostrarTodasCuotas((prev) => !prev)}
                    >
                      <Text style={styles.changeButtonText}>
                        {mostrarTodasCuotas ? 'Ver menos cuotas' : `Ver ${cuotas.length - 6} cuotas más`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <Text style={styles.label}>Paso 4 · Resumen de cuota</Text>

              {!cuotaSeleccionada ? (
                <Text style={styles.emptyText}>Este préstamo no tiene cuotas pendientes.</Text>
              ) : (
                <View style={styles.infoCard}>
                  <Text style={styles.infoName}>Cuota #{cuotaSeleccionada.numero_cuota}</Text>
                  <Text style={styles.infoMeta}>Vence: {formatearFecha(cuotaSeleccionada.fecha_vencimiento)}</Text>
                  <Text style={styles.infoMeta}>Monto cuota: {formatearMoneda(Number(cuotaSeleccionada.monto_cuota || 0))}</Text>
                  <Text style={styles.infoMeta}>Saldo pendiente: {formatearMoneda(Number(cuotaSeleccionada.saldo_pendiente || 0))}</Text>
                  <Text style={styles.infoMeta}>Estado: {cuotaSeleccionada.estado || 'pendiente'}</Text>
                </View>
              )}
            </>
          )}

          {cuotaSeleccionada && (
            <>
              <Text style={styles.label}>Paso 5 · Método de pago</Text>

              <View style={styles.methodsRow}>
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    metodo === 'efectivo' && styles.methodButtonActive,
                  ]}
                  onPress={() => setMetodo('efectivo')}
                >
                  <Text
                    style={[
                      styles.methodButtonText,
                      metodo === 'efectivo' && styles.methodButtonTextActive,
                    ]}
                  >
                    Efectivo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    metodo === 'transferencia' && styles.methodButtonActive,
                  ]}
                  onPress={() => setMetodo('transferencia')}
                >
                  <Text
                    style={[
                      styles.methodButtonText,
                      metodo === 'transferencia' && styles.methodButtonTextActive,
                    ]}
                  >
                    Transferencia
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    metodo === 'mp' && styles.methodButtonActive,
                    !mpDisponible && styles.methodButtonDisabled,
                  ]}
                  onPress={() => {
                    if (!mpDisponible) {
                      Alert.alert('Mercado Pago no disponible', 'Primero conectá Mercado Pago en Configuraciones')
                      return
                    }
                    setMetodo('mp')
                  }}
                  activeOpacity={mpDisponible ? 0.8 : 1}
                >
                  <Text
                    style={[
                      styles.methodButtonText,
                      metodo === 'mp' && styles.methodButtonTextActive,
                    ]}
                  >
                    MP
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Paso 6 · Monto</Text>

              <TextInput
                value={metodo === 'transferencia' ? formatearMonedaInput(String(transferenciaMontoAutomatico)) : monto}
                onChangeText={(texto) => setMonto(formatearMonedaInput(texto))}
                placeholder="$0"
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
                style={[styles.input, metodo === 'transferencia' && styles.inputDisabled]}
                editable={metodo !== 'transferencia'}
              />

              {(metodo === 'transferencia' || metodo === 'mp') && (
                <>
                  <Text style={styles.transferBadge}>Pendiente de aprobación</Text>
                  <Text style={styles.helperText}>
                    Se registrará para revisión y recién se acreditará al aprobarse.
                  </Text>
                  {metodo === 'transferencia' && (
                    <Text style={styles.helperText}>
                      En transferencia el monto se completa automáticamente con el saldo de la cuota.
                    </Text>
                  )}
                </>
              )}
              {metodo === 'efectivo' && (
                <Text style={styles.helperText}>
                  El pago en efectivo se acredita al instante.
                </Text>
              )}

              <Text style={styles.helperText}>
                Cuota #{cuotaSeleccionada.numero_cuota} - saldo pendiente:{' '}
                {formatearMoneda(deudaActual)}
              </Text>

              {!mpDisponible ? (
                <Text style={styles.mpDisabledHelper}>
                  Primero conectá Mercado Pago en Configuraciones
                </Text>
              ) : null}

              {metodo === 'transferencia' && (
                <>
                  <Text style={styles.label}>Comprobante (texto o URL opcional)</Text>
                  <TextInput
                    value={comprobante}
                    onChangeText={setComprobante}
                    placeholder="Pegá una URL o nota del comprobante"
                    placeholderTextColor="#64748B"
                    style={styles.input}
                  />
                </>
              )}

              {metodo === 'mp' && (
                <Text style={styles.helperText}>
                  Se generará automáticamente un QR al registrar el pago.
                </Text>
              )}

              <Text style={styles.label}>Paso 7 · Resumen final</Text>

              <View style={styles.resumeCard}>
                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Recibido</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(montoNormalizado)}</Text>
                </View>

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>{metodo === 'efectivo' ? 'Se aplica a cuota' : 'Monto a acreditar (pendiente)'}</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(montoAplicado)}</Text>
                </View>

                {metodo === 'efectivo' && (
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Vuelto</Text>
                    <Text style={styles.resumeValue}>{formatearMoneda(vuelto)}</Text>
                  </View>
                )}

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Saldo restante cuota</Text>
                  <Text style={styles.resumeValue}>
                    {formatearMoneda(metodo === 'efectivo' ? saldoLuegoDelPagoCuota : deudaActual)}
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Paso 8 · Confirmación</Text>

              <TouchableOpacity
                style={[styles.saveButton, (guardando || !cuotaPendienteValida) && styles.saveButtonDisabled]}
                onPress={registrarPago}
                disabled={guardando || !cuotaPendienteValida}
              >
                <Text style={styles.saveButtonText}>
                  {guardando ? 'Guardando...' : 'Registrar pago de cuota'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
      </ScrollView>
      <Modal
        visible={Boolean(mpCheckout)}
        transparent
        animationType="fade"
        onRequestClose={() => setMpCheckout(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pago Mercado Pago generado</Text>
            <Text style={styles.modalSub}>Escaneá el QR o abrí Mercado Pago.</Text>

            {mpCheckout?.qrBase64 || mpCheckout?.qrUrl ? (
              <Image
                source={{
                  uri: mpCheckout?.qrBase64
                    ? `data:image/png;base64,${mpCheckout.qrBase64}`
                    : String(mpCheckout?.qrUrl || ''),
                }}
                style={styles.qrImage}
              />
            ) : (
              <Text style={styles.helperText}>No se pudo generar QR visual.</Text>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { width: '100%', marginTop: 14 }]}
              onPress={() => {
                if (mpCheckout?.initPoint) {
                  void Linking.openURL(mpCheckout.initPoint)
                }
              }}
            >
              <Text style={styles.saveButtonText}>Abrir Mercado Pago</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.changeButton, { width: '100%', marginTop: 10 }]}
              onPress={() => setMpCheckout(null)}
            >
              <Text style={styles.changeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817',
  },

  content: {
    padding: 16,
    paddingBottom: 30,
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
    fontSize: 16,
    fontWeight: '600',
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },

  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },

  title: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },

  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 20,
  },

  label: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 16,
  },


  inputDisabled: {
    opacity: 0.6,
  },

  transferBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#78350F',
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
  },

  listBox: {
    marginTop: 10,
    gap: 10,
  },

  selectCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
  },

  selectCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#0B1220',
  },

  selectName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },

  selectMeta: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },

  infoCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
  },

  infoName: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },

  infoMeta: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 2,
  },

  changeButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#172554',
  },

  changeButtonText: {
    color: '#BFDBFE',
    fontWeight: '700',
  },

  emptyText: {
    color: '#94A3B8',
    marginTop: 8,
  },

  helperText: {
    color: '#94A3B8',
    marginTop: 8,
    fontSize: 13,
  },

  methodsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },

  methodButton: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  methodButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#172554',
  },

  methodButtonText: {
    color: '#CBD5E1',
    fontWeight: '700',
  },

  methodButtonTextActive: {
    color: '#DBEAFE',
  },

  methodButtonDisabled: {
    opacity: 0.45,
    borderColor: '#334155',
  },

  mpDisabledHelper: {
    color: '#FCA5A5',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },

  resumeCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },

  resumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  resumeLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },

  resumeValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },

  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },

  modalTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },

  modalSub: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },

  qrImage: {
    width: 240,
    height: 240,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
})
