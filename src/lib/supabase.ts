import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://itnwdpwnbcqerpmyygcv.supabase.co'
const supabaseAnonKey = 'sb_publishable_UM8pd3LanUN-Z5wqbTNG6g_XN7K8mx7'

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb && !isSSR,
    lock: processLock,
  },
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