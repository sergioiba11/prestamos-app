import { StyleSheet, Text, View } from 'react-native'

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Pantalla explore</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
  },
})