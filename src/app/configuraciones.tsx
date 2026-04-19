import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import {
  authenticateWithBiometrics,
  disableBiometric,
  enableBiometricForUser,
  getBiometricAvailability,
  getBiometricState,
} from '../lib/biometrics'
import { supabase } from '../lib/supabase'

type EstadoMp = 'loading' | 'connected' | 'disconnected'
type BiometricStatus = 'loading' | 'enabled' | 'disabled' | 'unsupported' | 'not_enrolled'

type MercadoPagoConfig = {
  connected: boolean
  mp_user_id: string | null
  public_key: string | null
  alias_cuenta: string | null
  updated_at: string | null
}

const MP_CLIENT_ID = process.env.EXPO_PUBLIC_MP_CLIENT_ID
const MP_REDIRECT_URI = process.env.EXPO_PUBLIC_MP_REDIRECT_URI

export default function Configuraciones() {
  const { session } = useAuth()
  const [estadoMp, setEstadoMp] = useState<EstadoMp>('loading')
  const [isConnectingMp, setIsConnectingMp] = useState(false)
  const [isDisconnectingMp, setIsDisconnectingMp] = useState(false)
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfig | null>(null)
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>('loading')
  const [updatingBiometric, setUpdatingBiometric] = useState(false)

  const loadBiometricStatus = useCallback(async () => {
    if (!session?.user?.id) {
      setBiometricStatus('disabled')
      return
    }

    const [availability, state] = await Promise.all([
      getBiometricAvailability(),
      getBiometricState(),
    ])

    if (!availability.supported) {
      setBiometricStatus('unsupported')
      return
    }

    if (!availability.enrolled) {
      setBiometricStatus('not_enrolled')
      return
    }

    if (state.enabled && state.userId === session.user.id) {
      setBiometricStatus('enabled')
      return
    }

    setBiometricStatus('disabled')
  }, [session?.user?.id])

  const cargarEstadoMercadoPago = useCallback(async () => {
    if (!session?.user?.id) {
      setEstadoMp('disconnected')
      return
    }

    setEstadoMp('loading')

    const { data, error } = await supabase
      .from('admin_settings')
      .select('connected, mp_access_token, mp_user_id, public_key, alias_cuenta, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      console.log('[configuraciones] error cargando admin_settings:', error)
      setEstadoMp('disconnected')
      return
    }

    const token = String(data?.mp_access_token || '').trim()
    const connected = Boolean(data?.connected) && Boolean(token)

    setMpConfig({
      connected,
      mp_user_id: data?.mp_user_id ? String(data.mp_user_id) : null,
      public_key: data?.public_key ? String(data.public_key) : null,
      alias_cuenta: data?.alias_cuenta ? String(data.alias_cuenta) : null,
      updated_at: data?.updated_at ? String(data.updated_at) : null,
    })
    setEstadoMp(connected ? 'connected' : 'disconnected')
  }, [session?.user?.id])

  useFocusEffect(
    useCallback(() => {
      void cargarEstadoMercadoPago()
      void loadBiometricStatus()
    }, [cargarEstadoMercadoPago, loadBiometricStatus])
  )

  const handleEnableBiometrics = useCallback(async () => {
    if (!session?.user?.id || updatingBiometric) return

    setUpdatingBiometric(true)
    try {
      const availability = await getBiometricAvailability()

      if (!availability.supported) {
        Alert.alert('Biometría', 'Tu dispositivo no soporta biometría')
        setBiometricStatus('unsupported')
        return
      }

      if (!availability.enrolled) {
        Alert.alert('Biometría', 'No tenés biometría configurada en este dispositivo')
        setBiometricStatus('not_enrolled')
        return
      }

      const authResult = await authenticateWithBiometrics()
      if (!authResult.success) {
        Alert.alert('Biometría', 'No se pudo verificar tu identidad biométrica')
        return
      }

      await enableBiometricForUser(session.user.id)
      setBiometricStatus('enabled')
      Alert.alert('Listo', 'Biometría activada correctamente')
    } finally {
      setUpdatingBiometric(false)
    }
  }, [session?.user?.id, updatingBiometric])

  const handleDisableBiometrics = useCallback(async () => {
    if (updatingBiometric) return

    setUpdatingBiometric(true)
    try {
      await disableBiometric()
      setBiometricStatus('disabled')
      Alert.alert('Listo', 'Ingreso con biometría desactivado')
    } finally {
      setUpdatingBiometric(false)
    }
  }, [updatingBiometric])

  const handleConnectMercadoPago = useCallback(async () => {
    const clientId = String(MP_CLIENT_ID || '').trim()
    const redirectUri = String(MP_REDIRECT_URI || '').trim()

    if (!clientId || !redirectUri) {
      Alert.alert(
        'Falta configuración',
        'Faltan EXPO_PUBLIC_MP_CLIENT_ID o EXPO_PUBLIC_MP_REDIRECT_URI. Configuralas para conectar Mercado Pago.'
      )
      return
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: redirectUri,
    })

    const oauthUrl = `https://auth.mercadopago.com.ar/authorization?${params.toString()}`
    setIsConnectingMp(true)

    try {
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') {
          throw new Error('No se encontró window en entorno web.')
        }

        window.location.href = oauthUrl
        return
      }

      await Linking.openURL(oauthUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      Alert.alert('Error', message || 'No se pudo abrir la conexión con Mercado Pago.')
    } finally {
      setIsConnectingMp(false)
    }
  }, [])

  const handleDisconnectMercadoPago = useCallback(async () => {
    if (!session?.user?.id || isDisconnectingMp) return

    Alert.alert(
      'Desconectar Mercado Pago',
      '¿Seguro que querés desconectar la cuenta de Mercado Pago?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setIsDisconnectingMp(true)

                const { error } = await supabase
                  .from('admin_settings')
                  .upsert(
                    {
                      user_id: session.user.id,
                      connected: false,
                      mp_access_token: null,
                      mp_refresh_token: null,
                      mp_user_id: null,
                      public_key: null,
                      alias_cuenta: null,
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id' }
                  )

                if (error) {
                  Alert.alert('Error', error.message)
                  return
                }

                Alert.alert('Listo', 'Mercado Pago quedó desconectado.')
                await cargarEstadoMercadoPago()
              } finally {
                setIsDisconnectingMp(false)
              }
            })()
          },
        },
      ]
    )
  }, [cargarEstadoMercadoPago, isDisconnectingMp, session?.user?.id])

  const estadoTexto =
    estadoMp === 'connected'
      ? 'Mercado Pago conectado ✅'
      : estadoMp === 'loading'
        ? 'Verificando estado de conexión...'
        : 'No conectado ❌'

  const botonTexto = estadoMp === 'connected' ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'
  const badgeConectado = estadoMp === 'connected'

  const biometricMessage =
    biometricStatus === 'enabled'
      ? 'Ingreso rápido activo en este dispositivo.'
      : biometricStatus === 'unsupported'
        ? 'Tu dispositivo no soporta biometría.'
        : biometricStatus === 'not_enrolled'
          ? 'No tenés biometría configurada en este dispositivo.'
          : 'Podés activar huella o rostro para ingreso rápido.'

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Configuraciones</Text>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.mpCard]}>
          <Text style={styles.cardTitleActive}>Cobros con Mercado Pago</Text>

          <View style={styles.statusRow}>
            <Text style={styles.cardTextActive}>{estadoTexto}</Text>
            <View style={[styles.statusBadge, badgeConectado ? styles.statusBadgeConnected : styles.statusBadgeDisconnected]}>
              <Text style={[styles.statusBadgeText, badgeConectado ? styles.statusBadgeTextConnected : styles.statusBadgeTextDisconnected]}>
                {badgeConectado ? 'Conectado' : 'No conectado'}
              </Text>
            </View>
          </View>

          {badgeConectado ? (
            <View style={styles.mpInfoBox}>
              <Text style={styles.mpInfoText}>Cuenta: {mpConfig?.alias_cuenta || 'Sin alias'}</Text>
              <Text style={styles.mpInfoText}>MP user id: {mpConfig?.mp_user_id || '—'}</Text>
              <Text style={styles.mpInfoText}>Public key: {mpConfig?.public_key || '—'}</Text>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.connectButton, isConnectingMp ? styles.connectButtonDisabled : null]}
              onPress={handleConnectMercadoPago}
              disabled={isConnectingMp}
              activeOpacity={0.8}
            >
              {isConnectingMp ? (
                <ActivityIndicator size="small" color="#082F49" />
              ) : (
                <Text style={styles.connectButtonText}>{botonTexto}</Text>
              )}
            </TouchableOpacity>

            {badgeConectado ? (
              <TouchableOpacity
                style={[styles.disconnectButton, isDisconnectingMp ? styles.connectButtonDisabled : null]}
                onPress={handleDisconnectMercadoPago}
                disabled={isDisconnectingMp}
              >
                {isDisconnectingMp ? (
                  <ActivityIndicator size="small" color="#FECACA" />
                ) : (
                  <Text style={styles.disconnectButtonText}>Desconectar</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {estadoMp === 'loading' ? <ActivityIndicator size="small" color="#38BDF8" /> : null}
          </View>
        </View>

        <View style={[styles.card, styles.cardActive]}>
          <Text style={styles.cardTitleActive}>Ingreso con biometría</Text>
          <Text style={styles.cardTextActive}>{biometricMessage}</Text>

          <View style={styles.buttonRow}>
            {biometricStatus === 'enabled' ? (
              <TouchableOpacity
                style={[styles.disconnectButton, updatingBiometric ? styles.connectButtonDisabled : null]}
                onPress={handleDisableBiometrics}
                disabled={updatingBiometric}
              >
                {updatingBiometric ? (
                  <ActivityIndicator size="small" color="#FECACA" />
                ) : (
                  <Text style={styles.disconnectButtonText}>Desactivar biometría</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.connectButton,
                  (biometricStatus === 'unsupported' || biometricStatus === 'not_enrolled' || updatingBiometric)
                    ? styles.connectButtonDisabled
                    : null,
                ]}
                onPress={handleEnableBiometrics}
                disabled={biometricStatus === 'unsupported' || biometricStatus === 'not_enrolled' || updatingBiometric}
              >
                {updatingBiometric ? (
                  <ActivityIndicator size="small" color="#082F49" />
                ) : (
                  <Text style={styles.connectButtonText}>Activar biometría</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.card, styles.cardActive]}
          onPress={() => router.push('/cambiar-password')}
        >
          <Text style={styles.cardTitleActive}>Seguridad</Text>
          <Text style={styles.cardTextActive}>Cambiar contraseña de tu cuenta</Text>
        </TouchableOpacity>

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
    minWidth: 220,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: '#082F49',
    fontWeight: '900',
  },
  statusRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  statusBadgeConnected: {
    backgroundColor: '#052E16',
    borderColor: '#166534',
  },
  statusBadgeDisconnected: {
    backgroundColor: '#3F1D2E',
    borderColor: '#9D174D',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeTextConnected: {
    color: '#86EFAC',
  },
  statusBadgeTextDisconnected: {
    color: '#F9A8D4',
  },
  mpInfoBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    backgroundColor: '#0B2840',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  mpInfoText: {
    color: '#BAE6FD',
    fontSize: 13,
  },
  disconnectButton: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: '#B91C1C',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectButtonText: {
    color: '#FEE2E2',
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
