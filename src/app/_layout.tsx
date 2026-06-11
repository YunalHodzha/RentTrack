import '../global.css';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
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
import { Loading, ToastHost, ConfirmHost, ErrorState } from '@/components/ui';
import { AuthScreen } from '@/components/auth-screen';
import { ResetPasswordScreen } from '@/components/reset-password-screen';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState(false);
  const { session, initializing: authInitializing } = useAuthStore();
  const t = useTheme();

  const runInit = useCallback(() => {
    setInitError(false);
    setupNotificationListeners();
    const loadSettings = useSettingsStore.getState().loadSettings;
    const initAuth = useAuthStore.getState().init;
    initDatabase()
      .then(() => loadSettings())
      .then(() => requestNotificationPermissions())
      .then(() => initAuth())
      .then(() => setDbReady(true))
      .catch((e) => { console.error(e); setInitError(true); })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => { runInit(); }, [runInit]);

  function handleRetryInit() {
    setDbReady(false);
    runInit();
  }

  const ready = dbReady && !authInitializing;

  // Password recovery deep link (renttrack://reset-password#... / exp://.../--/reset-password#...).
  // Прихваща се тук, а не като route: без сесия Stack-ът изобщо не е монтиран,
  // а екранът трябва да е достъпен без вход. Флагът държи екрана видим, докато
  // потребителят запази паролата — setSession от линка създава сесия по средата
  // на потока и иначе gate-ът би превключил към приложението преждевременно.
  const incomingUrl = Linking.useURL();
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  useEffect(() => {
    if (incomingUrl && incomingUrl.includes('reset-password')) setRecoveryUrl(incomingUrl);
  }, [incomingUrl]);

  // Start sync once signed in; tear it down on sign-out. Keyed by user id so a
  // token refresh (new session object, same user) doesn't restart the triggers.
  // Overdue-marking and reminder-scheduling are user-scoped, so they run here
  // (once a user is known) rather than at pre-auth startup.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!ready || !userId) return;
    void markOverduePayments(userId).then(() => schedulePaymentReminders());
    return setupSyncTriggers();
  }, [ready, userId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={t.isDark ? 'light' : 'dark'} />
        {initError ? (
          <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
            <ErrorState
              title="Грешка при стартиране"
              message="Данните не можаха да се заредят. Проверете връзката и опитайте отново."
              onRetry={handleRetryInit}
            />
          </View>
        ) : !ready ? (
          <Loading />
        ) : recoveryUrl ? (
          <ResetPasswordScreen url={recoveryUrl} onDone={() => setRecoveryUrl(null)} />
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
            <Stack.Screen name="reset-password" />
          </Stack>
        )}
        {/* Над всичко (вкл. auth екрана) — единната обратна връзка. */}
        <ToastHost />
        {/* Потвържденията за разрушителни действия — над всичко, вкл. отворен SheetModal. */}
        <ConfirmHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
