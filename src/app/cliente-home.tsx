import { router, Stack } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nombre: string
  telefono: string | null
  direccion: string | null
  dni: string | null
}

type PanelCliente = {
  cliente_id: string
  total_a_pagar: number
  total_pagado: number
  restante: number
}

type PagoCliente = {
  id: string
  estado: 'pendiente' | 'aprobado' | 'rechazado' | string
  metodo: string | null
  monto: number | null
  created_at: string | null
}

function formatCurrency(value: number) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`
}

export default function ClienteHome() {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [resumen, setResumen] = useState<PanelCliente | null>(null)
  const [ultimoPago, setUltimoPago] = useState<PagoCliente | null>(null)

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError) throw authError

      const userId = authData.user?.id

      if (!userId) {
        throw new Error('No se encontró el usuario logueado')
      }

      const { data: clienteData, error: clienteError } = await supabase
        .from('clientes')
        .select('*')
        .eq('usuario_id', userId)
        .single()

      if (clienteError) throw clienteError

      setCliente(clienteData)

      const { data: panelData, error: panelError } = await supabase
        .from('panel_clientes')
        .select('*')
        .eq('cliente_id', clienteData.id)
        .single()

      if (panelError) throw panelError

      setResumen(panelData)

      const { data: pagoData, error: pagoError } = await supabase
        .from('pagos')
        .select('id, estado, metodo, monto, created_at')
        .eq('cliente_id', clienteData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pagoError) throw pagoError
      setUltimoPago((pagoData as PagoCliente) || null)
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron cargar tus datos')
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.replace('/login' as any)
  }

  const estadoUltimoPago = useMemo(() => {
    if (ultimoPago?.estado === 'pendiente') return 'Pago pendiente de aprobación'
    if (ultimoPago?.estado === 'aprobado') return 'Pago aprobado'
    if (ultimoPago?.estado === 'rechazado') return 'Pago rechazado'
    return 'No hay movimientos recientes'
  }, [ultimoPago])

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#E10076" />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>¡Hola {cliente?.nombre?.split(' ')[0] || 'Rubén'}!</Text>

          <View style={styles.headerActions}>
            <Text style={styles.headerIcon}>👁️</Text>
            <Text style={styles.headerIcon}>❔</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.balanceCard}>
            <View>
              <Text style={styles.balanceTitle}>Dinero en cuenta</Text>
              <Text style={styles.balanceAmount}>$0⁰⁰</Text>
            </View>

            <Text style={styles.balanceDetail}>Ver detalle ›</Text>
          </View>

          <View style={styles.loanCard}>
            <View style={styles.loanTabs}>
              <View style={styles.loanTabActive}>
                <Text style={styles.loanTabTitle}>👛 Línea de crédito</Text>
                <Text style={styles.loanTabSub}>(Gastos diarios)</Text>
              </View>
              <View style={styles.loanTab}>
                <Text style={styles.loanTabInactive}>💸 Préstamos</Text>
              </View>
            </View>

            <Text style={styles.loanQuestion}>¿Necesitás dinero?</Text>
            <Text style={styles.loanLabel}>Pedí hasta</Text>
            <Text style={styles.loanAmount}>{formatCurrency(resumen?.restante || 2_000_000)}</Text>

            <TouchableOpacity style={styles.loanButton}>
              <Text style={styles.loanButtonText}>Solicitar préstamo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            <Text style={styles.activityTitle}>Tu actividad</Text>
            <Text style={styles.activityIcon}>☁️</Text>
            <Text style={styles.activityHeadline}>{estadoUltimoPago}</Text>
            <Text style={styles.activitySub}>Usá tu billetera y seguí potenciando tu perfil.</Text>
          </View>

          <TouchableOpacity style={styles.logout} onPress={cerrarSesion}>
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomNav}>
          <Text style={styles.navItemActive}>Inicio</Text>
          <Text style={styles.navItem}>Crédito</Text>
          <View style={styles.qrButton}>
            <Text style={styles.qrText}>⌘</Text>
          </View>
          <Text style={styles.navItem}>Préstamos</Text>
          <Text style={styles.navItem}>Menú</Text>
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EFEFEF',
  },
  header: {
    backgroundColor: '#E10076',
    paddingTop: 56,
    paddingBottom: 26,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 42,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 18,
  },
  headerIcon: {
    fontSize: 24,
  },
  content: {
    padding: 18,
    paddingBottom: 140,
    marginTop: -20,
    gap: 16,
  },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  balanceTitle: {
    fontSize: 21,
    color: '#2f2f2f',
  },
  balanceAmount: {
    fontSize: 56,
    fontWeight: '800',
    marginTop: 6,
  },
  balanceDetail: {
    color: '#E10076',
    fontSize: 30,
    fontWeight: '700',
    marginTop: 8,
  },
  loanCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  loanTabs: {
    flexDirection: 'row',
  },
  loanTabActive: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: '#F2F2F2',
    borderBottomRightRadius: 24,
  },
  loanTab: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  loanTabTitle: {
    fontSize: 21,
    color: '#333',
    fontWeight: '600',
  },
  loanTabSub: {
    fontSize: 12,
    color: '#ff73b8',
    marginTop: 6,
  },
  loanTabInactive: {
    fontSize: 21,
    color: '#E10076',
    marginTop: 4,
  },
  loanQuestion: {
    marginTop: 26,
    marginHorizontal: 18,
    fontSize: 44,
    color: '#222',
  },
  loanLabel: {
    marginTop: 26,
    marginHorizontal: 18,
    fontSize: 24,
    color: '#333',
  },
  loanAmount: {
    marginHorizontal: 18,
    marginTop: 4,
    fontSize: 64,
    fontWeight: '900',
    color: '#111',
  },
  loanButton: {
    marginTop: 22,
    marginHorizontal: 18,
    borderRadius: 20,
    paddingVertical: 16,
    backgroundColor: '#E10076',
    alignItems: 'center',
  },
  loanButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 32,
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  activityTitle: {
    alignSelf: 'flex-start',
    fontSize: 20,
    fontWeight: '700',
    color: '#2a2a2a',
    marginBottom: 22,
  },
  activityIcon: {
    fontSize: 74,
    opacity: 0.4,
    marginBottom: 8,
  },
  activityHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f1f1f',
    textAlign: 'center',
  },
  activitySub: {
    fontSize: 16,
    marginTop: 6,
    color: '#3c3c3c',
    textAlign: 'center',
  },
  logout: {
    marginTop: 6,
    alignSelf: 'center',
    backgroundColor: '#2E2E2E',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 26,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navItem: {
    fontSize: 14,
    color: '#8b8b8b',
  },
  navItemActive: {
    fontSize: 14,
    color: '#E10076',
    fontWeight: '700',
  },
  qrButton: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#E10076',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
  },
  qrText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '900',
  },
})
