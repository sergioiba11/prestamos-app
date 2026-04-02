import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Prestamo = {
  prestamo_id: string
  nombre: string
  total_a_pagar: number
  total_pagado: number
  restante: number
}

export default function EmpleadoHome() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    obtenerPrestamos()
  }, [])

  const obtenerPrestamos = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('resumen_prestamos')
      .select('*')

    if (error) {
      Alert.alert('Error', error.message)
      setLoading(false)
      return
    }

    setPrestamos(data || [])
    setLoading(false)
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const irACargarPago = (prestamoId: string) => {
    router.push({
      pathname: '/cargar-pago' as any,
      params: { prestamo_id: prestamoId },
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Panel empleado</Text>

        <TouchableOpacity style={styles.logout} onPress={cerrarSesion}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.empty}>Cargando...</Text>
      ) : prestamos.length === 0 ? (
        <Text style={styles.empty}>No hay préstamos para mostrar</Text>
      ) : (
        <FlatList
          data={prestamos}
          keyExtractor={(item) => item.prestamo_id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.info}>Total: ${item.total_a_pagar}</Text>
              <Text style={styles.info}>Pagado: ${item.total_pagado}</Text>
              <Text style={styles.restante}>Restante: ${item.restante}</Text>

              <TouchableOpacity
                style={styles.payButton}
                onPress={() => irACargarPago(item.prestamo_id)}
              >
                <Text style={styles.payButtonText}>Cargar pago</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#031132',
    padding: 20,
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  logout: {
    backgroundColor: '#FF4D4D',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#1E2D4A',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
  },
  nombre: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  info: {
    color: '#D1D5DB',
    fontSize: 15,
    marginBottom: 4,
  },
  restante: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 12,
  },
  payButton: {
    backgroundColor: '#3468E8',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  empty: {
    color: '#94A3B8',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
})