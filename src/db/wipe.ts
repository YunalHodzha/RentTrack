import { leases, payments, properties, tenants } from './schema';
import type { AppDatabase } from './soft-delete';

/**
 * Минимален интерфейс към AsyncStorage (само каквото wipe-ът ползва), за да е
 * функцията тестваема в node без react-native.
 */
export interface KeyValueStorage {
  removeItem: (key: string) => Promise<void>;
}

/** AsyncStorage ключ на sync курсора за даден потребител (ползва се и от sync-runtime). */
export const syncCursorKey = (userId: string) => `renttrack_sync_cursor_${userId}`;

/**
 * Локалната половина на изтриването на акаунт: ТВЪРД delete на всички редове
 * от четирите таблици + изтриване на sync курсора на потребителя.
 *
 * Това е едно от двете места (с import-replace в export.ts), където hard delete
 * е позволен въпреки soft-delete конвенцията: GDPR изисква реално заличаване,
 * а soft-изтритите редове също са лични данни. Изтрива се всичко, не само
 * редовете на потребителя — устройството се връща в чисто състояние.
 *
 * Ред child-first заради FK-ите; една транзакция, за да не остане базата
 * наполовина изтрита (expo-sqlite транзакциите са синхронни — .run(), без await).
 */
export async function wipeLocalAccountData(
  db: AppDatabase,
  userId: string,
  storage: KeyValueStorage,
): Promise<void> {
  db.transaction((tx) => {
    tx.delete(payments).run();
    tx.delete(leases).run();
    tx.delete(tenants).run();
    tx.delete(properties).run();
  });
  await storage.removeItem(syncCursorKey(userId));
}
