import {
  groupThousands,
  formatMoney,
  sumByCurrency,
  formatPeriod,
  addPeriodMonths,
  listPeriods,
  formatDate,
  isPaymentOverdue,
  paymentDueDate,
  dueDateForPeriod,
} from '../domain';

describe('domain utilities', () => {
  describe('groupThousands', () => {
    it('formats numbers with space-separated thousands', () => {
      expect(groupThousands(1234567)).toMatch(/1\s234\s567/);
      expect(groupThousands(1000)).toMatch(/1\s000/);
      expect(groupThousands(999)).toBe('999');
      expect(groupThousands(0)).toBe('0');
    });

    it('rounds floating point numbers', () => {
      expect(groupThousands(1234.5)).toMatch(/1\s235/);
      expect(groupThousands(1234.4)).toMatch(/1\s234/);
    });

    it('handles negative numbers', () => {
      const result = groupThousands(-1234567);
      expect(result).toMatch(/-.*234.*567/);
    });
  });

  describe('formatMoney', () => {
    it('formats EUR correctly', () => {
      expect(formatMoney(1200, 'EUR')).toMatch(/1.*200.*€/);
      expect(formatMoney(0, 'EUR')).toMatch(/0.*€/);
    });

    it('formats BGN correctly', () => {
      expect(formatMoney(500, 'BGN')).toMatch(/500.*лв\./);
      expect(formatMoney(1500, 'BGN')).toMatch(/1.*500.*лв\./);
    });

    it('defaults to EUR', () => {
      expect(formatMoney(800)).toMatch(/800.*€/);
    });
  });

  describe('sumByCurrency', () => {
    it('sums amounts by currency', () => {
      const items = [
        { amount: 1200, currency: 'EUR' as const },
        { amount: 800, currency: 'EUR' as const },
        { amount: 500, currency: 'BGN' as const },
      ];
      const result = sumByCurrency(items);
      expect(result).toMatch(/2.*000.*€/);
      expect(result).toMatch(/500.*лв\./);
    });

    it('handles empty array', () => {
      expect(sumByCurrency([])).toMatch(/0.*€/);
    });

    it('handles single currency', () => {
      const items = [
        { amount: 1000, currency: 'EUR' as const },
        { amount: 500, currency: 'EUR' as const },
      ];
      expect(sumByCurrency(items)).toMatch(/1.*500.*€/);
    });

    it('handles mixed currencies correctly', () => {
      const items = [
        { amount: 100, currency: 'BGN' as const },
        { amount: 200, currency: 'EUR' as const },
        { amount: 300, currency: 'BGN' as const },
      ];
      const result = sumByCurrency(items);
      expect(result).toMatch(/200.*€/);
      expect(result).toMatch(/400.*лв\./);
    });
  });

  describe('formatPeriod', () => {
    it('formats yyyy-MM to Bulgarian month and year', () => {
      expect(formatPeriod('2026-06')).toBe('юни 2026');
      expect(formatPeriod('2026-01')).toBe('януари 2026');
      expect(formatPeriod('2026-12')).toBe('декември 2026');
    });

    it('returns raw value for unparseable input', () => {
      expect(formatPeriod('invalid')).toBe('invalid');
      expect(formatPeriod('2026')).toBe('2026');
      expect(formatPeriod('2026-13')).toBe('2026-13');
    });
  });

  describe('addPeriodMonths', () => {
    it('advances period by positive months', () => {
      expect(addPeriodMonths('2026-01', 1)).toBe('2026-02');
      expect(addPeriodMonths('2026-12', 1)).toBe('2027-01');
      expect(addPeriodMonths('2026-06', 3)).toBe('2026-09');
    });

    it('advances period by negative months', () => {
      expect(addPeriodMonths('2026-03', -1)).toBe('2026-02');
      expect(addPeriodMonths('2026-01', -1)).toBe('2025-12');
      expect(addPeriodMonths('2026-06', -6)).toBe('2025-12');
    });

    it('handles year boundaries', () => {
      expect(addPeriodMonths('2026-11', 3)).toBe('2027-02');
      expect(addPeriodMonths('2025-02', -3)).toBe('2024-11');
    });

    it('returns raw value for unparseable input', () => {
      expect(addPeriodMonths('invalid', 1)).toBe('invalid');
    });
  });

  describe('listPeriods', () => {
    it('generates consecutive periods', () => {
      expect(listPeriods('2026-01', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
      expect(listPeriods('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    });

    it('handles count of 0', () => {
      expect(listPeriods('2026-06', 0)).toEqual([]);
    });

    it('handles count of 1', () => {
      expect(listPeriods('2026-06', 1)).toEqual(['2026-06']);
    });

    it('handles negative count as 0', () => {
      expect(listPeriods('2026-06', -5)).toEqual([]);
    });
  });

  describe('formatDate', () => {
    it('formats yyyy-MM-dd to Bulgarian date', () => {
      expect(formatDate('2026-06-04')).toBe('4 юни 2026');
      expect(formatDate('2026-01-01')).toBe('1 януари 2026');
      expect(formatDate('2026-12-31')).toBe('31 декември 2026');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
    });

    it('returns raw value for unparseable input', () => {
      expect(formatDate('invalid')).toBe('invalid');
      expect(formatDate('2026-06')).toBe('2026-06');
    });
  });

  describe('isPaymentOverdue', () => {
    it('detects overdue payment correctly', () => {
      // If today is 2026-06-05 and payment day is 1, 2026-06-01 is overdue
      expect(isPaymentOverdue('2026-06', 1, '2026-06-05')).toBe(true);
    });

    it('detects payment due today as not overdue', () => {
      expect(isPaymentOverdue('2026-06', 5, '2026-06-05')).toBe(false);
    });

    it('detects future payment as not overdue', () => {
      expect(isPaymentOverdue('2026-06', 10, '2026-06-05')).toBe(false);
    });

    it('handles month boundaries', () => {
      expect(isPaymentOverdue('2026-05', 31, '2026-06-01')).toBe(true);
    });

    it('uses today\'s date by default', () => {
      const today = new Date().toISOString().split('T')[0];
      const period = today.substring(0, 7);
      const day = parseInt(today.substring(8), 10);
      // If we explicitly request a payment day in the past of this month, it should be overdue
      expect(isPaymentOverdue(period, day - 1, today)).toBe(true);
    });

    it('returns false for unparseable period', () => {
      expect(isPaymentOverdue('invalid', 1, '2026-06-05')).toBe(false);
    });

    it('clamps day 31 to end of February (non-leap year)', () => {
      // 2026 is not a leap year → Feb has 28 days; day 31 clamps to the 28th.
      expect(isPaymentOverdue('2026-02', 31, '2026-02-28')).toBe(false);
      expect(isPaymentOverdue('2026-02', 31, '2026-03-01')).toBe(true);
    });

    it('clamps day 31 to end of February (leap year)', () => {
      // 2024 is a leap year → Feb has 29 days; day 31 clamps to the 29th.
      expect(isPaymentOverdue('2024-02', 31, '2024-02-29')).toBe(false);
      expect(isPaymentOverdue('2024-02', 31, '2024-03-01')).toBe(true);
    });

    it('clamps day 31 in 30-day months', () => {
      // April has 30 days; day 31 clamps to the 30th.
      expect(isPaymentOverdue('2026-04', 31, '2026-04-30')).toBe(false);
      expect(isPaymentOverdue('2026-04', 31, '2026-05-01')).toBe(true);
    });
  });

  describe('dueDateForPeriod', () => {
    it('clamps day 31 to end of February (non-leap year)', () => {
      // 2026 не е високосна → февруари има 28 дни.
      expect(dueDateForPeriod('2026-02', 31)).toBe('2026-02-28');
    });

    it('clamps day 31 to end of February (leap year)', () => {
      // 2028 е високосна → февруари има 29 дни.
      expect(dueDateForPeriod('2028-02', 31)).toBe('2028-02-29');
    });

    it('clamps day 31 in 30-day months', () => {
      expect(dueDateForPeriod('2026-04', 31)).toBe('2026-04-30');
    });

    it('keeps day 31 in 31-day months', () => {
      expect(dueDateForPeriod('2026-07', 31)).toBe('2026-07-31');
    });

    it('clamps day 30 to end of February', () => {
      expect(dueDateForPeriod('2026-02', 30)).toBe('2026-02-28');
    });

    it('keeps days 1 and 15 unchanged', () => {
      expect(dueDateForPeriod('2026-06', 1)).toBe('2026-06-01');
      expect(dueDateForPeriod('2026-06', 15)).toBe('2026-06-15');
    });

    it('returns null for unparseable period', () => {
      expect(dueDateForPeriod('invalid', 15)).toBeNull();
      expect(dueDateForPeriod('2026', 15)).toBeNull();
    });
  });

  describe('paymentDueDate', () => {
    // Датите се сглобяват от ISO низ (UTC полунощ), затова сверяваме през getUTC*,
    // за да е тестът независим от часовата зона на машината.
    it('clamps day 31 to end of February (non-leap year)', () => {
      // 2026 не е високосна → февруари има 28 дни; ден 31 се ограничава до 28-и.
      const d = paymentDueDate('2026-02', 31)!;
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(1); // 0-базиран: февруари
      expect(d.getUTCDate()).toBe(28);
    });

    it('clamps day 31 to end of February (leap year)', () => {
      // 2024 е високосна → февруари има 29 дни; ден 31 се ограничава до 29-и.
      expect(paymentDueDate('2024-02', 31)!.getUTCDate()).toBe(29);
    });

    it('clamps day 31 in 30-day months', () => {
      // Април има 30 дни; ден 31 се ограничава до 30-и.
      expect(paymentDueDate('2026-04', 31)!.getUTCDate()).toBe(30);
    });

    it('keeps a valid day unchanged', () => {
      const d = paymentDueDate('2026-06', 15)!;
      expect(d.getUTCMonth()).toBe(5); // 0-базиран: юни
      expect(d.getUTCDate()).toBe(15);
    });

    it('returns null for unparseable period', () => {
      expect(paymentDueDate('invalid', 15)).toBeNull();
      expect(paymentDueDate('2026', 15)).toBeNull();
    });
  });
});
