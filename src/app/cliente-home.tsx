import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Alert,
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
}

type PanelCliente = {
  cliente_id: string
  total_a_pagar: number
  total_pagado: number
  restante: number
}

export default function ClienteHome() {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [resumen, setResumen] = useState<PanelCliente | null>(null)

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError) throw authError

      const userId = authData.user?.id

      if (!userId) {
        throw new Error('No se encontró el usuario logueado')
      }

      const { data: clienteData, error: clienteError } = await supabase
        .from('clientes')
        .select('*')
        .eq('usuario_id', userId)
        .single()

      if (clienteError) throw clienteError

      setCliente(clienteData)

      const { data: panelData, error: panelError } = await supabase
        .from('panel_clientes')
        .select('*')
        .eq('cliente_id', clienteData.id)
        .single()

      if (panelError) throw panelError

      setResumen(panelData)
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar tus datos')
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mi crédito</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Cliente</Text>
        <Text style={styles.value}>{cliente?.nombre || '-'}</Text>

        <Text style={styles.label}>Teléfono</Text>
        <Text style={styles.value}>{cliente?.telefono || '-'}</Text>

        <Text style={styles.label}>Dirección</Text>
        <Text style={styles.value}>{cliente?.direccion || '-'}</Text>

        <Text style={styles.label}>DNI</Text>
        <Text style={styles.value}>{cliente?.dni || '-'}</Text>

        <View style={{ height: 16 }} />

        <Text style={styles.label}>Monto total</Text>
        <Text style={styles.value}>${Number(resumen?.total_a_pagar || 0).toLocaleString('es-AR')}</Text>

        <Text style={styles.label}>Pagado</Text>
        <Text style={styles.value}>${Number(resumen?.total_pagado || 0).toLocaleString('es-AR')}</Text>

        <Text style={styles.label}>Restante</Text>
        <Text style={styles.restante}>
          ${Number(resumen?.restante || 0).toLocaleString('es-AR')}
        </Text>
      </View>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Pagar cuota</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={cerrarSesion}>
        <Text style={styles.buttonText}>Salir</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07173a',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1e2c45',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  label: {
    color: '#8fb3e8',
    fontSize: 14,
    marginTop: 8,
  },
  value: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  restante: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#3167e3',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  logout: {
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
})