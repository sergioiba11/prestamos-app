import { Ionicons } from '@expo/vector-icons'
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
import { useAppTheme } from '../context/AppThemeContext'
import { esNombreCompletoValido, normalizarNombreCompleto } from '../lib/nombre'
import { safeGoBack } from '../lib/navigation'
import { supabase } from '../lib/supabase'

export const options = {
  headerShown: false,
}

export default function NuevoEmpleado() {
  const { theme } = useAppTheme()
  const colors = theme.colors
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const goBack = () => safeGoBack('admin')

  const crearEmpleado = async () => {
    if (loading) return
    const nombreLimpio = normalizarNombreCompleto(nombre)

    if (!nombreLimpio) {
      Alert.alert('Error', 'El nombre y apellido es obligatorio')
      return
    }

    if (!esNombreCompletoValido(nombreLimpio)) {
      Alert.alert('Error', 'Ingresar nombre completo')
      return
    }

    if (!email.trim() || !password.trim() || !adminPassword.trim()) {
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
            nombre: nombreLimpio,
            email: email.trim().toLowerCase(),
            password: password.trim(),
            adminPassword: adminPassword.trim(),
          }),
        }
      )

      const json = await res.json()

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
      goBack()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Ocurrió un error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <TouchableOpacity style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={goBack}>
        <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
        <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>Volver</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.textPrimary }]}>Nuevo empleado</Text>

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        placeholder="Nombre completo"
        placeholderTextColor={colors.textSecondary}
        value={nombre}
        onChangeText={setNombre}
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        placeholder="Contraseña del empleado"
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        placeholder="Tu contraseña de admin"
        placeholderTextColor={colors.textSecondary}
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
    padding: 20,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
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
