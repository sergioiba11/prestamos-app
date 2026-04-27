import { router } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native'
import { safeGoBack } from '../lib/navigation'
import { esNombreCompletoValido, normalizarNombreCompleto } from '../lib/nombre'
import { supabase } from '../lib/supabase'
import { createSystemActivity } from '../lib/activity'

export default function NuevoCliente() {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [dni, setDni] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const mostrarMensaje = (titulo: string, mensaje: string) => {
    if (typeof window !== 'undefined') {
      window.alert(`${titulo}\n\n${mensaje}`)
    } else {
      Alert.alert(titulo, mensaje)
    }
  }

  const guardarCliente = async () => {
    if (loading) return

    const nombreLimpio = normalizarNombreCompleto(nombre)
    const telefonoLimpio = telefono.trim()
    const direccionLimpia = direccion.trim()
    const dniLimpio = dni.trim()
    const emailLimpio = email.trim().toLowerCase()
    const passwordLimpia = password.trim()

    if (!nombreLimpio) {
      mostrarMensaje('Error', 'El nombre y apellido es obligatorio')
      return
    }

    if (!esNombreCompletoValido(nombreLimpio)) {
      mostrarMensaje('Error', 'Ingresar nombre completo')
      return
    }

    if (!emailLimpio || !passwordLimpia) {
      mostrarMensaje('Error', 'Completá email y contraseña')
      return
    }

    if (passwordLimpia.length < 6) {
      mostrarMensaje('Error', 'La contraseña debe tener al menos 6 caracteres')
      return
    }

    try {
      setLoading(true)

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      console.log('SESSION ERROR:', sessionError)
      console.log('SESSION USER:', session?.user)
      console.log('ACCESS TOKEN:', session?.access_token)

      if (sessionError || !session?.access_token || !session?.user?.id) {
        throw new Error('La sesión del admin expiró. Volvé a iniciar sesión.')
      }

      const adminIdAntes = session.user.id
      const tokenAntes = session.access_token
console.log('TOKEN FINAL:', tokenAntes)
    const res = await fetch(
  'https://itnwdpwnbcqerpmyygcv.supabase.co/functions/v1/crear-cliente',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenAntes}`,
    },
    body: JSON.stringify({
      nombre: nombreLimpio,
      telefono: telefonoLimpio,
      direccion: direccionLimpia,
      dni: dniLimpio,
      email: emailLimpio,
      password: passwordLimpia,
    }),
  }
)
      const data = await res.json().catch(() => null)

      console.log('STATUS crear-cliente:', res.status)
      console.log(
        'RESPUESTA crear-cliente:',
        JSON.stringify(data, null, 2)
      )

      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`)
      }

      const {
        data: { session: sessionFinal },
      } = await supabase.auth.getSession()

      console.log('SESSION FINAL USER:', sessionFinal?.user)
      console.log('SESSION FINAL TOKEN:', sessionFinal?.access_token)

      if (!sessionFinal?.user || !sessionFinal?.access_token) {
        throw new Error(
          'Se creó el cliente, pero no quedó una sesión activa del admin'
        )
      }

      if (sessionFinal.user.id !== adminIdAntes) {
        throw new Error(
          'La sesión cambió después de crear el cliente. No debería pasar.'
        )
      }

      try {
        await createSystemActivity({
          tipo: 'cliente_creado',
          titulo: 'Nuevo cliente creado',
          descripcion: `Se creó el cliente ${nombreLimpio}`,
          entidad_tipo: 'cliente',
          entidad_id: data?.cliente?.id || null,
          usuario_id: adminIdAntes,
          prioridad: 'normal',
          visible_en_notificaciones: true,
          metadata: { dni: dniLimpio, email: emailLimpio, telefono: telefonoLimpio },
        })
      } catch (activityError) {
        console.warn('No se pudo registrar actividad desde frontend (backend ya registró):', activityError)
      }

      mostrarMensaje('Éxito', 'Cliente creado correctamente')

      setNombre('')
      setTelefono('')
      setDireccion('')
      setDni('')
      setEmail('')
      setPassword('')

     safeGoBack('admin')
    } catch (error: any) {
      console.log('ERROR crear-cliente:', error)

      const mensaje =
        error?.message?.includes('already') ||
        error?.message?.includes('registrado')
          ? 'Ese email ya está registrado'
          : error?.message || 'No se pudo crear el cliente'

      mostrarMensaje('Error', mensaje)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.headerBack}
        onPress={() => safeGoBack('admin')}
        disabled={loading}
      >
        <Text style={styles.headerBackText}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nuevo cliente</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre completo"
        placeholderTextColor="#94A3B8"
        value={nombre}
        onChangeText={setNombre}
      />

      <TextInput
        style={styles.input}
        placeholder="Teléfono"
        placeholderTextColor="#94A3B8"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        placeholder="Dirección"
        placeholderTextColor="#94A3B8"
        value={direccion}
        onChangeText={setDireccion}
      />

      <TextInput
        style={styles.input}
        placeholder="DNI"
        placeholderTextColor="#94A3B8"
        value={dni}
        onChangeText={setDni}
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#94A3B8"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="#94A3B8"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={guardarCliente}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Guardando...' : 'Guardar cliente'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => safeGoBack('admin')}
        disabled={loading}
      >
        <Text style={styles.secondaryButtonText}>Volver</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    justifyContent: 'center',
    flexGrow: 1,
  },
  headerBack: {
    marginTop: 4,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  headerBackText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 15,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
})
