import { Link, router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'
import { normalizeDni, startRegistrationByDni } from '../../lib/onboarding'

export default function OnboardingDniScreen() {
  const { updateState } = useOnboarding()
  const [dni, setDni] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [activeDni, setActiveDni] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    const cleanDni = normalizeDni(dni)

    if (cleanDni.length < 7 || cleanDni.length > 8) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.')
      return
    }

    setLoading(true)
    setActiveDni(false)
    setError('')
    setStatus('Verificando DNI…')

    try {
      const result = await startRegistrationByDni(cleanDni)

      if (result.status === 'active') {
        setStatus('')
        setActiveDni(true)
        setError('Este DNI ya tiene una cuenta activa.')
        return
      }

      updateState({
        dni: cleanDni,
        identity: result.identity,
        registrationStatus: result.status,
        isIdentityConfirmed: true,
        isCodeValidated: false,
        verifiedPhone: result.identity.telefono || '',
      })

      setStatus('Continuá con la verificación')
      router.push('/onboarding/codigo' as any)
    } catch (err: any) {
      setStatus('')
      setError(err?.message || 'No pudimos iniciar el registro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingScaffold title="Crear cuenta" subtitle="Ingresá tu DNI para iniciar el registro.">
      <TextInput
        style={onboardingStyles.input}
        placeholder="DNI"
        keyboardType="number-pad"
        value={dni}
        onChangeText={(value) => {
          setDni(value)
          setStatus('')
          setActiveDni(false)
          if (error) setError('')
        }}
        maxLength={14}
      />

      {status ? <Text style={onboardingStyles.helperText}>{status}</Text> : null}
      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      {activeDni ? (
        <View style={{ gap: 10 }}>
          <Link href={'/login' as any} asChild>
            <TouchableOpacity style={onboardingStyles.buttonSecondary}>
              <Text style={onboardingStyles.buttonSecondaryText}>Iniciá sesión</Text>
            </TouchableOpacity>
          </Link>

          <Link href={'/login' as any} asChild>
            <TouchableOpacity style={onboardingStyles.buttonSecondary}>
              <Text style={onboardingStyles.buttonSecondaryText}>Recuperá tu cuenta</Text>
            </TouchableOpacity>
          </Link>
        </View>
      ) : null}

      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={handleContinue}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={onboardingStyles.buttonPrimaryText}>Continuar</Text>
        )}
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
