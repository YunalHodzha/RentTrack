// Type-only import: erased at compile time, so it carries NO runtime side
// effect. expo-notifications' index eagerly runs DevicePushTokenAutoRegistration
// on evaluation, which warns/errors in Expo Go — importing the runtime module
// statically would trigger that at app start. We instead require() it lazily,
// only when NOT in Expo Go (see loadNotifications), so the module is never
// evaluated under Expo Go.
import type * as NotificationsModule from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { leases, payments, properties } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { type Currency } from '@/lib/domain';
import { buildDailyDigest } from '@/lib/notification-digest';
import { useSettingsStore } from '@/store/settings';

// Notifications were removed from Expo Go in SDK 53. When running in Expo Go we
// skip all notification work so the app doesn't error; a development build gets
// the full behaviour. See https://docs.expo.dev/develop/development-builds/introduction/
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Lazily load the expo-notifications runtime module. Returns null in Expo Go so
 * the module is never evaluated there (avoiding the push-token side effect).
 */
function loadNotifications(): typeof NotificationsModule | null {
  if (isExpoGo) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

let handlerConfigured = false;

function ensureHandler(Notifications: typeof NotificationsModule) {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  handlerConfigured = true;
}

let notificationSubscription: NotificationsModule.Subscription | null = null;

export function setupNotificationListeners() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  ensureHandler(Notifications);

  if (notificationSubscription) notificationSubscription.remove();
  notificationSubscription = Notifications.addNotificationResponseReceivedListener(
    (response: NotificationsModule.NotificationResponse) => {
      const propertyId = response.notification.request.content.data?.propertyId;
      if (propertyId) {
        router.push(`/property/${propertyId}`);
      }
    },
  );
}

export async function requestNotificationPermissions() {
  const Notifications = loadNotifications();
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Отменя всички насрочени напомняния в OS-а. Вика се при изход и при изтриване
 * на акаунт — иначе известия за вече несъществуващи/чужди данни остават планирани
 * до 3 месеца напред. При следващ вход root layout-ът ги възстановява
 * (markOverduePayments → schedulePaymentReminders в ефекта по userId).
 *
 * Нарочно НЕ е в auth store-а: store-ът не може да импортира този модул без
 * цикъл (auth → notifications → db/owner → auth), затова call site-овете
 * (settings изход, services/account изтриване) го викат изрично.
 */
export async function cancelScheduledReminders() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Насрочва по ЕДИН дневен дайджест (в 09:00 локално време) вместо по едно
 * известие на договор. Съдържанието идва от чистата `buildDailyDigest`
 * (наближаващи падежи, падеж днес, просрочия на всеки 3 дни).
 *
 * IMPORTANT LIMITATIONS:
 * - Хоризонтът е 30 дни напред; преплануира се при всяко отваряне на
 *   приложението и при всяка промяна на плащане, така че на практика
 *   известията спират само ако приложението не се отваря над месец.
 * - iOS лимитът от 64 насрочени известия е спазен по конструкция (≤31 дни ×
 *   1 известие на ден).
 * - For reliable testing on physical devices, use a development build via EAS
 *   (not Expo Go). Expo Go has limited notification support from SDK 53+.
 * - On iOS, the app must have notification permissions granted. On Android 12+,
 *   the system may group or suppress notifications.
 */
export async function schedulePaymentReminders() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  ensureHandler(Notifications);
  await Notifications.cancelAllScheduledNotificationsAsync();

  const uid = currentUserId();
  if (!uid) return;

  const daysBefore = useSettingsStore.getState().notificationDaysBefore;

  const activeLeases = await db
    .select({
      id: leases.id,
      propertyId: leases.propertyId,
      propertyName: properties.name,
      rentAmount: leases.rentAmount,
      currency: leases.currency,
      paymentDay: leases.paymentDay,
      startDate: leases.startDate,
    })
    .from(leases)
    .innerJoin(properties, eq(leases.propertyId, properties.id))
    .where(ownedAndLive(leases, uid, eq(leases.status, 'active')));

  const paidRows = await db
    .select({ leaseId: payments.leaseId, period: payments.period })
    .from(payments)
    .where(ownedAndLive(payments, uid, eq(payments.status, 'paid')));

  const digestLeases = activeLeases.map((l) => ({
    id: l.id,
    propertyId: l.propertyId,
    propertyName: l.propertyName,
    rentAmount: l.rentAmount,
    currency: (l.currency as Currency) ?? 'EUR',
    paymentDay: l.paymentDay,
    startPeriod: l.startDate.slice(0, 7),
  }));
  const paidPeriods = new Set(paidRows.map((p) => `${p.leaseId}:${p.period}`));

  const now = new Date();
  // Днешният дайджест влиза само ако 09:00 локално още не е минало.
  const firstOffset = now.getHours() < 9 ? 0 : 1;

  for (let offset = firstOffset; offset <= 30; offset++) {
    // Локални компоненти, НЕ new Date('YYYY-MM-DD') — ISO стрингът се парсва
    // като полунощ UTC и в източните зони известието бие в 2–3 през нощта.
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

    const digest = buildDailyDigest({ date, daysBefore, leases: digestLeases, paidPeriods });
    if (!digest) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: digest.title,
        body: digest.body,
        // propertyId само при дайджест за един имот — deep link-ът в
        // setupNotificationListeners навигира натам.
        ...(digest.propertyId ? { data: { propertyId: digest.propertyId } } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0),
      },
    });
  }
}
