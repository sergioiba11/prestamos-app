import { Redirect } from 'expo-router'

// Pantalla no utilizada — redirige al inicio
export default function Explore() {
  return <Redirect href="/login" />
}
