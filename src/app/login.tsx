import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../components/onboarding/OnboardingScaffold'
import { authTheme } from '../constants/auth-theme'
import { goByRole } from '../lib/auth-routing'
import { signInWithEmailOrDni } from '../lib/onboarding'
import { supabase } from '../lib/supabase'

type Mode = 'email' | 'dni'

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('email')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) {
        void goByRole(data.session.user.id)
      }
    })
  }, [])

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError('Completá los datos para ingresar.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const user = await signInWithEmailOrDni({
        identifier,
        password,
        mode,
      })
      await goByRole(user.id)
    } catch (err: any) {
      const message = err?.message || 'No se pudo iniciar sesión.'
      if (message.toLowerCase().includes('usuario no encontrado')) {
        setError('Usuario no encontrado.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (mode === 'dni') {
      setError('Para recuperar contraseña ingresá con Email.')
      return
    }

    try {
      const email = identifier.trim().toLowerCase()

      if (!email) {
        setError('Ingresá tu email para recuperar contraseña.')
        return
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setSuccess('Te enviamos un correo para restablecer tu contraseña.')
      setError('')
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar el correo de recuperación.')
      setSuccess('')
    }
  }

  return (
    <OnboardingScaffold title="Iniciar sesión" subtitle="Entrá con email o DNI.">
      <View style={styles.modeSwitch}>
        {(['email', 'dni'] as Mode[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.modeBtn, mode === item && styles.modeBtnActive]}
            onPress={() => {
              setMode(item)
              setIdentifier('')
              setError('')
              setSuccess('')
            }}
          >
            <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>
              {item === 'email' ? 'Email' : 'DNI'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={onboardingStyles.input}
        placeholder={mode === 'email' ? 'Email' : 'DNI'}
        keyboardType={mode === 'email' ? 'email-address' : 'number-pad'}
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={onboardingStyles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity onPress={handleForgotPassword}>
        <Text style={styles.link}>¿Olvidaste contraseña?</Text>
      </TouchableOpacity>

      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      <TouchableOpacity style={onboardingStyles.buttonPrimary} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={onboardingStyles.buttonPrimaryText}>Ingresar</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={onboardingStyles.buttonSecondary} onPress={() => router.push('/onboarding/dni' as any)}>
        <Text style={onboardingStyles.buttonSecondaryText}>Crear cuenta</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}

const styles = StyleSheet.create({
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#EAF2FC',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  modeText: {
    color: authTheme.textMuted,
    fontWeight: '600',
  },
  modeTextActive: {
    color: authTheme.primary,
  },
  link: {
    color: authTheme.primary,
    textAlign: 'right',
  },
  successText: {
    color: authTheme.success,
    fontSize: 13,
  },
})
