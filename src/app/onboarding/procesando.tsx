import { router } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { OnboardingScaffold } from '../../components/onboarding/OnboardingScaffold'
import { authTheme } from '../../constants/auth-theme'

export default function ProcessingScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/onboarding/validacion-identidad' as any)
    }, 1600)

    return () => clearTimeout(timer)
  }, [])

  return (
    <OnboardingScaffold title="Procesando" subtitle="Estamos preparando tu cuenta.">
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
        <ActivityIndicator size="large" color={authTheme.primary} />
        <Text style={{ color: authTheme.textMuted }}>Esto puede tardar unos segundos...</Text>
      </View>
    </OnboardingScaffold>
  )
}
