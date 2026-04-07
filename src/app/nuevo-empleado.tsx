import { router } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

export const options = {
  headerShown: false,
}

export default function NuevoEmpleado() {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const crearEmpleado = async () => {
    if (loading) return

    if (
      !nombre.trim() ||
      !email.trim() ||
      !password.trim() ||
      !adminPassword.trim()
    ) {
      Alert.alert('Error', 'Completá todos los campos')
      return
    }

    if (password.trim().length < 6) {
      Alert.alert(
        'Error',
        'La contraseña del empleado debe tener al menos 6 caracteres'
      )
      return
    }

    try {
      setLoading(true)

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        Alert.alert('Error', sessionError.message)
        return
      }

      if (!session?.access_token) {
        Alert.alert('Error', 'No hay sesión activa')
        return
      }

      const res = await fetch(
        'https://itnwdpwnbcqerpmyygcv.supabase.co/functions/v1/crear-empleado',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            nombre: nombre.trim(),
            email: email.trim().toLowerCase(),
            password: password.trim(),
            adminPassword: adminPassword.trim(),
          }),
        }
      )

      const json = await res.json()

      console.log('STATUS CREAR EMPLEADO:', res.status)
      console.log(
        'RESPUESTA CREAR EMPLEADO JSON:',
        JSON.stringify(json, null, 2)
      )

      if (!res.ok) {
        Alert.alert('Error', json?.error || JSON.stringify(json))
        return
      }

      if (!json?.ok) {
        Alert.alert('Error', json?.error || 'No se pudo crear el empleado')
        return
      }

      Alert.alert('Éxito', 'Empleado creado correctamente')
      setNombre('')
      setEmail('')
      setPassword('')
      setAdminPassword('')
      router.back()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Ocurrió un error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nuevo empleado</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        placeholderTextColor="#94A3B8"
        value={nombre}
        onChangeText={setNombre}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#94A3B8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña del empleado"
        placeholderTextColor="#94A3B8"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Tu contraseña de admin"
        placeholderTextColor="#94A3B8"
        value={adminPassword}
        onChangeText={setAdminPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={crearEmpleado}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creando...' : 'Crear empleado'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
})