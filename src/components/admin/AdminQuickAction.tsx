import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'

export function AdminQuickAction({
  label,
  icon,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#DBEAFE" />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 170,
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E40AF',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  text: { color: '#fff', fontWeight: '700' },
})
