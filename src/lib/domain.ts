import type { Property, Payment } from '@/db/schema';
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
};

export const PAYMENT_STATUS_TONE: Record<Payment['status'], Tone> = {
  paid: 'success',
  partial: 'warning',
  pending: 'muted',
};

export const PAYMENT_STATUSES = [
  { value: 'paid' as const, label: 'Платено' },
  { value: 'partial' as const, label: 'Частично' },
  { value: 'pending' as const, label: 'Очаква се' },
];

export type Currency = 'EUR' | 'BGN';

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: '€', BGN: 'лв.' };

const BG_MONTHS = [
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
