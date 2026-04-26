import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'

export type AppThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'app_theme_mode'

const lightColors = {
  background: '#EAF3FF',
  surface: '#FFFFFF',
  surfaceSoft: '#F4F8FF',
  sidebarBg: '#F8FBFF',
  border: '#CFE0FF',
  textPrimary: '#0F1E3A',
  textSecondary: '#557099',
  primary: '#2457E6',
  primarySoft: '#EAF0FF',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#F59E0B',
}

const darkColors = {
  background: '#020817',
  surface: '#0B1220',
  surfaceSoft: '#0F172A',
  sidebarBg: '#030B1A',
  border: '#1E293B',
  textPrimary: '#E2E8F0',
  textSecondary: '#94A3B8',
  primary: '#2563EB',
  primarySoft: '#1E3A8A',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
}

export type AppTheme = {
  mode: AppThemeMode
  colors: typeof lightColors
  isDark: boolean
  isLight: boolean
}

type AppThemeContextValue = {
  theme: AppTheme
  mode: AppThemeMode
  setTheme: (next: AppThemeMode) => void
  toggleTheme: () => void
  hydrated: boolean
}

const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined)

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppThemeMode>('dark')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY)
        if (mounted && (saved === 'dark' || saved === 'light')) {
          setMode(saved)
        }
      } finally {
        if (mounted) setHydrated(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const setTheme = (next: AppThemeMode) => {
    setMode(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }

  const toggleTheme = () => {
    setTheme(mode === 'dark' ? 'light' : 'dark')
  }

  const value = useMemo<AppThemeContextValue>(() => {
    const colors = mode === 'dark' ? darkColors : lightColors
    return {
      mode,
      hydrated,
      setTheme,
      toggleTheme,
      theme: {
        mode,
        colors,
        isDark: mode === 'dark',
        isLight: mode === 'light',
      },
    }
  }, [mode, hydrated])

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext)
  if (!ctx) throw new Error('useAppTheme must be used inside AppThemeProvider')
  return ctx
}
