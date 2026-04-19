import { router } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'

export default function ValidationSuccessScreen() {
  const { state } = useOnboarding()

  if (!state.isCodeValidated) {
    router.replace('/onboarding/codigo' as any)
    return null
  }

  return (
    <OnboardingScaffold title="¡Excelente!" subtitle="Tu identidad fue validada con éxito.">
      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={() => router.push('/onboarding/password' as any)}
      >
        <Text style={onboardingStyles.buttonPrimaryText}>Continuar</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
