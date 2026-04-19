import { router } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { useOnboarding } from '../../context/OnboardingContext'

export default function OptionalIdentityValidationScreen() {
  const { resetState } = useOnboarding()

  return (
    <OnboardingScaffold
      title="Vamos a validar tu identidad"
      subtitle="Este paso es opcional por ahora. Luego podés cargar tu DNI o selfie."
    >
      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={() => {
          resetState()
          router.replace('/cliente-home' as any)
        }}
      >
        <Text style={onboardingStyles.buttonPrimaryText}>Subir DNI / selfie (placeholder)</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={onboardingStyles.buttonSecondary}
        onPress={() => {
          resetState()
          router.replace('/cliente-home' as any)
        }}
      >
        <Text style={onboardingStyles.buttonSecondaryText}>Omitir por ahora</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}
