import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
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
import { getRecoveryTokensFromUrl } from '../lib/auth-redirect'
import { supabase } from '../lib/supabase'

const MIN_PASSWORD_LENGTH = 6

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [bootLoading, setBootLoading] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let mounted = true

    const bootstrapRecovery = async () => {
      try {
        setError('')

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const tokenData = getRecoveryTokensFromUrl(window.location.href)

          if (tokenData?.type === 'recovery') {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
            })

            if (sessionError) throw sessionError

            if (mounted) setRecoveryReady(true)
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted && session?.user) {
          setRecoveryReady(true)
        } else if (mounted) {
          setRecoveryReady(false)
          setError('El enlace es inválido o venció. Solicitá uno nuevo.')
        }
      } catch (_err: any) {
        if (mounted) {
          setRecoveryReady(false)
          setError('El enlace es inválido o venció. Solicitá uno nuevo.')
        }
      } finally {
        if (mounted) setBootLoading(false)
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryReady(true)
        setError('')
        return
      }

      if (event === 'SIGNED_OUT') {
        setRecoveryReady(false)
        return
      }

      if (session?.user) {
        setRecoveryReady(true)
      }
    })

    void bootstrapRecovery()

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const formDisabled = useMemo(() => {
    return loading || bootLoading || !recoveryReady
  }, [loading, bootLoading, recoveryReady])

  const handleUpdatePassword = async () => {
    if (formDisabled) return

    const cleanPassword = password.trim()
    const cleanConfirm = confirmPassword.trim()

    if (!cleanPassword || !cleanConfirm) {
      setError('Completá ambos campos.')
      return
    }

    if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (cleanPassword !== cleanConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { error: updateError } = await supabase.auth.updateUser({
        password: cleanPassword,
      })

      if (updateError) throw updateError

      setSuccess('Contraseña actualizada correctamente.')
      await supabase.auth.signOut()
      setTimeout(() => {
        router.replace('/login' as any)
      }, 1200)
    } catch (_err: any) {
      setError('El enlace es inválido o venció. Solicitá uno nuevo.')
      setSuccess('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>Restablecer contraseña</Text>
          <Text style={styles.subtitle}>Ingresá una nueva contraseña para tu cuenta.</Text>

          <TextInput
            style={styles.input}
            placeholder="Nueva contraseña"
            secureTextEntry
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              if (error) setError('')
            }}
            editable={!formDisabled}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirmar nueva contraseña"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value)
              if (error) setError('')
            }}
            editable={!formDisabled}
          />

          {bootLoading ? (
            <View style={styles.inlineRow}>
              <ActivityIndicator color="#1D4ED8" />
              <Text style={styles.loadingText}>Validando enlace...</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, formDisabled && styles.buttonDisabled]}
            disabled={formDisabled}
            onPress={handleUpdatePassword}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Guardar contraseña</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/recover-password' as any)}
            disabled={loading}
          >
            <Text style={styles.secondaryText}>Solicitar nuevo enlace</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghostButton} onPress={() => router.replace('/login' as any)} disabled={loading}>
            <Text style={styles.ghostText}>Volver a iniciar sesión</Text>
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
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: '#1E3A8A', fontSize: 13 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.65 },
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
  ghostButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  ghostText: { color: '#1E3A8A', fontWeight: '600', fontSize: 14 },
  errorText: { color: '#DC2626', fontSize: 13 },
  successText: { color: '#16A34A', fontSize: 13 },
})
