import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function RecoverPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) {
      setError('Ingresá tu correo.')
      setSuccess('')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Ingresá un correo válido.')
      setSuccess('')
      return
    }

    try {
      setLoading(true)
      setError('')
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail)
      if (resetError) throw resetError
      setSuccess('Te enviamos un correo para restablecer tu contraseña.')
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el correo de recuperación.')
      setSuccess('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>Ingresá tu correo y te enviaremos un enlace de recuperación.</Text>

          <TextInput
            style={styles.input}
            placeholder="Correo"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              if (error) setError('')
            }}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}

          <TouchableOpacity style={styles.primaryButton} disabled={loading} onPress={handleSubmit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enviar correo</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/login' as any)}>
            <Text style={styles.secondaryText}>Volver a iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#EAF3FF' },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: '#0A1F44' },
  subtitle: { color: '#5F6F8F', fontSize: 14, marginBottom: 6 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8E6FA',
    backgroundColor: '#FFFFFF',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#1D4ED8', fontWeight: '700', fontSize: 15 },
  errorText: { color: '#DC2626', fontSize: 13 },
  successText: { color: '#16A34A', fontSize: 13 },
})
