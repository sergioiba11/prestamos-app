import { Link, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { normalizeDni, normalizePhoneAR, registerUserFromOnboarding } from '../lib/onboarding'

export default function RegisterScreen() {
  const params = useLocalSearchParams()
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const preselectedMode = modeParam === 'dni' || modeParam === 'email' ? modeParam : null

  const [mode, setMode] = useState<'dni' | 'email'>(preselectedMode || 'email')
  const [nombre, setNombre] = useState('')
  const [dni, setDni] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (loading) return

    const nombreLimpio = nombre.trim()
    const dniLimpio = normalizeDni(dni)
    const emailLimpio = email.trim().toLowerCase()
    const phoneNormalizado = normalizePhoneAR(telefono)
    const passwordLimpia = password.trim()

    if (!nombreLimpio || !dniLimpio || !emailLimpio || !telefono.trim() || !passwordLimpia) {
      Alert.alert('Datos incompletos', 'Completá nombre, DNI, email, teléfono y contraseña.')
      return
    }

    if (!/^\d{7,8}$/.test(dniLimpio)) {
      Alert.alert('DNI inválido', 'Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    if (!emailLimpio.includes('@')) {
      Alert.alert('Email inválido', 'Ingresá un email válido.')
      return
    }

    if (!phoneNormalizado) {
      Alert.alert('Teléfono inválido', 'Ingresá un teléfono de Argentina válido. Ejemplo: +54 9 11 1234 5678')
      return
    }

    if (passwordLimpia.length < 6) {
      Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.')
      return
    }

    try {
      setLoading(true)
      await registerUserFromOnboarding({
        dni: dniLimpio,
        nombre: nombreLimpio,
        email: emailLimpio,
        phone: phoneNormalizado,
        password: passwordLimpia,
        clienteId: null,
      })

      Alert.alert('Cuenta creada', 'Tu cuenta fue creada correctamente. Ahora iniciá sesión.', [
        { text: 'Ir al login', onPress: () => router.replace('/login' as any) },
      ])
    } catch (error: any) {
      Alert.alert('No se pudo crear la cuenta', error?.message || 'Intentá nuevamente en unos segundos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Podés registrarte por DNI o con email si el flujo de DNI no te reconoce.</Text>

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'dni' && styles.modeButtonActive]}
              onPress={() => setMode('dni')}
            >
              <Text style={[styles.modeButtonText, mode === 'dni' && styles.modeButtonTextActive]}>Crear cuenta con DNI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
              onPress={() => setMode('email')}
            >
              <Text style={[styles.modeButtonText, mode === 'email' && styles.modeButtonTextActive]}>Crear cuenta con email</Text>
            </TouchableOpacity>
          </View>

          {mode === 'dni' ? (
            <TouchableOpacity style={styles.dniFlowButton} onPress={() => router.push('/onboarding/dni' as any)}>
              <Text style={styles.dniFlowButtonText}>Ir al flujo guiado por DNI</Text>
            </TouchableOpacity>
          ) : null}

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
            placeholder="Email"
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
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  modeButtonActive: { backgroundColor: '#DBEAFE', borderColor: '#2563EB' },
  modeButtonText: { color: '#1D4ED8', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  modeButtonTextActive: { color: '#1E40AF' },
  dniFlowButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    alignItems: 'center',
  },
  dniFlowButtonText: { color: '#1D4ED8', fontWeight: '700' },
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
})
