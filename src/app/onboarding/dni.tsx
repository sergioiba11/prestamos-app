import { router } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'
import { lookupIdentityByDni } from '../../lib/onboarding'

export default function OnboardingDniScreen() {
  const { updateState } = useOnboarding()
  const [dni, setDni] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    const cleanDni = dni.replace(/\D/g, '')

    if (cleanDni.length < 7 || cleanDni.length > 8) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const identity = await lookupIdentityByDni(cleanDni)

      if (!identity) {
        setError('No encontramos un cliente con ese DNI.')
        return
      }

      updateState({
        dni: cleanDni,
        identity,
        isIdentityConfirmed: false,
        isCodeValidated: false,
      })
      router.push('/onboarding/identidad' as any)
    } catch {
      setError('No pudimos validar el DNI. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingScaffold
      title="Ingresá tu DNI"
      subtitle="Vamos a buscar tus datos para empezar el onboarding"
    >
      <TextInput
        style={onboardingStyles.input}
        placeholder="DNI"
        keyboardType="number-pad"
        value={dni}
        onChangeText={(value) => {
          setDni(value)
          if (error) setError('')
        }}
        maxLength={8}
      />

      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={handleContinue}
        disabled={loading}
      >
        <Text style={onboardingStyles.buttonPrimaryText}>
          {loading ? 'Validando...' : 'Continuar'}
        </Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
