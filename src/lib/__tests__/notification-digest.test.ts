import { buildDailyDigest, type DigestLease } from '../notification-digest';

// startPeriod по подразбиране е 2026-07, за да няма минали неплатени периоди,
// чиито просрочия случайно уцелват 3-дневния каданс и замърсяват проверките.
function lease(overrides: Partial<DigestLease> = {}): DigestLease {
  return {
    id: 'lease-1',
    propertyId: 'prop-1',
    propertyName: 'Апартамент Център',
    rentAmount: 1200,
    currency: 'EUR',
    paymentDay: 15,
    startPeriod: '2026-07',
    ...overrides,
  };
}

function digest(date: string, leases: DigestLease[], opts: { daysBefore?: number; paid?: string[] } = {}) {
  return buildDailyDigest({
    date,
    daysBefore: opts.daysBefore ?? 3,
    leases,
    paidPeriods: new Set(opts.paid ?? []),
  });
}

describe('buildDailyDigest', () => {
  // paymentDay=15 → dueDate за 2026-07 е 2026-07-15

  describe('отброяване преди падежа (daysBefore=3)', () => {
    it('dueDate-3 → „наближаващ" с 3 оставащи дни', () => {
      const result = digest('2026-07-12', [lease()]);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Напомняне за наем');
      expect(result!.body).toContain('след 3 дни');
      expect(result!.propertyId).toBe('prop-1');
    });

    it('dueDate-2 → „наближаващ" с 2 оставащи дни', () => {
      const result = digest('2026-07-13', [lease()]);
      expect(result!.body).toContain('след 2 дни');
    });

    it('dueDate-1 → „утре"', () => {
      const result = digest('2026-07-14', [lease()]);
      expect(result!.body).toContain('утре');
    });

    it('dueDate-4 → нищо (извън прозореца)', () => {
      expect(digest('2026-07-11', [lease()])).toBeNull();
    });
  });

  describe('падежен ден', () => {
    it('date === dueDate → „днес"', () => {
      const result = digest('2026-07-15', [lease()]);
      expect(result!.title).toBe('Падеж днес');
      expect(result!.body).toContain('Днес е падежът');
      expect(result!.propertyId).toBe('prop-1');
    });
  });

  describe('просрочие — каданс на всеки 3 дни', () => {
    it('dueDate+3 и dueDate+6 → „просрочен"', () => {
      for (const date of ['2026-07-18', '2026-07-21']) {
        const result = digest(date, [lease()]);
        expect(result).not.toBeNull();
        expect(result!.title).toBe('Просрочен наем');
        expect(result!.body).toContain('Просрочен наем');
        expect(result!.propertyId).toBe('prop-1');
      }
    });

    it('dueDate+1, +2, +4 → нищо', () => {
      for (const date of ['2026-07-16', '2026-07-17', '2026-07-19']) {
        expect(digest(date, [lease()])).toBeNull();
      }
    });
  });

  describe('платени периоди', () => {
    it('период със status paid → нищо', () => {
      expect(digest('2026-07-15', [lease()], { paid: ['lease-1:2026-07'] })).toBeNull();
    });
  });

  describe('няколко договора в един ден', () => {
    it('два падежа в същия ден → обобщен текст, propertyId null', () => {
      const leases = [
        lease(),
        lease({ id: 'lease-2', propertyId: 'prop-2', propertyName: 'Гараж Юг', rentAmount: 200, currency: 'BGN' }),
      ];
      const result = digest('2026-07-15', leases);
      expect(result!.title).toBe('Падеж днес');
      expect(result!.body).toBe('2 наема искат внимание: 2 с падеж днес');
      expect(result!.propertyId).toBeNull();
    });

    it('смес от просрочен и наближаващ → бройки по категории, нулевите се изпускат', () => {
      const leases = [
        // dueDate 2026-07-15 → на 18-и е +3 дни просрочие
        lease(),
        // dueDate 2026-07-20 → на 18-и е 2 дни преди падеж
        lease({ id: 'lease-2', propertyId: 'prop-2', propertyName: 'Офис Запад', paymentDay: 20 }),
      ];
      const result = digest('2026-07-18', leases);
      expect(result!.title).toBe('Просрочен наем');
      expect(result!.body).toBe('2 наема искат внимание: 1 просрочен, 1 с наближаващ падеж');
      expect(result!.propertyId).toBeNull();
    });
  });

  describe('начало на договора', () => {
    it('период преди startPeriod → игнориран', () => {
      // Юнският падеж (2026-06-15) е точно +33 дни към 2026-07-18 — кратно на 3,
      // т.е. БИ генерирал „просрочен", ако периодът не се пропускаше заради
      // startPeriod=2026-07. Юли е платен, август е далече → очакваме null.
      const result = digest('2026-07-18', [lease()], { paid: ['lease-1:2026-07'] });
      expect(result).toBeNull();
    });
  });

  describe('клампване на paymentDay към края на месеца', () => {
    it('paymentDay=31 през февруари → падеж на 28-и', () => {
      const l = lease({ paymentDay: 31, startPeriod: '2026-02' });
      const result = digest('2026-02-28', [l]);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Падеж днес');
    });
  });
});
