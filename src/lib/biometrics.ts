import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled'
const BIOMETRIC_USER_ID_KEY = 'biometric_user_id'
const BIOMETRIC_ENABLED_AT_KEY = 'biometric_enabled_at'

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

export async function hasBiometricHardwareAsync() {
  if (!canUseBiometricFeatures()) return false
  return LocalAuthentication.hasHardwareAsync()
}

export async function isBiometricEnrolledAsync() {
  const hasHardware = await hasBiometricHardwareAsync()
  if (!hasHardware) return false
  return LocalAuthentication.isEnrolledAsync()
}

export async function authenticateWithBiometrics() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirmá tu identidad',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
    fallbackLabel: 'Usar código del dispositivo',
  })
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) {
    return { supported: false, enrolled: false, available: false }
  }

  const supported = await hasBiometricHardwareAsync()
  const enrolled = supported ? await isBiometricEnrolledAsync() : false

  return {
    supported,
    enrolled,
    available: supported && enrolled,
  }
}

export async function getBiometricState(): Promise<BiometricState> {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return EMPTY_STATE

  const [enabledRaw, userId, enabledAt] = await Promise.all([
    SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
    SecureStore.getItemAsync(BIOMETRIC_USER_ID_KEY),
    SecureStore.getItemAsync(BIOMETRIC_ENABLED_AT_KEY),
  ])

  return {
    enabled: enabledRaw === 'true',
    userId: userId || null,
    enabledAt: enabledAt || null,
  }
}

export async function enableBiometricForUser(userId: string) {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return

  const now = new Date().toISOString()

  await Promise.all([
    SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(BIOMETRIC_USER_ID_KEY, userId, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(BIOMETRIC_ENABLED_AT_KEY, now, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ])
}

export async function disableBiometric() {
  const secureStoreAvailable = await canUseSecureStorage()
  if (!secureStoreAvailable) return

  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_USER_ID_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_AT_KEY),
  ])
}
