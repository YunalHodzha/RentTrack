import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '@/db/client';
import { Loading } from '@/components/ui';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const t = useTheme();

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch(console.error)
      .finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={t.isDark ? 'light' : 'dark'} />
        {!ready ? (
          <Loading />
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: t.bg },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="property/[id]" options={{ headerShown: true, title: 'Имот' }} />
            <Stack.Screen name="tenant/[id]" options={{ headerShown: true, title: 'Наемател' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
