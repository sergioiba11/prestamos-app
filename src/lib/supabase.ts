import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const envSupabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const envSupabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export const SUPABASE_URL =
  envSupabaseUrl || 'https://itnwdpwnbcqerpmyygcv.supabase.co'
export const SUPABASE_ANON_KEY =
  envSupabaseAnonKey || 'sb_publishable_UM8pd3LanUN-Z5wqbTNG6g_XN7K8mx7'
export const supabaseUrl = SUPABASE_URL
export const supabaseAnonKey = SUPABASE_ANON_KEY

const isWeb = Platform.OS === 'web'
const isSSR = typeof window === 'undefined'

const webStorage = {
  getItem: async (key: string) => {
    if (isSSR) return null
    return window.localStorage.getItem(key)
  },
  setItem: async (key: string, value: string) => {
    if (isSSR) return
    window.localStorage.setItem(key, value)
  },
  removeItem: async (key: string) => {
    if (isSSR) return
    window.localStorage.removeItem(key)
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: isWeb ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb && !isSSR,
    lock: processLock,
  },
})

console.log('SUPABASE CONFIG:', {
  url: SUPABASE_URL,
  anonKeyPrefix: SUPABASE_ANON_KEY?.slice(0, 20) || null,
  isWeb,
})

if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
