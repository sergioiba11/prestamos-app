import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Text, TextInput, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'

const DEMO_CODE = '123456'

export default function VerificationCodeScreen() {
  const { state, updateState } = useOnboarding()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(45)

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const destination = useMemo(() => {
    if (state.identity?.telefono) {
      return `al ${state.identity.telefono}`
    }

    return 'a tu número registrado'
  }, [state.identity?.telefono])

  if (!state.isIdentityConfirmed) {
    router.replace('/onboarding/dni' as any)
    return null
  }

  const validate = () => {
    if (code.length < 4) {
      setError('Ingresá el código completo.')
      return
    }

    if (code !== DEMO_CODE) {
      setError('Código incorrecto. Intentá nuevamente.')
      return
    }

    updateState({ isCodeValidated: true })
    router.push('/onboarding/exito' as any)
  }

  return (
    <OnboardingScaffold title="Verificación por código" subtitle={`Enviamos un código SMS ${destination}.`}>
      <TextInput
        style={onboardingStyles.input}
        placeholder="Código de 6 dígitos"
        keyboardType="number-pad"
        value={code}
        onChangeText={(value) => {
          setCode(value.replace(/\D/g, ''))
          if (error) setError('')
        }}
        maxLength={6}
      />

      <Text style={onboardingStyles.helperText}>Código demo temporal: {DEMO_CODE}</Text>
      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      <TouchableOpacity style={onboardingStyles.buttonPrimary} onPress={validate}>
        <Text style={onboardingStyles.buttonPrimaryText}>Validar código</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={onboardingStyles.buttonSecondary}
        disabled={secondsLeft > 0}
        onPress={() => setSecondsLeft(45)}
      >
        <Text style={onboardingStyles.buttonSecondaryText}>
          {secondsLeft > 0 ? `Reenviar en ${secondsLeft}s` : 'Reenviar código'}
        </Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
