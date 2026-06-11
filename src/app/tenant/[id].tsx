import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/core';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, leases, properties, payments } from '@/db/schema';
import type { Tenant, Lease, Property, Payment } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { softDeleteTenant } from '@/db/soft-delete';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import {
  Screen, Card, Badge, Avatar, SectionTitle, Button, Field, Input,
  InfoRow, Divider, EmptyState, Loading, ErrorState, SheetModal, useTheme, spacing, radius,
} from '@/components/ui';
import { useDelayedFlag } from '@/hooks/use-loading-state';
import {
  formatMoney, formatPeriod, formatDate, sumByCurrency, deleteCascadeWarning,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONE, METHOD_LABELS, type Currency,
} from '@/lib/domain';

type PayRow = { payment: Payment; currency: Currency; propertyName: string };

export default function TenantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [activeLease, setActiveLease] = useState<Lease | null>(null);
  const [activeProperty, setActiveProperty] = useState<Property | null>(null);
  const [payRows, setPayRows] = useState<PayRow[]>([]);
  const [hasAnyLease, setHasAnyLease] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  const loadData = useCallback(async () => {
    const uid = currentUserId();
    if (!id || !uid) { setLoading(false); return; }
    try {
      setError(false);
      const [tn] = await db.select().from(tenants)
        .where(ownedAndLive(tenants, uid, eq(tenants.id, id))).limit(1);
      if (!tn) { router.back(); return; }
      setTenant(tn);

      const tLeases = await db.select().from(leases)
        .where(ownedAndLive(leases, uid, eq(leases.tenantId, id)));
      setHasAnyLease(tLeases.length > 0);

      const active = tLeases.find((l) => l.status === 'active') ?? null;
      setActiveLease(active);

      const allProps = await db.select().from(properties).where(ownedAndLive(properties, uid));
      const propName = (pid: string) => allProps.find((p) => p.id === pid)?.name ?? '—';
      setActiveProperty(active ? allProps.find((p) => p.id === active.propertyId) ?? null : null);

      const rows: PayRow[] = [];
      for (const lease of tLeases) {
        const pays = await db.select().from(payments)
          .where(ownedAndLive(payments, uid, eq(payments.leaseId, lease.id)));
        for (const payment of pays) {
          rows.push({ payment, currency: lease.currency as Currency, propertyName: propName(lease.propertyId) });
        }
      }
      rows.sort((a, b) => b.payment.period.localeCompare(a.payment.period));
      setPayRows(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function handleEdit(data: { name: string; phone: string | null; email: string | null; notes: string | null }) {
    if (!tenant) return;
    try {
      await db.update(tenants).set(data).where(eq(tenants.id, tenant.id));
      await loadData();
      toast.success('Наемателят е обновен');
    } catch {
      toast.error('Неуспешно обновяване на наемателя');
    } finally {
      setEditVisible(false);
    }
  }

  async function handleDelete() {
    if (!tenant) return;
    if (activeLease) {
      toast.error('Изтриването е блокирано: има активен договор');
      return;
    }
    const base = `Сигурни ли сте, че искате да изтриете „${tenant.name}“?`;
    const ok = await confirm({
      title: 'Изтриване на наемател',
      message: hasAnyLease ? `${base} ${deleteCascadeWarning(tenant.name)}` : base,
      confirmLabel: 'Изтрий',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await softDeleteTenant(db, tenant.id);
      toast.success('Наемателят е изтрит');
      router.back();
    } catch {
      toast.error('Неуспешно изтриране на наемателя');
    }
  }

  const showLoading = useDelayedFlag(loading);
  if (loading) return showLoading ? <Loading /> : <Screen />;
  if (error && !tenant) {
    return (
      <Screen>
        <ErrorState message="Наемателят не можа да се зареди." onRetry={loadData} />
      </Screen>
    );
  }
  if (!tenant) return null;

  const paidTotals = payRows
    .filter((r) => r.payment.status === 'paid')
    .map((r) => ({ amount: r.payment.amount, currency: r.currency }));

  return (
    <>
      <Stack.Screen
        options={{
          title: tenant.name,
          headerBackTitle: 'Назад',
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text, fontWeight: '800' },
          headerShadowVisible: false,
        }}
      />
      <Screen>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Identity + contact */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar name={tenant.name} size={56} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={{ fontSize: 21, fontWeight: '800', color: t.text }}>{tenant.name}</Text>
                {activeLease ? <View style={{ marginTop: 6 }}><Badge label="Активен наем" tone="success" /></View> : null}
              </View>
              <TouchableOpacity
                onPress={() => setEditVisible(true)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: t.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary }}>Редактирай</Text>
              </TouchableOpacity>
            </View>

            {tenant.phone || tenant.email ? (
              <>
                <Divider />
                {tenant.phone ? (
                  <ContactRow icon="📞" label={tenant.phone} onPress={() => Linking.openURL(`tel:${tenant.phone}`)} />
                ) : null}
                {tenant.email ? (
                  <ContactRow icon="✉️" label={tenant.email} onPress={() => Linking.openURL(`mailto:${tenant.email}`)} />
                ) : null}
              </>
            ) : null}

            {tenant.notes ? (
              <>
                <Divider />
                <Text style={{ fontSize: 14, color: t.textSecondary, lineHeight: 20 }}>{tenant.notes}</Text>
              </>
            ) : null}
          </Card>

          {/* Lifetime summary */}
          {payRows.length > 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: t.textSecondary, letterSpacing: 0.3 }}>ОБЩО ПЛАТЕНО</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: t.success, marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit>
                {sumByCurrency(paidTotals)}
              </Text>
              <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                {payRows.length} {payRows.length === 1 ? 'плащане' : 'плащания'}
              </Text>
            </Card>
          ) : null}

          {/* Active lease */}
          <View style={{ marginTop: spacing.xxl }}>
            <SectionTitle>Текущ договор</SectionTitle>
            {activeLease && activeProperty ? (
              <Card>
                <InfoRow label="Имот" value={activeProperty.name} onPress={() => router.push(`/property/${activeProperty.id}`)} />
                <InfoRow label="Наем" value={`${formatMoney(activeLease.rentAmount, activeLease.currency as Currency)} / месец`} />
                <InfoRow label="Ден за плащане" value={`${activeLease.paymentDay}-то число`} />
                <InfoRow label="Начало" value={formatDate(activeLease.startDate)} />
                {activeLease.depositAmount ? <InfoRow label="Депозит" value={formatMoney(activeLease.depositAmount, activeLease.currency as Currency)} /> : null}
              </Card>
            ) : (
              <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <Text style={{ fontSize: 14, color: t.textSecondary }}>Няма активен договор</Text>
              </Card>
            )}
          </View>

          {/* Payment history */}
          {payRows.length > 0 ? (
            <View style={{ marginTop: spacing.xxl }}>
              <SectionTitle>История на плащанията</SectionTitle>
              {payRows.map(({ payment, currency, propertyName }) => (
                <Card key={payment.id} style={{ marginBottom: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{formatPeriod(payment.period)}</Text>
                      <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>
                        {[propertyName, payment.method ? METHOD_LABELS[payment.method] : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{formatMoney(payment.amount, currency)}</Text>
                      <Badge label={PAYMENT_STATUS_LABELS[payment.status]} tone={PAYMENT_STATUS_TONE[payment.status]} />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <View style={{ marginTop: spacing.lg }}>
              <EmptyState icon="🧾" title="Няма записани плащания" message="Плащанията се записват от детайлния екран на имота." />
            </View>
          )}

          {/* Delete */}
          {!activeLease ? (
            <View style={{ marginTop: spacing.xxxl }}>
              <Button label="Изтриване на наемател" variant="danger" onPress={handleDelete} fullWidth />
            </View>
          ) : null}
        </ScrollView>
      </Screen>

      {editVisible ? (
        <EditTenantModal tenant={tenant} onClose={() => setEditVisible(false)} onSave={handleEdit} />
      ) : null}
    </>
  );
}

function ContactRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: spacing.md }}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={{ fontSize: 15, color: t.primary, fontWeight: '600', flex: 1 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function EditTenantModal({ tenant, onClose, onSave }: {
  tenant: Tenant;
  onClose: () => void;
  onSave: (data: { name: string; phone: string | null; email: string | null; notes: string | null }) => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [phone, setPhone] = useState(tenant.phone ?? '');
  const [email, setEmail] = useState(tenant.email ?? '');
  const [notes, setNotes] = useState(tenant.notes ?? '');

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете името на наемателя.'); return; }
    onSave({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null });
  }

  return (
    <SheetModal visible onClose={onClose} onSave={handleSave} title="Редактиране на наемател">
      <Field label="Име *">
        <Input value={name} onChangeText={setName} placeholder="Пълно име" />
      </Field>
      <Field label="Телефон">
        <Input value={phone} onChangeText={setPhone} placeholder="По избор" keyboardType="phone-pad" />
      </Field>
      <Field label="Имейл">
        <Input value={email} onChangeText={setEmail} placeholder="По избор" keyboardType="email-address" autoCapitalize="none" />
      </Field>
      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>
    </SheetModal>
  );
}
