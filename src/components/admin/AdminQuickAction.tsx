import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export function AdminQuickAction({
  label,
  subtitle,
  icon,
  onPress,
}: {
  label: string
  subtitle?: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#BFDBFE" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="arrow-forward" size={16} color="#64748B" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    minWidth: 245,
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E3A8A',
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E3A8A',
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#fff', fontWeight: '800', fontSize: 14 },
  subtitle: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
})
