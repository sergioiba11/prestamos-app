import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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

type Cliente = {
  id: string
  nombre: string
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
type MetodoPagoApi = 'efectivo' | 'transferencia' | 'mercadopago'

type RegistrarPagoResponse = {
  ok?: boolean
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

function normalizarMetodoPago(metodo: MetodoPagoUi): MetodoPagoApi {
  if (metodo === 'mp') return 'mercadopago'
  return metodo
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
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<Prestamo | null>(null)
  const [cuotaSeleccionada, setCuotaSeleccionada] = useState<Cuota | null>(null)

  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoPagoUi>('efectivo')

  useEffect(() => {
    cargarClientes()
  }, [])

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

  const cargarClientes = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, dni')
        .order('nombre', { ascending: true })

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      const lista = (data || []) as Cliente[]
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
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return clientes

    return clientes.filter((cliente) => {
      return (
        cliente.nombre?.toLowerCase().includes(texto) ||
        cliente.telefono?.toLowerCase().includes(texto) ||
        cliente.dni?.toLowerCase().includes(texto)
      )
    })
  }, [clientes, busqueda])

  const montoNumero = textoAMonto(monto)
  const deudaActual = Number(cuotaSeleccionada?.saldo_pendiente || 0)
  const montoAplicado = Math.min(montoNumero, deudaActual)
  const vuelto = Math.max(0, montoNumero - deudaActual)
  const saldoLuegoDelPagoCuota = Math.max(0, deudaActual - montoAplicado)

  const volver = () => {
    if (clienteSeleccionado?.id) {
      router.replace(`/cliente-detalle?cliente_id=${clienteSeleccionado.id}` as any)
      return
    }
    router.back()
  }

  const limpiarTodo = () => {
    setClienteSeleccionado(null)
    setPrestamos([])
    setPrestamoSeleccionado(null)
    setCuotas([])
    setCuotaSeleccionada(null)
    setBusqueda('')
    setMonto('')
    setMetodo('efectivo')
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

    if (!montoNumero || montoNumero <= 0) {
      Alert.alert('Error', 'Ingresá un monto válido')
      return
    }

    if (deudaActual <= 0) {
      Alert.alert('Error', 'La cuota seleccionada no tiene saldo pendiente')
      return
    }

    try {
      setGuardando(true)

      const accessToken = await obtenerAccessTokenValido()
      console.log('ACCESS TOKEN REGISTRAR PAGO (últimos 10):', accessToken.slice(-10))

      const payload = {
        prestamo_id: prestamoSeleccionado.id,
        cliente_id: clienteSeleccionado.id,
        cuota_id: cuotaSeleccionada.id,
        numero_cuota: cuotaSeleccionada.numero_cuota,
        monto: Number(montoAplicado.toFixed(2)),
        monto_ingresado: Number(montoNumero.toFixed(2)),
        metodo: normalizarMetodoPago(metodo),
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

      const saldoRestantePrestamo = Number(json?.saldo_restante || 0)
      const saldoRestanteCuota = Number(
        json?.cuota_actualizada?.saldo_despues ?? saldoLuegoDelPagoCuota
      )

      router.replace({
        pathname: '/pago-aprobado',
        params: {
          monto: String(Number(montoAplicado.toFixed(2))),
          monto_ingresado: String(Number(montoNumero.toFixed(2))),
          vuelto: String(Number(json?.vuelto ?? vuelto).toFixed(2)),
          metodo,
          fecha: new Date().toLocaleString('es-AR'),
          saldo_restante: String(saldoRestantePrestamo),
          saldo_restante_cuota: String(saldoRestanteCuota),
          cuota_id: cuotaSeleccionada.id,
          numero_cuota: String(cuotaSeleccionada.numero_cuota),
          cuotas_impactadas: JSON.stringify(json?.cuotas_impactadas || []),
          proxima_cuota: json?.proxima_cuota?.numero_cuota
            ? String(json.proxima_cuota.numero_cuota)
            : '',
          prestamo_id: prestamoSeleccionado.id,
          cliente_id: clienteSeleccionado.id,
          cliente_nombre: clienteSeleccionado.nombre,
          cliente_apellido: clienteSeleccionado.apellido || '',
          cliente_telefono: clienteSeleccionado.telefono || '',
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
    <ScrollView
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
          <Text style={styles.label}>Buscar cliente</Text>

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Nombre, teléfono o DNI"
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
          <Text style={styles.label}>Cliente seleccionado</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoName}>{clienteSeleccionado.nombre}</Text>
            <Text style={styles.infoMeta}>DNI: {clienteSeleccionado.dni || '—'}</Text>
            <Text style={styles.infoMeta}>
              Teléfono: {clienteSeleccionado.telefono || 'Sin teléfono'}
            </Text>
          </View>

          <TouchableOpacity style={styles.changeButton} onPress={limpiarTodo}>
            <Text style={styles.changeButtonText}>Cambiar cliente</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Elegí el préstamo</Text>

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
              <Text style={styles.label}>Elegí la cuota</Text>

              {cuotas.length === 0 ? (
                <Text style={styles.emptyText}>Este préstamo no tiene cuotas pendientes.</Text>
              ) : (
                <View style={styles.listBox}>
                  {cuotas.map((cuota) => {
                    const seleccionada = cuotaSeleccionada?.id === cuota.id

                    return (
                      <TouchableOpacity
                        key={cuota.id}
                        style={[
                          styles.selectCard,
                          seleccionada && styles.selectCardActive,
                        ]}
                        onPress={() => {
                          setCuotaSeleccionada(cuota)
                          setMonto('')
                        }}
                      >
                        <Text style={styles.selectName}>
                          Cuota #{cuota.numero_cuota}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Vence: {formatearFecha(cuota.fecha_vencimiento)}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Monto cuota: {formatearMoneda(Number(cuota.monto_cuota || 0))}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Saldo pendiente: {formatearMoneda(Number(cuota.saldo_pendiente || 0))}
                        </Text>
                        <Text style={styles.selectMeta}>
                          Estado: {cuota.estado || 'pendiente'}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </>
          )}

          {cuotaSeleccionada && (
            <>
              <Text style={styles.label}>Monto recibido</Text>

              <TextInput
                value={monto}
                onChangeText={(texto) => setMonto(formatearMonedaInput(texto))}
                placeholder="$0"
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.helperText}>
                Cuota #{cuotaSeleccionada.numero_cuota} - saldo pendiente:{' '}
                {formatearMoneda(deudaActual)}
              </Text>

              <Text style={styles.label}>Método de pago</Text>

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
                  ]}
                  onPress={() => setMetodo('mp')}
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

              <View style={styles.resumeCard}>
                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Recibido</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(montoNumero)}</Text>
                </View>

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Se aplica a cuota</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(montoAplicado)}</Text>
                </View>

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Vuelto</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(vuelto)}</Text>
                </View>

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Saldo restante cuota</Text>
                  <Text style={styles.resumeValue}>
                    {formatearMoneda(saldoLuegoDelPagoCuota)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, guardando && styles.saveButtonDisabled]}
                onPress={registrarPago}
                disabled={guardando}
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
})
