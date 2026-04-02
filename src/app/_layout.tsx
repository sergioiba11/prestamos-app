import { Stack, router } from 'expo-router'
import { Image, TouchableOpacity } from 'react-native'
import { AuthProvider } from '../context/AuthContext'

export default function RootLayout() {
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
            <TouchableOpacity
              onPress={() => router.replace('/admin-home' as any)}
              activeOpacity={0.8}
            >
              <Image
                source={require('../../assets/images/logo.png')}
                style={{
                  width: 132,
                  height: 38,
                }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ),
        }}
      />
    </AuthProvider>
  )
}