import { router } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from 'react-native'
import { supabase } from '../lib/supabase'

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

    const nombreLimpio = nombre.trim()
    const telefonoLimpio = telefono.trim()
    const direccionLimpia = direccion.trim()
    const dniLimpio = dni.trim()
    const emailLimpio = email.trim().toLowerCase()
    const passwordLimpia = password.trim()

    if (!nombreLimpio || !emailLimpio || !passwordLimpia) {
      mostrarMensaje('Error', 'Completá nombre, email y contraseña')
      return
    }

    if (passwordLimpia.length < 6) {
      mostrarMensaje('Error', 'La contraseña debe tener al menos 6 caracteres')
      return
    }

    try {
      setLoading(true)

      console.log('INICIO crear cliente')

      // 1) Crear usuario auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: emailLimpio,
        password: passwordLimpia,
      })

      console.log('SIGNUP DATA:', signUpData)
      console.log('SIGNUP ERROR:', signUpError)

      if (signUpError) {
        throw signUpError
      }

      if (!signUpData.user?.id) {
        throw new Error('No se pudo crear el usuario en auth')
      }

      const userId = signUpData.user.id

      // 2) Insertar en usuarios
      const { error: errorUsuario } = await supabase
        .from('usuarios')
        .insert({
          id: userId,
          nombre: nombreLimpio,
          email: emailLimpio,
          rol: 'cliente',
        })

      console.log('INSERT usuarios ERROR:', errorUsuario)

      if (errorUsuario) {
        throw new Error(`Error en usuarios: ${errorUsuario.message}`)
      }

      // 3) Insertar en clientes
      const { data: clienteInsertado, error: errorCliente } = await supabase
        .from('clientes')
        .insert({
          nombre: nombreLimpio,
          telefono: telefonoLimpio || null,
          direccion: direccionLimpia || null,
          dni: dniLimpio || null,
          usuario_id: userId,
        })
        .select()
        .single()

      console.log('INSERT cliente DATA:', clienteInsertado)
      console.log('INSERT cliente ERROR:', errorCliente)

      if (errorCliente) {
        throw new Error(`Error en clientes: ${errorCliente.message}`)
      }

      mostrarMensaje('Éxito', 'Cliente creado correctamente')

      if (clienteInsertado?.id) {
        router.replace(`/cliente-detalle?cliente_id=${clienteInsertado.id}` as any)
      } else {
        router.replace('/admin-home' as any)
      }
    } catch (error: any) {
      console.log('ERROR CREAR CLIENTE:', error)

      const mensaje =
        error?.message?.includes('User already registered')
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
      <TouchableOpacity style={styles.headerBack} onPress={() => router.back()} disabled={loading}>
        <Text style={styles.headerBackText}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nuevo cliente</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
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
        onPress={() => router.back()}
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