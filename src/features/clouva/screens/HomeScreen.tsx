import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlowCard, QuickAction, SectionHeader, SmartInput } from '../components/base'
import { PageContainer } from '../layout/PageContainer'
import { clouvaTokens } from '../theme/tokens'

const actions = [
  { icon: 'musical-notes-outline' as const, label: 'Flows' },
  { icon: 'mic-outline' as const, label: 'Studio' },
  { icon: 'rocket-outline' as const, label: 'Launch' },
  { icon: 'sparkles-outline' as const, label: 'AI' },
]

export function ClouvaHomeScreen() {
  return (
    <PageContainer>
      <View style={styles.hero}>
        <Text style={styles.greeting}>Buen día, Flow ✨</Text>
        <Text style={styles.subtitle}>Tu sistema creativo premium para construir y lanzar arte real.</Text>
      </View>

      <SmartInput placeholder="Capturá una idea rápida..." />

      <SectionHeader title="Resumen rápido" action="Ver todo" />
      <View style={styles.grid}>
        <GlowCard title="Tareas críticas" subtitle="8 pendientes · 3 esta semana" />
        <GlowCard title="Progreso creativo" subtitle="72% de tu sprint activo" />
      </View>

      <SectionHeader title="Acciones rápidas" />
      <View style={styles.actions}>
        {actions.map((item) => (
          <QuickAction key={item.label} icon={item.icon} label={item.label} />
        ))}
      </View>

      <SectionHeader title="Actividad reciente" />
      <GlowCard title="Sesión guardada: Noche en Tokio" subtitle="Beat + letra + visual vinculados al Launch de junio." />

      <View style={styles.dock}>
        {['home', 'albums', 'add-circle', 'notifications', 'person'].map((icon) => (
          <Pressable key={icon} style={styles.dockBtn}>
            <Ionicons name={icon as any} size={20} color={icon === 'add-circle' ? clouvaTokens.colors.green : clouvaTokens.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </PageContainer>
  )
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  greeting: { color: clouvaTokens.colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: clouvaTokens.colors.textMuted, lineHeight: 20 },
  grid: { gap: 12 },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  dock: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: clouvaTokens.colors.border,
    backgroundColor: '#0B1020CC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dockBtn: { width: 44, alignItems: 'center' },
})
