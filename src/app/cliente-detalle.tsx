import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  direccion: string | null
  dni: string | null
  usuario_id?: string | null
  email?: string | null
}

type Prestamo = {
  id: string
  monto: number
  interes: number
  total_a_pagar: number
  modalidad?: string | null
  dias_plazo?: number | null
  cuotas?: number | null
  fecha_limite?: string | null
  fecha_inicio?: string | null
  fecha_inicio_mora?: string | null
  estado?: string | null
}

type ResultadoMoraMensual = {
  tipo: 'mensual'
  diasAtraso: number
  porcentajeMora: number
  moraPesos: number
  totalActualizado: number
  estadoVisual: 'AL DÍA' | 'DEMORADO'
  detalle: string
}

type ResultadoMoraDiaria = {
  tipo: 'diario'
  diasAtraso: number
  cuotaDiaria: number
  porcentajeMoraPorDia: number
  moraPesos: number
  totalActualizado: number
  estadoVisual: 'AL DÍA' | 'DEMORADO'
  detalle: string
}

type ResultadoMora = ResultadoMoraMensual | ResultadoMoraDiaria

const PORCENTAJE_MORA_DIARIA = 20

function formatearMoneda(valor: number) {
  return `$${Number(valor || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function calcularDiasAtraso(fechaInicioMora: string | null) {
  if (!fechaInicioMora) return 0

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const inicio = new Date(fechaInicioMora + 'T00:00:00')
  inicio.setHours(0, 0, 0, 0)

  const diferenciaMs = hoy.getTime() - inicio.getTime()
  const diasAtraso = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24)) + 1

  return diasAtraso > 0 ? diasAtraso : 0
}

function calcularMoraMensual(
  totalBase: number,
  fechaInicioMora: string | null
): ResultadoMoraMensual {
  const diasAtraso = calcularDiasAtraso(fechaInicioMora)

  if (diasAtraso <= 0) {
    return {
      tipo: 'mensual',
      diasAtraso: 0,
      porcentajeMora: 0,
      moraPesos: 0,
      totalActualizado: totalBase,
      estadoVisual: 'AL DÍA',
      detalle: 'Sin mora',
    }
  }

  let porcentajeMora = 0

  const tramoUno = Math.max(Math.min(diasAtraso, 10) - 3, 0)
  porcentajeMora += tramoUno * 1

  const tramoDos = Math.max(diasAtraso - 10, 0)
  porcentajeMora += tramoDos * 2

  const moraPesos = (totalBase * porcentajeMora) / 100
  const totalActualizado = totalBase + moraPesos

  return {
    tipo: 'mensual',
    diasAtraso,
    porcentajeMora,
    moraPesos,
    totalActualizado,
    estadoVisual: 'DEMORADO',
    detalle: `Mora mensual acumulada: ${porcentajeMora}%`,
  }
}

function calcularMoraDiaria(
  totalBase: number,
  diasPlazo: number | null | undefined,
  fechaInicioMora: string | null
): ResultadoMoraDiaria {
  const diasAtraso = calcularDiasAtraso(fechaInicioMora)
  const diasPrestamo = Number(diasPlazo || 0)

  if (!diasPrestamo || diasPrestamo <= 0) {
    return {
      tipo: 'diario',
      diasAtraso: 0,
      cuotaDiaria: 0,
      porcentajeMoraPorDia: PORCENTAJE_MORA_DIARIA,
      moraPesos: 0,
      totalActualizado: totalBase,
      estadoVisual: 'AL DÍA',
      detalle: 'Sin plazo diario válido',
    }
  }

  const cuotaDiaria = totalBase / diasPrestamo

  if (diasAtraso <= 0) {
    return {
      tipo: 'diario',
      diasAtraso: 0,
      cuotaDiaria,
      porcentajeMoraPorDia: PORCENTAJE_MORA_DIARIA,
      moraPesos: 0,
      totalActualizado: totalBase,
      estadoVisual: 'AL DÍA',
      detalle: 'Sin mora',
    }
  }

  const moraPorDia = cuotaDiaria * (PORCENTAJE_MORA_DIARIA / 100)
  const moraPesos = diasAtraso * moraPorDia
  const totalActualizado = totalBase + moraPesos

  return {
    tipo: 'diario',
    diasAtraso,
    cuotaDiaria,
    porcentajeMoraPorDia: PORCENTAJE_MORA_DIARIA,
    moraPesos,
    totalActualizado,
    estadoVisual: 'DEMORADO',
    detalle: `${PORCENTAJE_MORA_DIARIA}% de una cuota diaria por cada día vencido`,
  }
}

export default function ClienteDetalle() {
  const params = useLocalSearchParams()

  const clienteId = useMemo(() => {
    const raw = params.cliente_id
    if (Array.isArray(raw)) return raw[0]
    return typeof raw === 'string' ? raw : undefined
  }, [params])

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [loading, setLoading] = useState(true)

  const cargarDatos = useCallback(async () => {
    if (!clienteId) {
      setCliente(null)
      setPrestamos([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const { data: clienteData, error: clienteError } = await supabase
        .from('clientes')
        .select(`
          id,
          nombre,
          telefono,
          direccion,
          dni,
          usuario_id,
          usuarios:usuario_id (
            id,
            email,
            nombre,
            rol
          )
        `)
        .eq('id', clienteId)
        .single()

      if (clienteError || !clienteData) {
        console.log('Error cliente:', clienteError)
        setCliente(null)
        setPrestamos([])
        return
      }

      const { data: prestamosData, error: prestamosError } = await supabase
        .from('prestamos')
        .select(`
          id,
          monto,
          interes,
          total_a_pagar,
          modalidad,
          dias_plazo,
          cuotas,
          fecha_limite,
          fecha_inicio,
          fecha_inicio_mora,
          estado
        `)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })

      if (prestamosError) {
        console.log('Error préstamos:', prestamosError)
      }

      const usuarioRelacion = Array.isArray(clienteData.usuarios)
        ? clienteData.usuarios[0]
        : clienteData.usuarios

      setCliente({
        id: clienteData.id,
        nombre: clienteData.nombre,
        telefono: clienteData.telefono,
        direccion: clienteData.direccion,
        dni: clienteData.dni,
        usuario_id: clienteData.usuario_id,
        email: usuarioRelacion?.email ?? null,
      })

      setPrestamos((prestamosData || []) as Prestamo[])
    } catch (error) {
      console.log('Error general:', error)
      setCliente(null)
      setPrestamos([])
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useFocusEffect(
    useCallback(() => {
      cargarDatos()
    }, [cargarDatos])
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    )
  }

  if (!cliente) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Cliente no encontrado</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.headerCard}>
        <Text style={styles.headerEyebrow}>Detalle del cliente</Text>
        <Text style={styles.title}>{cliente.nombre}</Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Teléfono</Text>
            <Text style={styles.infoValue}>{cliente.telefono || '—'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dirección</Text>
            <Text style={styles.infoValue}>{cliente.direccion || '—'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>DNI</Text>
            <Text style={styles.infoValue}>{cliente.dni || '—'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{cliente.email || '—'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>Préstamos</Text>

      {prestamos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Sin préstamos</Text>
        </View>
      ) : (
        prestamos.map((p) => {
          const esDiario = p.modalidad === 'diario'
          const modalidadTexto = esDiario ? 'Cuota diaria' : 'Cuota mensual'

          const resultado: ResultadoMora = esDiario
            ? calcularMoraDiaria(
                Number(p.total_a_pagar || 0),
                p.dias_plazo,
                p.fecha_inicio_mora || null
              )
            : calcularMoraMensual(
                Number(p.total_a_pagar || 0),
                p.fecha_inicio_mora || null
              )

          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.tipoPrestamo}>{modalidadTexto}</Text>

                <View
                  style={[
                    styles.estadoBox,
                    resultado.estadoVisual === 'DEMORADO'
                      ? styles.estadoDemorado
                      : styles.estadoAlDia,
                  ]}
                >
                  <Text style={styles.estadoText}>{resultado.estadoVisual}</Text>
                </View>
              </View>

              <View style={styles.loanGrid}>
                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Monto</Text>
                  <Text style={styles.loanValue}>
                    {formatearMoneda(Number(p.monto || 0))}
                  </Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Interés original</Text>
                  <Text style={styles.loanValue}>{Number(p.interes || 0)}%</Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Total base</Text>
                  <Text style={styles.loanValue}>
                    {formatearMoneda(Number(p.total_a_pagar || 0))}
                  </Text>
                </View>

                {esDiario ? (
                  <View style={styles.loanRow}>
                    <Text style={styles.loanLabel}>Plazo</Text>
                    <Text style={styles.loanValue}>
                      {Number(p.dias_plazo || 0)} días
                    </Text>
                  </View>
                ) : (
                  <View style={styles.loanRow}>
                    <Text style={styles.loanLabel}>Cuotas</Text>
                    <Text style={styles.loanValue}>
                      {Number(p.cuotas || 0)}
                    </Text>
                  </View>
                )}

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Fecha inicio</Text>
                  <Text style={styles.loanValue}>
                    {p.fecha_inicio || 'Sin cargar'}
                  </Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Fecha límite</Text>
                  <Text style={styles.loanValue}>
                    {p.fecha_limite || 'Sin cargar'}
                  </Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Inicio de mora</Text>
                  <Text style={styles.loanValue}>
                    {p.fecha_inicio_mora || 'Sin cargar'}
                  </Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Días de atraso</Text>
                  <Text style={styles.loanValue}>{resultado.diasAtraso}</Text>
                </View>

                {resultado.tipo === 'diario' ? (
                  <>
                    <View style={styles.loanRow}>
                      <Text style={styles.loanLabel}>1 cuota diaria</Text>
                      <Text style={styles.loanValue}>
                        {formatearMoneda(resultado.cuotaDiaria)}
                      </Text>
                    </View>

                    <View style={styles.loanRow}>
                      <Text style={styles.loanLabel}>Interés por día</Text>
                      <Text style={styles.loanValue}>
                        {resultado.porcentajeMoraPorDia}% de 1 cuota diaria
                      </Text>
                    </View>

                    <View style={styles.loanRow}>
                      <Text style={styles.loanLabel}>Detalle mora</Text>
                      <Text style={styles.loanValue}>{resultado.detalle}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.loanRow}>
                      <Text style={styles.loanLabel}>Mora acumulada</Text>
                      <Text style={styles.loanValue}>
                        {resultado.porcentajeMora}%
                      </Text>
                    </View>

                    <View style={styles.loanRow}>
                      <Text style={styles.loanLabel}>Detalle mora</Text>
                      <Text style={styles.loanValue}>{resultado.detalle}</Text>
                    </View>
                  </>
                )}

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Mora en pesos</Text>
                  <Text style={styles.loanValue}>
                    {formatearMoneda(resultado.moraPesos)}
                  </Text>
                </View>

                <View style={styles.loanRow}>
                  <Text style={styles.loanLabel}>Estado guardado</Text>
                  <Text style={styles.loanValue}>{p.estado || 'pendiente'}</Text>
                </View>
              </View>

              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total actualizado</Text>
                <Text style={styles.totalFinal}>
                  {formatearMoneda(resultado.totalActualizado)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.pagoButton}
                onPress={() =>
                  router.push({
                    pathname: '/cargar-pago',
                    params: { cliente_id: cliente.id },
                  } as any)
                }
              >
                <Text style={styles.pagoButtonText}>💵 Cargar pago</Text>
              </TouchableOpacity>
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#E2E8F0',
    marginTop: 12,
    fontSize: 15,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  backButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  headerCard: {
    backgroundColor: '#1E293B',
    padding: 18,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerEyebrow: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },
  infoGrid: {
    gap: 10,
  },
  infoRow: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  infoValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  section: {
    color: '#FFFFFF',
    fontSize: 20,
    marginTop: 4,
    marginBottom: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyText: {
    color: '#CBD5E1',
    fontSize: 15,
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  tipoPrestamo: {
    color: '#93C5FD',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
  },
  estadoBox: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  estadoAlDia: {
    backgroundColor: '#166534',
  },
  estadoDemorado: {
    backgroundColor: '#991B1B',
  },
  estadoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  loanGrid: {
    gap: 10,
  },
  loanRow: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  loanLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  loanValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  totalCard: {
    backgroundColor: '#172554',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  totalLabel: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  totalFinal: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  pagoButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 2,
  },
  pagoButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
})