import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function MenuScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>HOT APPETIZERS</Text>

      <View style={styles.item}>
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.image}
        />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Eggplant Moussaka (D, G)</Text>
          <Text>Baked layers of eggplant and tomato sauce.</Text>
          <Text style={styles.price}>AED 55.00</Text>
        </View>
      </View>

  

      {/* Repeat for other dishes */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  item: { flexDirection: 'row', marginBottom: 16 },
  image: { width: 100, height: 100, marginRight: 10, borderRadius: 8 },
  textContainer: { flex: 1 },
  title: { fontSize: 16, fontWeight: 'bold' },
  price: { marginTop: 5, fontWeight: 'bold' }
});
