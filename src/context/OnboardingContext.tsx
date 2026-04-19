import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { IdentityData, RegistrationStatus } from '../lib/onboarding'

type OnboardingState = {
  dni: string
  identity: IdentityData | null
  isIdentityConfirmed: boolean
  isCodeValidated: boolean
  verifiedPhone: string
  registrationStatus: RegistrationStatus | null
  biometricsEnabled: boolean | null
}

type OnboardingContextType = {
  state: OnboardingState
  loading: boolean
  updateState: (patch: Partial<OnboardingState>) => void
  resetState: () => void
}

const STORAGE_KEY = 'creditodo:onboarding'

const initialState: OnboardingState = {
  dni: '',
  identity: null,
  isIdentityConfirmed: false,
  isCodeValidated: false,
  verifiedPhone: '',
  registrationStatus: null,
  biometricsEnabled: null,
}

const OnboardingContext = createContext<OnboardingContextType>({
  state: initialState,
  loading: true,
  updateState: () => undefined,
  resetState: () => undefined,
})

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initialState)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw) {
          setState({ ...initialState, ...JSON.parse(raw) })
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const updateState = (patch: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const resetState = () => {
    setState(initialState)
    void AsyncStorage.removeItem(STORAGE_KEY)
  }

  const value = useMemo(
    () => ({ state, loading, updateState, resetState }),
    [state, loading]
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  return useContext(OnboardingContext)
}
