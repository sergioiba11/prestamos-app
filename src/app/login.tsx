import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as Linking from 'expo-linking'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export const options = {
  headerShown: false,
}

const redirectTo = makeRedirectUri({
  scheme: 'prestamosapp',
})

async function goByRole(userId: string) {
  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()

  if (userError) {
    throw new Error('No se pudo obtener el rol del usuario')
  }

  const rol = userData?.rol

  if (rol === 'admin') {
    router.replace('/admin-home' as any)
    return
  }

  if (rol === 'empleado') {
    router.replace('/empleado-home' as any)
    return
  }

  router.replace('/cliente-home' as any)
}

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)

  if (errorCode) {
    throw new Error(errorCode)
  }

  const access_token =
    typeof params.access_token === 'string' ? params.access_token : undefined

  const refresh_token =
    typeof params.refresh_token === 'string' ? params.refresh_token : undefined

  if (!access_token || !refresh_token) return null

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })

  if (error) throw error

  return data.session
}

async function enviarRecuperacionPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
}

type LoadingAction = 'login' | 'google' | 'recovery' | 'resend' | null

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const passwordRef = useRef<TextInput>(null)

  const isLoading = loadingAction !== null

  useEffect(() => {
    let mounted = true

    const checkExistingSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (session?.user) {
        await goByRole(session.user.id)
      }
    }

    checkExistingSession()

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      void (async () => {
        try {
          const session = await createSessionFromUrl(url)

          if (session?.user) {
            await goByRole(session.user.id)
          }
        } catch (error: any) {
          setErrorMsg(error?.message || 'No se pudo completar Google')
        }
      })()
    })

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      void (async () => {
        if (!mounted) return

        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
          session?.user
        ) {
          await goByRole(session.user.id)
        }
      })()
    })

    return () => {
      mounted = false
      linkingSub.remove()
      authSubscription.unsubscribe()
    }
  }, [])

  const handleLogin = async () => {
    if (isLoading) return

    setErrorMsg('')
    setSuccessMsg('')

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Completá email y contraseña para continuar.')
      return
    }

    try {
      setLoadingAction('login')

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      })

      if (error) {
        const msg = error.message?.toLowerCase?.() || ''

        if (
          msg.includes('email not confirmed') ||
          msg.includes('not confirmed') ||
          msg.includes('confirmation')
        ) {
          setErrorMsg('Tu cuenta todavía no está activada. Revisá tu correo.')
          return
        }

        if (
          msg.includes('invalid login credentials') ||
          msg.includes('invalid credentials') ||
          msg.includes('invalid email or password')
        ) {
          setErrorMsg('Correo o contraseña incorrectos.')
          return
        }

        setErrorMsg(error.message || 'No se pudo iniciar sesión.')
        return
      }

      if (!data.user) {
        setErrorMsg('No se encontró el usuario.')
        return
      }

      await goByRole(data.user.id)
    } catch (error: any) {
      setErrorMsg(error?.message || 'No se pudo iniciar sesión.')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleGoogleLogin = async () => {
    if (isLoading) return

    setErrorMsg('')
    setSuccessMsg('')

    try {
      setLoadingAction('google')

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        })

        if (error) throw error
        return
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })

      if (error) throw error
      if (!data?.url) throw new Error('No se pudo abrir Google')

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      if (result.type === 'success') {
        const session = await createSessionFromUrl(result.url)

        if (session?.user) {
          await goByRole(session.user.id)
          return
        }
      }

      if (result.type !== 'cancel') {
        setErrorMsg('No se pudo completar el login con Google.')
      }
    } catch (error: any) {
      setErrorMsg(error?.message || 'No se pudo iniciar sesión con Google.')
    } finally {
      setLoadingAction(null)
    }
  }

  const handleForgotPassword = async () => {
    if (isLoading) return

    setErrorMsg('')
    setSuccessMsg('')

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) {
      setErrorMsg('Ingresá tu email para restablecer la contraseña.')
      return
    }

    try {
      setLoadingAction('recovery')
      const { error } = await enviarRecuperacionPassword(cleanEmail)

      if (error) throw error

      setSuccessMsg('Te enviamos un enlace para restablecer tu contraseña.')
    } catch (error: any) {
      setErrorMsg(error?.message || 'No se pudo enviar el correo de recuperación.')
    } finally {
      setLoadingAction(null)
    }
  }

  const reenviarActivacion = async () => {
    if (isLoading) return

    setErrorMsg('')
    setSuccessMsg('')

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail) {
      setErrorMsg('Ingresá tu email para reenviar la activación.')
      return
    }

    try {
      setLoadingAction('resend')

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      })

      if (error) throw error

      setSuccessMsg('Te reenviamos el correo de activación.')
      if (Platform.OS !== 'web') {
        Alert.alert('Correo enviado', 'Te reenviamos el correo de activación.')
      }
    } catch (error: any) {
      setErrorMsg(error?.message || 'No se pudo reenviar el correo.')
    } finally {
      setLoadingAction(null)
    }
  }

  const contenidoLogin = (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/images/logo-root.png')} style={styles.logo} contentFit="contain" />
        </View>

        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.subtitle}>Accedé a tu cuenta para continuar</Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, errorMsg ? styles.inputError : null]}
            placeholder="Email"
            placeholderTextColor="#7C8BA5"
            value={email}
            onChangeText={(text) => {
              setEmail(text)
              if (errorMsg) setErrorMsg('')
              if (successMsg) setSuccessMsg('')
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <TextInput
            ref={passwordRef}
            style={[styles.input, errorMsg ? styles.inputError : null]}
            placeholder="Contraseña"
            placeholderTextColor="#7C8BA5"
            secureTextEntry
            value={password}
            onChangeText={(text) => {
              setPassword(text)
              if (errorMsg) setErrorMsg('')
            }}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <Pressable onPress={handleForgotPassword} disabled={isLoading} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>
              {loadingAction === 'recovery'
                ? 'Enviando recuperación...'
                : '¿Olvidaste tu contraseña?'}
            </Text>
          </Pressable>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

          <TouchableOpacity
            style={[styles.buttonPrimary, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {loadingAction === 'login' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonPrimaryText}>Ingresar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, isLoading && styles.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={isLoading}
          >
            {loadingAction === 'google' ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.buttonSecondaryText}>Ingresar con Google</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.bottomLinks}>
          <TouchableOpacity
            onPress={reenviarActivacion}
            disabled={isLoading}
            style={styles.secondaryLinkWrap}
          >
            <Text style={styles.secondaryLinkText}>
              {loadingAction === 'resend'
                ? 'Reenviando activación...'
                : 'Reenviar correo de activación'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/register' as any)}
            disabled={isLoading}
            style={styles.registerLinkWrap}
          >
            <Text style={styles.registerLinkText}>¿No tenés cuenta? Registrate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  return Platform.OS === 'web' ? (
    <View style={styles.container}>
      <form
        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        onSubmit={(event) => {
          event.preventDefault()
          void handleLogin()
        }}
      >
        {contenidoLogin}
      </form>
    </View>
  ) : (
    <View style={styles.container}>{contenidoLogin}</View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  screen: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 72,
    height: 72,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#111C34',
    color: '#F8FAFC',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#273449',
    fontSize: 15,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 4,
  },
  forgotText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '500',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -2,
  },
  successText: {
    color: '#86EFAC',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -2,
  },
  buttonPrimary: {
    marginTop: 4,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSecondary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  bottomLinks: {
    marginTop: 16,
    gap: 10,
    alignItems: 'center',
  },
  secondaryLinkWrap: {
    paddingVertical: 2,
  },
  secondaryLinkText: {
    color: '#64748B',
    fontSize: 13,
  },
  registerLinkWrap: {
    paddingVertical: 4,
  },
  registerLinkText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
})
