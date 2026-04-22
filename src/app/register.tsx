import { Link, router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { normalizeDni, normalizePhoneAR } from '../lib/onboarding'
import { supabase } from '../lib/supabase'

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const parseErrorPayload = async (raw: any): Promise<{ error?: string } | null> => {
    if (!raw) return null

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? (parsed as { error?: string }) : null
      } catch {
        return null
      }
    }

    if (typeof raw === 'object') {
      if (typeof raw.json === 'function') {
        try {
          const payload = await raw.clone().json()
          return payload && typeof payload === 'object' ? (payload as { error?: string }) : null
        } catch {
          return null
        }
      }
      return raw as { error?: string }
    }

    return null
  }

  const extractInvokeErrorMessage = async (invokeError: any): Promise<string> => {
    const fallbackMessage = String(invokeError?.message || 'No se pudo crear la cuenta.')
    const fallbackGeneric = 'Edge Function returned a non-2xx status code'

    const payloadFromContext = await parseErrorPayload(invokeError?.context)
    if (typeof payloadFromContext?.error === 'string' && payloadFromContext.error.trim()) return payloadFromContext.error

    if (fallbackMessage && fallbackMessage !== fallbackGeneric) return fallbackMessage
    return 'No se pudo completar el registro en este momento.'
  }

  const submit = async () => {
    if (loading) return

    const nombreLimpio = nombre.trim()
    const dniLimpio = normalizeDni(dni)
    const emailLimpio = email.trim().toLowerCase()
    const phoneNormalizado = normalizePhoneAR(telefono)
    const passwordLimpia = password.trim()

    setError('')
    setSuccess('')

    if (!nombreLimpio) {
      setError('Ingresá tu nombre.')
      return
    }

    if (!dniLimpio) {
      setError('Ingresá tu DNI.')
      return
    }

    if (!/^\d{7,8}$/.test(dniLimpio)) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    if (!emailLimpio) {
      setError('Ingresá tu correo.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      setError('Ingresá un correo válido.')
      return
    }

    if (!telefono.trim() || !phoneNormalizado) {
      setError('Ingresá un teléfono válido de Argentina. Ejemplo: +54 9 11 1234 5678.')
      return
    }

    if (!passwordLimpia) {
      setError('Ingresá una contraseña.')
      return
    }

    if (passwordLimpia.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    try {
      setLoading(true)
      const payload = {
        dni: dniLimpio,
        nombre: nombreLimpio,
        email: emailLimpio,
        telefono: phoneNormalizado,
        password: passwordLimpia,
        clienteId: null,
      }

      const { data, error: invokeError } = await supabase.functions.invoke('registro-cliente-publico', {
        body: payload,
      })

      if (invokeError) {
        const detailMessage = await extractInvokeErrorMessage(invokeError)
        setError(detailMessage)
        return
      }

      const response = data as { ok?: boolean; error?: string; code?: string } | null
      if (!response?.ok) {
        setError(response?.error || 'No se pudo completar el registro.')
        return
      }

      setSuccess('Cuenta creada correctamente. Ya podés iniciar sesión.')
      setTimeout(() => router.replace('/login' as any), 600)
    } catch (err: any) {
      const payload = await parseErrorPayload(err?.context)
      const payloadMessage = typeof payload?.error === 'string' ? payload.error.trim() : ''
      const errMessage = String(err?.message || '').trim()

      setError(payloadMessage || errMessage || 'No se pudo completar el registro en este momento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Completá tus datos para crear tu cuenta de cliente.</Text>

          <TextInput style={styles.input} placeholder="Nombre y apellido" value={nombre} onChangeText={setNombre} />
          <TextInput
            style={styles.input}
            placeholder="DNI"
            keyboardType="number-pad"
            value={dni}
            onChangeText={setDni}
          />
          <TextInput
            style={styles.input}
            placeholder="Correo"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono (+54...)"
            keyboardType="phone-pad"
            value={telefono}
            onChangeText={setTelefono}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}

          <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Crear cuenta</Text>}
          </TouchableOpacity>

          <Link href={'/login' as any} asChild>
            <TouchableOpacity style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Ya tengo cuenta</Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#EAF3FF' },
  flex: { flex: 1 },
  content: { padding: 20, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
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
  disabled: { opacity: 0.7 },
  errorText: { color: '#DC2626', fontSize: 13 },
  successText: { color: '#16A34A', fontSize: 13 },
})
