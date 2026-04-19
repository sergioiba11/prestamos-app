import { router } from 'expo-router'
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import { OnboardingScaffold, onboardingStyles } from '../../components/onboarding/OnboardingScaffold'
import { authTheme } from '../../constants/auth-theme'
import { useOnboarding } from '../../context/OnboardingContext'

export default function IdentityConfirmationScreen() {
  const { state, resetState, updateState } = useOnboarding()
  const identity = state.identity

  if (!identity) {
    router.replace('/onboarding/dni' as any)
    return null
  }

  return (
    <OnboardingScaffold title="Confirmación de identidad" subtitle="Verificá que los datos sean correctos.">
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>DNI</Text>
        <Text style={styles.infoValue}>{identity.dni}</Text>
        <Text style={styles.infoLabel}>Nombre</Text>
        <Text style={styles.infoValue}>{identity.nombre}</Text>
      </View>

      {identity.source === 'mock-temporal' ? (
        <Text style={onboardingStyles.helperText}>
          Datos mock temporales para demo. Reemplazar por datos reales de Supabase.
        </Text>
      ) : null}

      <TouchableOpacity
        style={onboardingStyles.buttonPrimary}
        onPress={() => {
          updateState({ isIdentityConfirmed: true })
          router.push('/onboarding/codigo' as any)
        }}
      >
        <Text style={onboardingStyles.buttonPrimaryText}>Sí, continuar</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={onboardingStyles.buttonSecondary}
        onPress={() => {
          resetState()
          router.replace('/onboarding/dni' as any)
        }}
      >
        <Text style={onboardingStyles.buttonSecondaryText}>No soy yo</Text>
      </TouchableOpacity>
    </OnboardingScaffold>
  )
}

const styles = StyleSheet.create({
  infoBox: {
    borderWidth: 1,
    borderColor: authTheme.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#F8FBFF',
    gap: 4,
  },
  infoLabel: {
    color: authTheme.textMuted,
    fontSize: 12,
  },
  infoValue: {
    color: authTheme.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
})
