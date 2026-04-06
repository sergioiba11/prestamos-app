import { router, useLocalSearchParams } from 'expo-router'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

function formatearMoneda(valor: number) {
  return (
    '$' +
    new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(valor || 0))
  )
}

function obtenerTextoSeguro(valor: unknown, fallback = '—') {
  if (typeof valor === 'string' && valor.trim()) return valor
  return fallback
}

function obtenerNumeroSeguro(valor: unknown) {
  const numero = Number(valor || 0)
  return Number.isFinite(numero) ? numero : 0
}

export default function PagoAprobado() {
  const params = useLocalSearchParams()

  const monto = obtenerNumeroSeguro(params.monto)
  const montoIngresado = obtenerNumeroSeguro(params.monto_ingresado)
  const vuelto = obtenerNumeroSeguro(params.vuelto)
  const saldo = obtenerNumeroSeguro(params.saldo_restante)

  const metodo = obtenerTextoSeguro(params.metodo)
  const clienteId = Array.isArray(params.cliente_id)
    ? params.cliente_id[0]
    : params.cliente_id

  const prestamoId = Array.isArray(params.prestamo_id)
    ? params.prestamo_id[0]
    : params.prestamo_id

  const cuotasAplicadas = obtenerTextoSeguro(
    Array.isArray(params.cuotas_aplicadas)
      ? params.cuotas_aplicadas[0]
      : params.cuotas_aplicadas,
    'No informado'
  )

  const proximaCuota = obtenerTextoSeguro(
    Array.isArray(params.proxima_cuota)
      ? params.proxima_cuota[0]
      : params.proxima_cuota,
    'No informada'
  )

  const fecha = new Date().toLocaleString('es-AR')

  const imprimir = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print()
      return
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>✅ Pago aprobado</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Monto pagado</Text>
        <Text style={styles.value}>{formatearMoneda(monto)}</Text>

        <Text style={styles.label}>Monto ingresado</Text>
        <Text style={styles.value}>{formatearMoneda(montoIngresado)}</Text>

        <Text style={styles.label}>Vuelto</Text>
        <Text style={styles.value}>{formatearMoneda(vuelto)}</Text>

        <Text style={styles.label}>Método</Text>
        <Text style={styles.value}>{metodo}</Text>

        <Text style={styles.label}>Fecha</Text>
        <Text style={styles.value}>{fecha}</Text>

        <Text style={styles.label}>Saldo restante</Text>
        <Text style={styles.value}>{formatearMoneda(saldo)}</Text>

        <View style={styles.divider} />

        <Text style={styles.label}>Cuotas impactadas</Text>
        <Text style={styles.valueSmall}>{cuotasAplicadas}</Text>

        <Text style={styles.label}>Próxima cuota pendiente</Text>
        <Text style={styles.valueSmall}>{proximaCuota}</Text>

        <Text style={styles.label}>ID préstamo</Text>
        <Text style={styles.valueSmall}>{obtenerTextoSeguro(prestamoId)}</Text>
      </View>

      {Platform.OS === 'web' ? (
        <TouchableOpacity style={styles.button} onPress={imprimir}>
          <Text style={styles.buttonText}>🖨️ Imprimir ticket</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          router.replace(`/cliente-detalle?cliente_id=${clienteId}` as any)
        }
      >
        <Text style={styles.buttonText}>← Volver al cliente</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    color: '#22C55E',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  label: {
    color: '#94A3B8',
    fontSize: 13,
  },
  value: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  valueSmall: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 8,
  },
  button: {
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
  },
})