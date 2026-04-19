import { Redirect } from 'expo-router'

export default function OnboardingIndex() {
  return <Redirect href={'/onboarding/dni' as any} />
}
