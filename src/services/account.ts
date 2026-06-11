import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/db/client';
import { wipeLocalAccountData } from '@/db/wipe';
import { cancelScheduledReminders } from '@/services/notifications';
import { isSupabaseConfigured, requireSupabase } from '@/services/supabase';
import { withSyncPaused } from '@/services/sync-runtime';
import { useAuthStore } from '@/store/auth';

/**
 * Пълно изтриване на акаунта (изискване на Apple + GDPR право на изтриване).
 *
 * Редът е изричен — НЕ разчитаме на onAuthStateChange да чисти данни, за да
 * няма race с фоновия sync (целият поток тече под sync mutex-а):
 *   1. RPC `delete_my_account` (supabase/account-deletion.sql) трие акаунта и
 *      всички облачни данни. При грешка спираме тук — локално нищо не е пипнато.
 *   2. Локален hard wipe на четирите таблици + sync курсора на потребителя.
 *   3. signOut → auth gate-ът връща екрана за вход.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase не е конфигуриран.' };
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return { error: 'Няма активна сесия.' };

  return withSyncPaused(async () => {
    const { error } = await requireSupabase().rpc('delete_my_account');
    if (error) return { error: error.message };

    await wipeLocalAccountData(db, userId, AsyncStorage);
    // Насрочените напомняния сочат към току-що изтрити данни — чистим ги
    // заедно с локалния wipe.
    await cancelScheduledReminders();
    await useAuthStore.getState().signOut();
    return { error: null };
  });
}
