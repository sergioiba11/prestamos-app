import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

const AUTH_REDIRECT_BASE_URL = process.env.EXPO_PUBLIC_AUTH_REDIRECT_BASE_URL?.trim()
const APP_WEB_URL = process.env.EXPO_PUBLIC_APP_URL?.trim()

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '')
const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '')

const getDefaultBaseUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return stripTrailingSlash(window.location.origin)
  }

  return stripTrailingSlash(Linking.createURL('/'))
}

export const getAuthRedirectUrl = (path: string) => {
  const cleanPath = stripLeadingSlash(path)
  const baseUrl =
    AUTH_REDIRECT_BASE_URL ||
    (Platform.OS === 'web' ? APP_WEB_URL || getDefaultBaseUrl() : getDefaultBaseUrl())

  return `${stripTrailingSlash(baseUrl)}/${cleanPath}`
}

export const getRecoveryRedirectUrl = () => getAuthRedirectUrl('reset-password')

type RecoveryTokens = {
  access_token: string
  refresh_token: string
  type?: string
}

export const getRecoveryTokensFromUrl = (url: string): RecoveryTokens | null => {
  const [, hash = ''] = url.split('#')
  const params = new URLSearchParams(hash)

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) return null

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    type: params.get('type') || undefined,
  }
}
