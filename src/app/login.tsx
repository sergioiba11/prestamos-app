import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import {
  Alert,
  Platform,
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
  router.replace('/')
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

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
          Alert.alert('Error', error?.message || 'No se pudo completar Google')
        }
      })()
    })

   const {
  data: { subscription: authSubscription },
} = supabase.auth.onAuthStateChange((event, session) => {
  void (async () => {
    if (!mounted) return

    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
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
    if (loading) return

    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Completá todos los campos')
      return
    }

    try {
      setLoading(true)

      const cleanEmail = email.trim().toLowerCase()
      const cleanPassword = password.trim()

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
          Alert.alert(
            'Email no confirmado',
            'Primero revisá tu correo y activá la cuenta.'
          )
          return
        }

        if (
          msg.includes('invalid login credentials') ||
          msg.includes('invalid credentials')
        ) {
          Alert.alert('Error', 'Email o contraseña incorrectos')
          return
        }

        throw error
      }

      if (!data.user) {
        throw new Error('No se encontró el usuario')
      }

      await goByRole(data.user.id)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    if (loading) return

    try {
      setLoading(true)

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
        Alert.alert('Error', 'No se pudo completar el login con Google')
      }
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'No se pudo iniciar sesión con Google'
      )
    } finally {
      setLoading(false)
    }
  }

  const reenviarActivacion = async () => {
    if (loading) return

    if (!email.trim()) {
      Alert.alert('Error', 'Ingresá el email')
      return
    }

    try {
      setLoading(true)

      const cleanEmail = email.trim().toLowerCase()

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      })

      if (error) throw error

      Alert.alert('Correo enviado', 'Te reenviamos el correo de activación.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo reenviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar sesión</Text>

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
        placeholder="Contraseña"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.googleButton, loading && styles.buttonDisabled]}
        onPress={handleGoogleLogin}
        disabled={loading}
      >
        <Text style={styles.googleButtonText}>
          {loading ? 'Procesando...' : 'Ingresar con Google'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={reenviarActivacion}
        disabled={loading}
      >
        <Text style={styles.secondaryText}>Reenviar correo de activación</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => router.push('/register' as any)}
        disabled={loading}
      >
        <Text style={styles.secondaryText}>¿No tenés cuenta? Registrate</Text>
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
    textAlign: 'center',
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
  googleButton: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  googleButtonText: {
    color: '#0F172A',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondary: {
    marginTop: 12,
  },
  secondaryText: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 14,
  },
})