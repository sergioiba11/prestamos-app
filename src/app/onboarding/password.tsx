import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { authTheme } from '../../constants/auth-theme'
import { useOnboarding } from '../../context/OnboardingContext'
import { registerUserFromOnboarding } from '../../lib/onboarding'

export default function CreatePasswordScreen() {
  const { state } = useOnboarding()
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [email, setEmail] = useState(state.identity?.email || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)

  const canContinue = useMemo(
    () => hasMinLength && hasNumber && password.length > 0 && password === repeatPassword,
    [hasMinLength, hasNumber, password, repeatPassword]
  )

  if (!state.isCodeValidated || !state.identity || !state.verifiedPhone) {
    router.replace('/onboarding/dni' as any)
    return null
  }

  const handleContinue = async () => {
    if (!canContinue) {
      setError('Revisá las reglas de contraseña y la confirmación.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await registerUserFromOnboarding({
        dni: state.identity.dni,
        nombre: state.identity.nombre,
        apellido: state.identity.apellido || '',
        password,
        email,
        phone: state.verifiedPhone,
      })

      router.push('/onboarding/biometria' as any)
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la cuenta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingScaffold title="Creá tu contraseña" subtitle="Vas a usarla para ingresar a CrediTodo.">
      <TextInput
        style={onboardingStyles.input}
        placeholder="Email de acceso"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={onboardingStyles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={(value) => {
          setPassword(value)
          if (error) setError('')
        }}
      />

      <TextInput
        style={onboardingStyles.input}
        placeholder="Repetir contraseña"
        secureTextEntry
        value={repeatPassword}
        onChangeText={setRepeatPassword}
      />

      <View>
        <Text style={{ color: hasMinLength ? authTheme.success : authTheme.textMuted }}>• Mínimo 8 caracteres</Text>
        <Text style={{ color: hasNumber ? authTheme.success : authTheme.textMuted }}>• Al menos un número</Text>
      </View>

      {error ? <Text style={onboardingStyles.errorText}>{error}</Text> : null}

      <TouchableOpacity style={onboardingStyles.buttonPrimary} onPress={handleContinue} disabled={loading}>
        <Text style={onboardingStyles.buttonPrimaryText}>{loading ? 'Creando...' : 'Continuar'}</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
