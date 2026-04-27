import { router, Stack } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { supabase } from '../lib/supabase'

type FocusField = 'actual' | 'nueva' | 'confirmar' | null

export default function CambiarPassword() {
  const { width } = useWindowDimensions()
  const isMobile = width < 700

  const [passwordActual, setPasswordActual] = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')

  const [loadingGuardar, setLoadingGuardar] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [focusedField, setFocusedField] = useState<FocusField>(null)

  const [showActual, setShowActual] = useState(false)
  const [showNueva, setShowNueva] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)

  const cleanCurrent = passwordActual.trim()
  const cleanNew = nuevaPassword.trim()
  const cleanConfirm = confirmarPassword.trim()

  const passwordChecks = useMemo(
    () => ({
      min: cleanNew.length >= 8,
      upper: /[A-Z]/.test(cleanNew),
      lower: /[a-z]/.test(cleanNew),
      number: /[0-9]/.test(cleanNew),
      symbol: /[^A-Za-z0-9]/.test(cleanNew),
    }),
    [cleanNew]
  )

  const rulesPassed = useMemo(
    () => Object.values(passwordChecks).filter(Boolean).length,
    [passwordChecks]
  )

  const allRulesPassed = rulesPassed === 5
  const passwordsMatch = !cleanConfirm || cleanNew === cleanConfirm
  const sameAsCurrent = !!cleanCurrent && !!cleanNew && cleanCurrent === cleanNew

  const strengthLabel = useMemo(() => {
    if (!cleanNew) return null
    if (rulesPassed <= 2) return 'Débil'
    if (rulesPassed <= 4) return 'Media'
    return 'Fuerte'
  }, [cleanNew, rulesPassed])

  const getBlockingMessage = () => {
    if (!cleanCurrent) return 'Ingresá tu contraseña actual.'
    if (!cleanNew) return 'Ingresá una nueva contraseña.'
    if (!cleanConfirm) return 'Confirmá la nueva contraseña.'
    if (sameAsCurrent) return 'La nueva contraseña debe ser distinta a la actual.'
    if (!passwordsMatch) return 'La confirmación no coincide con la nueva contraseña.'
    if (!allRulesPassed)
      return 'La nueva contraseña no cumple los requisitos de seguridad.'
    return null
  }

  const canSubmit = !getBlockingMessage() && !loadingGuardar

  const handleSubmit = async () => {
    setErrorMessage('')
    setSuccessMessage('')

    const blockingMessage = getBlockingMessage()
    if (blockingMessage) {
      Alert.alert('Faltan datos', blockingMessage)
      setErrorMessage(blockingMessage)
      return
    }

    try {
      setLoadingGuardar(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      console.log('[cambiar-password] user email:', user?.email)

      if (!user?.email) {
        throw new Error('No se pudo obtener el email del usuario actual.')
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: cleanCurrent,
      })

      if (signInError) {
        console.error(
          '[cambiar-password] error validar contraseña actual:',
          signInError
        )
        setErrorMessage('Contraseña actual incorrecta')
        return
      }

      console.log('[cambiar-password] contraseña actual validada')

      const { error: updateError } = await supabase.auth.updateUser({
        password: cleanNew,
      })

      if (updateError) {
        console.error('[cambiar-password] error actualizar password:', updateError)
        throw updateError
      }

      console.log('[cambiar-password] password actualizado ok')

      setSuccessMessage('Contraseña actualizada correctamente. Redirigiendo...')

      await supabase.auth.signOut()
      router.replace('/login')
    } catch (error: any) {
      setErrorMessage(error?.message || 'No se pudo actualizar la contraseña.')
    } finally {
      setLoadingGuardar(false)
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { maxWidth: 620, width: isMobile ? '100%' : 620 }]}> 
          <TouchableOpacity
            style={styles.backInline}
            onPress={() => router.back()}
            disabled={loadingGuardar}
          >
            <Text style={styles.backInlineText}>← Volver</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Cambiar contraseña</Text>
          <Text style={styles.subtitle}>
            Actualizá tu clave de acceso de forma segura.
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>🛡️</Text>
            <Text style={styles.infoText}>
              Por seguridad, primero validamos tu contraseña actual.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Seguridad de la cuenta</Text>

          {!!errorMessage && (
            <View style={styles.errorAlert}>
              <Text style={styles.errorAlertText}>{errorMessage}</Text>
            </View>
          )}

          {!!successMessage && (
            <View style={styles.successAlert}>
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
          )}

          <Text style={styles.label}>Contraseña actual</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === 'actual' && styles.inputWrapFocused,
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Ingresá tu contraseña actual"
              placeholderTextColor="#64748B"
              secureTextEntry={!showActual}
              value={passwordActual}
              onChangeText={setPasswordActual}
              autoCapitalize="none"
              onFocus={() => setFocusedField('actual')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowActual(!showActual)}
            >
              <Text style={styles.eyeText}>{showActual ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Nueva contraseña</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === 'nueva' && styles.inputWrapFocused,
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Ej: NuevaClave#2026"
              placeholderTextColor="#64748B"
              secureTextEntry={!showNueva}
              value={nuevaPassword}
              onChangeText={setNuevaPassword}
              autoCapitalize="none"
              onFocus={() => setFocusedField('nueva')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowNueva(!showNueva)}
            >
              <Text style={styles.eyeText}>{showNueva ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <View
            style={[
              styles.inputWrap,
              focusedField === 'confirmar' && styles.inputWrapFocused,
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Repetí la nueva contraseña"
              placeholderTextColor="#64748B"
              secureTextEntry={!showConfirmar}
              value={confirmarPassword}
              onChangeText={setConfirmarPassword}
              autoCapitalize="none"
              onFocus={() => setFocusedField('confirmar')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmar(!showConfirmar)}
            >
              <Text style={styles.eyeText}>{showConfirmar ? 'Ocultar' : 'Ver'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rulesBox}>
            <RuleItem ok={passwordChecks.min} text="8 o más caracteres" />
            <RuleItem ok={passwordChecks.upper} text="1 mayúscula" />
            <RuleItem ok={passwordChecks.lower} text="1 minúscula" />
            <RuleItem ok={passwordChecks.number} text="1 número" />
            <RuleItem ok={passwordChecks.symbol} text="1 símbolo" />
          </View>

          {!!strengthLabel && (
            <Text style={styles.strengthText}>Seguridad: {strengthLabel}</Text>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.cancelButton, isMobile && styles.mobileButton]}
              onPress={() => router.back()}
              disabled={loadingGuardar}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, isMobile && styles.mobileButton, !canSubmit && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loadingGuardar}
            >
              <Text style={styles.primaryButtonText}>
                {loadingGuardar ? 'Actualizando…' : 'Actualizar contraseña'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function RuleItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleIcon, ok && styles.ruleIconOk]}>{ok ? '✓' : '•'}</Text>
      <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },

  card: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },

  backInline: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 6,
  },

  backInlineText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },

  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },

  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 4,
  },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E3A8A',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },

  infoIcon: {
    fontSize: 18,
  },

  infoText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },

  errorAlert: {
    backgroundColor: '#3F1D25',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },

  errorAlertText: {
    color: '#FCA5A5',
    fontWeight: '600',
    fontSize: 13,
  },

  successAlert: {
    backgroundColor: '#132A1D',
    borderColor: '#166534',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },

  successAlertText: {
    color: '#86EFAC',
    fontWeight: '600',
    fontSize: 13,
  },

  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#020817',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    overflow: 'hidden',
  },

  inputWrapFocused: {
    borderColor: '#3B82F6',
  },

  input: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },

  eyeButton: {
    borderLeftWidth: 1,
    borderLeftColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#111827',
  },

  eyeText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 12,
  },

  rulesBox: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  ruleIcon: {
    color: '#64748B',
    fontWeight: '700',
    width: 12,
    textAlign: 'center',
  },

  ruleIconOk: {
    color: '#22C55E',
  },

  ruleText: {
    color: '#94A3B8',
    fontSize: 13,
  },

  ruleTextOk: {
    color: '#E2E8F0',
  },

  strengthText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 4,
  },

  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },

  cancelButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 140,
  },

  cancelButtonText: {
    color: '#E2E8F0',
    textAlign: 'center',
    fontWeight: '700',
  },

  primaryButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 220,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },

  mobileButton: {
    width: '100%',
  },

  disabledButton: {
    opacity: 0.5,
  },
})
