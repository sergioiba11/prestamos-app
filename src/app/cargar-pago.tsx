import { useFocusEffect } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  SUPABASE_URL,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../lib/supabase'
import { createSystemActivity } from '../lib/activity'

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
type OpcionSobranteEfectivo = 'dar_vuelto' | 'aplicar_proximas'

type MercadoPagoEstado = {
  connected: boolean
  aliasCuenta: string | null
  mpUserId: string | null
}

type RegistrarPagoResponse = {
  ok?: boolean
  pendiente?: boolean
  estado?: string
  impactado?: boolean
  error?: string
  detalle?: string
  pago?: any
  cuotas_impactadas?: number[]
  estado_comprobante?: string
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

function inicioDelDia(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
}

function parsearFechaIso(fecha?: string | null) {
  if (!fecha) return null
  const [yyyy, mm, dd] = fecha.slice(0, 10).split('-').map((p) => Number(p))
  if (!yyyy || !mm || !dd) return null
  return new Date(yyyy, mm - 1, dd)
}

function obtenerEstadoCuotaVisual(cuota: Cuota, esProximaPendiente: boolean) {
  const normalizado = String(cuota.estado || 'pendiente').toLowerCase()
  if (normalizado === 'pagado') {
    return { etiqueta: '✔ PAGADA', color: '#22C55E', fondo: '#052E16' }
  }

  const fechaVencimiento = parsearFechaIso(cuota.fecha_vencimiento)
  const estaVencida = Boolean(fechaVencimiento && fechaVencimiento < inicioDelDia())
  if (estaVencida) {
    return { etiqueta: '● VENCIDA', color: '#F87171', fondo: '#450A0A' }
  }

  if (esProximaPendiente) {
    return { etiqueta: '● PRÓXIMA', color: '#FACC15', fondo: '#422006' }
  }

  return { etiqueta: '● PENDIENTE', color: '#93C5FD', fondo: '#0B234A' }
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
  const scrollRef = useRef<ScrollView | null>(null)
  const paymentFormYRef = useRef(0)

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
  const [prestamoExpandidoId, setPrestamoExpandidoId] = useState<string | null>(null)
  const [cuotasPorPrestamo, setCuotasPorPrestamo] = useState<Record<string, Cuota[]>>({})

  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPagoUi>('efectivo')
  const [comprobante, setComprobante] = useState('')
  const [opcionSobranteEfectivo, setOpcionSobranteEfectivo] = useState<OpcionSobranteEfectivo>('aplicar_proximas')
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
  const { width } = useWindowDimensions()
  const contentMaxWidth = 1280
  const isDesktop = width >= 1024

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
      setPrestamoExpandidoId(null)
      setCuotasPorPrestamo({})
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
      setPrestamoExpandidoId(lista[0]?.id || null)
      void cargarResumenCuotasPrestamos(lista.map((prestamo) => prestamo.id))
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar los préstamos')
      setPrestamos([])
      setPrestamoSeleccionado(null)
      setPrestamoExpandidoId(null)
    } finally {
      setLoading(false)
    }
  }

  const cargarResumenCuotasPrestamos = async (prestamosIds: string[]) => {
    if (!prestamosIds.length) {
      setCuotasPorPrestamo({})
      return
    }

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
      .in('prestamo_id', prestamosIds)
      .in('estado', ['pendiente', 'parcial'])
      .order('numero_cuota', { ascending: true })

    if (error) {
      console.log('[cargar-pago] no se pudo precargar cuotas por préstamo', error)
      return
    }

    const mapa = ((data || []) as Cuota[]).reduce<Record<string, Cuota[]>>((acc, cuota) => {
      if (!acc[cuota.prestamo_id]) acc[cuota.prestamo_id] = []
      acc[cuota.prestamo_id].push(cuota)
      return acc
    }, {})

    setCuotasPorPrestamo(mapa)
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
      setCuotasPorPrestamo((prev) => ({ ...prev, [prestamoId]: lista }))
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

  const filtroCoincideClienteSeleccionado = useMemo(() => {
    if (!busquedaDebounced || !clienteSeleccionado) return true
    const texto = busquedaDebounced
    return (
      clienteSeleccionado.nombre?.toLowerCase().includes(texto) ||
      clienteSeleccionado.dni?.toLowerCase().includes(texto) ||
      clienteSeleccionado.email?.toLowerCase().includes(texto)
    )
  }, [busquedaDebounced, clienteSeleccionado])

  const prestamosFiltrados = useMemo(() => {
    if (!busquedaDebounced) return prestamos
    const texto = busquedaDebounced

    return prestamos.filter((prestamo) => {
      const cuotasPrestamo = cuotasPorPrestamo[prestamo.id] || []
      const coincidePrestamo = prestamo.id.toLowerCase().includes(texto)
      const coincideCliente = filtroCoincideClienteSeleccionado
      const coincideCuota = cuotasPrestamo.some((cuota) =>
        String(cuota.numero_cuota).includes(texto.replace(/\D/g, ''))
      )
      return coincidePrestamo || coincideCliente || coincideCuota
    })
  }, [prestamos, cuotasPorPrestamo, busquedaDebounced, filtroCoincideClienteSeleccionado])

  const cuotasFiltradas = useMemo(() => {
    if (!prestamoSeleccionado) return []
    const base = cuotas
    if (!busquedaDebounced) return base

    const texto = busquedaDebounced
    const soloDigitos = texto.replace(/\D/g, '')

    return base.filter((cuota) => {
      if (String(cuota.numero_cuota).includes(soloDigitos)) return true
      if (prestamoSeleccionado.id.toLowerCase().includes(texto)) return true
      return filtroCoincideClienteSeleccionado
    })
  }, [cuotas, prestamoSeleccionado, busquedaDebounced, filtroCoincideClienteSeleccionado])
  const proximaCuotaPendienteId = useMemo(() => {
    return (
      cuotas
        .filter((cuota) => String(cuota.estado || '').toLowerCase() !== 'pagado')
        .sort((a, b) => a.numero_cuota - b.numero_cuota)[0]?.id || null
    )
  }, [cuotas])

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
  const haySobranteEfectivo = metodo === 'efectivo' && deudaActual > 0 && montoNormalizado > deudaActual + 0.009
  const aplicarAMultiples = haySobranteEfectivo
    ? opcionSobranteEfectivo === 'aplicar_proximas'
    : true
  const cuotasPrestamoSeleccionado = prestamoSeleccionado
    ? cuotasPorPrestamo[prestamoSeleccionado.id] || cuotas
    : []
  const saldoRestantePrestamo = cuotasPrestamoSeleccionado.reduce(
    (acc, cuota) => acc + Number(cuota.saldo_pendiente || 0),
    0
  )
  const totalPrestamo = Number(prestamoSeleccionado?.total_a_pagar || 0)
  const totalPagadoPrestamo = Math.max(0, totalPrestamo - saldoRestantePrestamo)
  const cuotasGridColumns =
    width >= 1600 ? 6 : width >= 1400 ? 5 : width >= 1100 ? 4 : width >= 900 ? 3 : 2
  const cuotaItemWidth = isDesktop
    ? Math.max(158, (Math.min(width, contentMaxWidth) - 64 - (cuotasGridColumns - 1) * 12) / cuotasGridColumns)
    : Math.max(150, (width - 32 - (cuotasGridColumns - 1) * 10) / cuotasGridColumns)

  const limpiarClienteSeleccionado = () => {
    setClienteSeleccionado(null)
    setPrestamos([])
    setPrestamoSeleccionado(null)
    setCuotas([])
    setCuotaSeleccionada(null)
    setMostrarTodasCuotas(false)
    setPrestamoExpandidoId(null)
    setCuotasPorPrestamo({})
    setMonto('')
    setMetodo('efectivo')
    setComprobante('')
    setMpCheckout(null)
  }

  const volver = () => {
    router.replace('/admin-home' as any)
  }

  useEffect(() => {
    if (!cuotaSeleccionada) return

    if (metodo === 'transferencia') {
      setMonto(formatearMonedaInput(String(transferenciaMontoAutomatico)))
    }
  }, [metodo, cuotaSeleccionada, transferenciaMontoAutomatico])


  useEffect(() => {
    if (!haySobranteEfectivo) {
      setOpcionSobranteEfectivo('aplicar_proximas')
    }
  }, [haySobranteEfectivo])

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
        comprobante: metodo === 'transferencia' ? comprobante.trim() || null : null,
        comprobante_url: metodo === 'transferencia' ? comprobante.trim() || null : null,
        mp_preference_id:
          metodo === 'mp' ? mpData?.preference_id || null : null,
        aplicar_a_multiples: aplicarAMultiples,
      }

      console.log('PAYLOAD REGISTRAR PAGO:', payload)

      const json = await invocarFuncionConFallback(accessToken, payload)
      console.log('[cargar-pago] respuesta completa registrar-pago:', json)

      if (!json || json.error || json.ok === false || !json?.pago?.id) {
        console.error('[cargar-pago] registrar-pago inválido/error:', {
          error: json?.error,
          detalle: json?.detalle,
          ok: json?.ok,
          pago_id: json?.pago?.id,
          response: json,
        })
        Alert.alert(
          'Error',
          json?.error ||
            json?.detalle ||
            'No se pudo registrar el pago correctamente. Intentá nuevamente.'
        )
        return
      }

      if (metodo === 'transferencia') {
        if (json.ok && json.estado === 'pendiente_aprobacion' && json.impactado === false) {
          Alert.alert('Transferencia pendiente', 'La transferencia quedó pendiente de validación')
          void cargarCuotasPrestamo(prestamoSeleccionado.id)
          setMonto('')
          setComprobante('')
          router.push('/pagos-pendientes' as any)
          return
        }

        Alert.alert('Error', 'La transferencia no pudo registrarse como pendiente')
        return
      }

      if (json?.pendiente) {
        try {
          await createSystemActivity({
            tipo: 'pago_pendiente',
            titulo: 'Pago pendiente de aprobación',
            descripcion: `Transferencia de ${formatearMoneda(Number(montoAplicado.toFixed(2)))} pendiente para ${clienteSeleccionado.nombre}` ,
            entidad_tipo: 'pago',
            entidad_id: json?.pago?.id ? String(json.pago.id) : null,
            prioridad: 'alta',
            visible_en_notificaciones: true,
            metadata: {
              cliente_id: clienteSeleccionado.id,
              prestamo_id: prestamoSeleccionado.id,
              monto: Number(montoAplicado.toFixed(2)),
              cuota: cuotaSeleccionada.numero_cuota,
              metodo,
              route: '/pagos-pendientes',
            },
          })
        } catch (activityError) {
          console.warn('[cargar-pago] createSystemActivity pago_pendiente fallback (registrado server-side)', activityError)
        }

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

      try {
        await createSystemActivity({
          tipo: 'pago_registrado',
          titulo: 'Pago registrado',
          descripcion: `Pago aplicado en cuota #${cuotaSeleccionada.numero_cuota} de ${clienteSeleccionado.nombre}`,
          entidad_tipo: 'pago',
          entidad_id: json?.pago?.id ? String(json.pago.id) : null,
          prioridad: 'normal',
          visible_en_notificaciones: true,
          metadata: {
            cliente_id: clienteSeleccionado.id,
            prestamo_id: prestamoSeleccionado.id,
            monto: Number(montoAplicado.toFixed(2)),
            metodo,
            route: '/actividad',
          },
        })
      } catch (activityError) {
        console.warn('[cargar-pago] createSystemActivity pago_registrado fallback (registrado server-side)', activityError)
      }

      if (!(json.ok && json.estado === 'aprobado' && json.impactado === true)) {
        Alert.alert('Error', 'El pago no quedó aprobado correctamente')
        return
      }

      router.push({
        pathname: '/pago-aprobado',
        params: {
          id: String(json.pago.id),
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
          pago_id: String(json.pago.id),
          identificador_interno_pago: String(json.pago.id),
          observaciones: json?.pago?.nota ? String(json.pago.nota) : '',
        },
      })
    } catch (error: any) {
      console.error('[cargar-pago] error registrar pago catch:', error)
      const detalle = typeof error?.details === 'string' ? error.details : ''
      const hint = typeof error?.hint === 'string' ? error.hint : ''
      const mensaje = [error?.message, detalle, hint].filter(Boolean).join('\n')
      Alert.alert('Error', mensaje || 'No se pudo registrar el pago')
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
      <LinearGradient
        colors={['#0F172A', '#1E3A8A', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      />
      <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="always"
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        isDesktop && styles.contentDesktop,
        cuotaSeleccionada && !isDesktop ? styles.contentWithFixedFooter : null,
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.contentInner, { maxWidth: contentMaxWidth }]}>
      <View style={styles.headerWrap}>
        <TouchableOpacity style={styles.backButton} onPress={volver}>
          <Text style={styles.backButtonText}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Cargar pago</Text>
        <Text style={styles.subtitle}>Registrá pagos de clientes activos</Text>
      </View>
      {!clienteSeleccionado && (
      <View style={[styles.mainCard, styles.sectionCard, styles.searchCard]}>
        <Text style={styles.sectionTitle}>BUSCAR</Text>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por cliente, DNI, ID préstamo o cuota"
          placeholderTextColor="#64748B"
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (clientesFiltrados.length === 1) {
              setClienteSeleccionado(clientesFiltrados[0])
            }
          }}
        />
      </View>
      )}

      {!clienteSeleccionado ? (
        <>
          <Text style={styles.label}>Paso 1 · Seleccioná cliente</Text>

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
        <View style={[styles.workflowLayout, isDesktop && styles.workflowLayoutDesktop]}>
          <View style={[styles.workflowLeft, isDesktop && styles.workflowLeftDesktop]}>
            <View style={[styles.infoCard, styles.mainCard]}>
              <Text style={styles.sectionTitle}>CLIENTE</Text>
              <Text style={styles.infoName}>{clienteSeleccionado.nombre}</Text>
              <Text style={styles.infoMeta}>DNI: {clienteSeleccionado.dni || '—'}</Text>
              <Text style={styles.infoMeta}>Teléfono: {clienteSeleccionado.telefono || 'Sin teléfono'}</Text>
              {clienteSeleccionado.email ? (
                <Text style={styles.infoMeta}>Email: {clienteSeleccionado.email}</Text>
              ) : null}
              <View style={styles.clientActionsRow}>
                <TouchableOpacity style={styles.changeButton} onPress={limpiarClienteSeleccionado}>
                  <Text style={styles.changeButtonText}>Cambiar cliente</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.changeButton, styles.secondaryActionButton]}
                  onPress={() => router.push(`/cliente/${clienteSeleccionado.id}` as any)}
                >
                  <Text style={styles.changeButtonText}>Ver detalle del cliente</Text>
                </TouchableOpacity>
              </View>
            </View>

            {prestamosFiltrados.length === 0 ? (
              <Text style={styles.emptyText}>Este cliente no tiene préstamos activos.</Text>
            ) : (
              <View style={[styles.mainCard, styles.sectionCard]}>
                <Text style={styles.sectionTitle}>PRÉSTAMOS</Text>
                <View style={styles.loanCardsWrap}>
                  {prestamosFiltrados.map((prestamo) => {
                    const cuotasPrestamo = cuotasPorPrestamo[prestamo.id] || []
                    const saldoPrestamo = cuotasPrestamo.reduce((acc, cuota) => acc + Number(cuota.saldo_pendiente || 0), 0)
                    return (
                      <TouchableOpacity
                        key={prestamo.id}
                        style={[
                          styles.loanItemCard,
                          prestamoSeleccionado?.id === prestamo.id && styles.loanItemCardActive,
                        ]}
                        onPress={() => {
                          setPrestamoSeleccionado(prestamo)
                          setCuotaSeleccionada(null)
                          setMonto('')
                          void cargarCuotasPrestamo(prestamo.id)
                        }}
                      >
                        <View style={styles.loanItemRow}>
                          <View style={styles.loanItemLeft}>
                            <Text style={styles.loanItemId}>Préstamo #{prestamo.id.slice(0, 8)}</Text>
                            <Text style={styles.loanItemMeta}>Estado: {prestamo.estado || 'activo'}</Text>
                          </View>
                          <View style={styles.loanItemRight}>
                            <Text style={styles.loanItemTotal}>Total: {formatearMoneda(Number(prestamo.total_a_pagar || 0))}</Text>
                            <Text style={styles.loanItemSaldo}>Saldo: {formatearMoneda(saldoPrestamo)}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <View style={styles.loanSummaryCard}>
                  <View style={styles.loanSummaryHeader}>
                    <Text style={styles.remainingLabel}>Saldo restante</Text>
                    <Text style={styles.remainingValue}>{formatearMoneda(saldoRestantePrestamo)}</Text>
                  </View>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Total a pagar</Text>
                    <Text style={styles.loanSummaryValue}>{formatearMoneda(totalPrestamo)}</Text>
                  </View>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Total pagado</Text>
                    <Text style={styles.loanSummaryValue}>{formatearMoneda(totalPagadoPrestamo)}</Text>
                  </View>
                </View>
              </View>
            )}

            {prestamoSeleccionado && (
              <View style={[styles.mainCard, styles.sectionCard]}>
                <Text style={styles.sectionTitle}>CUOTAS</Text>
                <ScrollView
                  style={isDesktop ? styles.quotaDesktopScroll : undefined}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={isDesktop}
                  contentContainerStyle={styles.quotaGrid}
                >
                  {cuotasFiltradas.map((cuota) => {
                    const estadoUi = obtenerEstadoCuotaVisual(cuota, cuota.id === proximaCuotaPendienteId)
                    const selected = cuotaSeleccionada?.id === cuota.id
                    return (
                      <Pressable
                        key={cuota.id}
                        onPress={() => {
                          setCuotaSeleccionada(cuota)
                          requestAnimationFrame(() => {
                            scrollRef.current?.scrollTo({
                              y: Math.max(0, paymentFormYRef.current - 24),
                              animated: true,
                            })
                          })
                        }}
                        style={({ hovered, pressed }) => [
                          styles.quotaTile,
                          { width: cuotaItemWidth, borderColor: estadoUi.color, backgroundColor: estadoUi.fondo },
                          selected && styles.quotaTileActive,
                          hovered && styles.quotaTileHover,
                          pressed && styles.quotaTilePressed,
                        ]}
                      >
                        <Text style={styles.quotaTileTitle}>#{cuota.numero_cuota}</Text>
                        <Text style={styles.quotaTileAmount}>{formatearMoneda(Number(cuota.saldo_pendiente || cuota.monto_cuota || 0))}</Text>
                        <Text style={[styles.quotaTileBadge, { color: estadoUi.color }]}>{estadoUi.etiqueta}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {cuotaSeleccionada && (
            <View style={[styles.workflowRight, isDesktop && styles.workflowRightDesktop]}>
            <View
              onLayout={(event) => {
                paymentFormYRef.current = event.nativeEvent.layout.y
              }}
            >
              <View style={[styles.mainCard, styles.sectionCard, styles.paymentPrimaryCard]}>
                <Text style={styles.sectionTitle}>PAGO</Text>
                <Text style={styles.label}>Método de pago</Text>
                <View style={styles.methodsRow}>
                  <TouchableOpacity
                    style={[
                      styles.methodButton,
                      metodo === 'efectivo' && styles.methodButtonActive,
                    ]}
                    onPress={() => setMetodo('efectivo')}
                    activeOpacity={0.88}
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
                    activeOpacity={0.88}
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
                    activeOpacity={mpDisponible ? 0.88 : 1}
                  >
                    <Text
                      style={[
                        styles.methodButtonText,
                        metodo === 'mp' && styles.methodButtonTextActive,
                      ]}
                    >
                      Mercado Pago
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Monto</Text>
                <TextInput
                  value={metodo === 'transferencia' ? formatearMonedaInput(String(transferenciaMontoAutomatico)) : monto}
                  onChangeText={(texto) => setMonto(formatearMonedaInput(texto))}
                  placeholder="$ 0,00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  style={[
                    styles.amountInput,
                    isDesktop && styles.amountInputDesktop,
                    metodo === 'transferencia' && styles.inputDisabled,
                  ]}
                  editable={metodo !== 'transferencia'}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!guardando && cuotaPendienteValida) {
                      void registrarPago()
                    }
                  }}
                />

                <Text style={styles.label}>Resumen</Text>
                <View style={styles.resumeCard}>
                  <Text style={styles.resumeTitle}>RESUMEN DEL PAGO</Text>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Total aplicado</Text>
                    <Text style={styles.resumeValue}>{formatearMoneda(montoAplicado)}</Text>
                  </View>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Monto entregado</Text>
                    <Text style={styles.resumeValue}>{formatearMoneda(montoNormalizado)}</Text>
                  </View>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Vuelto</Text>
                    <Text style={styles.resumeValue}>{formatearMoneda(vuelto)}</Text>
                  </View>
                  <View style={styles.resumeRow}>
                    <Text style={styles.resumeLabel}>Saldo restante</Text>
                    <Text style={styles.resumeValue}>
                      {formatearMoneda(metodo === 'efectivo' ? saldoLuegoDelPagoCuota : deudaActual)}
                    </Text>
                  </View>
                </View>
                {isDesktop && (
                  <TouchableOpacity
                    style={[styles.saveButton, styles.desktopSaveButton, (guardando || !cuotaPendienteValida) && styles.saveButtonDisabled]}
                    onPress={registrarPago}
                    disabled={guardando || !cuotaPendienteValida}
                  >
                    <Text style={styles.saveButtonText}>
                      {guardando ? 'Guardando...' : 'Registrar pago'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.mainCard, styles.sectionCard, styles.paymentNotesCard]}>
                {(metodo === 'transferencia' || metodo === 'mp') && (
                  <>
                  <Text style={styles.transferBadge}>Pendiente de aprobación</Text>
                  {metodo === 'transferencia' && (
                    <Text style={styles.helperText}>
                      La transferencia se registrará como pendiente hasta su validación manual.
                    </Text>
                  )}
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
              </View>

              {haySobranteEfectivo && (
                <View style={styles.sobranteCard}>
                  <Text style={styles.sobranteTitle}>Sobrante detectado</Text>
                  <Text style={styles.sobranteText}>
                    Elegí cómo querés resolver el excedente de {formatearMoneda(vuelto)}.
                  </Text>
                  <View style={styles.sobranteOptions}>
                    <TouchableOpacity
                      style={[
                        styles.sobranteOption,
                        opcionSobranteEfectivo === 'dar_vuelto' && styles.sobranteOptionActive,
                      ]}
                      onPress={() => setOpcionSobranteEfectivo('dar_vuelto')}
                    >
                      <Text
                        style={[
                          styles.sobranteOptionText,
                          opcionSobranteEfectivo === 'dar_vuelto' && styles.sobranteOptionTextActive,
                        ]}
                      >
                        Dar vuelto
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.sobranteOption,
                        opcionSobranteEfectivo === 'aplicar_proximas' && styles.sobranteOptionActive,
                      ]}
                      onPress={() => setOpcionSobranteEfectivo('aplicar_proximas')}
                    >
                      <Text
                        style={[
                          styles.sobranteOptionText,
                          opcionSobranteEfectivo === 'aplicar_proximas' && styles.sobranteOptionTextActive,
                        ]}
                      >
                        Aplicar a próximas cuotas
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

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

            </View>
            </View>
          )}
        </View>
      )}
      </View>
      </ScrollView>
      {cuotaSeleccionada && !isDesktop ? (
        <View style={styles.fixedFooterWrap} pointerEvents="box-none">
          <View style={[styles.fixedFooter, { maxWidth: contentMaxWidth }]}>
            <View style={styles.fixedFooterResume}>
              <Text style={styles.fixedFooterText}>A aplicar: {formatearMoneda(montoAplicado)}</Text>
              <Text style={styles.fixedFooterSubtext}>
                Entregado: {formatearMoneda(montoNormalizado)}
                {vuelto > 0.009 ? ` · Vuelto: ${formatearMoneda(vuelto)}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.saveButton, styles.fixedFooterButton, (guardando || !cuotaPendienteValida) && styles.saveButtonDisabled]}
              onPress={registrarPago}
              disabled={guardando || !cuotaPendienteValida}
            >
              <Text style={styles.saveButtonText}>
                {guardando ? 'Guardando...' : `Registrar pago ${formatearMoneda(montoNormalizado)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },

  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 56,
  },
  contentDesktop: {
    paddingHorizontal: 32,
  },
  contentWithFixedFooter: {
    paddingBottom: 210,
  },
  contentInner: {
    width: '100%',
    alignSelf: 'center',
  },
  headerWrap: {
    marginBottom: 4,
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
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    marginBottom: 16,
  },

  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },

  title: {
    color: '#F8FAFC',
    fontSize: 34,
    fontWeight: '800',
  },

  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 20,
  },

  label: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 12,
  },
  sectionCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 20,
    padding: 18,
  },
  searchCard: {
    marginTop: 14,
  },

  input: {
    backgroundColor: '#0B1220',
    borderColor: 'rgba(148,163,184,0.20)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#F8FAFC',
    fontSize: 17,
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
    gap: 16,
  },

  selectCard: {
    backgroundColor: '#111C35',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.20)',
    borderRadius: 18,
    padding: 18,
  },
  loanCardCompact: {
    padding: 12,
  },
  loanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  compactQuotaList: {
    marginTop: 10,
    gap: 8,
  },
  compactQuotaCard: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactQuotaTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  compactActionButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
  },
  compactActionButtonText: {
    color: '#DBEAFE',
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 12,
    padding: 18,
  },
  clientActionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  mainCard: {
    marginTop: 18,
    ...Platform.select({
      web: {
        shadowColor: '#020617',
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      default: {
        elevation: 4,
      },
    }),
  },
  workflowLayout: {
    gap: 20,
  },
  workflowLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  workflowLeft: {
    width: '100%',
  },
  workflowLeftDesktop: {
    flex: 1.35,
  },
  workflowRight: {
    width: '100%',
  },
  workflowRightDesktop: {
    flex: 0.85,
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.9,
    marginBottom: 12,
  },

  infoName: {
    color: '#F8FAFC',
    fontSize: 21,
    fontWeight: '700',
    marginBottom: 6,
  },

  infoMeta: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 2,
  },

  changeButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#172554',
  },
  secondaryActionButton: {
    backgroundColor: '#1E293B',
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
    fontSize: 14,
  },

  methodsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    flexWrap: 'nowrap',
  },

  methodButton: {
    backgroundColor: '#111C35',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 18,
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
  },

  methodButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#172554',
  },

  methodButtonText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 15,
  },

  methodButtonTextActive: {
    color: '#DBEAFE',
  },

  methodButtonDisabled: {
    opacity: 0.45,
    borderColor: '#334155',
  },

  resumeCard: {
    backgroundColor: 'rgba(30,58,138,0.42)',
    borderWidth: 1,
    borderColor: '#1D4ED8',
    borderRadius: 18,
    padding: 22,
    marginTop: 14,
    gap: 14,
  },
  resumeTitle: {
    color: '#BFDBFE',
    fontSize: 13,
    letterSpacing: 1.2,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },

  resumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  resumeLabel: {
    color: '#93C5FD',
    fontSize: 15,
  },

  resumeValue: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
  },

  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    minHeight: 52,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    ...Platform.select({
      web: {
        shadowColor: '#2563EB',
        shadowOpacity: 0.28,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      default: {},
    }),
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  desktopSaveButton: {
    width: '100%',
    marginTop: 16,
  },

  sobranteCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(30,58,138,0.20)',
    padding: 16,
    gap: 12,
  },
  sobranteTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  sobranteText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  sobranteOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  sobranteOption: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#0F172A',
  },
  sobranteOptionActive: {
    borderColor: '#22C55E',
    backgroundColor: '#052E16',
  },
  sobranteOptionText: {
    color: '#CBD5E1',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  sobranteOptionTextActive: {
    color: '#BBF7D0',
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
  loanPickerRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  loanPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111C35',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  loanPillActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#172554',
  },
  loanPillText: {
    color: '#DBEAFE',
    fontWeight: '700',
    fontSize: 13,
  },
  loanCardsWrap: {
    gap: 16,
  },
  loanItemCard: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 18,
    backgroundColor: '#0F172A',
    padding: 16,
    gap: 6,
  },
  loanItemCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#1E293B',
  },
  loanItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  loanItemLeft: {
    flex: 1,
    gap: 4,
  },
  loanItemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  loanItemId: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  loanItemMeta: {
    color: '#93C5FD',
    fontSize: 12,
  },
  loanItemSaldo: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  loanItemTotal: {
    color: '#BFDBFE',
    fontSize: 13,
    fontWeight: '600',
  },
  loanSummaryCard: {
    marginTop: 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: 'rgba(30,58,138,0.36)',
    padding: 18,
    gap: 10,
  },
  loanSummaryHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E3A8A',
    paddingBottom: 8,
    marginBottom: 2,
  },
  remainingLabel: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '700',
  },
  remainingValue: {
    color: '#3B82F6',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 2,
  },
  loanSummaryValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  quotaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quotaDesktopScroll: {
    maxHeight: 420,
  },
  quotaTile: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 108,
    padding: 16,
    justifyContent: 'space-between',
  },
  quotaTileActive: {
    borderWidth: 2,
    shadowColor: '#2563EB',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  quotaTileHover: {
    transform: [{ scale: 1.01 }],
  },
  quotaTilePressed: {
    opacity: 0.9,
  },
  quotaTileTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '800',
  },
  quotaTileAmount: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  quotaTileBadge: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  amountInput: {
    backgroundColor: '#0B1120',
    borderColor: '#1D4ED8',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    height: 56,
    color: '#F8FAFC',
    fontSize: 24,
    textAlign: 'center',
    fontWeight: '700',
  },
  amountInputDesktop: {
    fontSize: 28,
  },
  paymentPrimaryCard: {
    marginTop: 0,
  },
  paymentNotesCard: {
    marginTop: 16,
  },
  fixedFooterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  fixedFooter: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    padding: 12,
    gap: 10,
  },
  fixedFooterResume: {
    gap: 4,
  },
  fixedFooterText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  fixedFooterSubtext: {
    color: '#BFDBFE',
    fontSize: 13,
    fontWeight: '600',
  },
  fixedFooterButton: {
    marginTop: 0,
  },
})
