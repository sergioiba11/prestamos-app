import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { clouvaTokens } from '../theme/tokens'

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {!!action && <Text style={styles.action}>{action}</Text>}
    </View>
  )
}

export function GlowCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </View>
  )
}

export function QuickAction({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <Pressable style={styles.quickAction}>
      <Ionicons name={icon} size={20} color={clouvaTokens.colors.green} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  )
}

export function SmartInput({ placeholder }: { placeholder: string }) {
  return <TextInput placeholder={placeholder} placeholderTextColor={clouvaTokens.colors.textMuted} style={styles.input} />
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: clouvaTokens.colors.text, fontSize: 20, fontWeight: '700' },
  action: { color: clouvaTokens.colors.violet, fontWeight: '600' },
  card: {
    backgroundColor: clouvaTokens.colors.surface,
    borderColor: clouvaTokens.colors.border,
    borderWidth: 1,
    borderRadius: clouvaTokens.radius.lg,
    padding: clouvaTokens.spacing.lg,
    gap: clouvaTokens.spacing.sm,
    shadowColor: clouvaTokens.colors.violet,
    shadowOpacity: 0.25,
    shadowRadius: 14,
  },
  cardTitle: { color: clouvaTokens.colors.text, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: clouvaTokens.colors.textMuted, lineHeight: 20 },
  quickAction: {
    backgroundColor: clouvaTokens.colors.surfaceAlt,
    borderRadius: clouvaTokens.radius.md,
    padding: clouvaTokens.spacing.md,
    alignItems: 'center',
    width: 88,
    gap: clouvaTokens.spacing.sm,
    borderWidth: 1,
    borderColor: clouvaTokens.colors.border,
  },
  quickLabel: { color: clouvaTokens.colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: clouvaTokens.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: clouvaTokens.colors.border,
    borderRadius: clouvaTokens.radius.md,
    padding: clouvaTokens.spacing.md,
    color: clouvaTokens.colors.text,
  },
})
