import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function ClientesLista() {
  const [clientes, setClientes] = useState<any[]>([])

  useEffect(() => {
    obtenerClientes()
  }, [])

  const obtenerClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')

    if (error) {
      console.log(error)
      return
    }

    setClientes(data || [])
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clientes</Text>

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/cliente/${item.id}` as any)}
          >
            <Text style={styles.nombre}>{item.nombre}</Text>
            <Text style={styles.info}>
              {item.telefono || 'Sin teléfono'}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#031132',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1E2D4A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  nombre: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  info: {
    color: '#9CA3AF',
    marginTop: 4,
  },
})
