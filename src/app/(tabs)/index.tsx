import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/db/client';
import { properties, leases, payments } from '@/db/schema';
import type { Lease, Property } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { useAppStore } from '@/store';
import { toast } from '@/store/toast';
import { schedulePaymentReminders } from '@/services/notifications';
import { savePayments, type PaymentInput } from '@/services/payments';
import { PaymentModal } from '@/components/payment-form';
import { useFocusReload } from '@/hooks/use-focus-reload';
import { useLoadingState } from '@/hooks/use-loading-state';
import { Header, Card, Badge, ProgressBar, Button, EmptyState, Skeleton, ErrorState, SheetModal, useTheme, spacing, radius, shadow } from '@/components/ui';
import { formatMoney, formatPeriod, overduePeriodsForLease, type Currency } from '@/lib/domain';
import { onboardingSteps, type OnboardingStep } from '@/lib/onboarding';

export default function DashboardScreen() {
  const t = useTheme();
  const { properties: props, leases: leaseList, payments: payList, setProperties, setLeases, setPayments } = useAppStore();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [leaseSelectVisible, setLeaseSelectVisible] = useState(false);
  const [paymentLease, setPaymentLease] = useState<Lease | null>(null);

  const loadAll = useCallback(async () => {
    const uid = currentUserId();
    if (!uid) { setProperties([]); setLeases([]); setPayments([]); setLoaded(true); return; }
    try {
      setError(false);
      const [p, l, pay] = await Promise.all([
        db.select().from(properties).where(ownedAndLive(properties, uid)),
        db.select().from(leases).where(ownedAndLive(leases, uid)),
        db.select().from(payments).where(ownedAndLive(payments, uid)),
      ]);
      setProperties(p);
      setLeases(l);
      setPayments(pay);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [setProperties, setLeases, setPayments]);

  useFocusReload(loadAll);

  const phase = useLoadingState(loaded, props.length === 0);

  // „Първи стъпки": видима, докато стъпките не са готови, освен ако е скрита
  // ръчно (✕ → флаг в AsyncStorage, отделен за всеки потребител). null = флагът
  // още се чете → не рисуваме нищо (без премигване).
  const uid = currentUserId();
  const [onboardingHidden, setOnboardingHidden] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setOnboardingHidden(true); return; }
    AsyncStorage.getItem(`renttrack_onboarding_hidden_${uid}`)
      .then((v) => { if (!cancelled) setOnboardingHidden(v === '1'); })
      .catch(() => { if (!cancelled) setOnboardingHidden(false); });
    return () => { cancelled = true; };
  }, [uid]);

  function hideOnboarding() {
    setOnboardingHidden(true);
    if (uid) void AsyncStorage.setItem(`renttrack_onboarding_hidden_${uid}`, '1');
  }

  const steps = onboardingSteps({ properties: props.length, leases: leaseList.length, payments: payList.length });
  const onboardingVisible = loaded && onboardingHidden === false && steps.some((s) => !s.done);

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const activeLeases = leaseList.filter((l) => l.status === 'active');
  const rentedCount = props.filter((p) => p.status === 'rented').length;
  const occupancyRate = props.length > 0 ? Math.round((rentedCount / props.length) * 100) : 0;

  // Currency is tracked per lease, so all aggregates are kept per-currency.
  const currencyOf = (leaseId: string): Currency =>
    (leaseList.find((l) => l.id === leaseId)?.currency as Currency) ?? 'EUR';

  const currentPaid = payList.filter((p) => p.period === currentPeriod && p.status === 'paid');

  const incomeBy: Partial<Record<Currency, number>> = {};
  for (const l of activeLeases) incomeBy[l.currency] = (incomeBy[l.currency] ?? 0) + l.rentAmount;

  const collectedBy: Partial<Record<Currency, number>> = {};
  for (const p of currentPaid) {
    const c = currencyOf(p.leaseId);
    collectedBy[c] = (collectedBy[c] ?? 0) + p.amount;
  }

  const owedBy: Partial<Record<Currency, number>> = {};
  for (const c of Object.keys(incomeBy) as Currency[]) {
    owedBy[c] = Math.max(0, (incomeBy[c] ?? 0) - (collectedBy[c] ?? 0));
  }

  const fmtMap = (m: Partial<Record<Currency, number>>) => {
    const keys = Object.keys(m) as Currency[];
    return keys.length ? keys.map((c) => formatMoney(m[c]!, c)).join('  ·  ') : formatMoney(0, 'EUR');
  };
  const totalOwed = (Object.values(owedBy) as number[]).reduce((s, n) => s + n, 0);

  // Просрочия през overduePeriodsForLease: покрива и МИНАЛИ неплатени месеци
  // (неплатен януари не изчезва от индикатора на 1 февруари), с клампнат падеж
  // за къси месеци. Плащанията са заредени веднъж (payList) и се групират по
  // договор — без заявки в цикъл. Днешната дата е локална (както currentPeriod).
  const today = format(new Date(), 'yyyy-MM-dd');
  const paymentsByLease = new Map<string, typeof payList>();
  for (const p of payList) {
    const arr = paymentsByLease.get(p.leaseId);
    if (arr) arr.push(p); else paymentsByLease.set(p.leaseId, [p]);
  }
  const overdueByLease = activeLeases
    .map((lease) => overduePeriodsForLease(lease, paymentsByLease.get(lease.id) ?? [], today))
    .filter((periods) => periods.length > 0);
  const overdueLeaseCount = overdueByLease.length;
  const overduePeriodCount = overdueByLease.reduce((sum, periods) => sum + periods.length, 0);

  // Бързо „Запиши плащане": активни договори, подредени — първо просрочени, после
  // дължащи текущия месец, после останалите. Преизползва вече групираните плащания.
  const recordableLeases = activeLeases
    .map((lease) => {
      const lp = paymentsByLease.get(lease.id) ?? [];
      const overdue = overduePeriodsForLease(lease, lp, today).length > 0;
      const owesCurrent = !lp.some((p) => p.period === currentPeriod && p.status === 'paid');
      return { lease, overdue, owesCurrent, priority: overdue ? 2 : owesCurrent ? 1 : 0 };
    })
    .sort((a, b) => b.priority - a.priority);

  function openRecordPayment() {
    // Един договор → директно към формата; иначе селектор.
    if (recordableLeases.length === 1) setPaymentLease(recordableLeases[0].lease);
    else setLeaseSelectVisible(true);
  }

  async function handleRecordPayment(rows: PaymentInput[]) {
    if (!paymentLease) return;
    try {
      await savePayments(paymentLease.id, 'add', rows);
      await loadAll();
      await schedulePaymentReminders();
      toast.success(rows.length > 1 ? 'Плащанията са записани' : 'Плащането е записано');
    } catch {
      toast.error('Неуспешно записване на плащането');
    } finally {
      setPaymentLease(null);
    }
  }

  const paymentLeasePeriods = paymentLease
    ? payList.filter((p) => p.leaseId === paymentLease.id).map((p) => p.period)
    : [];

  const monthLabel = formatPeriod(currentPeriod);
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Header title="Табло" subtitle={monthCapitalized} />

      {error && props.length === 0 ? (
        <ErrorState message="Данните не можаха да се заредят." onRetry={loadAll} />
      ) : phase === 'skeleton' ? (
        <DashboardSkeleton />
      ) : phase === 'pending' ? null : (
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        {/* Hero — expected monthly income */}
        <View
          style={{
            backgroundColor: t.primary,
            borderRadius: radius.xl,
            padding: spacing.xxl,
            ...shadow.lg,
            shadowColor: t.primary,
          }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>
            ОЧАКВАН МЕСЕЧЕН ДОХОД
          </Text>
          <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 }}>
            {fmtMap(incomeBy)}
          </Text>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)',
            }}>
            <HeroStat label="Активни договори" value={String(activeLeases.length)} />
            <HeroStat label="Имоти" value={String(props.length)} />
            <HeroStat label="Заетост" value={`${occupancyRate}%`} />
          </View>
        </View>

        {/* First steps (onboarding) */}
        {onboardingVisible ? <OnboardingCard steps={steps} onHide={hideOnboarding} /> : null}

        {/* Collected / outstanding this month */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatTile label="Събрано" sub={monthCapitalized} value={fmtMap(collectedBy)} tone="success" />
          <StatTile label="Дължимо" sub={monthCapitalized} value={fmtMap(owedBy)} tone={totalOwed > 0 ? 'warning' : 'success'} />
        </View>

        {/* Бързо записване на плащане (избор на договор → формата за плащане) */}
        {recordableLeases.length > 0 ? (
          <Button label="+ Запиши плащане" onPress={openRecordPayment} fullWidth />
        ) : null}

        {/* Occupancy */}
        {props.length > 0 ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>Заетост</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.textSecondary }}>
                {rentedCount} / {props.length} имота
              </Text>
            </View>
            <ProgressBar value={occupancyRate} tone={occupancyRate >= 70 ? 'success' : 'primary'} />
          </Card>
        ) : null}

        {/* Reports button */}
        {props.length > 0 ? (
          <Button
            label="📊 Справки и отчети"
            onPress={() => router.push('/reports')}
            fullWidth
          />
        ) : null}

        {/* Overdue alert */}
        {overdueLeaseCount > 0 ? (
          <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warning + '55' }}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 22 }}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: t.warning }}>Просрочени плащания</Text>
                <Text style={{ fontSize: 13, color: t.warning, marginTop: 4, lineHeight: 19 }}>
                  {overdueLeaseCount} договор{overdueLeaseCount === 1 ? '' : 'а'} с{' '}
                  {overduePeriodCount === 1 ? '1 неплатен месец' : `${overduePeriodCount} неплатени месеца`} след падежа, вкл. минали периоди.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* First-run empty state — само ако картата „Първи стъпки" е скрита,
            иначе двете се дублират. */}
        {props.length === 0 && !onboardingVisible ? (
          <View style={{ marginTop: spacing.xxl }}>
            <EmptyState
              icon="🏠"
              title="Добре дошли в RentTrack"
              message="Започнете, като добавите първия си имот в раздел „Имоти“."
              action={<Button label="Добави имот" onPress={() => router.push('/(tabs)/properties')} />}
            />
          </View>
        ) : null}
      </View>
      )}
    </ScrollView>

    {leaseSelectVisible ? (
      <LeaseSelectModal
        leases={recordableLeases}
        properties={props}
        onClose={() => setLeaseSelectVisible(false)}
        onSelect={(lease) => { setLeaseSelectVisible(false); setPaymentLease(lease); }}
      />
    ) : null}

    {paymentLease ? (
      <PaymentModal
        state={{ mode: 'add' }}
        currency={paymentLease.currency as Currency}
        defaultAmount={paymentLease.rentAmount}
        takenPeriods={paymentLeasePeriods}
        onClose={() => setPaymentLease(null)}
        onSubmit={handleRecordPayment}
        onDelete={() => { /* add режим няма изтриване */ }}
      />
    ) : null}
    </>
  );
}

/**
 * Селектор на активен договор за бързото „Запиши плащане". Подреден отвън —
 * първо просрочени/дължащи. Натискане отваря споделената форма за плащане.
 */
function LeaseSelectModal({ leases, properties, onSelect, onClose }: {
  leases: { lease: Lease; overdue: boolean; owesCurrent: boolean }[];
  properties: Property[];
  onSelect: (lease: Lease) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <SheetModal visible onClose={onClose} title="Изберете договор">
      <View style={{ gap: spacing.md }}>
        {leases.map(({ lease, overdue, owesCurrent }) => {
          const propName = properties.find((p) => p.id === lease.propertyId)?.name ?? '—';
          return (
            <Card key={lease.id} onPress={() => onSelect(lease)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: spacing.md }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }} numberOfLines={1}>{propName}</Text>
                  <Text style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}>
                    {formatMoney(lease.rentAmount, lease.currency as Currency)} / месец
                  </Text>
                </View>
                {overdue ? <Badge label="Просрочен" tone="danger" /> : owesCurrent ? <Badge label="Дължи" tone="warning" /> : null}
              </View>
            </Card>
          );
        })}
      </View>
    </SheetModal>
  );
}

/**
 * Карта „Първи стъпки" за нов потребител: три стъпки с отметки от реалните
 * данни. Незавършените са натискаеми и водят към мястото на действието —
 * без навигационна машина, просто преход към съответния таб.
 */
function OnboardingCard({ steps, onHide }: { steps: OnboardingStep[]; onHide: () => void }) {
  const t = useTheme();
  const doneCount = steps.filter((s) => s.done).length;
  // Договорите се създават от екрана на имота, но първо трябва наемател —
  // затова стъпка 2 води към таб „Наематели".
  const targets: Record<OnboardingStep['key'], { route: '/(tabs)/properties' | '/(tabs)/tenants'; hint: string }> = {
    property: { route: '/(tabs)/properties', hint: 'Раздел „Имоти“ → бутон +' },
    lease: { route: '/(tabs)/tenants', hint: 'Добавете наемател, после договор от екрана на имота' },
    payment: { route: '/(tabs)/properties', hint: 'Записва се от екрана на имота' },
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: t.text }}>Първи стъпки</Text>
        <TouchableOpacity onPress={onHide} hitSlop={10} accessibilityRole="button" accessibilityLabel="Скрий първите стъпки">
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.textMuted }}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        <ProgressBar value={(doneCount / steps.length) * 100} tone={doneCount > 0 ? 'success' : 'primary'} />
      </View>
      {steps.map((step) => (
        <TouchableOpacity
          key={step.key}
          disabled={step.done}
          activeOpacity={0.7}
          onPress={() => router.push(targets[step.key].route)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9 }}>
          <Text style={{ fontSize: 17 }}>{step.done ? '✅' : '⬜'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: step.done ? t.textMuted : t.text }}>
              {step.title}
            </Text>
            {!step.done ? (
              <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{targets[step.key].hint}</Text>
            ) : null}
          </View>
          {!step.done ? <Text style={{ fontSize: 18, fontWeight: '700', color: t.primary }}>›</Text> : null}
        </TouchableOpacity>
      ))}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
      <Skeleton height={150} style={{ borderRadius: radius.xl }} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}><Skeleton height={92} style={{ borderRadius: radius.lg }} /></View>
        <View style={{ flex: 1 }}><Skeleton height={92} style={{ borderRadius: radius.lg }} /></View>
      </View>
      <Skeleton height={80} style={{ borderRadius: radius.lg }} />
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function StatTile({ label, sub, value, tone }: { label: string; sub: string; value: string; tone: 'success' | 'warning' }) {
  const t = useTheme();
  const color = tone === 'warning' ? t.warning : t.success;
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.textSecondary, letterSpacing: 0.3 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color, marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{sub}</Text>
    </Card>
  );
}
