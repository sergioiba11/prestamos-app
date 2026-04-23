import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

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
  visible,
  notifications,
  onMarkAllRead,
  anchorRef,
  onClose,
}: {
  visible: boolean
  notifications: AdminNotification[]
  onMarkAllRead: () => void
  anchorRef?: View | null
  onClose?: () => void
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!visible || !anchorRef) return

    anchorRef.measureInWindow((x, y, width, height) => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
      const panelWidth = 340
      const panelHeight = 420
      const margin = 8

      let left = x + width - panelWidth
      let top = y + height + 8

      if (left < margin) left = margin
      if (left + panelWidth > viewportWidth - margin) left = viewportWidth - panelWidth - margin
      if (top + panelHeight > viewportHeight - margin) top = Math.max(margin, y - panelHeight - 8)

      setPosition({ top, left })
    })
  }, [anchorRef, visible])

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return
    const reposition = () => {
      if (!anchorRef) return
      anchorRef.measureInWindow((x, y, width, height) => {
        const viewportHeight = window.innerHeight
        const panelWidth = 340
        const panelHeight = 420
        const margin = 8
        const viewportWidth = window.innerWidth
        let left = x + width - panelWidth
        let top = y + height + 8
        if (left < margin) left = margin
        if (left + panelWidth > viewportWidth - margin) left = viewportWidth - panelWidth - margin
        if (top + panelHeight > viewportHeight - margin) top = Math.max(margin, y - panelHeight - 8)
        setPosition({ top, left })
      })
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchorRef, visible])

  if (!visible) return null

  const content = (
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

  if (Platform.OS === 'web' && typeof document !== 'undefined' && position) {
    return require('react-dom').createPortal(
      <View style={styles.portalRoot} pointerEvents="box-none">
        <Pressable style={styles.portalBackdrop} onPress={onClose} />
        <View style={[styles.panelPortal, { top: position.top, left: position.left }]}>{content}</View>
      </View>,
      document.body
    )
  }

  return content
}

const styles = StyleSheet.create({
  panel: {
    width: 340,
    maxHeight: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    padding: 12,
    zIndex: 9999,
    elevation: 30,
    gap: 8,
  },
  portalRoot: {
    ...StyleSheet.absoluteFillObject,
    position: 'fixed',
    zIndex: 99999,
  },
  portalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    position: 'fixed',
  },
  panelPortal: {
    position: 'fixed',
    zIndex: 99999,
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
