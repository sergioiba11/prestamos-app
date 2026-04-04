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
import { supabase } from '../lib/supabase'

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

function limpiarNumero(texto: string) {
  return texto.replace(/[^0-9]/g, '')
}

function formatearMonedaInput(valor: string) {
  const limpio = limpiarNumero(valor)
  if (!limpio) return ''
  return '$' + new Intl.NumberFormat('es-AR').format(Number(limpio))
}

function formatearMoneda(valor: number) {
  return '$' + new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

function formatearFecha(fecha?: string | null) {
  if (!fecha) return '—'
  const limpia = fecha.slice(0, 10)
  const partes = limpia.split('-')
  if (partes.length !== 3) return limpia
  return `${partes[2]}/${partes[1]}/${partes[0]}`
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

  const [busqueda, setBusqueda] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<Prestamo | null>(null)

  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'mp'>('efectivo')

  useEffect(() => {
    cargarClientes()
  }, [])

  useEffect(() => {
    if (clienteSeleccionado?.id) {
      cargarPrestamosCliente(clienteSeleccionado.id)
    } else {
      setPrestamos([])
      setPrestamoSeleccionado(null)
    }
  }, [clienteSeleccionado])

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
  const deudaActual = Number(prestamoSeleccionado?.total_a_pagar || 0)

  const volver = () => {
    if (clienteSeleccionado?.id) {
      router.replace(`/cliente-detalle?cliente_id=${clienteSeleccionado.id}` as any)
      return
    }

    router.back()
  }

  const registrarPago = async () => {
    if (guardando) return

    if (!clienteSeleccionado) {
      Alert.alert('Error', 'Seleccioná un cliente')
      return
    }

    if (!prestamoSeleccionado) {
      Alert.alert('Error', 'Seleccioná un préstamo')
      return
    }

    if (!montoNumero || montoNumero <= 0) {
      Alert.alert('Error', 'Ingresá un monto válido')
      return
    }

    if (montoNumero > deudaActual) {
      Alert.alert(
        'Error',
        `El pago no puede ser mayor a la deuda actual (${formatearMoneda(deudaActual)})`
      )
      return
    }

    try {
      setGuardando(true)

      const { data, error } = await supabase.functions.invoke('registrar-pago', {
        body: {
          prestamo_id: prestamoSeleccionado.id,
          cliente_id: clienteSeleccionado.id,
          monto: montoNumero,
          metodo: metodo,
        },
      })

      if (error) {
        Alert.alert('Error', error.message || 'No se pudo registrar el pago')
        return
      }

      if (!data?.ok) {
        Alert.alert('Error', data?.error || 'No se pudo registrar el pago')
        return
      }

      Alert.alert('Éxito', 'Pago cargado correctamente', [
        {
          text: 'OK',
          onPress: () => {
            router.replace(`/cliente-detalle?cliente_id=${clienteSeleccionado.id}` as any)
          },
        },
      ])
    } catch (error: any) {
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
      <Text style={styles.subtitle}>Registrá un pago y descontalo del préstamo</Text>

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

          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => {
              setClienteSeleccionado(null)
              setPrestamos([])
              setPrestamoSeleccionado(null)
              setBusqueda('')
            }}
          >
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
                    onPress={() => setPrestamoSeleccionado(prestamo)}
                  >
                    <Text style={styles.selectName}>
                      {prestamo.modalidad === 'diario' ? 'Préstamo diario' : 'Préstamo mensual'}
                    </Text>
                    <Text style={styles.selectMeta}>
                      Deuda actual: {formatearMoneda(Number(prestamo.total_a_pagar || 0))}
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
              <Text style={styles.label}>Monto a cobrar</Text>
              <TextInput
                value={monto}
                onChangeText={(texto) => setMonto(formatearMonedaInput(texto))}
                placeholder="$0"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text style={styles.helperText}>
                Deuda actual: {formatearMoneda(deudaActual)}
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
                  <Text style={styles.resumeLabel}>Pago</Text>
                  <Text style={styles.resumeValue}>{formatearMoneda(montoNumero)}</Text>
                </View>

                <View style={styles.resumeRow}>
                  <Text style={styles.resumeLabel}>Queda</Text>
                  <Text style={styles.resumeValue}>
                    {formatearMoneda(Math.max(0, deudaActual - montoNumero))}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, guardando && styles.saveButtonDisabled]}
                onPress={registrarPago}
                disabled={guardando}
              >
                <Text style={styles.saveButtonText}>
                  {guardando ? 'Guardando...' : 'Registrar pago'}
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
    fontSize: 15,
  },

  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },

  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 14,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },

  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 18,
  },

  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },

  helperText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },

  listBox: {
    marginTop: 4,
  },

  selectCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },

  selectCardActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#0B1220',
  },

  selectName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  selectMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },

  infoCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 14,
  },

  infoName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  infoMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },

  changeButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  changeButtonText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },

  methodsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 2,
  },

  methodButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  methodButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },

  methodButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 14,
  },

  methodButtonTextActive: {
    color: '#FFFFFF',
  },

  resumeCard: {
    marginTop: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },

  resumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  resumeLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },

  resumeValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  saveButton: {
    marginTop: 18,
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 8,
  },
})