import { router, useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

function formatearMoneda(valor: number) {
  return '$' + new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

export default function PagoAprobado() {
  const params = useLocalSearchParams()

  const monto = Number(params.monto || 0)
  const saldo = Number(params.saldo_restante || 0)
  const metodo = params.metodo || '—'
  const cliente_id = params.cliente_id

  const fecha = new Date().toLocaleString('es-AR')

  const imprimir = () => {
    window.print()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>✅ Pago aprobado</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Monto pagado</Text>
        <Text style={styles.value}>{formatearMoneda(monto)}</Text>

        <Text style={styles.label}>Método</Text>
        <Text style={styles.value}>{metodo}</Text>

        <Text style={styles.label}>Fecha</Text>
        <Text style={styles.value}>{fecha}</Text>

        <Text style={styles.label}>Saldo restante</Text>
        <Text style={styles.value}>{formatearMoneda(saldo)}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={imprimir}>
        <Text style={styles.buttonText}>🖨️ Imprimir ticket</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace(`/cliente-detalle?cliente_id=${cliente_id}`)}
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