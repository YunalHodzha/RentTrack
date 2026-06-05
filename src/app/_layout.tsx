import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '@/db/client';
import { markOverduePayments } from '@/db/utils';
import { requestNotificationPermissions, schedulePaymentReminders, setupNotificationListeners } from '@/services/notifications';
import { useSettingsStore } from '@/store/settings';
import { useAuthStore } from '@/store/auth';
import { setupSyncTriggers } from '@/services/sync-runtime';
import { Loading } from '@/components/ui';
import { AuthScreen } from '@/components/auth-screen';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const { session, initializing: authInitializing } = useAuthStore();
  const t = useTheme();

  useEffect(() => {
    setupNotificationListeners();
    const loadSettings = useSettingsStore.getState().loadSettings;
    const initAuth = useAuthStore.getState().init;
    initDatabase()
      .then(() => loadSettings())
      .then(() => markOverduePayments())
      .then(() => requestNotificationPermissions())
      .then(() => schedulePaymentReminders())
      .then(() => initAuth())
      .then(() => setDbReady(true))
      .catch(console.error)
      .finally(() => SplashScreen.hideAsync());
  }, []);

  const ready = dbReady && !authInitializing;

  // Start sync once signed in; tear it down on sign-out. Keyed by user id so a
  // token refresh (new session object, same user) doesn't restart the triggers.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!ready || !userId) return;
    return setupSyncTriggers();
  }, [ready, userId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={t.isDark ? 'light' : 'dark'} />
        {!ready ? (
          <Loading />
        ) : !session ? (
          <AuthScreen />
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: t.bg },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="property/[id]" options={{ headerShown: true, title: 'Имот' }} />
            <Stack.Screen name="tenant/[id]" options={{ headerShown: true, title: 'Наемател' }} />
            <Stack.Screen name="reports" options={{ headerShown: true, title: 'Справки' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
