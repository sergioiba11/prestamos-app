import { useEffect, useMemo } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

export default function ClienteDetalleLegacyRedirect() {
  const params = useLocalSearchParams()

  const clienteId = useMemo(() => {
    const raw = params.cliente_id
    if (Array.isArray(raw)) return raw[0] || ''
    return typeof raw === 'string' ? raw : ''
  }, [params.cliente_id])

  const prestamoId = useMemo(() => {
    const raw = params.prestamo_id
    if (Array.isArray(raw)) return raw[0] || ''
    return typeof raw === 'string' ? raw : ''
  }, [params.prestamo_id])

  useEffect(() => {
    if (!clienteId) {
      router.replace('/clientes' as any)
      return
    }

    const nextRoute = prestamoId ? `/cliente/${clienteId}?prestamo_id=${prestamoId}` : `/cliente/${clienteId}`
    console.warn('[cliente-detalle-legacy] ruta obsoleta detectada, redirigiendo', { clienteId, prestamoId, nextRoute })
    router.replace(nextRoute as any)
  }, [clienteId, prestamoId])

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={styles.text}>Redirigiendo al detalle unificado...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020817' },
  text: { color: '#94A3B8', marginTop: 10 },
})
