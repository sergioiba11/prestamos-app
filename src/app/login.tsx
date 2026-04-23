import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { registerLoginActivity } from '../lib/activity'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [canLoginWithBiometric, setCanLoginWithBiometric] = useState(false)
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      const [{ data: sessionData }, biometricState] = await Promise.all([
        supabase.auth.getSession(),
        getBiometricState(),
      ])

      if (!mounted) return

      if (sessionData.session?.user?.id) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData.user?.email_confirmed_at) {
          if (!userError) {
            console.warn('[auth] getUser devolvió email_confirmed_at vacío al abrir login', {
              email: userData.user?.email || null,
            })
            setPendingConfirmationEmail((userData.user?.email || '').toLowerCase())
            setError('Tenés que confirmar tu correo antes de ingresar.')
          }
          await supabase.auth.signOut()
          setCanLoginWithBiometric(biometricState.enabled)
          return
        }

        await goByRole(sessionData.session.user.id)
        return
      }

      await supabase.auth.signOut()
      setCanLoginWithBiometric(biometricState.enabled)
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
        'Ingreso rápido con huella',
        '¿Querés activar huella o rostro para tus próximos ingresos?',
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
    const trimmedIdentifier = identifier.trim()

    if (!trimmedIdentifier) {
      setError('Ingresá DNI o correo')
      return
    }

    if (!password.trim()) {
      setError('Ingresá tu contraseña')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    setPendingConfirmationEmail('')

    try {
      const { email } = await signInWithEmailOrDni({
        identifier: trimmedIdentifier,
        password,
        mode: 'auto',
      })

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        await supabase.auth.signOut()
        setError('No se pudo validar tu sesión. Intentá nuevamente.')
        return
      }

      if (!userData.user.email_confirmed_at) {
        console.warn('[auth] getUser devolvió email_confirmed_at vacío', {
          email: userData.user.email || email,
        })
        await supabase.auth.signOut()
        setPendingConfirmationEmail((userData.user.email || email || '').toLowerCase())
        setError('Tenés que confirmar tu correo antes de ingresar.')
        return
      }

      await askEnableBiometricAfterLogin(userData.user.id)
      try {
        await registerLoginActivity(userData.user.id)
      } catch (activityError) {
        console.warn('[login] no se pudo registrar actividad de login', activityError)
      }
      await goByRole(userData.user.id)
    } catch (err: any) {
      const normalizedMessage = String(err?.message || '').toLowerCase()
      const normalizedCode = String(err?.code || '').toLowerCase()
      const isEmailNotConfirmed =
        normalizedMessage.includes('email_not_confirmed') || normalizedCode.includes('email_not_confirmed')

      if (isEmailNotConfirmed) {
        const resolvedEmail = String(err?.resolvedEmail || '').toLowerCase()
        setPendingConfirmationEmail(resolvedEmail)
        await supabase.auth.signOut()
        setError('Tenés que confirmar tu correo antes de ingresar.')
        return
      }

      setError(err?.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    const emailToResend = pendingConfirmationEmail.trim().toLowerCase()

    if (!emailToResend) {
      setError('Ingresá tu correo para reenviar la confirmación.')
      return
    }

    try {
      setResendLoading(true)
      setError('')
      setSuccess('')

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: emailToResend,
      })
      // Si no llegan correos, revisar SMTP propio en Supabase Auth

      if (resendError) {
        console.warn('[auth] falló resend de confirmación', {
          email: emailToResend,
          code: (resendError as any)?.code || null,
          message: resendError.message,
        })
        throw resendError
      }

      setSuccess('Te reenviamos el correo de confirmación.')
    } catch (err: any) {
      setError(err?.message || 'No se pudo reenviar el correo de confirmación.')
    } finally {
      setResendLoading(false)
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

      setError('Tu sesión expiró. Ingresá nuevamente con tu método habitual')
      if (biometricState.enabled) {
        await disableBiometric()
        setCanLoginWithBiometric(false)
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo usar biometría en este momento')
    } finally {
      setBiometricLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={['#0A1F44', '#123B82', '#1D6FE8']} style={styles.headerGradient}>
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Iniciar sesión</Text>
            <Text style={styles.subtitle}>Ingresá con DNI o correo y tu contraseña.</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color="#6B7A99" />
              <TextInput
                style={styles.input}
                placeholder="DNI o correo"
                placeholderTextColor="#93A0BA"
                autoCapitalize="none"
                value={identifier}
                onChangeText={(value) => {
                  setIdentifier(value)
                  if (error) setError('')
                }}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color="#6B7A99" />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor="#93A0BA"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  if (error) setError('')
                }}
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#6B7A99"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => router.push('/recover-password' as any)} style={styles.inlineLinkWrap}>
              <Text style={styles.inlineLink}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}

            {pendingConfirmationEmail ? (
              <TouchableOpacity
                style={styles.resendButton}
                onPress={handleResendConfirmation}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color="#1D4ED8" />
                ) : (
                  <Text style={styles.resendButtonText}>Reenviar correo de confirmación</Text>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Ingresar</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.createAccountButton} onPress={() => router.push('/register' as any)}>
              <Text style={styles.createAccountText}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Ingreso rápido</Text>
            <View style={styles.dividerLine} />
          </View>

          {canLoginWithBiometric ? (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricLogin}
              disabled={biometricLoading}
            >
              {biometricLoading ? (
                <ActivityIndicator color={authTheme.primary} />
              ) : (
                <>
                  <Ionicons name="finger-print-outline" size={22} color={authTheme.primary} />
                  <Text style={styles.biometricButtonText}>Ingreso rápido con huella</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EAF3FF',
  },
  headerGradient: {
    paddingTop: Platform.OS === 'web' ? 26 : 12,
    paddingBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logo: {
    width: 178,
    height: 54,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 20,
    shadowColor: '#1A2B4C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 7,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A1F44',
  },
  subtitle: {
    color: '#5F6F8F',
    fontSize: 14,
    marginBottom: 8,
  },
  inputWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D8E6FA',
    backgroundColor: '#F8FBFF',
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
  },
  inlineLinkWrap: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  inlineLink: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 4,
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  createAccountButton: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#ECF5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '700',
  },
  resendButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#C9DAF4',
  },
  dividerText: {
    color: '#5F6F8F',
    fontSize: 13,
    fontWeight: '600',
  },
  biometricButton: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  biometricButtonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
  successText: {
    color: '#16A34A',
    fontSize: 13,
  },
})
