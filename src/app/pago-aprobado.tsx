import { router, useLocalSearchParams } from 'expo-router'
import { Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

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

function normalizarTelefonoParaWhatsApp(valor: unknown) {
  return String(valor || '').replace(/[^\d]/g, '')
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

  const cuotasAplicadasRaw = obtenerTextoSeguro(
    Array.isArray(params.cuotas_aplicadas)
      ? params.cuotas_aplicadas[0]
      : params.cuotas_aplicadas,
    ''
  )
  let cuotasAplicadas = 'No informado'
  try {
    const parsed = JSON.parse(cuotasAplicadasRaw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      cuotasAplicadas = parsed.map((n) => `#${n}`).join(', ')
    } else if (typeof cuotasAplicadasRaw === 'string' && cuotasAplicadasRaw.trim()) {
      cuotasAplicadas = cuotasAplicadasRaw
    }
  } catch {
    cuotasAplicadas = cuotasAplicadasRaw || 'No informado'
  }

  const proximaCuota = obtenerTextoSeguro(
    Array.isArray(params.proxima_cuota)
      ? params.proxima_cuota[0]
      : params.proxima_cuota,
    'No informada'
  )
  const clienteNombre = obtenerTextoSeguro(
    `${obtenerTextoSeguro(
      Array.isArray(params.cliente_nombre) ? params.cliente_nombre[0] : params.cliente_nombre,
      ''
    )} ${obtenerTextoSeguro(
      Array.isArray(params.cliente_apellido) ? params.cliente_apellido[0] : params.cliente_apellido,
      ''
    )}`.trim(),
    'Cliente'
  )
  const clienteTelefonoParam = obtenerTextoSeguro(
    Array.isArray(params.cliente_telefono) ? params.cliente_telefono[0] : params.cliente_telefono,
    ''
  )

  const fecha = new Date().toLocaleString('es-AR')

  const imprimir = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print()
      return
    }
  }

  const mensajeWhatsApp = [
    'Hola, te comparto el comprobante de tu pago:',
    '',
    `Cliente: ${clienteNombre}`,
    `Monto: ${formatearMoneda(monto)}`,
    `Fecha: ${fecha}`,
    `Cuotas: ${cuotasAplicadas}`,
    `Saldo restante: ${formatearMoneda(saldo)}`,
    '',
    'Gracias.',
  ].join('\n')

  const copiarMensaje = async () => {
    const nav = globalThis as typeof globalThis & {
      navigator?: { clipboard?: { writeText: (text: string) => Promise<void> } }
    }
    if (Platform.OS === 'web' && nav.navigator?.clipboard?.writeText) {
      await nav.navigator.clipboard.writeText(mensajeWhatsApp)
      return
    }
  }

  const enviarPorWhatsApp = async () => {
    let telefono = normalizarTelefonoParaWhatsApp(clienteTelefonoParam)

    if (!telefono && Platform.OS === 'web' && typeof window !== 'undefined') {
      const manual = window.prompt('Ingresá el número de WhatsApp (con código de país):', '')
      telefono = normalizarTelefonoParaWhatsApp(manual || '')
    }

    if (!telefono) {
      console.warn('No se pudo abrir WhatsApp: el cliente no tiene teléfono cargado.')
      return
    }

    const mensajeCodificado = encodeURIComponent(mensajeWhatsApp)
    const url = `https://wa.me/${telefono}?text=${mensajeCodificado}`
    await Linking.openURL(url)
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

      <View style={styles.actionsRow}>
        {Platform.OS === 'web' ? (
          <Pressable
            style={({ hovered, pressed }) => [
              styles.button,
              styles.buttonHalf,
              hovered && styles.buttonHover,
              pressed && styles.buttonPressed,
            ]}
            onPress={imprimir}
          >
            <Text style={styles.buttonText}>🖨️ Imprimir ticket</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ hovered, pressed }) => [
            styles.button,
            styles.buttonHalf,
            styles.whatsappButton,
            hovered && styles.whatsappButtonHover,
            pressed && styles.buttonPressed,
          ]}
          onPress={enviarPorWhatsApp}
        >
          <Text style={styles.buttonText}>🟢 Enviar por WhatsApp</Text>
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <Pressable
          style={({ hovered, pressed }) => [
            styles.secondaryButton,
            hovered && styles.secondaryButtonHover,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => void copiarMensaje()}
        >
          <Text style={styles.secondaryButtonText}>📋 Copiar mensaje</Text>
        </Pressable>
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
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  buttonHalf: {
    flex: 1,
    marginTop: 0,
  },
  buttonHover: {
    backgroundColor: '#1D4ED8',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  whatsappButton: {
    backgroundColor: '#16A34A',
  },
  whatsappButtonHover: {
    backgroundColor: '#15803D',
  },
  secondaryButton: {
    marginTop: 10,
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#0B1220',
  },
  secondaryButtonHover: {
    backgroundColor: '#111B2F',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '600',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
  },
})
