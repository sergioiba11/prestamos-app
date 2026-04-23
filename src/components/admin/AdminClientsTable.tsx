import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ClientePrestamoActivo } from '../../lib/admin-dashboard'

function toInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'CL'
}

function formatDate(value: string) {
  if (!value || value === '—') return '—'
  const [yy, mm, dd] = value.split('-')
  return yy && mm && dd ? `${dd}/${mm}/${yy}` : value
}

function money(v: number) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

export function AdminClientsTable({
  rows,
  onView,
  onEdit,
  onHistory,
}: {
  rows: ClientePrestamoActivo[]
  onView: (row: ClientePrestamoActivo) => void
  onEdit: (row: ClientePrestamoActivo) => void
  onHistory: (row: ClientePrestamoActivo) => void
}) {
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRefs = useRef<Record<string, View | null>>({})

  const activeRow = useMemo(() => rows.find((row) => row.prestamoId === menuOpenFor) || null, [menuOpenFor, rows])

  const updateMenuPosition = useCallback((prestamoId: string) => {
    const trigger = triggerRefs.current[prestamoId]
    if (!trigger) return

    trigger.measureInWindow((x, y, width, height) => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
      const menuWidth = 190
      const menuHeight = 132
      const margin = 8

      let left = x + width - menuWidth
      let top = y + height + 8

      if (left < margin) left = margin
      if (left + menuWidth > viewportWidth - margin) left = viewportWidth - menuWidth - margin
      if (top + menuHeight > viewportHeight - margin) top = Math.max(margin, y - menuHeight - 8)

      setMenuPosition({ top, left })
    })
  }, [])

  const toggleMenu = useCallback(
    (prestamoId: string) => {
      setMenuOpenFor((prev) => {
        if (prev === prestamoId) {
          setMenuPosition(null)
          return null
        }

        setTimeout(() => updateMenuPosition(prestamoId), 0)
        return prestamoId
      })
    },
    [updateMenuPosition]
  )

  useEffect(() => {
    if (!menuOpenFor || Platform.OS !== 'web') return

    const handleReposition = () => updateMenuPosition(menuOpenFor)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [menuOpenFor, updateMenuPosition])

  const closeMenu = useCallback(() => {
    setMenuOpenFor(null)
    setMenuPosition(null)
  }, [])

  const portalMenu =
    Platform.OS === 'web' &&
    typeof document !== 'undefined' &&
    menuOpenFor &&
    menuPosition &&
    activeRow
      ? require('react-dom').createPortal(
          <View style={styles.portalRoot} pointerEvents="box-none">
            <Pressable style={styles.portalBackdrop} onPress={closeMenu} />
            <View style={[styles.menuPortal, { top: menuPosition.top, left: menuPosition.left }]}>
              <TouchableOpacity onPress={() => { closeMenu(); onView(activeRow) }}><Text style={styles.menuItem}>Ver detalles</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { closeMenu(); onEdit(activeRow) }}><Text style={styles.menuItem}>Editar cliente</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { closeMenu(); onHistory(activeRow) }}><Text style={styles.menuItem}>Historial pagos</Text></TouchableOpacity>
            </View>
          </View>,
          document.body
        )
      : null

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableWrap}>
          <TableHeader />
          {rows.map((row) => (
            <View key={row.prestamoId} style={styles.row}>
              <View style={[styles.cell, styles.clientCell]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{toInitials(row.nombre)}</Text></View>
                <View>
                  <Text style={styles.name}>{row.nombre}</Text>
                  <Text style={styles.email}>{row.email || 'Sin email'}</Text>
                </View>
              </View>

              <Text style={[styles.cell, styles.text]}>{row.dni}</Text>
              <Text style={[styles.cell, styles.text]}>{row.telefono}</Text>
              <Text style={[styles.cell, styles.text]}>{money(row.prestamoActivo)}</Text>
              <Text style={[styles.cell, styles.text]}>{formatDate(row.proximoPago)}</Text>
              <View style={[styles.cell, styles.statusCell]}><StatusBadge status={row.estado} /></View>
              <View style={[styles.cell, styles.actionsCell]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onView(row)}>
                  <Ionicons name="eye-outline" size={16} color="#BFDBFE" />
                </TouchableOpacity>
                <View
                  collapsable={false}
                  ref={(node) => {
                    triggerRefs.current[row.prestamoId] = node
                  }}
                >
                  <TouchableOpacity style={styles.iconBtn} onPress={() => toggleMenu(row.prestamoId)}>
                    <Ionicons name="ellipsis-horizontal" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      {portalMenu}
    </>
  )
}

function TableHeader() {
  const headers = ['Cliente', 'DNI', 'Teléfono', 'Préstamo activo', 'Próximo pago', 'Estado', 'Acciones']
  return (
    <View style={styles.headerRow}>
      {headers.map((h, index) => (
        <Text key={h} style={[styles.headerText, index === 0 ? styles.clientHeader : styles.headerCell]}>{h}</Text>
      ))}
    </View>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const warning = s.includes('venc') || s.includes('mora') || s.includes('atras')

  return (
    <View style={[styles.badge, warning ? styles.badgeWarn : styles.badgeOk]}>
      <Text style={styles.badgeText}>{warning ? 'Atención' : 'Activo'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tableWrap: { minWidth: 1010, width: '100%', overflow: 'visible' },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingVertical: 11,
    marginBottom: 4,
  },
  headerText: { color: '#94A3B8', fontWeight: '700', fontSize: 12, paddingHorizontal: 12 },
  clientHeader: { width: 286 },
  headerCell: { width: 120 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 10,
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  cell: { paddingHorizontal: 12 },
  clientCell: { width: 286, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusCell: { width: 120 },
  actionsCell: { width: 120, flexDirection: 'row', gap: 8 },
  text: { width: 120, color: '#E2E8F0' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#1E3A8A',
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#DBEAFE', fontWeight: '800', fontSize: 12 },
  name: { color: '#fff', fontWeight: '700' },
  email: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', borderWidth: 1 },
  badgeOk: { backgroundColor: '#134E4A', borderColor: '#0F766E' },
  badgeWarn: { backgroundColor: '#7C2D12', borderColor: '#C2410C' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1220',
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
  menuPortal: {
    position: 'fixed',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 8,
    gap: 8,
    minWidth: 140,
    zIndex: 99999,
    elevation: 30,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  menuItem: { color: '#E2E8F0', fontSize: 12 },
})
