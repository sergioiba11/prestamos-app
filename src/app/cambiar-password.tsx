import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function CambiarPassword() {
  const [passwordActual, setPasswordActual] = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [nonce, setNonce] = useState('')

  const [loadingEnviarCodigo, setLoadingEnviarCodigo] = useState(false)
  const [loadingGuardar, setLoadingGuardar] = useState(false)
  const [codigoEnviado, setCodigoEnviado] = useState(false)

  const [showActual, setShowActual] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)

  const validarPassword = (value: string) => {
    const limpia = value.trim()

    if (limpia.length < 8) return 'Debe tener al menos 8 caracteres'
    if (!/[A-Z]/.test(limpia)) return 'Debe tener al menos 1 mayúscula'
    if (!/[a-z]/.test(limpia)) return 'Debe tener al menos 1 minúscula'
    if (!/[0-9]/.test(limpia)) return 'Debe tener al menos 1 número'
    if (!/[^A-Za-z0-9]/.test(limpia)) return 'Debe tener al menos 1 símbolo'

    return null
  }

  const passwordError = useMemo(() => {
    if (!nuevaPassword.trim()) return null
    return validarPassword(nuevaPassword)
  }, [nuevaPassword])

  const passwordsMatch = useMemo(() => {
    if (!confirmarPassword.trim()) return true
    return nuevaPassword.trim() === confirmarPassword.trim()
  }, [nuevaPassword, confirmarPassword])

  const puedeEnviarCodigo =
    !!passwordActual.trim() &&
    !!nuevaPassword.trim() &&
    !!confirmarPassword.trim() &&
    !passwordError &&
    passwordsMatch &&
    passwordActual.trim() !== nuevaPassword.trim() &&
    !loadingEnviarCodigo

  const puedeGuardar =
    codigoEnviado &&
    !!nonce.trim() &&
    !!nuevaPassword.trim() &&
    !!confirmarPassword.trim() &&
    !passwordError &&
    passwordsMatch &&
    !loadingGuardar

  const limpiarCampos = () => {
    setPasswordActual('')
    setNuevaPassword('')
    setConfirmarPassword('')
    setNonce('')
    setCodigoEnviado(false)
    setShowActual(false)
    setShowNueva(false)
    setShowConfirmar(false)
  }

  const enviarCodigo = async () => {
    if (!puedeEnviarCodigo) {
      if (!passwordActual.trim()) {
        Alert.alert('Error', 'Ingresá tu contraseña actual')
        return
      }

      if (passwordError) {
        Alert.alert('Error', passwordError)
        return
      }

      if (!passwordsMatch) {
        Alert.alert('Error', 'Las nuevas contraseñas no coinciden')
        return
      }

      if (passwordActual.trim() === nuevaPassword.trim()) {
        Alert.alert('Error', 'La nueva contraseña no puede ser igual a la actual')
        return
      }

      return
    }

    try {
      setLoadingEnviarCodigo(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user?.email) throw new Error('No se pudo obtener el usuario actual')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordActual.trim(),
      })

      if (signInError) {
        throw new Error('La contraseña actual no es correcta')
      }

      const { error: reauthError } = await supabase.auth.reauthenticate()

      if (reauthError) throw reauthError

      setCodigoEnviado(true)
      Alert.alert(
        'Código enviado',
        'Te enviamos un código al email. Revisalo y pegalo abajo para confirmar el cambio.'
      )
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo enviar el código')
    } finally {
      setLoadingEnviarCodigo(false)
    }
  }

  const guardarNuevaPassword = async () => {
    if (!puedeGuardar) {
      if (!codigoEnviado) {
        Alert.alert('Error', 'Primero pedí el código')
        return
      }

      if (!nonce.trim()) {
        Alert.alert('Error', 'Ingresá el código del email')
        return
      }

      if (passwordError) {
        Alert.alert('Error', passwordError)
        return
      }

      if (!passwordsMatch) {
        Alert.alert('Error', 'Las nuevas contraseñas no coinciden')
        return
      }

      return
    }

    try {
      setLoadingGuardar(true)

      const { error } = await supabase.auth.updateUser({
        password: nuevaPassword.trim(),
        nonce: nonce.trim(),
      })

      if (error) throw error

      limpiarCampos()
      Alert.alert('Éxito', 'Contraseña cambiada correctamente')

      await supabase.auth.signOut()
      router.replace('/login')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cambiar la contraseña')
    } finally {
      setLoadingGuardar(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Cambiar contraseña</Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={loadingEnviarCodigo || loadingGuardar}
        >
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Seguridad de la cuenta</Text>
          <Text style={styles.helpTop}>
            Para cambiar la contraseña, verificá tu identidad con tu contraseña
            actual y un código enviado por email.
          </Text>

          <Text style={styles.label}>Contraseña actual</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Ingresá tu contraseña actual"
              placeholderTextColor="#64748B"
              secureTextEntry={!showActual}
              value={passwordActual}
              onChangeText={setPasswordActual}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowActual(!showActual)}
            >
              <Text style={styles.eyeText}>{showActual ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Nueva contraseña</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Ej: NuevaClave#2026"
              placeholderTextColor="#64748B"
              secureTextEntry={!showNueva}
              value={nuevaPassword}
              onChangeText={setNuevaPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNueva(!showNueva)}
            >
              <Text style={styles.eyeText}>{showNueva ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Repetí la nueva contraseña"
              placeholderTextColor="#64748B"
              secureTextEntry={!showConfirmar}
              value={confirmarPassword}
              onChangeText={setConfirmarPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmar(!showConfirmar)}
            >
              <Text style={styles.eyeText}>
                {showConfirmar ? 'Ocultar' : 'Ver'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rulesBox}>
            <Text style={styles.rule}>• 8 o más caracteres</Text>
            <Text style={styles.rule}>• 1 mayúscula</Text>
            <Text style={styles.rule}>• 1 minúscula</Text>
            <Text style={styles.rule}>• 1 número</Text>
            <Text style={styles.rule}>• 1 símbolo</Text>
          </View>

          {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}

          {!!confirmarPassword.trim() && !passwordsMatch && (
            <Text style={styles.errorText}>Las nuevas contraseñas no coinciden</Text>
          )}

          {!!nuevaPassword.trim() &&
            !!passwordActual.trim() &&
            passwordActual.trim() === nuevaPassword.trim() && (
              <Text style={styles.errorText}>
                La nueva contraseña no puede ser igual a la actual
              </Text>
            )}

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              (!puedeEnviarCodigo || loadingEnviarCodigo) && styles.disabledButton,
            ]}
            onPress={enviarCodigo}
            disabled={!puedeEnviarCodigo || loadingEnviarCodigo}
          >
            <Text style={styles.secondaryButtonText}>
              {loadingEnviarCodigo ? 'Enviando código...' : 'Enviar código'}
            </Text>
          </TouchableOpacity>

          {codigoEnviado && (
            <>
              <View style={styles.separator} />

              <Text style={styles.codeInfo}>
                Revisá tu correo e ingresá el código de verificación.
              </Text>

              <Text style={styles.label}>Código de verificación</Text>
              <TextInput
                style={styles.inputSolo}
                placeholder="Ingresá el código del email"
                placeholderTextColor="#64748B"
                value={nonce}
                onChangeText={setNonce}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!puedeGuardar || loadingGuardar) && styles.disabledButton,
                ]}
                onPress={guardarNuevaPassword}
                disabled={!puedeGuardar || loadingGuardar}
              >
                <Text style={styles.saveButtonText}>
                  {loadingGuardar ? 'Guardando...' : 'Confirmar cambio'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    flex: 1,
  },

  backButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
  },

  content: {
    padding: 16,
    paddingBottom: 32,
  },

  card: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
  },

  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },

  helpTop: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },

  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#020817',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },

  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
  },

  inputSolo: {
    backgroundColor: '#020817',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    marginBottom: 12,
  },

  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#1E293B',
    backgroundColor: '#111827',
  },

  eyeText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 12,
  },

  rulesBox: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
  },

  rule: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
  },

  errorText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },

  secondaryButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },

  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },

  separator: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 16,
  },

  codeInfo: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },

  saveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },

  saveButtonText: {
    color: '#020817',
    fontWeight: '800',
    fontSize: 15,
  },

  disabledButton: {
    opacity: 0.5,
  },
})