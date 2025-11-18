import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MenuItem = {
  id: number;
  title: string;
  desc: string;
  price: string;
};

export default function MenuScreen() {
  const [cart, setCart] = useState<MenuItem[]>([]); // ✅ Define type for cart

  const handleItemPress = (item: MenuItem) => {
    setCart((prev) => [...prev, item]);
    Alert.alert("Added to Cart", `${item.title} has been added.`);
  };

  const menuItems: MenuItem[] = [
    { id: 1, title: "Eggplant Moussaka (D, G)", desc: "Baked layers of eggplant and tomato sauce.", price: "AED 55.00" },
    { id: 2, title: "Falafel Platter", desc: "Chickpea patties served with tahini sauce.", price: "AED 40.00" },
    { id: 3, title: "Hummus with Pita", desc: "Classic hummus served with warm pita bread.", price: "AED 30.00" },
    { id: 4, title: "Grilled Halloumi", desc: "Grilled cheese served with tomato and olive oil.", price: "AED 45.00" },
    { id: 5, title: "Stuffed Grape Leaves", desc: "Rice and herbs rolled in grape leaves.", price: "AED 35.00" },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>HOT APPETIZERS</Text>

        {menuItems.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.item} 
            onPress={() => handleItemPress(item)}
          >
            <Image
              source={require('@/assets/images/partial-react-logo.png')}
              style={styles.image}
            />
            <View style={styles.textContainer}>
              <Text style={styles.title}>{item.title}</Text>
              <Text>{item.desc}</Text>
              <Text style={styles.price}>{item.price}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {cart.length > 0 && (
        <View style={styles.cartContainer}>
          <Text style={styles.cartText}>🛒 {cart.length} item(s) in cart</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  item: { 
    flexDirection: 'row', 
    marginBottom: 16, 
    backgroundColor: '#f8f8f8', 
    borderRadius: 8, 
    padding: 8,
    alignItems: 'center'
  },
  image: { width: 100, height: 100, marginRight: 10, borderRadius: 8 },
  textContainer: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 'bold' },
  price: { marginTop: 5, fontWeight: 'bold', color: '#444' },
  cartContainer: {
    backgroundColor: '#333',
    padding: 12,
    alignItems: 'center'
  },
  cartText: { color: '#fff', fontWeight: 'bold' }
});
