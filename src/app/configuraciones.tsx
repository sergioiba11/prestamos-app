import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function Configuraciones() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Configuraciones</Text>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 🔐 SEGURIDAD (DESTACADO) */}
        <TouchableOpacity
          style={[styles.card, styles.cardActive]}
          onPress={() => router.push('/cambiar-password')}
        >
          <Text style={styles.cardTitleActive}>Seguridad</Text>
          <Text style={styles.cardTextActive}>
            Cambiar contraseña de tu cuenta
          </Text>
        </TouchableOpacity>

        {/* 🔒 RESTO (DESACTIVADO) */}
        <View style={[styles.card, styles.cardDisabled]}>
          <Text style={styles.cardTitleDisabled}>Cobros y mora</Text>
          <Text style={styles.cardTextDisabled}>
            Próximamente vas a poder ajustar días de gracia, mora diaria, castigo y reglas de cobro.
          </Text>
        </View>

        <View style={[styles.card, styles.cardDisabled]}>
          <Text style={styles.cardTitleDisabled}>Préstamos</Text>
          <Text style={styles.cardTextDisabled}>
            Próximamente: intereses por cuotas, límites, modalidades y configuraciones rápidas.
          </Text>
        </View>

        <View style={[styles.card, styles.cardDisabled]}>
          <Text style={styles.cardTitleDisabled}>Clientes y empleados</Text>
          <Text style={styles.cardTextDisabled}>
            Próximamente: permisos, estados, edición rápida y gestión del equipo.
          </Text>
        </View>

        <View style={[styles.card, styles.cardDisabled]}>
          <Text style={styles.cardTitleDisabled}>Marca y panel</Text>
          <Text style={styles.cardTextDisabled}>
            Próximamente: logo, colores, textos del negocio y accesos rápidos personalizados.
          </Text>
        </View>

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
    padding: 16,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },

  backButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  backButtonText: {
    color: '#E2E8F0',
    fontWeight: '800',
  },

  content: {
    paddingBottom: 24,
  },

  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },

  /* 🔥 ACTIVO (MISMO ESTILO PERO DESTACA) */
  cardActive: {
    backgroundColor: '#111827', // un poco más claro
    borderWidth: 1.5,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },

  cardTitleActive: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },

  cardTextActive: {
    color: '#CBD5E1',
    fontSize: 14,
  },

  /* ⚫ DESACTIVADO */
  cardDisabled: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    opacity: 0.5,
  },

  cardTitleDisabled: {
    color: '#64748B',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },

  cardTextDisabled: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
})