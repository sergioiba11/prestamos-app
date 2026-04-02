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
    const raw = params.id ?? params.cliente_id
    if (Array.isArray(raw)) return raw[0]
    return raw
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
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.volver}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.title}>{cliente.nombre}</Text>

        <Text style={styles.item}>
          <Text style={styles.label}>Teléfono: </Text>
          {cliente.telefono || 'Sin cargar'}
        </Text>

        <Text style={styles.item}>
          <Text style={styles.label}>Dirección: </Text>
          {cliente.direccion || 'Sin cargar'}
        </Text>

        <Text style={styles.item}>
          <Text style={styles.label}>DNI: </Text>
          {cliente.dni || 'Sin cargar'}
        </Text>

        <Text style={styles.item}>
          <Text style={styles.label}>Email: </Text>
          {cliente.email || 'Sin cargar'}
        </Text>
      </View>

      <Text style={styles.section}>Préstamos</Text>

      {prestamos.length === 0 ? (
        <Text style={styles.item}>Sin préstamos</Text>
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
              <Text style={styles.tipoPrestamo}>{modalidadTexto}</Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Monto: </Text>
                {formatearMoneda(Number(p.monto || 0))}
              </Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Interés original: </Text>
                {Number(p.interes || 0)}%
              </Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Total base: </Text>
                {formatearMoneda(Number(p.total_a_pagar || 0))}
              </Text>

              {esDiario ? (
                <Text style={styles.item}>
                  <Text style={styles.label}>Plazo: </Text>
                  {Number(p.dias_plazo || 0)} días
                </Text>
              ) : (
                <Text style={styles.item}>
                  <Text style={styles.label}>Cuotas: </Text>
                  {Number(p.cuotas || 0)}
                </Text>
              )}

              <Text style={styles.item}>
                <Text style={styles.label}>Fecha inicio: </Text>
                {p.fecha_inicio || 'Sin cargar'}
              </Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Fecha límite: </Text>
                {p.fecha_limite || 'Sin cargar'}
              </Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Inicio de mora: </Text>
                {p.fecha_inicio_mora || 'Sin cargar'}
              </Text>

              <View
                style={[
                  styles.estadoBox,
                  resultado.estadoVisual === 'DEMORADO'
                    ? styles.estadoDemorado
                    : styles.estadoAlDia,
                ]}
              >
                <Text style={styles.estadoText}>
                  Estado: {resultado.estadoVisual}
                </Text>
              </View>

              <Text style={styles.item}>
                <Text style={styles.label}>Días de atraso: </Text>
                {resultado.diasAtraso}
              </Text>

              {resultado.tipo === 'diario' ? (
                <>
                  <Text style={styles.item}>
                    <Text style={styles.label}>Valor de 1 cuota diaria: </Text>
                    {formatearMoneda(resultado.cuotaDiaria)}
                  </Text>

                  <Text style={styles.item}>
                    <Text style={styles.label}>Interés por día vencido: </Text>
                    {resultado.porcentajeMoraPorDia}% de 1 cuota diaria
                  </Text>

                  <Text style={styles.item}>
                    <Text style={styles.label}>Detalle mora: </Text>
                    {resultado.detalle}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.item}>
                    <Text style={styles.label}>Mora acumulada: </Text>
                    {resultado.porcentajeMora}%
                  </Text>

                  <Text style={styles.item}>
                    <Text style={styles.label}>Detalle mora: </Text>
                    {resultado.detalle}
                  </Text>
                </>
              )}

              <Text style={styles.item}>
                <Text style={styles.label}>Mora en pesos: </Text>
                {formatearMoneda(resultado.moraPesos)}
              </Text>

              <Text style={styles.totalFinal}>
                Total actualizado: {formatearMoneda(resultado.totalActualizado)}
              </Text>

              <Text style={styles.item}>
                <Text style={styles.label}>Estado guardado: </Text>
                {p.estado || 'pendiente'}
              </Text>
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
    padding: 20,
  },
  center: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
  },
  volver: {
    color: '#3B82F6',
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  item: {
    color: '#CBD5E1',
    marginBottom: 6,
    fontSize: 15,
  },
  label: {
    color: '#fff',
    fontWeight: 'bold',
  },
  section: {
    color: '#fff',
    fontSize: 18,
    marginVertical: 10,
    fontWeight: '700',
  },
  tipoPrestamo: {
    color: '#93C5FD',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  estadoBox: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 10,
  },
  estadoAlDia: {
    backgroundColor: '#166534',
  },
  estadoDemorado: {
    backgroundColor: '#991B1B',
  },
  estadoText: {
    color: '#fff',
    fontWeight: '700',
  },
  totalFinal: {
    color: '#60A5FA',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 8,
  },
})