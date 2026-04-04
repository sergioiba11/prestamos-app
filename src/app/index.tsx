import { router, Stack } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'

async function goByRole(userId: string) {
  const { data: userData, error } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()

  if (error) {
    router.replace('/login' as any)
    return
  }

  const rol = userData?.rol

if (rol === 'admin') {
  router.replace('/admin-home' as any)
  return
}
  if (rol === 'empleado') {
    router.replace('/empleado-home' as any)
    return
  }

  router.replace('/cliente-home' as any)
}

export default function Index() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.82)).current
  const textFadeAnim = useRef(new Animated.Value(0)).current
  const glowAnim = useRef(new Animated.Value(0.4)).current
  const [dots, setDots] = useState('')

  useEffect(() => {
    let mounted = true

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start()

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )

    glowLoop.start()

    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return ''
        return prev + '.'
      })
    }, 400)

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (session?.user) {
        await goByRole(session.user.id)
        return
      }

      router.replace('/login' as any)
    }

    const timer = setTimeout(() => {
      boot()
    }, 2200)

    return () => {
      mounted = false
      clearTimeout(timer)
      clearInterval(dotsInterval)
      glowLoop.stop()
    }
  }, [fadeAnim, scaleAnim, textFadeAnim, glowAnim])

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#020817" />

        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />

        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: glowAnim,
                transform: [{ scale: glowAnim }],
              },
            ]}
          />

          <Image
            source={require('../../assets/images/logo-carga.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.loadingWrapper,
            {
              opacity: textFadeAnim,
            },
          ]}
        >
          <Text style={styles.loadingText}>Cargando{dots}</Text>
        </Animated.View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    top: -180,
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.10)',
  },

  bottomGlow: {
    position: 'absolute',
    bottom: -180,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
  },

  logoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
  },

  logoGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },

  logo: {
    width: 330,
    height: 150,
  },

  loadingWrapper: {
    position: 'absolute',
    bottom: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
})