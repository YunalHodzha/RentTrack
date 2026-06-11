import type { Property, Payment, Lease } from '@/db/schema';
import type { Tone } from '@/theme';

/** Property types in display order, with Bulgarian labels and icons. */
export const PROPERTY_TYPES = ['apartment', 'garage', 'land', 'office', 'other'] as const;

export const TYPE_LABELS: Record<Property['type'], string> = {
  apartment: 'Апартамент',
  garage: 'Гараж',
  land: 'Земя',
  office: 'Офис',
  other: 'Друго',
};

export const TYPE_ICONS: Record<Property['type'], string> = {
  apartment: '🏢',
  garage: '🚗',
  land: '🌳',
  office: '🏬',
  other: '📦',
};

export const STATUS_LABELS: Record<Property['status'], string> = {
  free: 'Свободен',
  rented: 'Под наем',
  unavailable: 'Недостъпен',
};

export const STATUS_TONE: Record<Property['status'], Tone> = {
  free: 'success',
  rented: 'primary',
  unavailable: 'muted',
};

export const METHOD_LABELS: Record<NonNullable<Payment['method']>, string> = {
  cash: 'В брой',
  bank: 'Банков превод',
  other: 'Друго',
};

export const PAYMENT_METHODS = [
  { value: 'cash' as const, label: 'В брой' },
  { value: 'bank' as const, label: 'Банков превод' },
  { value: 'other' as const, label: 'Друго' },
];

export const PAYMENT_STATUS_LABELS: Record<Payment['status'], string> = {
  paid: 'Платено',
  partial: 'Частично',
  pending: 'Очаква се',
  overdue: 'Просрочено',
};

export const PAYMENT_STATUS_TONE: Record<Payment['status'], Tone> = {
  paid: 'success',
  partial: 'warning',
  pending: 'muted',
  overdue: 'danger',
};

export const PAYMENT_STATUSES = [
  { value: 'paid' as const, label: 'Платено' },
  { value: 'partial' as const, label: 'Частично' },
  { value: 'pending' as const, label: 'Очаква се' },
  { value: 'overdue' as const, label: 'Просрочено' },
];

export type Currency = 'EUR' | 'BGN';

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: '€', BGN: 'лв.' };

export const BG_MONTHS = [
  'януари', 'февруари', 'март', 'април', 'май', 'юни',
  'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

/** 1234567 -> "1 234 567" (space-grouped thousands, no decimals). */
export function groupThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Currency-aware money formatting, e.g. 1200 EUR -> "1 200 €". */
export function formatMoney(amount: number, currency: Currency = 'EUR'): string {
  return `${groupThousands(amount)} ${CURRENCY_SYMBOL[currency]}`;
}

/**
 * Sum a set of amounts that may span multiple currencies and render them as a
 * single string, e.g. "1 200 € · 800 лв.". Mixing currencies into one number
 * would be wrong, so each currency is totalled and shown separately.
 */
export function sumByCurrency(items: { amount: number; currency: Currency }[]): string {
  const totals: Partial<Record<Currency, number>> = {};
  for (const item of items) {
    totals[item.currency] = (totals[item.currency] ?? 0) + item.amount;
  }
  const parts = (Object.keys(totals) as Currency[]).map((c) => formatMoney(totals[c]!, c));
  return parts.length > 0 ? parts.join('  ·  ') : formatMoney(0, 'EUR');
}

/** 'yyyy-MM' -> "юни 2026". Falls back to the raw value if unparseable. */
export function formatPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const month = BG_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : period;
}

/** Advance a 'yyyy-MM' period by `k` whole months (k may be negative). */
export function addPeriodMonths(period: string, k: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  let year = Number(m[1]);
  let monthIndex = Number(m[2]) - 1 + k;
  year += Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** ['2026-06', '2026-07', ...] — `count` consecutive periods starting at `start`. */
export function listPeriods(start: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addPeriodMonths(start, i));
}

/** 'yyyy-MM-dd' -> "3 юни 2026". Falls back to the raw value if unparseable. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const month = BG_MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : date;
}

/** Number of days in a given month. `month` is 1-based (1 = January). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Връща реалната дата на падежа (ISO 'yyyy-MM-dd') за даден период ('yyyy-MM')
 * и paymentDay, клампната към последния ден на месеца — вкл. високосен
 * февруари: '2026-02' + 31 → '2026-02-28', '2028-02' + 31 → '2028-02-29'.
 * Единственият източник на тази логика — просрочието (`isPaymentOverdue`) и
 * известията (`paymentDueDate`) минават оттук. Връща `null` при невалиден период.
 */
export function dueDateForPeriod(period: string, paymentDay: number): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const clampedDay = Math.min(paymentDay, daysInMonth(Number(m[1]), Number(m[2])));
  return `${m[1]}-${m[2]}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Check if a payment is overdue based on period, payment day, and today's date.
 * The due date comes from `dueDateForPeriod` (day clamped to month length);
 * the comparison is lexicographic over ISO dates.
 */
export function isPaymentOverdue(period: string, paymentDay: number, today: string = new Date().toISOString().split('T')[0]): boolean {
  const dueDate = dueDateForPeriod(period, paymentDay);
  return dueDate !== null && today > dueDate;
}

/**
 * Дата на падежа като `Date` (UTC полунощ) за насрочване на известия — тънка
 * обвивка над `dueDateForPeriod`. Връща `null` при невалиден период.
 */
export function paymentDueDate(period: string, paymentDay: number): Date | null {
  const iso = dueDateForPeriod(period, paymentDay);
  return iso ? new Date(iso) : null;
}

/**
 * Всички просрочени периоди на договор към `today` — от началото на договора
 * (вкл.) до текущия месец (или до края на договора, ако е по-рано), чийто
 * клампнат падеж (`dueDateForPeriod`) е минал и за които няма покриващо плащане.
 *
 * „Покриващо" = живо плащане със status 'paid' за периода — същата семантика
 * като индикатора на таблото досега: 'partial' НЕ покрива (месецът още се
 * дължи), 'pending'/'overdue' също. Подавай само живи редове (isNull(deletedAt)).
 *
 * Предплатените бъдещи месеци не са проблем — те имат 'paid' запис, а и без
 * него падежът им още не е минал.
 */
export function overduePeriodsForLease(
  lease: Pick<Lease, 'startDate' | 'endDate' | 'paymentDay'>,
  paymentsForLease: Pick<Payment, 'period' | 'status'>[],
  today: string = new Date().toISOString().split('T')[0],
): string[] {
  const start = lease.startDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start)) return [];

  // Горна граница: текущият месец, но не след края на договора (изтекъл, ала
  // още маркиран active договор не трупа просрочия за месеци след endDate).
  let end = today.slice(0, 7);
  const leaseEnd = lease.endDate?.slice(0, 7);
  if (leaseEnd && /^\d{4}-\d{2}$/.test(leaseEnd) && leaseEnd < end) end = leaseEnd;

  const covered = new Set(
    paymentsForLease.filter((p) => p.status === 'paid').map((p) => p.period),
  );

  const result: string[] = [];
  // Таван от 1200 месеца (100 години) — защита от безкраен цикъл при повредени данни.
  let guard = 0;
  for (let period = start; period <= end && guard < 1200; period = addPeriodMonths(period, 1), guard++) {
    if (!covered.has(period) && isPaymentOverdue(period, lease.paymentDay, today)) {
      result.push(period);
    }
  }
  return result;
}

/**
 * Допълнение към confirm() съобщението при изтриване на имот/наемател, който
 * има история (договори/плащания). Изтриването е каскадно (soft-delete на
 * договорите и плащанията), а справките и събраните суми четат само живи
 * редове — затова предупреждаваме изрично. Без история текстът се пропуска.
 */
export function deleteCascadeWarning(name: string): string {
  return `Това ще изтрие и всички договори и плащания към „${name}“. Историята на плащанията повече няма да се вижда в справките и събраните суми. Действието е необратимо.`;
}
