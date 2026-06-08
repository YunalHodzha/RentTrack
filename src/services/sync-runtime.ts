import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/db/client';
import { useAuthStore } from '@/store/auth';
import { useSyncStore } from '@/store/sync';
import { toast } from '@/store/toast';
import { isSupabaseConfigured, requireSupabase } from '@/services/supabase';
import { runSync, type CursorStore, type SyncRemote, type TableName } from '@/services/sync';

const SYNC_INTERVAL_MS = 60_000;

// Set once the first sync has claimed any pre-auth (null-userId) rows. Guards
// claimLocalRows to run at most once per install, so a second account signing in
// on the same device can't vacuum up leftover unowned rows.
const PREAUTH_MIGRATED_KEY = 'renttrack_preauth_migrated';

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
 *
 * `notifySuccess`/`notifyError` управляват видимата обратна връзка (toast):
 *  - ръчният sync в Настройки известява и за двете;
 *  - sync-ът при старт известява само за грешка (за да не показва „синхронизирано"
 *    на всяко отваряне);
 *  - фоновите тригери (интервал/foreground/reconnect) мълчат, иначе offline би
 *    означавало toast на всеки 60 секунди.
 */
export async function syncNow(options: { notifySuccess?: boolean; notifyError?: boolean } = {}): Promise<void> {
  if (!isSupabaseConfigured || inFlight) return;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  inFlight = true;
  useSyncStore.getState().markSyncing();
  try {
    const alreadyMigrated = (await AsyncStorage.getItem(PREAUTH_MIGRATED_KEY)) === '1';
    await runSync(db, supabaseRemote, cursorFor(userId), userId, { claimPreauth: !alreadyMigrated });
    // Only after a successful run (so an offline failure retries the claim).
    if (!alreadyMigrated) await AsyncStorage.setItem(PREAUTH_MIGRATED_KEY, '1');
    useSyncStore.getState().markSynced();
    if (options.notifySuccess) toast.success('Данните са синхронизирани');
  } catch (e) {
    useSyncStore.getState().markError(e instanceof Error ? e.message : 'Неуспешна синхронизация');
    if (options.notifyError) toast.error('Няма връзка — промените ще се синхронизират по-късно');
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
  // Стартовият sync известява при провал (offline на старта), но не и при успех.
  void syncNow({ notifyError: true });

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
