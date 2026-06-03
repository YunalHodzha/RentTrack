import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '@/db/client';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch(console.error)
      .finally(() => SplashScreen.hideAsync());
  }, []);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="property/[id]" options={{ headerShown: true, title: 'Имот' }} />
      <Stack.Screen name="tenant/[id]" options={{ headerShown: true, title: 'Наемател' }} />
    </Stack>
  );
}
