import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

type Estado = 'loading' | 'success' | 'error'

export default function MercadoPagoCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>()
  const [estado, setEstado] = useState<Estado>('loading')
  const [mensaje, setMensaje] = useState('Conectando tu cuenta de Mercado Pago...')

  useEffect(() => {
    const ejecutar = async () => {
      const oauthError = String(params?.error || '').trim()
      if (oauthError) {
        setEstado('error')
        setMensaje(`Mercado Pago devolvió un error: ${oauthError}`)
        return
      }

      const code = String(params?.code || '').trim()

      if (!code) {
        setEstado('error')
        setMensaje('No se recibió el parámetro ?code desde Mercado Pago.')
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) {
        setEstado('error')
        setMensaje('Tu sesión expiró. Iniciá sesión nuevamente y repetí la conexión.')
        return
      }

      const { data, error } = await supabase.functions.invoke('mp-exchange-token', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: { code },
      })

      if (error || !data?.ok) {
        setEstado('error')
        setMensaje(data?.error || error?.message || 'No se pudo conectar Mercado Pago.')
        return
      }

      setEstado('success')
      setMensaje('Mercado Pago conectado correctamente ✅')
    }

    void ejecutar()
  }, [params?.code, params?.error])

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        {estado === 'loading' ? <ActivityIndicator size="large" color="#0EA5E9" /> : null}

        <Text style={styles.title}>Conexión Mercado Pago</Text>
        <Text style={styles.subtitle}>{mensaje}</Text>

        <TouchableOpacity style={styles.button} onPress={() => router.replace('/configuraciones')}>
          <Text style={styles.buttonText}>Volver a Configuraciones</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    marginTop: 6,
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonText: {
    color: '#082F49',
    fontWeight: '900',
  },
})
