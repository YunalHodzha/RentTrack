import { addPeriodMonths, dueDateForPeriod, formatMoney, type Currency } from '@/lib/domain';

/**
 * Чиста логика за дневния дайджест на известията — без expo-*, без db.
 * Планировчикът (`src/services/notifications.ts`) я вика веднъж за всеки ден от
 * хоризонта и насрочва по едно известие на ден, вместо по едно на договор.
 */

export interface DigestLease {
  id: string;
  propertyId: string;
  propertyName: string;
  rentAmount: number;
  currency: Currency;
  paymentDay: number;
  /** 'yyyy-MM' — първият период на договора; по-ранни периоди се игнорират. */
  startPeriod: string;
}

export interface DigestInput {
  /** 'yyyy-MM-dd' — денят, за който се смята дайджестът. */
  date: string;
  /** Настройката notificationDaysBefore — колко дни преди падежа да напомня. */
  daysBefore: number;
  /** Само активните договори. */
  leases: DigestLease[];
  /** Ключове `${leaseId}:${period}` за плащания със status 'paid'. */
  paidPeriods: Set<string>;
}

export interface DailyDigest {
  title: string;
  body: string;
  /** Имотът за deep link — само когато дайджестът засяга точно един елемент. */
  propertyId: string | null;
}

type DigestItem =
  | { kind: 'upcoming'; daysLeft: number; lease: DigestLease }
  | { kind: 'today'; lease: DigestLease }
  | { kind: 'overdue'; lease: DigestLease };

const MS_PER_DAY = 86_400_000;

/** Просрочията напомнят на всеки 3 дни, не всекидневно. */
const OVERDUE_CADENCE_DAYS = 3;

/** Прозорец от периоди спрямо месеца на `date`: просрочия до 3 месеца назад
 *  и падежи в началото на следващия месец. */
const PERIODS_BACK = 3;
const PERIODS_FORWARD = 1;

function moneyLabel(lease: DigestLease): string {
  return `${lease.propertyName} (${formatMoney(lease.rentAmount, lease.currency)})`;
}

function singleItemBody(item: DigestItem): string {
  switch (item.kind) {
    case 'upcoming':
      return item.daysLeft === 1
        ? `Наемът за ${moneyLabel(item.lease)} е с падеж утре`
        : `Наемът за ${moneyLabel(item.lease)} е с падеж след ${item.daysLeft} дни`;
    case 'today':
      return `Днес е падежът на наема за ${moneyLabel(item.lease)}`;
    case 'overdue':
      return `Просрочен наем: ${moneyLabel(item.lease)}`;
  }
}

function summaryBody(items: DigestItem[]): string {
  const overdue = items.filter((i) => i.kind === 'overdue').length;
  const dueToday = items.filter((i) => i.kind === 'today').length;
  const upcoming = items.filter((i) => i.kind === 'upcoming').length;

  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} ${overdue === 1 ? 'просрочен' : 'просрочени'}`);
  if (dueToday > 0) parts.push(`${dueToday} с падеж днес`);
  if (upcoming > 0) parts.push(`${upcoming} с наближаващ падеж`);

  return `${items.length} наема искат внимание: ${parts.join(', ')}`;
}

/**
 * Смята какво (ако изобщо нещо) трябва да се покаже като известие в деня `date`.
 * За всеки активен договор и всеки неплатен период от прозореца:
 *  - [dueDate - daysBefore, dueDate - 1] → „наближаващ" (с оставащи дни);
 *  - date === dueDate → „днес";
 *  - date > dueDate → „просрочен", но само на всеки 3 дни след падежа.
 * Връща null, когато няма нито един елемент — за този ден не се насрочва нищо.
 */
export function buildDailyDigest(input: DigestInput): DailyDigest | null {
  const { date, daysBefore, leases, paidPeriods } = input;
  const dateMs = Date.parse(date);
  if (Number.isNaN(dateMs)) return null;

  const currentPeriod = date.slice(0, 7);
  const items: DigestItem[] = [];

  for (const lease of leases) {
    for (let k = -PERIODS_BACK; k <= PERIODS_FORWARD; k++) {
      const period = addPeriodMonths(currentPeriod, k);
      if (period < lease.startPeriod) continue;
      if (paidPeriods.has(`${lease.id}:${period}`)) continue;

      const dueDate = dueDateForPeriod(period, lease.paymentDay);
      if (!dueDate) continue;

      // Двете дати са ISO 'yyyy-MM-dd' → Date.parse дава UTC полунощ и за двете,
      // така че разликата е точен брой дни без DST изненади.
      const daysUntilDue = Math.round((Date.parse(dueDate) - dateMs) / MS_PER_DAY);

      if (daysUntilDue >= 1 && daysUntilDue <= daysBefore) {
        items.push({ kind: 'upcoming', daysLeft: daysUntilDue, lease });
      } else if (daysUntilDue === 0) {
        items.push({ kind: 'today', lease });
      } else if (daysUntilDue < 0 && -daysUntilDue % OVERDUE_CADENCE_DAYS === 0) {
        items.push({ kind: 'overdue', lease });
      }
    }
  }

  if (items.length === 0) return null;

  const hasOverdue = items.some((i) => i.kind === 'overdue');
  const hasToday = items.some((i) => i.kind === 'today');
  const title = hasOverdue ? 'Просрочен наем' : hasToday ? 'Падеж днес' : 'Напомняне за наем';

  if (items.length === 1) {
    return { title, body: singleItemBody(items[0]), propertyId: items[0].lease.propertyId };
  }
  return { title, body: summaryBody(items), propertyId: null };
}
