import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const BIOMETRIC_STORAGE_KEY = 'prestamos_biometric_v1'

export type BiometricState = {
  enabled: boolean
  userId: string | null
  enabledAt: string | null
}

export type BiometricAvailability = {
  supported: boolean
  enrolled: boolean
  available: boolean
}

const EMPTY_STATE: BiometricState = {
  enabled: false,
  userId: null,
  enabledAt: null,
}

function canUseBiometricFeatures() {
  return Platform.OS !== 'web'
}

export async function canUseSecureStorage() {
  if (!canUseBiometricFeatures()) return false
  return SecureStore.isAvailableAsync()
}

export async function getBiometricState(): Promise<BiometricState> {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return EMPTY_STATE

  const raw = await SecureStore.getItemAsync(BIOMETRIC_STORAGE_KEY)
  if (!raw) return EMPTY_STATE

  try {
    const parsed = JSON.parse(raw) as Partial<BiometricState>
    return {
      enabled: parsed.enabled === true,
      userId: parsed.userId ?? null,
      enabledAt: parsed.enabledAt ?? null,
    }
  } catch {
    return EMPTY_STATE
  }
}

export async function setBiometricState(state: BiometricState) {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return

  await SecureStore.setItemAsync(BIOMETRIC_STORAGE_KEY, JSON.stringify(state), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
}

export async function enableBiometricForUser(userId: string) {
  await setBiometricState({
    enabled: true,
    userId,
    enabledAt: new Date().toISOString(),
  })
}

export async function disableBiometric() {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return
  await SecureStore.deleteItemAsync(BIOMETRIC_STORAGE_KEY)
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!canUseBiometricFeatures()) {
    return { supported: false, enrolled: false, available: false }
  }

  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) {
    return { supported: false, enrolled: false, available: false }
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const isEnrolled = hasHardware
    ? await LocalAuthentication.isEnrolledAsync()
    : false

  return {
    supported: hasHardware,
    enrolled: isEnrolled,
    available: hasHardware && isEnrolled,
  }
}

export async function authenticateWithBiometrics() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirmá tu identidad',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
    fallbackLabel: 'Usar código del dispositivo',
  })
}
