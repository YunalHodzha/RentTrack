import { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { db } from '@/db/client';
import { properties, leases, payments } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { useAppStore } from '@/store';
import { useFocusReload } from '@/hooks/use-focus-reload';
import { useLoadingState } from '@/hooks/use-loading-state';
import { Header, Card, ProgressBar, Button, EmptyState, Skeleton, ErrorState, useTheme, spacing, radius, shadow } from '@/components/ui';
import { formatMoney, formatPeriod, type Currency } from '@/lib/domain';

export default function DashboardScreen() {
  const t = useTheme();
  const { properties: props, leases: leaseList, payments: payList, setProperties, setLeases, setPayments } = useAppStore();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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

  const overdueLeases = activeLeases.filter((lease) => {
    const dayOfMonth = new Date().getDate();
    const hasPaid = currentPaid.some((p) => p.leaseId === lease.id);
    return dayOfMonth > lease.paymentDay && !hasPaid;
  });

  const monthLabel = formatPeriod(currentPeriod);
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
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

        {/* Collected / outstanding this month */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatTile label="Събрано" sub={monthCapitalized} value={fmtMap(collectedBy)} tone="success" />
          <StatTile label="Дължимо" sub={monthCapitalized} value={fmtMap(owedBy)} tone={totalOwed > 0 ? 'warning' : 'success'} />
        </View>

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
        {overdueLeases.length > 0 ? (
          <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warning + '55' }}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 22 }}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: t.warning }}>Просрочени плащания</Text>
                <Text style={{ fontSize: 13, color: t.warning, marginTop: 4, lineHeight: 19 }}>
                  {overdueLeases.length} договор{overdueLeases.length > 1 ? 'а' : ''} с изминал ден на плащане без записано плащане за {monthCapitalized.toLowerCase()}.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* First-run empty state */}
        {props.length === 0 ? (
          <View style={{ marginTop: spacing.xxl }}>
            <EmptyState
              icon="🏠"
              title="Добре дошли в RentTrack"
              message="Започнете, като добавите първия си имот в раздел „Имоти“."
            />
          </View>
        ) : null}
      </View>
      )}
    </ScrollView>
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
