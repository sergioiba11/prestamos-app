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

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const guardarPassword = async () => {
    if (loading) return

    if (!password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Completá ambos campos')
      return
    }

    if (password.trim().length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (password.trim() !== confirmPassword.trim()) {
      Alert.alert('Error', 'Las contraseñas no coinciden')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.auth.updateUser({
        password: password.trim(),
      })

      if (error) throw error

      Alert.alert('Listo', 'Contraseña creada correctamente', [
        {
          text: 'Ir al login',
          onPress: () => router.replace('/login' as any),
        },
      ])
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear contraseña</Text>

      <TextInput
        style={styles.input}
        placeholder="Nueva contraseña"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TextInput
        style={styles.input}
        placeholder="Repetir contraseña"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={guardarPassword}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Guardando...' : 'Guardar contraseña'}
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