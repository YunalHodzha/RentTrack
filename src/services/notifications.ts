import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { leases, payments } from '@/db/schema';
import { formatPeriod, addPeriodMonths, formatMoney, type Currency } from '@/lib/domain';
import { useSettingsStore } from '@/store/settings';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let notificationSubscription: Notifications.Subscription | null = null;

export function setupNotificationListeners() {
  if (notificationSubscription) notificationSubscription.remove();

  notificationSubscription = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
    const propertyId = response.notification.request.content.data?.propertyId;
    if (propertyId) {
      router.push(`/property/${propertyId}`);
    }
  });
}

export async function requestNotificationPermissions() {
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
  await Notifications.cancelAllScheduledNotificationsAsync();

  const notificationDaysBefore = useSettingsStore.getState().notificationDaysBefore;
  const activeLeases = await db.select().from(leases).where(eq(leases.status, 'active'));
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  for (const lease of activeLeases) {
    for (let i = 0; i < 3; i++) {
      const period = addPeriodMonths(currentPeriod, i);
      const [existingPayment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.leaseId, lease.id), eq(payments.period, period)))
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
            type: 'date',
            date: reminderDate,
          } as Notifications.NotificationTriggerInput,
        });
      }
    }
  }
}
