import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import { AuthProvider } from '../context/AuthContext'

export default function RootLayout() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: '#0F172A',
          },
          headerTintColor: '#fff',
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
      />
    </AuthProvider>
  )
}