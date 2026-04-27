import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../../context/AppThemeContext'

export function AdminStatCard({
  label,
  value,
  subtitle,
  icon,
  tone,
  compact = false,
}: {
  label: string
  value: string
  subtitle?: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'blue' | 'violet' | 'teal' | 'orange'
  compact?: boolean
}) {
  const { theme } = useAppTheme()
  const colors = theme.colors
  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: colors.surface, borderColor: theme.isLight ? colors.border : toneStyles[tone].card.borderColor },
        toneStyles[tone].card,
      ]}
    >
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact, toneStyles[tone].iconWrap, theme.isLight && { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={compact ? 16 : 18} color={toneStyles[tone].iconColor} />
      </View>
      <Text style={[styles.label, compact && styles.labelCompact, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.value, compact && styles.valueCompact, { color: colors.textPrimary }]}>{value}</Text>
      {subtitle ? <Text style={[styles.subtitle, compact && styles.subtitleCompact, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    minWidth: 180,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#0B1220',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  cardCompact: {
    minWidth: 0,
    width: '48%',
    flexGrow: 0,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconWrapCompact: { width: 30, height: 30, borderRadius: 8, marginBottom: 6 },
  label: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  labelCompact: { fontSize: 10 },
  value: { color: '#fff', fontWeight: '800', fontSize: 18, marginTop: 3 },
  valueCompact: { fontSize: 17, marginTop: 2 },
  subtitle: { color: '#64748B', fontSize: 9, marginTop: 2 },
  subtitleCompact: { fontSize: 9, marginTop: 2 },
})

const toneStyles = {
  blue: { card: { borderColor: '#1D4ED8' }, iconWrap: { backgroundColor: '#1E3A8A' }, iconColor: '#93C5FD' },
  violet: { card: { borderColor: '#6D28D9' }, iconWrap: { backgroundColor: '#4C1D95' }, iconColor: '#C4B5FD' },
  teal: { card: { borderColor: '#0F766E' }, iconWrap: { backgroundColor: '#134E4A' }, iconColor: '#5EEAD4' },
  orange: { card: { borderColor: '#C2410C' }, iconWrap: { backgroundColor: '#7C2D12' }, iconColor: '#FDBA74' },
} as const
