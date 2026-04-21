import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { authTheme } from '../../constants/auth-theme'
import { useOnboarding } from '../../context/OnboardingContext'
import { isValidPhoneAR, maskPhone, normalizePhoneAR, sendPhoneOtp, verifyPhoneOtp } from '../../lib/onboarding'

const RESEND_COOLDOWN = 45

export default function VerificationCodeScreen() {
  const { state, updateState } = useOnboarding()
  const [phone, setPhone] = useState(state.verifiedPhone || state.identity?.telefono || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!state.isIdentityConfirmed) {
      return
    }

    const normalized = normalizePhoneAR(phone)
    if (!normalized || state.isCodeValidated) {
      return
    }

    void handleSendCode(normalized)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isIdentityConfirmed])

  useEffect(() => {
    if (!secondsLeft) return

    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsLeft])

  const normalizedPhone = normalizePhoneAR(phone)
  const canSend = isValidPhoneAR(phone) && !sending
  const canVerify = /^\d{4}$/.test(code) && !verifying

  const destination = useMemo(() => {
    if (!normalizedPhone) return 'a tu teléfono'
    return `al ${maskPhone(normalizedPhone)}`
  }, [normalizedPhone])


  if (!state.isIdentityConfirmed || !state.identity) {
    router.replace('/onboarding/dni' as any)
    return null
  }

  const handleSendCode = async (targetPhone?: string) => {
    const phoneToSend = targetPhone || normalizedPhone

    if (!phoneToSend) {
      setError('Ingresá un teléfono válido de Argentina (+549...).')
      return
    }

    setSending(true)
    setError('')
    setStatus('')
    setCode('')

    try {
      const sentPhone = await sendPhoneOtp(phoneToSend)

      updateState({
        verifiedPhone: sentPhone,
        isCodeValidated: false,
        identity: {
          ...state.identity,
          telefono: sentPhone,
        },
      })
      setPhone(sentPhone)
      setSecondsLeft(RESEND_COOLDOWN)
      setStatus('Te enviamos un código por SMS')
    } catch (err: any) {
      setError(err?.message || 'No pudimos enviar el código por SMS.')
    } finally {
      setSending(false)
    }
  }

  const validate = async () => {
    if (!canVerify) {
      setError('Ingresá el código completo de 4 dígitos.')
      return
    }

    if (!normalizedPhone) {
      setError('Ingresá un teléfono válido para verificar.')
      return
    }

    setVerifying(true)
    setError('')
    setStatus('')

    try {
      const session = await verifyPhoneOtp({
        phone: normalizedPhone,
        token: code,
      })

      if (!session.user.phone_confirmed_at) {
        throw new Error('No pudimos validar la verificación del teléfono. Intentá nuevamente.')
      }

      updateState({
        isCodeValidated: true,
        verifiedPhone: normalizedPhone,
      })

      Alert.alert('Listo', 'Tu teléfono fue verificado correctamente')
      router.push('/onboarding/password' as any)
    } catch (err: any) {
      const message = err?.message || 'No se pudo validar el código.'
      if (message.toLowerCase().includes('expirado')) {
        setError('Código expirado')
      } else if (message.toLowerCase().includes('incorrecto')) {
        setError('Código incorrecto')
      } else {
        setError(message)
      }
    } finally {
      setVerifying(false)
    }
  }

  return (
    <OnboardingScaffold title="Validá tu número" subtitle={`Te enviamos un código por SMS ${destination}.`}>
      <TextInput
        style={onboardingStyles.input}
        placeholder="+5491122334455"
        keyboardType="phone-pad"
        autoCapitalize="none"
        value={phone}
        onChangeText={(value) => {
          const sanitized = value.replace(/[^\d+]/g, '')
          setPhone(sanitized)
          setCode('')
          setStatus('')
          setError('')
          if (state.isCodeValidated || state.verifiedPhone !== normalizePhoneAR(sanitized)) {
            updateState({ isCodeValidated: false, verifiedPhone: '' })
          }
        }}
        autoComplete="tel"
      />

      <View style={styles.codeWrapper}>
        {[0, 1, 2, 3].map((index) => {
          const digit = code[index] || ''

          return (
            <View key={index} style={[styles.codeCell, digit ? styles.codeCellFilled : undefined]}>
              <Text style={styles.codeText}>{digit}</Text>
            </View>
          )
        })}
      </View>

      <TextInput
        style={styles.hiddenInput}
        value={code}
        onChangeText={(value) => {
          const cleaned = value.replace(/\D/g, '').slice(0, 4)
          setCode(cleaned)
          if (error) setError('')
        }}
        keyboardType="number-pad"
        maxLength={4}
        autoFocus
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
      />

      <Text style={onboardingStyles.helperText}>Ingresá el código de 4 dígitos que te enviamos por SMS.</Text>
      {status ? <Text style={styles.successText}>{status}</Text> : null}
      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[onboardingStyles.buttonPrimary, (!canVerify || verifying) && styles.disabledButton]}
        onPress={validate}
        disabled={!canVerify || verifying}
      >
        {verifying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={onboardingStyles.buttonPrimaryText}>Verificar código</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[onboardingStyles.buttonSecondary, (!canSend || secondsLeft > 0) && styles.disabledButton]}
        disabled={!canSend || secondsLeft > 0}
        onPress={() => handleSendCode()}
      >
        {sending ? (
          <ActivityIndicator color={authTheme.primary} />
        ) : (
          <Text style={onboardingStyles.buttonSecondaryText}>
            {secondsLeft > 0 ? `Reenviar código en ${secondsLeft} segundos` : 'Reenviar código'}
          </Text>
        )}
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}

const styles = StyleSheet.create({
  codeWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  codeCell: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: authTheme.border,
    backgroundColor: '#F8FBFF',
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCellFilled: {
    borderColor: authTheme.primary,
    backgroundColor: '#EAF2FC',
  },
  codeText: {
    fontSize: 28,
    letterSpacing: 2,
    fontWeight: '700',
    color: authTheme.text,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0.02,
    height: 1,
    width: 1,
  },
  successText: {
    color: authTheme.success,
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.6,
  },
})
