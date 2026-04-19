import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export type AdminNotification = {
  id: string
  titulo: string
  descripcion: string
  leida: boolean
  created_at: string
}

function formatDate(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function AdminNotificationsPanel({
  notifications,
  onMarkAllRead,
}: {
  notifications: AdminNotification[]
  onMarkAllRead: () => void
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Bandeja de entrada</Text>
        <TouchableOpacity onPress={onMarkAllRead}>
          <Text style={styles.markRead}>Marcar todas</Text>
        </TouchableOpacity>
      </View>

      {notifications.length === 0 ? (
        <Text style={styles.empty}>No hay notificaciones.</Text>
      ) : (
        notifications.map((item) => (
          <View key={item.id} style={[styles.item, !item.leida && styles.itemUnread]}>
            <Text style={styles.itemTitle}>{item.titulo}</Text>
            <Text style={styles.itemDesc}>{item.descripcion || 'Sin detalle'}</Text>
            <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
          </View>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 54,
    right: 0,
    width: 340,
    maxHeight: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 12,
    zIndex: 50,
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontWeight: '700' },
  markRead: { color: '#93C5FD', fontWeight: '700', fontSize: 12 },
  empty: { color: '#94A3B8', fontSize: 12 },
  item: { borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', backgroundColor: '#111827', padding: 10 },
  itemUnread: { borderColor: '#2563EB' },
  itemTitle: { color: '#fff', fontWeight: '700' },
  itemDesc: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  itemDate: { color: '#64748B', fontSize: 11, marginTop: 4 },
})
