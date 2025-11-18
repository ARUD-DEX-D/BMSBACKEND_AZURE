// app/_layout.tsx (modify your existing file)
import { useColorScheme } from '@/hooks/useColorScheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* outer wrapper centers the app on wide screens */}
      <View style={styles.outer}>
        {/* mobileFrame limits width to mimic a phone screen */}
        <View style={styles.mobileFrame}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" options={{ headerShown: false }} />
          </Stack>
        </View>
      </View>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#f2f4f6',     // background behind the phone frame
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileFrame: {
    width: '100%',
    maxWidth: 420,                 // phone width limit
    minHeight: '100%',
    backgroundColor: '#ffffff',    // app background
    // add subtle shadow on web (RN web supports elevation not always)
    ...Platform.select({
      web: {
        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        borderRadius: 12,
        overflow: 'hidden',
      },
      default: { flex: 1 },
    }),
    // On native platforms this simply fills screen (no centering)
  },
});
