// URL polyfill must load before @supabase/supabase-js: the client uses the WHATWG
// URL API, which React Native's Hermes runtime doesn't provide out of the box.
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether the Supabase env vars are present. The app is gated behind auth, so
 * when this is false the auth screen shows a "backend not configured" message
 * instead of crashing — useful for a fresh checkout without a `.env`.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * The Supabase client, or null when unconfigured. Consumers should check
 * `isSupabaseConfigured` (or use `requireSupabase()`) before calling.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL-based session detection in a native app (that's a web concern).
        detectSessionInUrl: false,
      },
    })
  : null;

/** Narrow the nullable client to a non-null one, throwing a clear error if not configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase не е конфигуриран. Задайте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY в .env.',
    );
  }
  return supabase;
}

// Keep the session token fresh while the app is in the foreground, and stop the
// timer in the background (per the supabase-js React Native guidance).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
