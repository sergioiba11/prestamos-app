import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.tableWrap}>
        <TableHeader />
        {rows.map((row) => (
          <View key={row.prestamoId} style={styles.row}>
            <View style={[styles.cell, styles.clientCell]}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{toInitials(row.nombre)}</Text></View>
              <View>
                <Text style={styles.name}>{row.nombre}</Text>
                <Text style={styles.email}>{row.email}</Text>
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
              <View>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setMenuOpenFor((prev) => (prev === row.prestamoId ? null : row.prestamoId))}>
                  <Ionicons name="ellipsis-horizontal" size={16} color="#94A3B8" />
                </TouchableOpacity>
                {menuOpenFor === row.prestamoId ? (
                  <View style={styles.menu}>
                    <TouchableOpacity onPress={() => { setMenuOpenFor(null); onView(row) }}><Text style={styles.menuItem}>Ver detalle</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setMenuOpenFor(null); onEdit(row) }}><Text style={styles.menuItem}>Editar cliente</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setMenuOpenFor(null); onHistory(row) }}><Text style={styles.menuItem}>Historial pagos</Text></TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
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
  const atrasado = s === 'atrasado' || s === 'en_mora'

  return (
    <View style={[styles.badge, atrasado ? styles.badgeWarn : styles.badgeOk]}>
      <Text style={styles.badgeText}>{atrasado ? 'Atrasado' : 'Activo'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tableWrap: { minWidth: 980, width: '100%' },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#0B1220',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingVertical: 10,
  },
  headerText: { color: '#94A3B8', fontWeight: '700', fontSize: 12, paddingHorizontal: 12 },
  clientHeader: { width: 270 },
  headerCell: { width: 118 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingVertical: 10,
    alignItems: 'center',
  },
  cell: { paddingHorizontal: 12 },
  clientCell: { width: 270, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusCell: { width: 118 },
  actionsCell: { width: 118, flexDirection: 'row', gap: 8 },
  text: { width: 118, color: '#E2E8F0' },
  avatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#DBEAFE', fontWeight: '700', fontSize: 12 },
  name: { color: '#fff', fontWeight: '700' },
  email: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeOk: { backgroundColor: '#134E4A' },
  badgeWarn: { backgroundColor: '#7C2D12' },
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
  menu: {
    position: 'absolute',
    top: 34,
    right: 0,
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 8,
    gap: 8,
    minWidth: 130,
    zIndex: 40,
  },
  menuItem: { color: '#E2E8F0', fontSize: 12 },
})
