import { LinearGradient } from 'expo-linear-gradient'
import { PropsWithChildren } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { clouvaTokens } from '../theme/tokens'

export function PageContainer({ children }: PropsWithChildren) {
  return (
    <LinearGradient colors={['#04050A', '#070C18']} style={styles.gradient}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  content: { padding: clouvaTokens.spacing.lg, gap: clouvaTokens.spacing.lg, paddingBottom: 120 },
})
