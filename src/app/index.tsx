import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { goByRole } from '../lib/auth-routing'
import { supabase } from '../lib/supabase'

const MIN_SPLASH_MS = 1000
const STATUS_STEPS = ['Cargando usuarios...', 'Cargando préstamos...', 'Sincronizando pagos...']

export default function Index() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.94)).current
  const textFadeAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(0)).current
  const [dots, setDots] = useState('...')
  const [statusStep, setStatusStep] = useState(0)

  useEffect(() => {
    let mounted = true
    const splashStartedAt = Date.now()

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 52,
        useNativeDriver: true,
      }),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start()

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )

    pulseLoop.start()

    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev === '.') return '...'
        if (prev === '..') return '.'
        return '..'
      })
    }, 450)

    const statusInterval = setInterval(() => {
      setStatusStep((prev) => (prev + 1) % STATUS_STEPS.length)
    }, 850)

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      const elapsed = Date.now() - splashStartedAt
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed)
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining))
      }

      if (!mounted) return

      if (session?.user) {
        await goByRole(session.user.id)
        return
      }

      router.replace('/login' as any)
    }

    boot()

    return () => {
      mounted = false
      clearInterval(dotsInterval)
      clearInterval(statusInterval)
      pulseLoop.stop()
    }
  }, [fadeAnim, pulseAnim, scaleAnim, textFadeAnim])

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  })

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  })

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#020817', '#0B1220', '#1E3A8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" backgroundColor="#020817" />

        <View style={styles.topGlow} />
        <View style={styles.centerGlow} />
        <View style={styles.bottomGlow} />

        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }, { scale: pulseScale }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
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
          <Text style={styles.loadingText}>Preparando tu panel{dots}</Text>
          <Text style={styles.statusStep}>{STATUS_STEPS[statusStep]}</Text>
          <ActivityIndicator size="small" color="#2563EB" style={styles.spinner} />
        </Animated.View>

        <Text style={styles.footerText}>CrediTodo · Panel financiero</Text>
      </LinearGradient>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    top: -210,
    width: 440,
    height: 440,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },

  centerGlow: {
    position: 'absolute',
    top: '42%',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 165, 233, 0.06)',
  },

  bottomGlow: {
    position: 'absolute',
    bottom: -200,
    width: 400,
    height: 400,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.10)',
  },

  logoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 34,
  },

  logoGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.10)',
  },

  logo: {
    width: 330,
    height: 150,
  },

  loadingWrapper: {
    position: 'absolute',
    bottom: 112,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },

  loadingText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  statusStep: {
    marginTop: 8,
    color: 'rgba(226, 232, 240, 0.86)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  spinner: {
    marginTop: 14,
  },

  footerText: {
    position: 'absolute',
    bottom: 40,
    color: 'rgba(203, 213, 225, 0.64)',
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
})
