import { router } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'

export default function BiometricsOptInScreen() {
  const { state, updateState } = useOnboarding()

  if (!state.isCodeValidated) {
    router.replace('/onboarding/dni' as any)
    return null
  }

  const saveAndContinue = (enabled: boolean) => {
    updateState({ biometricsEnabled: enabled })
    router.push('/onboarding/procesando' as any)
  }

  return (
    <OnboardingScaffold
      title="Activar ingreso simple"
      subtitle="Podés usar biometría para entrar más rápido en tu próximo inicio de sesión."
    >
      <TouchableOpacity style={onboardingStyles.buttonPrimary} onPress={() => saveAndContinue(true)}>
        <Text style={onboardingStyles.buttonPrimaryText}>Activar</Text>
      </TouchableOpacity>

      <TouchableOpacity style={onboardingStyles.buttonSecondary} onPress={() => saveAndContinue(false)}>
        <Text style={onboardingStyles.buttonSecondaryText}>Más tarde</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
