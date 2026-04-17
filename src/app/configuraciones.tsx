import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

type EstadoMp = 'loading' | 'connected' | 'disconnected'

const MP_CLIENT_ID = process.env.EXPO_PUBLIC_MP_CLIENT_ID || 'TU_CLIENT_ID'
const MP_REDIRECT_URI =
  process.env.EXPO_PUBLIC_MP_REDIRECT_URI || 'https://tuapp.vercel.app/mp-callback'

export default function Configuraciones() {
  const { session } = useAuth()
  const [estadoMp, setEstadoMp] = useState<EstadoMp>('loading')

  const oauthUrl = useMemo(() => {
    const params = new URLSearchParams({
      client_id: MP_CLIENT_ID,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: MP_REDIRECT_URI,
    })

    return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`
  }, [])

  const cargarEstadoMercadoPago = useCallback(async () => {
    if (!session?.user?.id) {
      setEstadoMp('disconnected')
      return
    }

    setEstadoMp('loading')

    const { data, error } = await supabase
      .from('admin_settings')
      .select('mp_access_token')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      console.log('[configuraciones] error cargando admin_settings:', error)
      setEstadoMp('disconnected')
      return
    }

    const token = String(data?.mp_access_token || '').trim()
    setEstadoMp(token ? 'connected' : 'disconnected')
  }, [session?.user?.id])

  useFocusEffect(
    useCallback(() => {
      void cargarEstadoMercadoPago()
    }, [cargarEstadoMercadoPago])
  )

  const conectarMercadoPago = async () => {
    if (MP_CLIENT_ID === 'TU_CLIENT_ID') {
      Alert.alert(
        'Falta configuración',
        'Configurá EXPO_PUBLIC_MP_CLIENT_ID y EXPO_PUBLIC_MP_REDIRECT_URI para iniciar OAuth.'
      )
      return
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = oauthUrl
      return
    }

    const canOpen = await Linking.canOpenURL(oauthUrl)
    if (!canOpen) {
      Alert.alert('Error', 'No se pudo abrir la URL de Mercado Pago')
      return
    }

    await Linking.openURL(oauthUrl)
  }

  const estadoTexto =
    estadoMp === 'connected'
      ? 'Mercado Pago conectado ✅'
      : estadoMp === 'loading'
        ? 'Verificando estado de conexión...'
        : 'No conectado ❌'

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Configuraciones</Text>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={[styles.card, styles.mpCard]}
          onPress={conectarMercadoPago}
          disabled={estadoMp === 'loading'}
        >
          <Text style={styles.cardTitleActive}>Cobros con Mercado Pago</Text>
          <Text style={styles.cardTextActive}>{estadoTexto}</Text>

          <View style={styles.buttonRow}>
            <View style={styles.connectButton}>
              <Text style={styles.connectButtonText}>Conectar Mercado Pago</Text>
            </View>

            {estadoMp === 'loading' ? (
              <ActivityIndicator size="small" color="#38BDF8" />
            ) : null}
          </View>
        </TouchableOpacity>

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

  mpCard: {
    backgroundColor: '#082F49',
    borderWidth: 1,
    borderColor: '#0EA5E9',
  },

  buttonRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  connectButton: {
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  connectButtonText: {
    color: '#082F49',
    fontWeight: '900',
  },

  cardActive: {
    backgroundColor: '#111827',
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
