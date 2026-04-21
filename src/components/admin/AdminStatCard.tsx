import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'

export function AdminStatCard({
  label,
  value,
  subtitle,
  icon,
  tone,
}: {
  label: string
  value: string
  subtitle?: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'blue' | 'violet' | 'teal' | 'orange'
}) {
  return (
    <View style={[styles.card, toneStyles[tone].card]}>
      <View style={[styles.iconWrap, toneStyles[tone].iconWrap]}>
        <Ionicons name={icon} size={18} color={toneStyles[tone].iconColor} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    minWidth: 210,
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#0B1220',
    padding: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  value: { color: '#fff', fontWeight: '800', fontSize: 24, marginTop: 5 },
  subtitle: { color: '#64748B', fontSize: 11, marginTop: 4 },
})

const toneStyles = {
  blue: { card: { borderColor: '#1D4ED8' }, iconWrap: { backgroundColor: '#1E3A8A' }, iconColor: '#93C5FD' },
  violet: { card: { borderColor: '#6D28D9' }, iconWrap: { backgroundColor: '#4C1D95' }, iconColor: '#C4B5FD' },
  teal: { card: { borderColor: '#0F766E' }, iconWrap: { backgroundColor: '#134E4A' }, iconColor: '#5EEAD4' },
  orange: { card: { borderColor: '#C2410C' }, iconWrap: { backgroundColor: '#7C2D12' }, iconColor: '#FDBA74' },
} as const
