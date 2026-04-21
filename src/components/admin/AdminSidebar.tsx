import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export type AdminNavKey =
  | 'inicio'
  | 'nuevo-prestamo'
  | 'registrar-pago'
  | 'clientes'
  | 'crear-cliente'
  | 'crear-empleado'
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
  { key: 'nuevo-prestamo', label: 'Nuevo préstamo', icon: 'wallet-outline' },
  { key: 'registrar-pago', label: 'Registrar pago', icon: 'cash-outline' },
  { key: 'clientes', label: 'Ver clientes', icon: 'people-outline' },
  { key: 'crear-cliente', label: 'Crear cliente', icon: 'person-circle-outline' },
  { key: 'crear-empleado', label: 'Crear empleado', icon: 'person-add-outline' },
  { key: 'config', label: 'Configuración', icon: 'settings-outline' },
]

export function AdminSidebar({ active, adminName, adminRole, onNavigate, onLogout, mobile, onCloseMobile }: Props) {
  return (
    <View style={[styles.sidebar, mobile && styles.sidebarMobile]}>
      <View>
        <View style={styles.logoWrap}>
          <View style={styles.logoBadge}>
            <Ionicons name="flash" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.logoText}>CrediTodo</Text>
            <Text style={styles.logoSub}>Panel Admin</Text>
          </View>
          {mobile ? (
            <TouchableOpacity onPress={onCloseMobile}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {navItems.map((item) => (
          <Pressable
            key={item.key}
            style={({ pressed }) => [styles.link, item.key === active && styles.linkActive, pressed && styles.linkHover]}
            onPress={() => onNavigate(item.key)}
          >
            <Ionicons name={item.icon} size={18} color={item.key === active ? '#BFDBFE' : '#94A3B8'} />
            <Text style={[styles.linkText, item.key === active && styles.linkTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.userName}>{adminName}</Text>
        <Text style={styles.userRole}>{adminRole || 'Administrador'}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: 270,
    backgroundColor: '#0A1120',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  sidebarMobile: { width: 290, height: '100%' },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  logoSub: { color: '#94A3B8', fontSize: 11 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 11, marginBottom: 4 },
  linkActive: { backgroundColor: '#1E3A8A', borderWidth: 1, borderColor: '#2563EB' },
  linkHover: { backgroundColor: '#172554' },
  linkText: { color: '#CBD5E1', fontWeight: '600' },
  linkTextActive: { color: '#DBEAFE' },
  footer: { borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12, gap: 6 },
  userName: { color: '#fff', fontWeight: '700' },
  userRole: { color: '#94A3B8', fontSize: 12, textTransform: 'capitalize' },
  logoutBtn: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingVertical: 9, alignItems: 'center' },
  logoutText: { color: '#E2E8F0', fontWeight: '700' },
})
