import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../components/onboarding/OnboardingScaffold'
import { authTheme } from '../constants/auth-theme'
import {
  authenticateWithBiometrics,
  disableBiometric,
  enableBiometricForUser,
  getBiometricAvailability,
  getBiometricState,
} from '../lib/biometrics'
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
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [canLoginWithBiometric, setCanLoginWithBiometric] = useState(false)

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      const [{ data: sessionData }, availability, biometricState] = await Promise.all([
        supabase.auth.getSession(),
        getBiometricAvailability(),
        getBiometricState(),
      ])

      if (!mounted) return

      if (sessionData.session?.user?.id) {
        await goByRole(sessionData.session.user.id)
        return
      }

      setCanLoginWithBiometric(
        availability.available && biometricState.enabled && Boolean(biometricState.userId)
      )
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [])

  const askEnableBiometricAfterLogin = async (userId: string) => {
    const biometricState = await getBiometricState()
    if (biometricState.enabled && biometricState.userId === userId) {
      return
    }

    const availability = await getBiometricAvailability()
    if (!availability.supported || !availability.enrolled) {
      return
    }

    const accepted = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Ingreso rápido',
        '¿Querés activar ingreso con biometría para próximos accesos?',
        [
          { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Activar', onPress: () => resolve(true) },
        ]
      )
    })

    if (!accepted) return

    const auth = await authenticateWithBiometrics()
    if (!auth.success) {
      setError('No se pudo verificar tu identidad biométrica')
      return
    }

    await enableBiometricForUser(userId)
    setSuccess('Biometría activada correctamente')
    setCanLoginWithBiometric(true)
  }

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

      await askEnableBiometricAfterLogin(user.id)
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

  const handleBiometricLogin = async () => {
    setBiometricLoading(true)
    setError('')
    setSuccess('')

    try {
      const availability = await getBiometricAvailability()

      if (!availability.supported) {
        setError('Tu dispositivo no soporta biometría')
        return
      }

      if (!availability.enrolled) {
        setError('No tenés biometría configurada en este dispositivo')
        return
      }

      const authResult = await authenticateWithBiometrics()
      if (!authResult.success) {
        setError('No se pudo verificar tu identidad biométrica')
        return
      }

      const [{ data: sessionData }, biometricState] = await Promise.all([
        supabase.auth.getSession(),
        getBiometricState(),
      ])

      if (sessionData.session?.user?.id) {
        await goByRole(sessionData.session.user.id)
        return
      }

      if (biometricState.enabled) {
        setError('Tu sesión expiró. Ingresá nuevamente con tu método habitual')
      } else {
        setError('Tu sesión expiró. Ingresá nuevamente')
      }

      await disableBiometric()
      setCanLoginWithBiometric(false)
    } catch (err: any) {
      setError(err?.message || 'No se pudo usar biometría en este momento')
    } finally {
      setBiometricLoading(false)
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

      {canLoginWithBiometric ? (
        <TouchableOpacity
          style={[onboardingStyles.buttonSecondary, styles.biometricButton]}
          onPress={handleBiometricLogin}
          disabled={biometricLoading}
        >
          {biometricLoading ? (
            <ActivityIndicator color={authTheme.primary} />
          ) : (
            <Text style={[onboardingStyles.buttonSecondaryText, styles.biometricButtonText]}>
              Ingresar con biometría
            </Text>
          )}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={onboardingStyles.buttonPrimary} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={onboardingStyles.buttonPrimaryText}>Ingresar</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={onboardingStyles.buttonSecondary} onPress={() => router.push('/onboarding/dni' as any)}>
        <Text style={onboardingStyles.buttonSecondaryText}>Activar cuenta</Text>
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
  biometricButton: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  biometricButtonText: {
    color: '#1D4ED8',
  },
})
