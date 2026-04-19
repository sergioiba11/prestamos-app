import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { authTheme } from '../../constants/auth-theme'

type Props = {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function OnboardingScaffold({ title, subtitle, children }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.brand}>CrediTodo</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.body}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export const onboardingStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: authTheme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#F8FBFF',
    color: authTheme.text,
    fontSize: 16,
  },
  buttonPrimary: {
    backgroundColor: authTheme.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#E8F3FE',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C6E5FB',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: authTheme.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: authTheme.danger,
    fontSize: 13,
  },
  helperText: {
    color: authTheme.textMuted,
    fontSize: 13,
  },
})

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: authTheme.background,
  },
  keyboardWrap: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: authTheme.card,
    borderRadius: 24,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 2,
  },
  brand: {
    color: authTheme.secondary,
    fontWeight: '700',
    marginBottom: 6,
  },
  title: {
    color: authTheme.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: authTheme.textMuted,
    marginTop: 8,
    fontSize: 14,
  },
  body: {
    marginTop: 24,
    gap: 12,
  },
})
