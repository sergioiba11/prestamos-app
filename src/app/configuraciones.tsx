import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useAppTheme } from '../context/AppThemeContext'
import {
  authenticateWithBiometrics,
  disableBiometric,
  enableBiometricForUser,
  getBiometricAvailability,
  getBiometricState,
} from '../lib/biometrics'
import { REGLAS_MORA_DEFAULT } from '../lib/mora'
import { esNombreCompletoValido, normalizarNombreCompleto } from '../lib/nombre'
import { safeGoBack } from '../lib/navigation'
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

const INTERESES_MENSUALES_DEFAULT: Record<number, number> = {
  1: 15, 2: 22, 3: 30, 4: 38, 5: 46, 6: 55, 7: 63, 8: 71, 9: 79, 10: 87, 11: 95, 12: 105,
  13: 114, 14: 123, 15: 132, 16: 141, 17: 150, 18: 160, 19: 169, 20: 178, 21: 187, 22: 196,
  23: 205, 24: 215, 25: 224, 26: 233, 27: 242, 28: 251, 29: 260, 30: 270, 31: 279, 32: 288,
  33: 297, 34: 306, 35: 315, 36: 325,
}

type InteresRow = {
  cuotas: number
  porcentaje: string
}

type MoraRow = {
  tramo: 'gracia' | 'mora_normal' | 'mora_alta'
  dias_desde: number
  dias_hasta: number | null
  porcentaje_diario: string
}

type AccordionKey = 'mercado-pago' | 'tasas-interes' | 'mora-atraso' | 'administradores' | 'biometria' | 'seguridad'

const MP_CLIENT_ID = process.env.EXPO_PUBLIC_MP_CLIENT_ID
const MP_REDIRECT_URI = process.env.EXPO_PUBLIC_MP_REDIRECT_URI
const DAILY_INTEREST_DAYS_RANGE = 365
const DAILY_INTERES_DEFAULT = 2

export default function Configuraciones() {
  const { session } = useAuth()
  const { theme, mode, setTheme } = useAppTheme()
  const colors = theme.colors
  const [estadoMp, setEstadoMp] = useState<EstadoMp>('loading')
  const [isConnectingMp, setIsConnectingMp] = useState(false)
  const [isDisconnectingMp, setIsDisconnectingMp] = useState(false)
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfig | null>(null)
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>('loading')
  const [updatingBiometric, setUpdatingBiometric] = useState(false)
  const [negocioNombre, setNegocioNombre] = useState('')
  const [negocioTelefono, setNegocioTelefono] = useState('')
  const [negocioAlias, setNegocioAlias] = useState('')
  const [brandingPrimario, setBrandingPrimario] = useState('#2563EB')
  const [preferenciaComprobanteSms, setPreferenciaComprobanteSms] = useState(true)
  const [savingBusinessData, setSavingBusinessData] = useState(false)
  const [userRole, setUserRole] = useState('empleado')
  const [interesesRows, setInteresesRows] = useState<InteresRow[]>([])
  const [interesesErrors, setInteresesErrors] = useState<Record<number, string>>({})
  const [loadingIntereses, setLoadingIntereses] = useState(true)
  const [savingIntereses, setSavingIntereses] = useState(false)
  const [dailyInterestBase, setDailyInterestBase] = useState(String(DAILY_INTERES_DEFAULT))
  const [dailyInterestError, setDailyInterestError] = useState('')
  const [moraRows, setMoraRows] = useState<MoraRow[]>([])
  const [moraErrors, setMoraErrors] = useState<Record<string, string>>({})
  const [loadingMora, setLoadingMora] = useState(true)
  const [savingMora, setSavingMora] = useState(false)
  const [adminNombre, setAdminNombre] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminTelefono, setAdminTelefono] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPasswordRepeat, setAdminPasswordRepeat] = useState('')
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('')
  const [countdownSeconds, setCountdownSeconds] = useState(5)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminStatus, setAdminStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [openSection, setOpenSection] = useState<AccordionKey>('mercado-pago')
  const [selectedCuotaMobile, setSelectedCuotaMobile] = useState(1)

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
    setNegocioNombre(String((data as any)?.nombre_negocio || 'CrediTodo'))
    setNegocioTelefono(String((data as any)?.telefono_negocio || ''))
    setNegocioAlias(String(data?.alias_cuenta || ''))
    setEstadoMp(connected ? 'connected' : 'disconnected')
  }, [session?.user?.id])

  const guardarDatosNegocio = useCallback(async () => {
    if (!session?.user?.id || savingBusinessData) return
    setSavingBusinessData(true)
    try {
      const { error } = await supabase
        .from('admin_settings')
        .upsert({
          user_id: session.user.id,
          nombre_negocio: negocioNombre.trim() || 'CrediTodo',
          telefono_negocio: negocioTelefono.trim() || null,
          alias_cuenta: negocioAlias.trim() || null,
          branding_primario: brandingPrimario.trim() || '#2563EB',
          preferencia_comprobante_sms: preferenciaComprobanteSms,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (error) throw error
      Alert.alert('Listo', 'Configuración del negocio guardada.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar configuración')
    } finally {
      setSavingBusinessData(false)
    }
  }, [brandingPrimario, negocioAlias, negocioNombre, negocioTelefono, preferenciaComprobanteSms, savingBusinessData, session?.user?.id])

  const buildDefaultInteresesRows = useCallback(
    () => Array.from({ length: 36 }, (_, idx) => {
      const cuota = idx + 1
      return { cuotas: cuota, porcentaje: String(INTERESES_MENSUALES_DEFAULT[cuota] ?? 0) }
    }),
    []
  )

  const cargarRolUsuario = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', session.user.id)
      .maybeSingle()
    setUserRole(String(data?.rol || 'empleado').toLowerCase())
  }, [session?.user?.id])

  const cargarIntereses = useCallback(async () => {
    setLoadingIntereses(true)
    setInteresesErrors({})
    setInteresesRows(buildDefaultInteresesRows())
    try {
      const { data, error } = await supabase
        .from('config_intereses')
        .select('tipo, plazo, porcentaje')
        .eq('activo', true)
        .order('plazo', { ascending: true })

      if (error || !data || data.length === 0) return

      const porCuota = new Map<number, string>()
      const interesesDiarios = new Map<number, number>()
      for (const item of data as any[]) {
        const tipo = String(item?.tipo || '').toLowerCase()
        const cuota = Number(item?.plazo || 0)
        if (!cuota || cuota < 1) continue
        if (tipo === 'mensual') {
          if (cuota > 36) continue
          porCuota.set(cuota, String(Number(item?.porcentaje || 0)))
        }
        if (tipo === 'diario') {
          interesesDiarios.set(cuota, Number(item?.porcentaje || 0))
        }
      }

      setInteresesRows(
        Array.from({ length: 36 }, (_, idx) => {
          const cuota = idx + 1
          return { cuotas: cuota, porcentaje: porCuota.get(cuota) ?? String(INTERESES_MENSUALES_DEFAULT[cuota] ?? 0) }
        })
      )

      const dailyBaseFromConfig = interesesDiarios.get(1)
      if (typeof dailyBaseFromConfig === 'number' && Number.isFinite(dailyBaseFromConfig)) {
        setDailyInterestBase(String(dailyBaseFromConfig))
      } else {
        setDailyInterestBase(String(DAILY_INTERES_DEFAULT))
      }
    } finally {
      setLoadingIntereses(false)
    }
  }, [buildDefaultInteresesRows])

  const esAdmin = userRole === 'admin'

  const buildDefaultMoraRows = useCallback(
    (): MoraRow[] => [
      { tramo: 'gracia', dias_desde: 1, dias_hasta: 3, porcentaje_diario: String(REGLAS_MORA_DEFAULT[0].porcentaje_diario) },
      { tramo: 'mora_normal', dias_desde: 4, dias_hasta: 10, porcentaje_diario: String(REGLAS_MORA_DEFAULT[1].porcentaje_diario) },
      { tramo: 'mora_alta', dias_desde: 11, dias_hasta: null, porcentaje_diario: String(REGLAS_MORA_DEFAULT[2].porcentaje_diario) },
    ],
    []
  )

  const onChangeInteres = (cuotas: number, value: string) => {
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '')
    setInteresesRows((prev) => prev.map((row) => (row.cuotas === cuotas ? { ...row, porcentaje: cleaned } : row)))
    setInteresesErrors((prev) => ({ ...prev, [cuotas]: '' }))
  }

  const onChangeDailyInterestBase = (value: string) => {
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '')
    setDailyInterestBase(cleaned)
    setDailyInterestError('')
  }

  const toggleSection = (section: AccordionKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpenSection(section)
  }

  const adminNombreTrimmed = normalizarNombreCompleto(adminNombre)
  const adminEmailTrimmed = adminEmail.trim().toLowerCase()
  const adminPasswordTrimmed = adminPassword.trim()
  const adminPasswordRepeatTrimmed = adminPasswordRepeat.trim()
  const adminCurrentPasswordTrimmed = adminCurrentPassword.trim()
  const adminFormReadyForCountdown = Boolean(
    adminNombreTrimmed &&
      esNombreCompletoValido(adminNombreTrimmed) &&
      adminEmailTrimmed &&
      adminPasswordTrimmed &&
      adminPasswordRepeatTrimmed &&
      adminCurrentPasswordTrimmed
  )

  useEffect(() => {
    if (openSection !== 'administradores') return
    if (!adminFormReadyForCountdown) {
      setCountdownSeconds(5)
      return
    }
    if (countdownSeconds <= 0) return

    const timeoutId = setTimeout(() => {
      setCountdownSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [adminFormReadyForCountdown, countdownSeconds, openSection])

  const validarIntereses = useCallback(() => {
    const errors: Record<number, string> = {}
    for (const row of interesesRows) {
      const raw = String(row.porcentaje || '').trim()
      const num = Number(raw)
      if (raw === '') {
        errors[row.cuotas] = 'Requerido'
        continue
      }
      if (!Number.isFinite(num)) {
        errors[row.cuotas] = 'Número inválido'
        continue
      }
      if (num < 0) {
        errors[row.cuotas] = 'Debe ser >= 0'
        continue
      }
      if (num > 500) {
        errors[row.cuotas] = 'Máximo 500'
      }
    }
    setInteresesErrors(errors)
    const dailyRaw = String(dailyInterestBase || '').trim()
    const dailyValue = Number(dailyRaw)
    if (dailyRaw === '') {
      setDailyInterestError('Requerido')
      return false
    }
    if (!Number.isFinite(dailyValue)) {
      setDailyInterestError('Número inválido')
      return false
    }
    if (dailyValue < 0) {
      setDailyInterestError('Debe ser >= 0')
      return false
    }
    if (dailyValue > 100) {
      setDailyInterestError('Máximo 100')
      return false
    }
    setDailyInterestError('')
    return Object.keys(errors).length === 0
  }, [dailyInterestBase, interesesRows])

  const guardarIntereses = useCallback(async () => {
    if (!esAdmin || savingIntereses) return
    if (!validarIntereses()) {
      Alert.alert('Error', 'Hay porcentajes inválidos. Revisá los campos marcados.')
      return
    }

    setSavingIntereses(true)
    try {
      const payloadMensual = interesesRows.map((row) => ({
        tipo: 'mensual',
        plazo: row.cuotas,
        porcentaje: Number(Number(row.porcentaje).toFixed(2)),
        activo: true,
        updated_at: new Date().toISOString(),
      }))
      const dailyBase = Number(Number(dailyInterestBase).toFixed(4))
      const payloadDiario = Array.from({ length: DAILY_INTEREST_DAYS_RANGE }, (_, idx) => {
        const day = idx + 1
        return {
          tipo: 'diario',
          plazo: day,
          porcentaje: Number((dailyBase * day).toFixed(2)),
          activo: true,
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await supabase.from('config_intereses').upsert([...payloadMensual, ...payloadDiario], { onConflict: 'tipo,plazo' })
      if (error) throw error
      Alert.alert('Listo', 'Tasas de interés guardadas.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar tasas de interés')
    } finally {
      setSavingIntereses(false)
    }
  }, [dailyInterestBase, esAdmin, interesesRows, savingIntereses, validarIntereses])

  const restaurarInteresesDefault = useCallback(async () => {
    if (!esAdmin || savingIntereses) return
    const defaults = buildDefaultInteresesRows()
    setInteresesRows(defaults)
    setInteresesErrors({})
    setSavingIntereses(true)
    try {
      const payloadMensual = defaults.map((row) => ({
        tipo: 'mensual',
        plazo: row.cuotas,
        porcentaje: Number(Number(row.porcentaje).toFixed(2)),
        activo: true,
        updated_at: new Date().toISOString(),
      }))
      const payloadDiario = Array.from({ length: DAILY_INTEREST_DAYS_RANGE }, (_, idx) => {
        const day = idx + 1
        return {
          tipo: 'diario',
          plazo: day,
          porcentaje: Number((DAILY_INTERES_DEFAULT * day).toFixed(2)),
          activo: true,
          updated_at: new Date().toISOString(),
        }
      })
      setDailyInterestBase(String(DAILY_INTERES_DEFAULT))
      const { error } = await supabase.from('config_intereses').upsert([...payloadMensual, ...payloadDiario], { onConflict: 'tipo,plazo' })
      if (error) throw error
      Alert.alert('Listo', 'Se restauraron los valores por defecto.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo restaurar valores por defecto')
    } finally {
      setSavingIntereses(false)
    }
  }, [buildDefaultInteresesRows, esAdmin, savingIntereses])

  const cargarMora = useCallback(async () => {
    setLoadingMora(true)
    setMoraErrors({})
    setMoraRows(buildDefaultMoraRows())
    try {
      const { data, error } = await supabase
        .from('config_mora')
        .select('tramo, dias_desde, dias_hasta, porcentaje_diario, activo')
        .eq('activo', true)

      if (error || !data || data.length === 0) return

      const byTramo = new Map<string, MoraRow>()
      for (const item of data as any[]) {
        const tramo = String(item?.tramo || '') as MoraRow['tramo']
        if (!['gracia', 'mora_normal', 'mora_alta'].includes(tramo)) continue
        byTramo.set(tramo, {
          tramo,
          dias_desde: Number(item?.dias_desde || 0),
          dias_hasta: item?.dias_hasta == null ? null : Number(item?.dias_hasta),
          porcentaje_diario: String(Number(item?.porcentaje_diario || 0)),
        })
      }

      const defaults = buildDefaultMoraRows()
      setMoraRows(defaults.map((row) => byTramo.get(row.tramo) || row))
    } finally {
      setLoadingMora(false)
    }
  }, [buildDefaultMoraRows])

  const onChangeMora = (tramo: MoraRow['tramo'], value: string) => {
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '')
    setMoraRows((prev) => prev.map((row) => (row.tramo === tramo ? { ...row, porcentaje_diario: cleaned } : row)))
    setMoraErrors((prev) => ({ ...prev, [tramo]: '' }))
  }

  const validarMora = useCallback(() => {
    const errors: Record<string, string> = {}
    for (const row of moraRows) {
      const raw = String(row.porcentaje_diario || '').trim()
      const num = Number(raw)
      if (raw === '') {
        errors[row.tramo] = 'Requerido'
      } else if (!Number.isFinite(num)) {
        errors[row.tramo] = 'Número inválido'
      } else if (num < 0) {
        errors[row.tramo] = 'Debe ser >= 0'
      } else if (num > 100) {
        errors[row.tramo] = 'Máximo 100'
      }
    }
    setMoraErrors(errors)
    return Object.keys(errors).length === 0
  }, [moraRows])

  const guardarMora = useCallback(async () => {
    if (!esAdmin || savingMora) return
    if (!validarMora()) {
      Alert.alert('Error', 'Hay porcentajes de mora inválidos. Revisá los campos marcados.')
      return
    }
    setSavingMora(true)
    try {
      const payload = moraRows.map((row) => ({
        tramo: row.tramo,
        dias_desde: row.dias_desde,
        dias_hasta: row.dias_hasta,
        porcentaje_diario: Number(Number(row.porcentaje_diario).toFixed(4)),
        activo: true,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('config_mora').upsert(payload, { onConflict: 'tramo' })
      if (error) throw error
      Alert.alert('Listo', 'Mora por atraso guardada.')
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar configuración de mora')
    } finally {
      setSavingMora(false)
    }
  }, [esAdmin, moraRows, savingMora, validarMora])

  const limpiarFormularioAdmin = useCallback(() => {
    setAdminNombre('')
    setAdminEmail('')
    setAdminTelefono('')
    setAdminPassword('')
    setAdminPasswordRepeat('')
    setAdminCurrentPassword('')
    setCountdownSeconds(5)
  }, [])

  const crearAdmin = useCallback(async () => {
    if (!esAdmin || adminLoading) return

    const nombre = normalizarNombreCompleto(adminNombre)
    const email = adminEmail.trim().toLowerCase()
    const telefono = adminTelefono.trim()
    const password = adminPassword.trim()
    const repeatPassword = adminPasswordRepeat.trim()
    const currentAdminPassword = adminCurrentPassword.trim()

    if (!nombre || !email || !password || !repeatPassword || !currentAdminPassword) {
      setAdminStatus({ type: 'error', message: 'Faltan datos obligatorios' })
      Alert.alert('Error', 'Faltan datos obligatorios')
      return
    }

    if (!esNombreCompletoValido(nombre)) {
      setAdminStatus({ type: 'error', message: 'Ingresar nombre completo' })
      Alert.alert('Error', 'Ingresar nombre completo')
      return
    }

    if (!email.includes('@')) {
      setAdminStatus({ type: 'error', message: 'Ingresá un email válido.' })
      Alert.alert('Error', 'Ingresá un email válido.')
      return
    }

    if (password.length < 6) {
      setAdminStatus({ type: 'error', message: 'La contraseña temporal debe tener al menos 6 caracteres.' })
      Alert.alert('Error', 'La contraseña temporal debe tener al menos 6 caracteres.')
      return
    }

    if (password !== repeatPassword) {
      setAdminStatus({ type: 'error', message: 'Las contraseñas no coinciden.' })
      Alert.alert('Error', 'Las contraseñas no coinciden.')
      return
    }

    if (countdownSeconds > 0) {
      setAdminStatus({ type: 'error', message: `Esperá ${countdownSeconds}s para confirmar la acción.` })
      return
    }

    setAdminLoading(true)
    setAdminStatus(null)

    try {
      const { data, error } = await supabase.functions.invoke('crear-admin', {
        body: {
          nombre,
          email,
          telefono,
          password,
          adminPassword: currentAdminPassword,
        },
      })

      console.log('crear-admin response:', { data, error })

      if (error) {
        let errorData: any = data
        const errorContext = (error as any)?.context
        if (errorContext && typeof errorContext.json === 'function') {
          try {
            errorData = await errorContext.clone().json()
          } catch {
            // no-op
          }
        }
        if (errorData?.detalle) {
          console.log('[crear-admin] detalle:', errorData.detalle)
        }
        throw new Error(errorData?.error || error.message || 'No se pudo crear el administrador')
      }

      if (!data?.ok) {
        if (data?.detalle) {
          console.log('[crear-admin] detalle:', data.detalle)
        }
        throw new Error(data?.error || 'No se pudo crear el administrador')
      }

      setAdminStatus({ type: 'success', message: 'Administrador creado correctamente.' })
      Alert.alert('Éxito', 'Administrador creado correctamente.')
      limpiarFormularioAdmin()
    } catch (error: any) {
      const message = error?.message || 'Ocurrió un error inesperado'
      setAdminStatus({ type: 'error', message })
      Alert.alert('Error', message)
    } finally {
      setAdminLoading(false)
    }
  }, [adminCurrentPassword, adminEmail, adminLoading, adminNombre, adminPassword, adminPasswordRepeat, adminTelefono, countdownSeconds, esAdmin, limpiarFormularioAdmin])

  useFocusEffect(
    useCallback(() => {
      void cargarEstadoMercadoPago()
      void loadBiometricStatus()
      void cargarRolUsuario()
      void cargarIntereses()
      void cargarMora()
    }, [cargarEstadoMercadoPago, cargarIntereses, cargarMora, cargarRolUsuario, loadBiometricStatus])
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
  const isWeb = Platform.OS === 'web'
  const selectedInteresMobile = useMemo(
    () => interesesRows.find((row) => row.cuotas === selectedCuotaMobile) ?? interesesRows[0],
    [interesesRows, selectedCuotaMobile]
  )

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Configuraciones</Text>
            <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => safeGoBack('admin')}>
              <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>Volver</Text>
            </TouchableOpacity>
          </View>

        <View style={[styles.card, styles.cardActive, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitleActive, { color: colors.textPrimary }]}>Apariencia</Text>
          <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>Elegí cómo querés ver el panel autenticado.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={() => setTheme('dark')} style={{ flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderColor: mode === 'dark' ? colors.primary : colors.border, backgroundColor: mode === 'dark' ? colors.primarySoft : colors.surfaceSoft }}>
              <Text style={{ color: mode === 'dark' ? colors.primary : colors.textPrimary, fontWeight: '700' }}>Modo oscuro</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTheme('light')} style={{ flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderColor: mode === 'light' ? colors.primary : colors.border, backgroundColor: mode === 'light' ? colors.primarySoft : colors.surfaceSoft }}>
              <Text style={{ color: mode === 'light' ? colors.primary : colors.textPrimary, fontWeight: '700' }}>Modo claro</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('mercado-pago')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Cobros con Mercado Pago</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'mercado-pago' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'mercado-pago' ? (
            <View style={[styles.card, styles.mpCard, styles.accordionBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.statusRow}>
                <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>{estadoTexto}</Text>
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
          ) : null}
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('tasas-interes')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Tasas de interés</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'tasas-interes' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'tasas-interes' ? (
            <View style={[styles.card, styles.interesesCard, styles.accordionBody]}>
              <Text style={[styles.cardTitleActive, { color: colors.textPrimary }]}>Préstamos mensuales</Text>
              <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>Administrá los porcentajes por cantidad de cuotas.</Text>
              {loadingIntereses ? (
                <View style={styles.interesesLoading}><ActivityIndicator size="small" color="#60A5FA" /></View>
              ) : isWeb ? (
                <View style={styles.interesesGrid}>
                  {interesesRows.map((row) => (
                    <View key={row.cuotas} style={[styles.interesRow, styles.interesRowWeb]}>
                      <Text style={styles.interesCuotaText}>{row.cuotas} cuota{row.cuotas > 1 ? 's' : ''}</Text>
                      <View style={styles.interesInputWrap}>
                        <TextInput value={row.porcentaje} onChangeText={(value) => onChangeInteres(row.cuotas, value)} editable={esAdmin} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748B" style={[styles.interesInput, !esAdmin && styles.interesInputReadonly, interesesErrors[row.cuotas] && styles.interesInputError]} />
                        <Text style={styles.interesPercent}>%</Text>
                      </View>
                      {!!interesesErrors[row.cuotas] && <Text style={styles.interesErrorText}>{interesesErrors[row.cuotas]}</Text>}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.mobileInteresCompact}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuotasChipsContainer}>
                    {interesesRows.map((row) => (
                      <TouchableOpacity key={row.cuotas} onPress={() => setSelectedCuotaMobile(row.cuotas)} style={[styles.cuotaChip, selectedCuotaMobile === row.cuotas && styles.cuotaChipActive]}>
                        <Text style={[styles.cuotaChipText, selectedCuotaMobile === row.cuotas && styles.cuotaChipTextActive]}>{row.cuotas}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {selectedInteresMobile ? (
                    <View style={styles.interesRow}>
                      <Text style={styles.interesCuotaText}>Cuota {selectedInteresMobile.cuotas}</Text>
                      <View style={styles.interesInputWrap}>
                        <TextInput value={selectedInteresMobile.porcentaje} onChangeText={(value) => onChangeInteres(selectedInteresMobile.cuotas, value)} editable={esAdmin} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748B" style={[styles.interesInput, !esAdmin && styles.interesInputReadonly, interesesErrors[selectedInteresMobile.cuotas] && styles.interesInputError]} />
                        <Text style={styles.interesPercent}>%</Text>
                      </View>
                      {!!interesesErrors[selectedInteresMobile.cuotas] && <Text style={styles.interesErrorText}>{interesesErrors[selectedInteresMobile.cuotas]}</Text>}
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.dailySection}>
                <Text style={[styles.cardTitleActive, { color: colors.textPrimary }]}>Préstamos diarios</Text>
                <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>Definí una tasa diaria base. Se aplica como interés total = tasa diaria × días.</Text>
                <View style={styles.interesRow}>
                  <Text style={styles.interesCuotaText}>Tasa diaria base</Text>
                  <View style={styles.interesInputWrap}>
                    <TextInput value={dailyInterestBase} onChangeText={onChangeDailyInterestBase} editable={esAdmin} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748B" style={[styles.interesInput, !esAdmin && styles.interesInputReadonly, !!dailyInterestError && styles.interesInputError]} />
                    <Text style={styles.interesPercent}>% diario</Text>
                  </View>
                  {!!dailyInterestError && <Text style={styles.interesErrorText}>{dailyInterestError}</Text>}
                </View>
              </View>

              {!esAdmin ? <Text style={styles.readonlyHint}>Solo un admin puede editar estas tasas.</Text> : null}
              <View style={styles.interesesButtons}>
                <TouchableOpacity style={[styles.saveInteresesButton, !isWeb && styles.mobileFullButton, (!esAdmin || savingIntereses || loadingIntereses) && styles.connectButtonDisabled]} onPress={guardarIntereses} disabled={!esAdmin || savingIntereses || loadingIntereses}>
                  {savingIntereses ? <ActivityIndicator size="small" color="#DBEAFE" /> : <Text style={styles.saveInteresesButtonText}>Guardar cambios</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.restoreInteresesButton, !isWeb && styles.mobileFullButton, (!esAdmin || savingIntereses || loadingIntereses) && styles.connectButtonDisabled]} onPress={restaurarInteresesDefault} disabled={!esAdmin || savingIntereses || loadingIntereses}>
                  <Text style={styles.restoreInteresesButtonText}>Restaurar valores por defecto</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('mora-atraso')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Mora por atraso</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'mora-atraso' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'mora-atraso' ? (
            <View style={[styles.card, styles.interesesCard, styles.accordionBody]}>
              <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>Configurá el porcentaje diario por tramo para cuotas vencidas.</Text>
              {loadingMora ? (
                <View style={styles.interesesLoading}><ActivityIndicator size="small" color="#60A5FA" /></View>
              ) : (
                <View style={styles.moraList}>
                  {moraRows.map((row) => {
                    const etiqueta = row.tramo === 'gracia' ? 'Días 1 a 3' : row.tramo === 'mora_normal' ? 'Días 4 a 10' : 'Día 11 en adelante'
                    return (
                      <View key={row.tramo} style={[styles.interesRow, isWeb && styles.moraRowWeb]}>
                        <Text style={styles.interesCuotaText}>{etiqueta}</Text>
                        <View style={styles.interesInputWrap}>
                          <TextInput value={row.porcentaje_diario} onChangeText={(value) => onChangeMora(row.tramo, value)} editable={esAdmin} keyboardType="numeric" placeholder="0" placeholderTextColor="#64748B" style={[styles.interesInput, !esAdmin && styles.interesInputReadonly, moraErrors[row.tramo] && styles.interesInputError]} />
                          <Text style={styles.interesPercent}>% diario</Text>
                        </View>
                        {!!moraErrors[row.tramo] && <Text style={styles.interesErrorText}>{moraErrors[row.tramo]}</Text>}
                      </View>
                    )
                  })}
                </View>
              )}
              {!esAdmin ? <Text style={styles.readonlyHint}>Solo un admin puede editar la mora por atraso.</Text> : null}
              <View style={styles.interesesButtons}>
                <TouchableOpacity style={[styles.saveInteresesButton, !isWeb && styles.mobileFullButton, (!esAdmin || savingMora || loadingMora) && styles.connectButtonDisabled]} onPress={guardarMora} disabled={!esAdmin || savingMora || loadingMora}>
                  {savingMora ? <ActivityIndicator size="small" color="#DBEAFE" /> : <Text style={styles.saveInteresesButtonText}>Guardar mora</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('administradores')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Administradores</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'administradores' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'administradores' ? (
            <View style={[styles.card, styles.cardActive, styles.accordionBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitleActive, { color: colors.textPrimary }]}>Agregar admin</Text>
              <View style={[styles.adminWarningBox, { backgroundColor: colors.surfaceSoft, borderColor: '#EF4444' }]}>
                <Text style={[styles.adminWarningTitle, { color: '#EF4444' }]}>⚠️ Acción sensible</Text>
                <Text style={[styles.adminWarningText, { color: colors.textSecondary }]}>
                  Esta acción crea un usuario con permisos totales de administración. Verificá el email y la identidad antes de continuar.
                </Text>
              </View>

              <View style={styles.businessGrid}>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminNombre}
                    onChangeText={setAdminNombre}
                    placeholder="Nombre completo"
                    placeholderTextColor={colors.textSecondary}
                    editable={esAdmin && !adminLoading}
                  />
                </View>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminEmail}
                    onChangeText={setAdminEmail}
                    placeholder="Email"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={esAdmin && !adminLoading}
                  />
                </View>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminTelefono}
                    onChangeText={setAdminTelefono}
                    placeholder="Teléfono (opcional)"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                    editable={esAdmin && !adminLoading}
                  />
                </View>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                    placeholder="Contraseña temporal"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    editable={esAdmin && !adminLoading}
                  />
                </View>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminPasswordRepeat}
                    onChangeText={setAdminPasswordRepeat}
                    placeholder="Repetir contraseña"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    editable={esAdmin && !adminLoading}
                  />
                </View>
                <View style={[styles.businessField, isWeb && styles.businessFieldWeb]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                    value={adminCurrentPassword}
                    onChangeText={setAdminCurrentPassword}
                    placeholder="Tu contraseña de admin"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    editable={esAdmin && !adminLoading}
                  />
                </View>
              </View>

              {adminStatus ? (
                <View style={[styles.adminStatusBox, adminStatus.type === 'success' ? styles.adminStatusSuccess : styles.adminStatusError]}>
                  <Text style={styles.adminStatusText}>{adminStatus.message}</Text>
                </View>
              ) : null}

              {!esAdmin ? (
                <Text style={[styles.readonlyHint, { color: colors.textSecondary }]}>Solo un admin puede crear otro admin.</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.saveInteresesButton,
                  !isWeb && styles.mobileFullButton,
                  (adminLoading || !esAdmin || !adminFormReadyForCountdown || countdownSeconds > 0) && styles.connectButtonDisabled,
                ]}
                onPress={crearAdmin}
                disabled={adminLoading || !esAdmin || !adminFormReadyForCountdown || countdownSeconds > 0}
              >
                {adminLoading ? (
                  <ActivityIndicator size="small" color="#DBEAFE" />
                ) : (
                  <Text style={styles.saveInteresesButtonText}>
                    {!adminFormReadyForCountdown
                      ? 'Completá los campos para confirmar'
                      : countdownSeconds > 0
                        ? `Confirmar en ${countdownSeconds}s`
                        : 'Crear administrador'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('biometria')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Biometría</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'biometria' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'biometria' ? (
            <View style={[styles.card, styles.cardActive, styles.accordionBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitleActive, { color: colors.textPrimary }]}>Ingreso con biometría</Text>
              <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>{biometricMessage}</Text>
              <View style={styles.buttonRow}>
                {biometricStatus === 'enabled' ? (
                  <TouchableOpacity style={[styles.disconnectButton, updatingBiometric ? styles.connectButtonDisabled : null]} onPress={handleDisableBiometrics} disabled={updatingBiometric}>
                    {updatingBiometric ? <ActivityIndicator size="small" color="#FECACA" /> : <Text style={styles.disconnectButtonText}>Desactivar biometría</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.connectButton, (biometricStatus === 'unsupported' || biometricStatus === 'not_enrolled' || updatingBiometric) ? styles.connectButtonDisabled : null]} onPress={handleEnableBiometrics} disabled={biometricStatus === 'unsupported' || biometricStatus === 'not_enrolled' || updatingBiometric}>
                    {updatingBiometric ? <ActivityIndicator size="small" color="#082F49" /> : <Text style={styles.connectButtonText}>Activar biometría</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.accordionSection}>
          <TouchableOpacity style={[styles.accordionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => toggleSection('seguridad')} activeOpacity={0.85}>
            <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>Seguridad</Text>
            <Text style={[styles.accordionChevron, { color: colors.textSecondary }]}>{openSection === 'seguridad' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {openSection === 'seguridad' ? (
            <View style={[styles.card, styles.cardActive, styles.accordionBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTextActive, { color: colors.textSecondary }]}>Cambiar contraseña de tu cuenta.</Text>
              <TouchableOpacity style={[styles.saveInteresesButton, !isWeb && styles.mobileFullButton, { marginTop: 12 }]} onPress={() => router.push('/cambiar-password')}>
                <Text style={styles.saveInteresesButtonText}>Cambiar contraseña</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020817',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
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
    fontSize: 34,
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
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  accordionSection: {
    marginBottom: 10,
  },
  accordionHeader: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accordionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  accordionChevron: {
    color: '#93C5FD',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  accordionBody: {
    marginTop: 6,
    marginBottom: 0,
  },
  mpCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  interesesCard: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
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
    lineHeight: 20,
  },
  businessGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  businessField: {
    width: '100%',
    paddingHorizontal: 6,
  },
  businessFieldWeb: {
    width: '50%',
  },
  businessSaveButton: {
    alignSelf: 'flex-end',
    marginTop: 14,
  },
  adminWarningBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  adminWarningTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  adminWarningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  adminStatusBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  adminStatusSuccess: {
    backgroundColor: '#052E16',
    borderColor: '#166534',
  },
  adminStatusError: {
    backgroundColor: '#3F1D2E',
    borderColor: '#9D174D',
  },
  adminStatusText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020817',
    color: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  preferenceRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  interesesLoading: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  interesesList: {
    marginTop: 12
  },
  interesesGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  mobileInteresCompact: {
    marginTop: 12,
  },
  cuotasChipsContainer: {
    gap: 8,
    paddingBottom: 8,
  },
  cuotaChip: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0B1220',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  cuotaChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#1E3A8A',
  },
  cuotaChipText: {
    color: '#CBD5E1',
    fontWeight: '700',
  },
  cuotaChipTextActive: {
    color: '#DBEAFE',
  },
  moraList: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  interesRow: {
    width: '100%',
    marginBottom: 12,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    backgroundColor: '#0B1220',
    padding: 12,
    gap: 8,
  },
  interesRowWeb: {
    width: '23%',
    minWidth: 210,
  },
  moraRowWeb: {
    width: '31%',
    minWidth: 220,
  },
  interesCuotaText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
  },
  interesInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  interesInput: {
    width: 96,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 36,
    color: '#E2E8F0',
    backgroundColor: '#020817',
  },
  interesInputReadonly: {
    opacity: 0.65,
  },
  interesInputError: {
    borderColor: '#DC2626',
  },
  interesPercent: {
    color: '#93C5FD',
    fontWeight: '800',
    fontSize: 12,
  },
  interesBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#052E16',
    borderWidth: 1,
    borderColor: '#166534',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  interesBadgeText: {
    color: '#86EFAC',
    fontWeight: '800',
    fontSize: 11,
  },
  interesErrorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
  readonlyHint: {
    marginTop: 10,
    color: '#94A3B8',
    fontSize: 12,
  },
  dailySection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#233047',
    paddingTop: 14,
  },
  interesesButtons: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  saveInteresesButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    minWidth: 190,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  saveInteresesButtonText: {
    color: '#DBEAFE',
    fontWeight: '800',
  },
  restoreInteresesButton: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileFullButton: {
    width: '100%',
  },
  restoreInteresesButtonText: {
    color: '#CBD5E1',
    fontWeight: '700',
  },
  interesesNotice: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    backgroundColor: '#22103B',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  interesesNoticeText: {
    color: '#E9D5FF',
    fontSize: 12,
    fontWeight: '700',
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
