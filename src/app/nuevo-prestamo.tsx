import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  dni: string | null
}

type PrestamoExistente = {
  id: string
  estado: string | null
  fecha_inicio_mora: string | null
}

const INTERESES_MENSUALES: Record<number, number> = {
  1: 15,
  2: 22,
  3: 30,
  4: 38,
  5: 46,
  6: 55,
  7: 63,
  8: 71,
  9: 79,
  10: 87,
  11: 95,
  12: 105,
  13: 114,
  14: 123,
  15: 132,
  16: 141,
  17: 150,
  18: 160,
  19: 169,
  20: 178,
  21: 187,
  22: 196,
  23: 205,
  24: 215,
  25: 224,
  26: 233,
  27: 242,
  28: 251,
  29: 260,
  30: 270,
  31: 279,
  32: 288,
  33: 297,
  34: 306,
  35: 315,
  36: 325,
}

function obtenerInteresDiarioPorDias(dias: number) {
  if (dias <= 0) return 0

  const minimoDias = 1
  const maximoDias = 365
  const minimoInteres = 2
  const maximoInteres = 300

  const progreso = (dias - minimoDias) / (maximoDias - minimoDias)
  const interes = minimoInteres + progreso * (maximoInteres - minimoInteres)

  return Math.round(interes)
}

function formatearFecha(fecha: Date) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function diasEnMes(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function calcularPrimeraFechaMoraMensual(
  fechaInicioTexto: string,
  diaPagoMensual: number
) {
  const fechaInicio = new Date(fechaInicioTexto + 'T00:00:00')
  const year = fechaInicio.getFullYear()
  const month = fechaInicio.getMonth()
  const day = fechaInicio.getDate()

  let targetYear = year
  let targetMonth = month

  if (day > diaPagoMensual) {
    targetMonth += 1
    if (targetMonth > 11) {
      targetMonth = 0
      targetYear += 1
    }
  }

  const ultimoDiaDelMes = diasEnMes(targetYear, targetMonth)
  const diaReal = Math.min(diaPagoMensual, ultimoDiaDelMes)

  return new Date(targetYear, targetMonth, diaReal)
}

function limpiarNumero(texto: string) {
  return texto.replace(/[^0-9]/g, '')
}

function formatearMonedaInput(valor: string) {
  const limpio = valor.replace(/[^0-9]/g, '')

  if (!limpio) return ''

  const numero = Number(limpio)

  return '$' + new Intl.NumberFormat('es-AR').format(numero)
}

function fechaValida(texto: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto)
}

export default function NuevoPrestamo() {
  const params = useLocalSearchParams()
  const clienteIdParam =
    typeof params.cliente_id === 'string' ? params.cliente_id : ''

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<Cliente | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [monto, setMonto] = useState('')
  const [interes, setInteres] = useState('')
  const [cuotas, setCuotas] = useState('')
  const [dias, setDias] = useState('')
  const [modalidad, setModalidad] = useState<'mensual' | 'diario'>('mensual')
  const [mostrarCuotas, setMostrarCuotas] = useState(false)
  const [mostrarDias, setMostrarDias] = useState(false)
  const [fechaInicio, setFechaInicio] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [habilitarDiaPagoManual, setHabilitarDiaPagoManual] = useState(false)
  const [diaPagoMensual, setDiaPagoMensual] = useState('')
  const [loading, setLoading] = useState(false)
  const [moraResumen, setMoraResumen] = useState('AL DÍA')

  useEffect(() => {
    obtenerClientes()
  }, [])

  useEffect(() => {
    if (clienteSeleccionado?.id) {
      revisarMoraCliente(clienteSeleccionado.id)
    } else {
      setMoraResumen('AL DÍA')
    }
  }, [clienteSeleccionado])

  const obtenerClientes = async () => {
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
  }

  const revisarMoraCliente = async (clienteId: string) => {
    const { data, error } = await supabase
      .from('prestamos')
      .select('id, estado, fecha_inicio_mora')
      .eq('cliente_id', clienteId)
      .order('fecha_inicio_mora', { ascending: false })

    if (error || !data || data.length === 0) {
      setMoraResumen('AL DÍA')
      return
    }

    const prestamosPendientes = (data as PrestamoExistente[]).filter(
      (p) => p.estado !== 'pagado'
    )

    if (prestamosPendientes.length === 0) {
      setMoraResumen('AL DÍA')
      return
    }

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    let estaDemorado = false

    for (const prestamo of prestamosPendientes) {
      if (!prestamo.fecha_inicio_mora) continue

      const inicioMora = new Date(prestamo.fecha_inicio_mora + 'T00:00:00')
      const diferenciaMs = hoy.getTime() - inicioMora.getTime()
      const diasMora = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24)) + 1

      if (diasMora >= 1) {
        estaDemorado = true
        break
      }
    }

    setMoraResumen(estaDemorado ? 'DEMORADO' : 'AL DÍA')
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

  const montoNumero = Number(limpiarNumero(monto)) || 0
  const interesNumero = Number(interes.replace('%', '')) || 0
  const cuotasNumero = Number(cuotas) || 0
  const diasNumero = Number(dias) || 0
  const diaPagoMensualNumero = Number(diaPagoMensual) || 0
  const clienteEnMora = moraResumen === 'DEMORADO'

  const totalAPagar = useMemo(() => {
    if (!montoNumero || interesNumero < 0) return 0
    return montoNumero + (montoNumero * interesNumero) / 100
  }, [montoNumero, interesNumero])

  const importeCuota = useMemo(() => {
    if (modalidad !== 'mensual') return 0
    if (!totalAPagar || !cuotasNumero || cuotasNumero <= 0) return 0
    return totalAPagar / cuotasNumero
  }, [totalAPagar, cuotasNumero, modalidad])

  const importeDiario = useMemo(() => {
    if (modalidad !== 'diario') return 0
    if (!totalAPagar || !diasNumero || diasNumero <= 0) return 0
    return totalAPagar / diasNumero
  }, [totalAPagar, diasNumero, modalidad])

  const diaPagoAutomaticoPreview = useMemo(() => {
    if (!fechaInicio || !fechaValida(fechaInicio)) return ''
    const fecha = new Date(fechaInicio + 'T00:00:00')
    fecha.setMonth(fecha.getMonth() + 1)
    return formatearFecha(fecha)
  }, [fechaInicio])

  const fechaInicioMoraPreview = useMemo(() => {
    if (!fechaInicio || !fechaValida(fechaInicio)) return ''

    if (modalidad === 'mensual') {
      if (!habilitarDiaPagoManual) {
        return diaPagoAutomaticoPreview
      }

      if (
        !diaPagoMensualNumero ||
        diaPagoMensualNumero < 1 ||
        diaPagoMensualNumero > 31
      ) {
        return ''
      }

      const fecha = calcularPrimeraFechaMoraMensual(
        fechaInicio,
        diaPagoMensualNumero
      )
      return formatearFecha(fecha)
    }

    const fecha = new Date(fechaInicio + 'T00:00:00')
    fecha.setDate(fecha.getDate() + 1)
    return formatearFecha(fecha)
  }, [
    fechaInicio,
    modalidad,
    diaPagoMensualNumero,
    habilitarDiaPagoManual,
    diaPagoAutomaticoPreview,
  ])

  const fechaLimitePreview = useMemo(() => {
    if (!fechaInicio || !fechaValida(fechaInicio)) return ''

    const fechaBase = new Date(fechaInicio + 'T00:00:00')

    if (modalidad === 'mensual') {
      fechaBase.setMonth(fechaBase.getMonth() + 1)
      return formatearFecha(fechaBase)
    }

    if (modalidad === 'diario' && diasNumero > 0) {
      fechaBase.setDate(fechaBase.getDate() + diasNumero)
      return formatearFecha(fechaBase)
    }

    return ''
  }, [fechaInicio, modalidad, diasNumero])

  const seleccionarCuota = (valor: number) => {
    const interesCalculado = INTERESES_MENSUALES[valor] || 0
    setCuotas(String(valor))
    setDias('')
    setInteres(String(interesCalculado))
    setMostrarCuotas(false)
  }

  const seleccionarDias = (valor: number) => {
    const interesCalculado = obtenerInteresDiarioPorDias(valor)
    setDias(String(valor))
    setCuotas('')
    setInteres(String(interesCalculado))
    setMostrarDias(false)
  }

  const cambiarModalidad = (nueva: 'mensual' | 'diario') => {
    setModalidad(nueva)
    setCuotas('')
    setDias('')
    setInteres('')
    setDiaPagoMensual('')
    setHabilitarDiaPagoManual(false)
    setMostrarCuotas(false)
    setMostrarDias(false)
  }

  const volverPantalla = () => {
    router.replace('/')
  }

  const mostrarMensaje = (titulo: string, mensaje: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${titulo}\n\n${mensaje}`)
  } else {
    Alert.alert(titulo, mensaje)
  }
}

const guardarPrestamo = async () => {
  if (loading) return

  console.log('CLICK EN GUARDAR')

  if (!clienteSeleccionado?.id) {
    mostrarMensaje('Error', 'Seleccioná un cliente')
    return
  }

  if (!montoNumero || montoNumero <= 0) {
    mostrarMensaje('Error', 'Ingresá un monto válido')
    return
  }

  if (!fechaInicio || !/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
    mostrarMensaje('Error', 'Ingresá una fecha válida en formato YYYY-MM-DD')
    return
  }

  if (modalidad === 'mensual' && cuotasNumero <= 0) {
    mostrarMensaje('Error', 'Seleccioná cuotas')
    return
  }

  if (modalidad === 'diario' && diasNumero <= 0) {
    mostrarMensaje('Error', 'Seleccioná días')
    return
  }

  if (modalidad === 'mensual' && habilitarDiaPagoManual) {
    if (diaPagoMensualNumero < 1 || diaPagoMensualNumero > 31) {
      mostrarMensaje('Error', 'Ingresá un día de pago válido del 1 al 31')
      return
    }
  }

  setLoading(true)

  try {
    console.log('CLIENTE SELECCIONADO:', clienteSeleccionado)

    const { data: clienteDb, error: errorCliente } = await supabase
      .from('clientes')
      .select('id, nombre')
      .eq('id', clienteSeleccionado.id)
      .maybeSingle()

    console.log('CLIENTE DB:', clienteDb)
    console.log('ERROR CLIENTE:', errorCliente)

    if (errorCliente) {
      mostrarMensaje('Error', `No se pudo verificar el cliente: ${errorCliente.message}`)
      return
    }

    if (!clienteDb) {
      mostrarMensaje('Error', 'El cliente seleccionado no existe en la base')
      return
    }

    const fechaBase = new Date(fechaInicio + 'T00:00:00')
    let fechaLimite = new Date(fechaBase)
    let fechaInicioMora = new Date(fechaBase)
    let diaPagoGuardar: number | null = null

    if (modalidad === 'mensual') {
      fechaLimite.setMonth(fechaLimite.getMonth() + 1)

      if (habilitarDiaPagoManual) {
        fechaInicioMora = calcularPrimeraFechaMoraMensual(
          fechaInicio,
          diaPagoMensualNumero
        )
        diaPagoGuardar = diaPagoMensualNumero
      } else {
        fechaInicioMora = new Date(fechaBase)
        fechaInicioMora.setMonth(fechaInicioMora.getMonth() + 1)
      }
    } else {
      fechaLimite.setDate(fechaLimite.getDate() + diasNumero)
      fechaInicioMora.setDate(fechaInicioMora.getDate() + 1)
    }

    const payload = {
  cliente_id: clienteSeleccionado.id,
  monto: montoNumero,
  interes: interesNumero,
  total_a_pagar: totalAPagar,
  fecha_inicio: fechaInicio,
  fecha_limite: formatearFecha(fechaLimite),
  fecha_inicio_mora: formatearFecha(fechaInicioMora),
  modalidad,
  estado: 'activo',
  cuotas: modalidad === 'mensual' ? cuotasNumero : 1,
  dias_plazo: modalidad === 'diario' ? diasNumero : null,
  dia_pago_mensual: modalidad === 'mensual' ? diaPagoGuardar : null,
}

    console.log('PAYLOAD A INSERTAR:', payload)

    const { data, error } = await supabase
      .from('prestamos')
      .insert(payload)
      .select()

    console.log('RESPUESTA INSERT DATA:', data)
    console.log('RESPUESTA INSERT ERROR:', error)

    if (error) {
      mostrarMensaje(
        'Error al guardar',
        `Mensaje: ${error.message}\nCódigo: ${error.code ?? 'sin código'}\nDetalle: ${error.details ?? 'sin detalle'}`
      )
      return
    }

    mostrarMensaje('Éxito', 'Préstamo guardado correctamente')

    router.replace(`/cliente-detalle?cliente_id=${clienteSeleccionado.id}` as any)
  } catch (error: any) {
    console.log('ERROR CATCH:', error)
    mostrarMensaje('Error', error?.message || 'No se pudo guardar el préstamo')
  } finally {
    setLoading(false)
  }
}
  function formatearARS(valor: number) {
  return '$' + new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.headerBack} onPress={volverPantalla}>
        <Text style={styles.headerBackText}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nuevo préstamo</Text>

      {!clienteSeleccionado ? (
        <>
          <Text style={styles.label}>Elegí un cliente</Text>

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, teléfono o DNI"
              placeholderTextColor="#94A3B8"
              value={busqueda}
              onChangeText={setBusqueda}
            />
          </View>

          {clientesFiltrados.length === 0 ? (
            <Text style={styles.empty}>No se encontraron clientes.</Text>
          ) : (
            clientesFiltrados.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.clientCard}
                onPress={() => setClienteSeleccionado(item)}
              >
                <Text style={styles.clienteNombre}>{item.nombre}</Text>
                <Text style={styles.clienteDato}>
                  Tel: {item.telefono || 'Sin cargar'}
                </Text>
                <Text style={styles.clienteDato}>
                  DNI: {item.dni || 'Sin cargar'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </>
      ) : (
        <>
          <View style={styles.selectedCard}>
            <Text style={styles.selectedTitle}>Cliente seleccionado</Text>
            <Text style={styles.clienteNombre}>
              {clienteSeleccionado.nombre}
            </Text>
            <Text style={styles.clienteDato}>
              Tel: {clienteSeleccionado.telefono || 'Sin cargar'}
            </Text>
            <Text style={styles.clienteDato}>
              DNI: {clienteSeleccionado.dni || 'Sin cargar'}
            </Text>

            <View
              style={[
                styles.estadoBox,
                clienteEnMora ? styles.estadoBoxRojo : styles.estadoBoxVerde,
              ]}
            >
              <Text style={styles.estadoBoxTexto}>
                Estado del cliente: {moraResumen}
              </Text>
            </View>

            {!clienteIdParam ? (
              <TouchableOpacity
                style={styles.changeButton}
                onPress={() => setClienteSeleccionado(null)}
              >
                <Text style={styles.changeButtonText}>Cambiar cliente</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.form}>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  modalidad === 'mensual' && styles.modeButtonActive,
                ]}
                onPress={() => cambiarModalidad('mensual')}
              >
                <Text style={styles.modeButtonText}>Mensual</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeButton,
                  modalidad === 'diario' && styles.modeButtonActive,
                ]}
                onPress={() => cambiarModalidad('diario')}
              >
                <Text style={styles.modeButtonText}>Diario</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Monto"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={monto}
              onChangeText={(texto) => setMonto(formatearMonedaInput(texto))}
            />

            <TextInput
              style={styles.input}
              placeholder="Interés (%)"
              placeholderTextColor="#94A3B8"
              value={interes ? `${interes}%` : ''}
              editable={false}
            />

            {modalidad === 'mensual' ? (
              <>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setMostrarCuotas(!mostrarCuotas)}
                >
                  <Text
                    style={[
                      styles.dropdownButtonText,
                      !cuotas && styles.dropdownPlaceholder,
                    ]}
                  >
                    {cuotas
                      ? `Cuotas: ${cuotas} - ${interes || 0}%`
                      : 'Seleccionar cuotas'}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {mostrarCuotas ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {mostrarCuotas && (
                  <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled style={styles.dropdownScroll}>
                      {Array.from({ length: 36 }, (_, i) => (
                        <TouchableOpacity
                          key={i + 1}
                          style={styles.dropdownItem}
                          onPress={() => seleccionarCuota(i + 1)}
                        >
                          <Text style={styles.dropdownItemText}>
                            {i + 1} cuota{i + 1 > 1 ? 's' : ''} -{' '}
                            {INTERESES_MENSUALES[i + 1]}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>
                    Asignar día de pago mensual manual
                  </Text>
                  <Switch
                    value={habilitarDiaPagoManual}
                    onValueChange={setHabilitarDiaPagoManual}
                    trackColor={{ false: '#334155', true: '#2563EB' }}
                    thumbColor="#fff"
                  />
                </View>

                {habilitarDiaPagoManual ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Día del mes de pago (1 al 31)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={diaPagoMensual}
                    onChangeText={setDiaPagoMensual}
                  />
                ) : (
                  <View style={styles.autoInfoBox}>
                    <Text style={styles.autoInfoText}>
                      Día de pago automático: 1 mes después de la fecha de creación
                    </Text>
                    <Text style={styles.autoInfoText}>
                      Fecha estimada: {diaPagoAutomaticoPreview || 'Sin calcular'}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setMostrarDias(!mostrarDias)}
                >
                  <Text
                    style={[
                      styles.dropdownButtonText,
                      !dias && styles.dropdownPlaceholder,
                    ]}
                  >
                    {dias
                      ? `Días: ${dias} - ${interes || 0}%`
                      : 'Seleccionar días'}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {mostrarDias ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {mostrarDias && (
                  <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled style={styles.dropdownScroll}>
                      {Array.from({ length: 365 }, (_, i) => {
                        const dia = i + 1
                        const interesDia = obtenerInteresDiarioPorDias(dia)

                        return (
                          <TouchableOpacity
                            key={dia}
                            style={styles.dropdownItem}
                            onPress={() => seleccionarDias(dia)}
                          >
                            <Text style={styles.dropdownItemText}>
                              {dia} día{dia > 1 ? 's' : ''} - {interesDia}%
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            <TextInput
              style={styles.input}
              placeholder="Fecha inicio (YYYY-MM-DD)"
              placeholderTextColor="#94A3B8"
              value={fechaInicio}
              onChangeText={setFechaInicio}
            />

            <View style={styles.resumeCard}>
  <Text style={styles.resumeText}>
    Monto: {formatearARS(montoNumero)}
  </Text>

  <Text style={styles.resumeText}>
    Interés aplicado: {interesNumero.toFixed(0)}%
  </Text>

  <Text style={styles.resumeText}>
    Interés generado: {formatearARS((montoNumero * interesNumero) / 100 || 0)}
  </Text>

  <Text style={styles.resumeText}>
    Total a pagar: {formatearARS(totalAPagar)}
  </Text>

  {modalidad === 'mensual' ? (
    <Text style={styles.resumeText}>
      Importe por cuota: {formatearARS(importeCuota)}
    </Text>
  ) : (
    <Text style={styles.resumeText}>
      Pago por día: {formatearARS(importeDiario)}
    </Text>
  )}

  <Text style={styles.resumeText}>
    Fecha límite del préstamo: {fechaLimitePreview || 'Sin calcular'}
  </Text>

  <Text style={styles.resumeText}>
    Fecha en que empieza la mora:{' '}
    {fechaInicioMoraPreview || 'Sin calcular'}
  </Text>
</View>

            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={guardarPrestamo}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Guardando...' : 'Guardar préstamo'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={volverPantalla}>
              <Text style={styles.backButtonText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
  },
  headerBack: {
    marginTop: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  headerBackText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 4,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 16,
    marginBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    paddingVertical: 14,
  },
  clientCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectedCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  selectedTitle: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  clienteNombre: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  clienteDato: {
    color: '#CBD5E1',
    fontSize: 15,
    marginTop: 2,
  },
  changeButton: {
    marginTop: 12,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  changeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  form: {
    marginTop: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  modeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dropdownButton: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  dropdownPlaceholder: {
    color: '#94A3B8',
  },
  dropdownArrow: {
    color: '#fff',
    fontSize: 14,
  },
  dropdownList: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
    maxHeight: 220,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 16,
  },
  resumeCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  resumeText: {
    color: '#E2E8F0',
    fontSize: 15,
    marginBottom: 6,
  },
  resumeSmall: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 15,
  },
  backButtonText: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
  },
  estadoBox: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  estadoBoxVerde: {
    backgroundColor: '#14532D',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  estadoBoxRojo: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  estadoBoxTexto: {
    color: '#fff',
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  switchLabel: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  autoInfoBox: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  autoInfoText: {
    color: '#CBD5E1',
    fontSize: 14,
    marginBottom: 4,
  },
})