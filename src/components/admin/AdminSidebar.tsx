import { Ionicons } from '@expo/vector-icons'
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAppTheme } from '../../context/AppThemeContext'

export type AdminNavKey =
  | 'inicio'
  | 'prestamos'
  | 'historial'
  | 'pagos-pendientes'
  | 'nuevo-prestamo'
  | 'registrar-pago'
  | 'clientes'
  | 'crear-cliente'
  | 'crear-empleado'
  | 'actividad'
  | 'config'

type Props = {
  active: AdminNavKey
  adminName: string
  adminRole: string
  onNavigate: (key: AdminNavKey) => void
  onLogout: () => void
  mobile?: boolean
  onCloseMobile?: () => void
}

const navItems: Array<{ key: AdminNavKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'inicio', label: 'Inicio', icon: 'home-outline' },
  { key: 'prestamos', label: 'Préstamos', icon: 'document-text-outline' },
  { key: 'historial', label: 'Historial', icon: 'time-outline' },
  { key: 'pagos-pendientes', label: 'Pagos pendientes', icon: 'hourglass-outline' },
  { key: 'nuevo-prestamo', label: 'Nuevo préstamo', icon: 'wallet-outline' },
  { key: 'registrar-pago', label: 'Registrar pago', icon: 'cash-outline' },
  { key: 'clientes', label: 'Ver clientes', icon: 'people-outline' },
  { key: 'crear-cliente', label: 'Crear cliente', icon: 'person-circle-outline' },
  { key: 'crear-empleado', label: 'Crear empleado', icon: 'person-add-outline' },
  { key: 'actividad', label: 'Actividad', icon: 'pulse-outline' },
  { key: 'config', label: 'Configuración', icon: 'settings-outline' },
]

export function AdminSidebar({ active, adminName, adminRole, onNavigate, onLogout, mobile, onCloseMobile }: Props) {
  const { theme } = useAppTheme()
  const colors = theme.colors
  const role = String(adminRole || '').toLowerCase()
  const visibleItems = navItems.filter((item) => {
    if (role === 'admin') return true
    if (role === 'empleado') return item.key !== 'crear-empleado' && item.key !== 'config'
    return item.key === 'inicio' || item.key === 'config'
  })

  return (
    <View style={[styles.sidebar, mobile && styles.sidebarMobile, { backgroundColor: colors.sidebarBg, borderRightColor: colors.border }]}>
      <View>
        <View style={[styles.logoWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
            <Image source={require('../../../assets/images/logo-sidebar.png')} style={{ width: 28, height: 28, resizeMode: 'contain' }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.logoText, { color: colors.textPrimary }]}>CrediTodo</Text>
            <Text style={[styles.logoSub, { color: colors.textSecondary }]}>Panel Admin</Text>
          </View>
          {mobile ? (
            <TouchableOpacity onPress={onCloseMobile}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.navList}>
          {visibleItems.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.link, item.key === active && styles.linkActive, pressed && styles.linkHover, item.key === active && { borderColor: colors.primary, backgroundColor: theme.isLight ? colors.primarySoft : 'rgba(37,99,235,0.2)' }, pressed && { backgroundColor: theme.isLight ? colors.surfaceSoft : '#111C30' } ]}
              onPress={() => onNavigate(item.key)}
            >
              <View style={[styles.navIconWrap, { borderColor: colors.border, backgroundColor: colors.surface }, item.key === active && styles.navIconWrapActive, item.key === active && { borderColor: colors.primary, backgroundColor: theme.isLight ? colors.primarySoft : '#1E3A8A' }]}>
                <Ionicons name={item.icon} size={17} color={item.key === active ? (theme.isLight ? colors.primary : '#DBEAFE') : colors.textSecondary} />
              </View>
              <Text style={[styles.linkText, { color: colors.textSecondary }, item.key === active && styles.linkTextActive, item.key === active && { color: theme.isLight ? colors.primary : '#DBEAFE' }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={[styles.userBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={[styles.userAvatar, { backgroundColor: theme.isLight ? colors.primarySoft : '#1E3A8A' }]}><Ionicons name="person" size={16} color={theme.isLight ? colors.primary : '#BFDBFE'} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>{adminName}</Text>
            <Text style={[styles.userRole, { color: colors.textSecondary }]}>{adminRole || 'Administrador'}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={16} color={colors.textPrimary} />
          <Text style={[styles.logoutText, { color: colors.textPrimary }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: 282,
    backgroundColor: '#030B1A',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  sidebarMobile: { width: 290, height: '100%' },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#0B1220',
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#1E40AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  logoSub: { color: '#94A3B8', fontSize: 11 },
  navList: { gap: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7 },
  linkActive: { backgroundColor: 'rgba(37,99,235,0.2)', borderWidth: 1, borderColor: '#2563EB' },
  linkHover: { backgroundColor: '#111C30' },
  navIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconWrapActive: { borderColor: '#2563EB', backgroundColor: '#1E3A8A' },
  linkText: { color: '#CBD5E1', fontWeight: '600', fontSize: 14 },
  linkTextActive: { color: '#DBEAFE' },
  footer: { borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12, gap: 10 },
  userBox: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0B1220',
  },
  userAvatar: { width: 30, height: 30, borderRadius: 999, backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center' },
  userName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  userRole: { color: '#94A3B8', fontSize: 11, textTransform: 'capitalize', marginTop: 1 },
  logoutBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  logoutText: { color: '#E2E8F0', fontWeight: '700', fontSize: 13 },
})
