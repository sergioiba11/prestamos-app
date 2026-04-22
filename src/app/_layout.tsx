import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import { authTheme } from '../constants/auth-theme'
import { AuthProvider } from '../context/AuthContext'
import { OnboardingProvider } from '../context/OnboardingContext'

export default function RootLayout() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <AuthProvider>
      <OnboardingProvider>
        <Stack
          screenOptions={{
            headerShown: true,
            headerStyle: {
              backgroundColor: authTheme.card,
            },
            headerTintColor: authTheme.text,
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerTitle: () => (
              <View>
                <Image
                  source={require('../../assets/images/logo.png')}
                  style={{
                    width: 132,
                    height: 38,
                  }}
                  resizeMode="contain"
                />
              </View>
            ),
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />

          <Stack.Screen name="admin-home" options={{ headerShown: false }} />
          <Stack.Screen name="historial-prestamos" options={{ headerShown: false }} />
          <Stack.Screen name="pagos-pendientes" options={{ headerShown: false }} />
          <Stack.Screen name="clientes" options={{ headerShown: false }} />
          <Stack.Screen name="nuevo-prestamo" options={{ headerShown: false }} />
          <Stack.Screen name="cargar-pago" options={{ headerShown: false }} />
          <Stack.Screen name="nuevo-cliente" options={{ headerShown: false }} />
          <Stack.Screen name="nuevo-empleado" options={{ headerShown: false }} />
          <Stack.Screen name="configuraciones" options={{ headerShown: false }} />
          <Stack.Screen name="cliente-detalle" options={{ headerShown: false }} />
        </Stack>
      </OnboardingProvider>
    </AuthProvider>
  )
}
