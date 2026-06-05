import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/db/client';
import { useAuthStore } from '@/store/auth';
import { useSyncStore } from '@/store/sync';
import { isSupabaseConfigured, requireSupabase } from '@/services/supabase';
import { runSync, type CursorStore, type SyncRemote, type TableName } from '@/services/sync';

const SYNC_INTERVAL_MS = 60_000;

/** Real transport: upsert/select against Supabase (RLS scopes rows to the user). */
const supabaseRemote: SyncRemote = {
  async push(table: TableName, rows) {
    const { error } = await requireSupabase().from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  },
  async pull(table: TableName, since) {
    const { data, error } = await requireSupabase().from(table).select('*').gt('updated_at', since);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};

/** Cursor is namespaced per user so switching accounts on one device can't skip data. */
function cursorFor(userId: string): CursorStore {
  const key = `renttrack_sync_cursor_${userId}`;
  return {
    get: async () => (await AsyncStorage.getItem(key)) ?? '',
    set: (value) => AsyncStorage.setItem(key, value),
  };
}

let inFlight = false;

/**
 * Run a sync if possible. Safe to call from any trigger: it no-ops when
 * unconfigured, signed out, or already running, and swallows transport errors
 * (offline) so the next trigger simply retries.
 */
export async function syncNow(): Promise<void> {
  if (!isSupabaseConfigured || inFlight) return;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  inFlight = true;
  useSyncStore.getState().markSyncing();
  try {
    await runSync(db, supabaseRemote, cursorFor(userId), userId);
    useSyncStore.getState().markSynced();
  } catch (e) {
    useSyncStore.getState().markError(e instanceof Error ? e.message : 'Неуспешна синхронизация');
  } finally {
    inFlight = false;
  }
}

/**
 * Wire the sync triggers: an immediate run, a periodic interval, app-foreground,
 * and network reconnect. Returns a cleanup function; call it when the session
 * ends so timers and listeners are torn down.
 */
export function setupSyncTriggers(): () => void {
  void syncNow();

  const interval = setInterval(() => { void syncNow(); }, SYNC_INTERVAL_MS);

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncNow();
  });

  // Flush on reconnect: only on the offline→online transition, not every event.
  let wasConnected = true;
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const connected = Boolean(state.isConnected);
    if (connected && !wasConnected) void syncNow();
    wasConnected = connected;
  });

  return () => {
    clearInterval(interval);
    appStateSub.remove();
    unsubscribeNet();
  };
}
