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
import { leases, payments } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { formatPeriod, addPeriodMonths, formatMoney, type Currency } from '@/lib/domain';
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
 * Schedule payment reminders for upcoming payment dues.
 *
 * IMPORTANT LIMITATIONS:
 * - Notifications are scheduled up to 3 months in advance only. If the app is not
 *   opened for more than 3 months, reminders will not be triggered.
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

  const notificationDaysBefore = useSettingsStore.getState().notificationDaysBefore;
  const activeLeases = await db.select().from(leases)
    .where(ownedAndLive(leases, uid, eq(leases.status, 'active')));
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  for (const lease of activeLeases) {
    for (let i = 0; i < 3; i++) {
      const period = addPeriodMonths(currentPeriod, i);
      const [existingPayment] = await db
        .select()
        .from(payments)
        .where(ownedAndLive(payments, uid, eq(payments.leaseId, lease.id), eq(payments.period, period)))
        .limit(1);

      if (existingPayment?.status === 'paid') continue;

      const [year, month] = period.split('-');
      const dueDate = new Date(`${year}-${month}-${String(lease.paymentDay).padStart(2, '0')}`);
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - notificationDaysBefore);

      if (reminderDate > today) {
        const currency = (lease.currency as Currency) ?? 'EUR';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Напомяне за плащане',
            body: `${formatMoney(lease.rentAmount, currency)} е дължимо на ${formatPeriod(period)}`,
            data: { propertyId: lease.propertyId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderDate,
          },
        });
      }
    }
  }
}
