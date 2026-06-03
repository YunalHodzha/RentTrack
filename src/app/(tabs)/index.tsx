import { useCallback } from 'react';
import { View, Text, ScrollView, useColorScheme } from 'react-native';
import { useFocusEffect } from '@react-navigation/core';
import { db } from '@/db/client';
import { properties, leases, payments } from '@/db/schema';
import { useAppStore } from '@/store';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';

export default function DashboardScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { properties: props, leases: leasList, payments: payList, setProperties, setLeases, setPayments } = useAppStore();

  const bg = isDark ? '#111827' : '#F9FAFB';
  const card = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const border = isDark ? '#374151' : '#E5E7EB';

  async function loadAll() {
    const [p, l, pay] = await Promise.all([
      db.select().from(properties),
      db.select().from(leases),
      db.select().from(payments),
    ]);
    setProperties(p);
    setLeases(l);
    setPayments(pay);
  }

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const activeLeases = leasList.filter((l) => l.status === 'active');
  const rentedCount = props.filter((p) => p.status === 'rented').length;
  const occupancyRate = props.length > 0 ? Math.round((rentedCount / props.length) * 100) : 0;

  const monthlyIncome = activeLeases.reduce((sum, l) => sum + l.rentAmount, 0);

  const currentPayments = payList.filter((p) => p.period === currentPeriod);
  const collected = currentPayments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const owed = monthlyIncome - collected;

  const overdueLeases = activeLeases.filter((lease) => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const hasPaid = currentPayments.some((p) => p.leaseId === lease.id && p.status === 'paid');
    return dayOfMonth > lease.paymentDay && !hasPaid;
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: card, borderBottomWidth: 1, borderBottomColor: border }}>
        <Text style={{ fontSize: 14, color: sub }}>{format(new Date(), 'MMMM yyyy')}</Text>
        <Text style={{ fontSize: 28, fontWeight: '700', color: text, marginTop: 2 }}>Табло</Text>
      </View>

      <View style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatCard title="Месечен доход" value={`€${monthlyIncome.toFixed(0)}`} sub={`${activeLeases.length} акт. договора`} color="#2563EB" card={card} text={text} sub2={sub} border={border} />
          <StatCard title="Заетост" value={`${occupancyRate}%`} sub={`${rentedCount} / ${props.length} имота`} color="#16A34A" card={card} text={text} sub2={sub} border={border} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatCard title="Събрано" value={`€${collected.toFixed(0)}`} sub={currentPeriod} color="#16A34A" card={card} text={text} sub2={sub} border={border} />
          <StatCard title="Дължимо" value={`€${owed.toFixed(0)}`} sub={currentPeriod} color={owed > 0 ? '#D97706' : '#16A34A'} card={card} text={text} sub2={sub} border={border} />
        </View>

        {overdueLeases.length > 0 && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#FDE68A' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>⚠️ Просрочени плащания</Text>
            <Text style={{ fontSize: 13, color: '#92400E', marginTop: 4 }}>
              {overdueLeases.length} договор{overdueLeases.length > 1 ? 'а' : ''} с изминал ден на плащане без записано плащане
            </Text>
          </View>
        )}

        {props.length === 0 && (
          <View style={{ backgroundColor: card, borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 32 }}>🏠</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: text, marginTop: 12 }}>Начало</Text>
            <Text style={{ fontSize: 14, color: sub, marginTop: 6, textAlign: 'center' }}>
              Добавете първия си имот в раздел Имоти
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ title, value, sub, color, card, text, sub2, border }: {
  title: string; value: string; sub: string; color: string;
  card: string; text: string; sub2: string; border: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: border }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: sub2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color, marginTop: 8 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: sub2, marginTop: 4 }}>{sub}</Text>
    </View>
  );
}
