import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

export default function WelcomeScreen() {
  const fade = useRef(new Animated.Value(0)).current
  const translate = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  return (
    <LinearGradient
      colors={['#0F172A', '#1E3A8A', '#2563EB']}
      style={styles.background}
    >
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={styles.container}>
        <View style={styles.topIndicators}>
          <View style={[styles.line, styles.activeLine]} />
          <View style={styles.line} />
          <View style={styles.line} />
        </View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: fade,
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <Text style={styles.title}>Tu crédito más cerca</Text>

          <Text style={styles.subtitle}>
            Ingresá o activá tu cuenta para continuar
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/register' as any)}
          >
            <Text style={styles.primaryButtonText}>
              Activar cuenta
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/login' as any)}
          >
            <Text style={styles.secondaryButtonText}>
              Iniciar sesión
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  topIndicators: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    width: '100%',
    maxWidth: 520,
  },

  line: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  activeLine: {
    backgroundColor: '#ffffff',
  },

  content: {
    marginBottom: 40,
    width: '100%',
    maxWidth: 520,
  },

  title: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    marginBottom: 12,
  },

  subtitle: {
    color: '#DBEAFE',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 36,
  },

  primaryButton: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 14,
  },

  primaryButtonText: {
    color: '#1D4ED8',
    fontSize: 18,
    fontWeight: '700',
  },

  secondaryButton: {
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  secondaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
})
