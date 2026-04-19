import { router } from 'expo-router'
import { useState } from 'react'
import { Text, TextInput, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'
import { lookupIdentityByDni, normalizeDni } from '../../lib/onboarding'

export default function OnboardingDniScreen() {
  const { updateState } = useOnboarding()
  const [dni, setDni] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    const cleanDni = normalizeDni(dni)

    if (cleanDni.length < 7 || cleanDni.length > 8) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const identity = await lookupIdentityByDni(cleanDni)

      if (!identity) {
        setError('Tu DNI todavía no fue habilitado. Contactate con la sucursal para activar tu cuenta.')
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
      setError('No pudimos validar tu DNI ahora. Intentá nuevamente en unos minutos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingScaffold
      title="Activar cuenta"
      subtitle="Ingresá tu DNI para validar que ya estás registrado por la sucursal."
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
        maxLength={14}
      />

      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={handleContinue}
        disabled={loading}
      >
        <Text style={onboardingStyles.buttonPrimaryText}>
          {loading ? 'Validando...' : 'Activar cuenta'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={onboardingStyles.buttonSecondary}
        onPress={() => router.back()}
        disabled={loading}
      >
        <Text style={onboardingStyles.buttonSecondaryText}>Volver</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
