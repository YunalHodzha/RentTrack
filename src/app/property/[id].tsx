import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/core';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/db/client';
import { properties, leases, tenants, payments } from '@/db/schema';
import type { Property, Lease, Tenant, Payment } from '@/db/schema';
import { ownedAndLive, currentUserId, requireUserId, withOwner } from '@/db/owner';
import { softDeleteProperty, softDeletePayment } from '@/db/soft-delete';
import { generateId } from '@/lib/uuid';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { schedulePaymentReminders } from '@/services/notifications';
import {
  Screen, Card, Badge, IconBadge, SectionTitle, Button, Field, Input, ChipGroup,
  InfoRow, Divider, EmptyState, Loading, ErrorState, SheetModal, useTheme, toneColors, spacing, radius, type Tone,
} from '@/components/ui';
import { useDelayedFlag } from '@/hooks/use-loading-state';
import {
  PROPERTY_TYPES, TYPE_LABELS, TYPE_ICONS, STATUS_LABELS, STATUS_TONE,
  METHOD_LABELS, PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONE,
  formatMoney, formatPeriod, formatDate, listPeriods, type Currency,
} from '@/lib/domain';

type PaymentInput = { period: string; amount: number; method: 'cash' | 'bank' | 'other'; status: Payment['status']; notes: string | null };

type PaymentModalState = { mode: 'add' | 'edit'; payment?: Payment } | null;

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();

  const [property, setProperty] = useState<Property | null>(null);
  const [activeLease, setActiveLease] = useState<Lease | null>(null);
  const [leaseTenant, setLeaseTenant] = useState<Tenant | null>(null);
  const [propertyPayments, setPropertyPayments] = useState<Payment[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [addLeaseVisible, setAddLeaseVisible] = useState(false);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>(null);
  const [editPropertyVisible, setEditPropertyVisible] = useState(false);

  const loadData = useCallback(async () => {
    const uid = currentUserId();
    if (!id || !uid) { setLoading(false); return; }
    try {
      setError(false);
      const [prop] = await db.select().from(properties)
        .where(ownedAndLive(properties, uid, eq(properties.id, id))).limit(1);
      if (!prop) { router.back(); return; }
      setProperty(prop);

      const [lease] = await db.select().from(leases)
        .where(ownedAndLive(leases, uid, eq(leases.propertyId, id), eq(leases.status, 'active')))
        .limit(1);
      setActiveLease(lease ?? null);

      if (lease) {
        const [tenant] = await db.select().from(tenants)
          .where(ownedAndLive(tenants, uid, eq(tenants.id, lease.tenantId))).limit(1);
        setLeaseTenant(tenant ?? null);
        const pays = await db.select().from(payments)
          .where(ownedAndLive(payments, uid, eq(payments.leaseId, lease.id)));
        setPropertyPayments(pays.sort((a, b) => b.period.localeCompare(a.period)));
      } else {
        setLeaseTenant(null);
        setPropertyPayments([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const currency: Currency = (activeLease?.currency as Currency) ?? 'EUR';

  async function handleAddLease(data: {
    tenantId: string; rentAmount: number; currency: Currency;
    paymentDay: number; startDate: string; depositAmount: number | null; notes: string | null;
  }) {
    if (!property) return;
    try {
      const now = new Date().toISOString();
      await db.insert(leases).values(withOwner({ id: generateId(), propertyId: property.id, status: 'active', createdAt: now, updatedAt: now, ...data }));
      await db.update(properties).set({ status: 'rented', updatedAt: now }).where(eq(properties.id, property.id));
      await loadData();
      toast.success('Договорът е създаден');
    } catch {
      toast.error('Неуспешно създаване на договора');
    } finally {
      setAddLeaseVisible(false);
    }
  }

  // Create a tenant inline from the lease modal. Persists to the DB (so it also
  // shows up in the Наематели tab) and updates the in-modal list so it can be
  // selected immediately.
  async function handleCreateTenant(data: { name: string; phone: string | null }): Promise<Tenant> {
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: generateId(),
      userId: requireUserId(),
      name: data.name,
      phone: data.phone,
      email: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.insert(tenants).values(tenant);
    setAllTenants((prev) => [...prev, tenant]);
    return tenant;
  }

  async function handleEndLease() {
    if (!activeLease || !property) return;
    const ok = await confirm({
      title: 'Приключи договора',
      message: 'Сигурни ли сте? Имотът ще бъде маркиран като свободен.',
      confirmLabel: 'Приключи',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();
      await db.update(leases).set({ status: 'ended', endDate: today, updatedAt: now }).where(eq(leases.id, activeLease.id));
      await db.update(properties).set({ status: 'free', updatedAt: now }).where(eq(properties.id, property.id));
      await loadData();
      toast.success('Договорът е приключен');
    } catch {
      toast.error('Неуспешно приключване на договора');
    }
  }

  async function handleSavePayment(rows: PaymentInput[]) {
    if (!activeLease || !paymentModal) return;
    const isEdit = paymentModal.mode === 'edit' && !!paymentModal.payment;
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toISOString();

      if (paymentModal.mode === 'edit' && paymentModal.payment) {
        const prev = paymentModal.payment;
        const data = rows[0];
        const paidDate = data.status === 'paid' ? (prev.paidDate ?? today) : prev.paidDate ?? null;
        await db.update(payments).set({ ...data, paidDate, updatedAt: now }).where(eq(payments.id, prev.id));
      } else {
        // Advance payment: one paid row per covered month so per-period logic
        // (collected totals, "current month" status, future reminders) stays correct.
        for (const data of rows) {
          const paidDate = data.status === 'paid' ? today : null;
          await db.insert(payments).values(withOwner({ id: generateId(), leaseId: activeLease.id, paidDate, createdAt: now, updatedAt: now, ...data }));
        }
      }
      await loadData();
      await schedulePaymentReminders();
      toast.success(isEdit ? 'Плащането е обновено' : rows.length > 1 ? 'Плащанията са записани' : 'Плащането е записано');
    } catch {
      toast.error('Неуспешно записване на плащането');
    } finally {
      setPaymentModal(null);
    }
  }

  async function handleDeletePayment(payment: Payment) {
    const ok = await confirm({
      title: 'Изтриване на плащане',
      message: `Да изтрия ли плащането за ${formatPeriod(payment.period)}?`,
      confirmLabel: 'Изтрий',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await softDeletePayment(db, payment.id);
      await loadData();
      await schedulePaymentReminders();
      toast.success('Плащането е изтрито');
    } catch {
      toast.error('Неуспешно изтриране на плащането');
    } finally {
      setPaymentModal(null);
    }
  }

  async function handleEditProperty(data: { name: string; address: string | null; type: Property['type']; notes: string | null }) {
    if (!property) return;
    try {
      await db.update(properties).set(data).where(eq(properties.id, property.id));
      await loadData();
      toast.success('Имотът е обновен');
    } catch {
      toast.error('Неуспешно обновяване на имота');
    } finally {
      setEditPropertyVisible(false);
    }
  }

  async function handleToggleStatus(next: 'free' | 'unavailable') {
    if (!property || property.status === next) return;
    try {
      await db.update(properties).set({ status: next }).where(eq(properties.id, property.id));
      await loadData();
      toast.success('Статусът е обновен');
    } catch {
      toast.error('Неуспешна промяна на статуса');
    }
  }

  async function handleDeleteProperty() {
    if (!property) return;
    if (activeLease) {
      toast.error('Изтриването е блокирано: има активен договор');
      return;
    }
    const ok = await confirm({
      title: 'Изтриване на имот',
      message: `Сигурни ли сте, че искате да изтриете „${property.name}“?`,
      confirmLabel: 'Изтрий',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await softDeleteProperty(db, property.id);
      toast.success('Имотът е изтрит');
      router.back();
    } catch {
      toast.error('Неуспешно изтриране на имота');
    }
  }

  const showLoading = useDelayedFlag(loading);
  if (loading) return showLoading ? <Loading /> : <Screen />;
  if (error && !property) {
    return (
      <Screen>
        <ErrorState message="Имотът не можа да се зареди." onRetry={loadData} />
      </Screen>
    );
  }
  if (!property) return null;

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const currentPayment = propertyPayments.find((p) => p.period === currentPeriod);
  const takenPeriods = propertyPayments.map((p) => p.period);

  return (
    <>
      <Stack.Screen
        options={{
          title: property.name,
          headerBackTitle: 'Назад',
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text, fontWeight: '800' },
          headerShadowVisible: false,
        }}
      />
      <Screen>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Property summary */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <IconBadge icon={TYPE_ICONS[property.type] ?? '📦'} tone={STATUS_TONE[property.status]} size={52} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={{ fontSize: 21, fontWeight: '800', color: t.text }}>{property.name}</Text>
                {property.address ? <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: 3 }}>{property.address}</Text> : null}
                <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>{TYPE_LABELS[property.type] ?? property.type}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg }}>
              <Badge label={STATUS_LABELS[property.status]} tone={STATUS_TONE[property.status]} />
              <TouchableOpacity
                onPress={() => setEditPropertyVisible(true)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: t.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary }}>Редактирай</Text>
              </TouchableOpacity>
            </View>
            {property.notes ? (
              <>
                <Divider />
                <Text style={{ fontSize: 14, color: t.textSecondary, lineHeight: 20 }}>{property.notes}</Text>
              </>
            ) : null}
          </Card>

          {/* Status toggle (only when there is no active lease) */}
          {!activeLease ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary, marginBottom: spacing.sm }}>Наличност</Text>
              <ChipGroup
                options={[{ value: 'free', label: 'Свободен' }, { value: 'unavailable', label: 'Недостъпен' }]}
                value={property.status === 'unavailable' ? 'unavailable' : 'free'}
                onChange={(v) => handleToggleStatus(v as 'free' | 'unavailable')}
              />
            </View>
          ) : null}

          {/* Lease */}
          <View style={{ marginTop: spacing.xxl }}>
            <SectionTitle>Договор за наем</SectionTitle>
            {activeLease && leaseTenant ? (
              <Card>
                <InfoRow label="Наемател" value={leaseTenant.name} onPress={() => router.push(`/tenant/${leaseTenant.id}`)} />
                <InfoRow label="Наем" value={`${formatMoney(activeLease.rentAmount, currency)} / месец`} />
                <InfoRow label="Ден за плащане" value={`${activeLease.paymentDay}-то число`} />
                <InfoRow label="Начало" value={formatDate(activeLease.startDate)} />
                {activeLease.depositAmount ? <InfoRow label="Депозит" value={formatMoney(activeLease.depositAmount, currency)} /> : null}
                {activeLease.notes ? (
                  <>
                    <Divider />
                    <Text style={{ fontSize: 14, color: t.textSecondary, lineHeight: 20 }}>{activeLease.notes}</Text>
                  </>
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
                  <Button label="Запиши плащане" onPress={() => setPaymentModal({ mode: 'add' })} fullWidth />
                  <Button label="Приключи" variant="secondary" tone="warning" onPress={handleEndLease} fullWidth />
                </View>
              </Card>
            ) : (
              <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <Text style={{ fontSize: 14, color: t.textSecondary, marginBottom: spacing.lg }}>Няма активен договор</Text>
                <Button
                  label="+ Добавяне на договор"
                  onPress={async () => {
                    const uid = currentUserId();
                    if (!uid) return;
                    const rows = await db.select().from(tenants).where(ownedAndLive(tenants, uid));
                    setAllTenants(rows);
                    setAddLeaseVisible(true);
                  }}
                />
              </Card>
            )}
          </View>

          {/* Current month status */}
          {activeLease ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary, marginBottom: spacing.md }}>
                Текущ месец · {formatPeriod(currentPeriod)}
              </Text>
              {currentPayment ? (
                <StatusLine
                  tone={PAYMENT_STATUS_TONE[currentPayment.status]}
                  text={`${PAYMENT_STATUS_LABELS[currentPayment.status]} · ${formatMoney(currentPayment.amount, currency)}${currentPayment.paidDate ? ` · ${formatDate(currentPayment.paidDate)}` : ''}`}
                />
              ) : (
                <StatusLine tone="warning" text="Не е записано плащане" />
              )}
            </Card>
          ) : null}

          {/* Payment history */}
          {propertyPayments.length > 0 ? (
            <View style={{ marginTop: spacing.xxl }}>
              <SectionTitle>История на плащанията</SectionTitle>
              {propertyPayments.map((payment) => (
                <Card key={payment.id} onPress={() => setPaymentModal({ mode: 'edit', payment })} style={{ marginBottom: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>{formatPeriod(payment.period)}</Text>
                      <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>
                        {[payment.method ? METHOD_LABELS[payment.method] : null, payment.paidDate ? formatDate(payment.paidDate) : null].filter(Boolean).join(' · ')}
                      </Text>
                      {payment.notes ? <Text style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', marginTop: 2 }}>{payment.notes}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{formatMoney(payment.amount, currency)}</Text>
                      <Badge label={PAYMENT_STATUS_LABELS[payment.status]} tone={PAYMENT_STATUS_TONE[payment.status]} />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : activeLease ? (
            <View style={{ marginTop: spacing.lg }}>
              <EmptyState icon="🧾" title="Няма записани плащания" message="Натиснете „Запиши плащане“, за да добавите първото." />
            </View>
          ) : null}

          {/* Delete */}
          {!activeLease ? (
            <View style={{ marginTop: spacing.xxxl }}>
              <Button label="Изтриване на имот" variant="danger" onPress={handleDeleteProperty} fullWidth />
            </View>
          ) : null}
        </ScrollView>
      </Screen>

      {addLeaseVisible ? (
        <AddLeaseModal
          visible={addLeaseVisible}
          tenantList={allTenants}
          onClose={() => setAddLeaseVisible(false)}
          onSave={handleAddLease}
          onCreateTenant={handleCreateTenant}
        />
      ) : null}

      {paymentModal && activeLease ? (
        <PaymentModal
          state={paymentModal}
          currency={currency}
          defaultAmount={activeLease.rentAmount}
          takenPeriods={takenPeriods}
          onClose={() => setPaymentModal(null)}
          onSubmit={handleSavePayment}
          onDelete={handleDeletePayment}
        />
      ) : null}

      {editPropertyVisible ? (
        <EditPropertyModal
          visible={editPropertyVisible}
          property={property}
          onClose={() => setEditPropertyVisible(false)}
          onSave={handleEditProperty}
        />
      ) : null}
    </>
  );
}

function StatusLine({ tone, text }: { tone: Tone; text: string }) {
  const t = useTheme();
  const color = toneColors(t, tone).fg;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 15, color, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

function AddLeaseModal({ visible, tenantList, onClose, onSave, onCreateTenant }: {
  visible: boolean;
  tenantList: Tenant[];
  onClose: () => void;
  onSave: (data: { tenantId: string; rentAmount: number; currency: Currency; paymentDay: number; startDate: string; depositAmount: number | null; notes: string | null }) => void;
  onCreateTenant: (data: { name: string; phone: string | null }) => Promise<Tenant>;
}) {
  const t = useTheme();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [rentAmount, setRentAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [paymentDay, setPaymentDay] = useState('1');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [depositAmount, setDepositAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Inline "new tenant" mini-form state.
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  function resetNewTenant() { setShowNewTenant(false); setNewName(''); setNewPhone(''); }

  function reset() {
    setSelectedTenantId(null); setRentAmount(''); setCurrency('EUR');
    setPaymentDay('1'); setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setDepositAmount(''); setNotes('');
    resetNewTenant();
  }

  async function handleCreateTenant() {
    if (!newName.trim()) { Alert.alert('Задължително', 'Моля, въведете името на наемателя.'); return; }
    setCreating(true);
    try {
      const tenant = await onCreateTenant({ name: newName.trim(), phone: newPhone.trim() || null });
      setSelectedTenantId(tenant.id);
      resetNewTenant();
    } catch {
      Alert.alert('Грешка', 'Неуспешно добавяне на наемател.');
    } finally {
      setCreating(false);
    }
  }

  function handleSave() {
    if (!selectedTenantId) { Alert.alert('Задължително', 'Моля, изберете наемател.'); return; }
    const amount = parseFloat(rentAmount);
    if (!rentAmount || isNaN(amount) || amount <= 0) { Alert.alert('Задължително', 'Моля, въведете валидна наемна сума.'); return; }
    const day = parseInt(paymentDay, 10);
    if (isNaN(day) || day < 1 || day > 31) { Alert.alert('Задължително', 'Денят за плащане трябва да е от 1 до 31.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { Alert.alert('Задължително', 'Въведете дата във формат ГГГГ-ММ-ДД.'); return; }
    const deposit = depositAmount ? parseFloat(depositAmount) : null;
    onSave({ tenantId: selectedTenantId, rentAmount: amount, currency, paymentDay: day, startDate, depositAmount: deposit && !isNaN(deposit) ? deposit : null, notes: notes.trim() || null });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <SheetModal visible={visible} onClose={handleClose} onSave={handleSave} title="Нов договор">
      <Field label="Наемател *">
        <View style={{ gap: spacing.sm }}>
          {tenantList.map((tenant) => {
            const active = selectedTenantId === tenant.id;
            return (
              <TouchableOpacity
                key={tenant.id}
                activeOpacity={0.8}
                onPress={() => setSelectedTenantId(tenant.id)}
                style={{
                  padding: 14, borderRadius: radius.md,
                  backgroundColor: active ? t.primarySoft : t.inputBg,
                  borderWidth: 1, borderColor: active ? t.primary : t.inputBorder,
                }}>
                <Text style={{ color: active ? t.primary : t.text, fontWeight: active ? '800' : '500', fontSize: 15 }}>{tenant.name}</Text>
                {tenant.phone ? <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{tenant.phone}</Text> : null}
              </TouchableOpacity>
            );
          })}

          {tenantList.length === 0 && !showNewTenant ? (
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Все още няма наематели. Добавете нов по-долу.</Text>
          ) : null}

          {showNewTenant ? (
            <View style={{ backgroundColor: t.inputBg, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: t.inputBorder, gap: spacing.sm }}>
              <Input value={newName} onChangeText={setNewName} placeholder="Име на наемателя *" />
              <Input value={newPhone} onChangeText={setNewPhone} placeholder="Телефон (по избор)" keyboardType="phone-pad" />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <Button label="Откажи" variant="secondary" onPress={resetNewTenant} style={{ flex: 1 }} />
                <Button label={creating ? 'Добавяне…' : 'Добави'} onPress={handleCreateTenant} disabled={creating} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowNewTenant(true)}
              style={{
                padding: 14, borderRadius: radius.md, alignItems: 'center',
                borderWidth: 1, borderColor: t.primary, borderStyle: 'dashed',
              }}>
              <Text style={{ color: t.primary, fontWeight: '700', fontSize: 15 }}>+ Нов наемател</Text>
            </TouchableOpacity>
          )}
        </View>
      </Field>

      <Field label="Наемна сума *">
        <Input value={rentAmount} onChangeText={setRentAmount} placeholder="0" keyboardType="decimal-pad" />
      </Field>

      <Field label="Валута">
        <ChipGroup options={[{ value: 'EUR', label: 'EUR €' }, { value: 'BGN', label: 'BGN лв.' }]} value={currency} onChange={setCurrency} />
      </Field>

      <Field label="Ден за плащане *" hint="Число от 1 до 31">
        <Input value={paymentDay} onChangeText={setPaymentDay} placeholder="1" keyboardType="number-pad" />
      </Field>

      <Field label="Начална дата *" hint="Формат ГГГГ-ММ-ДД">
        <Input value={startDate} onChangeText={setStartDate} placeholder="ГГГГ-ММ-ДД" />
      </Field>

      <Field label="Депозит">
        <Input value={depositAmount} onChangeText={setDepositAmount} placeholder="По избор" keyboardType="decimal-pad" />
      </Field>

      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>
    </SheetModal>
  );
}

function PaymentModal({ state, currency, defaultAmount, takenPeriods, onClose, onSubmit, onDelete }: {
  state: NonNullable<PaymentModalState>;
  currency: Currency;
  defaultAmount: number;
  takenPeriods: string[];
  onClose: () => void;
  onSubmit: (rows: PaymentInput[]) => void;
  onDelete: (payment: Payment) => void;
}) {
  const t = useTheme();
  const isEdit = state.mode === 'edit';
  const initial = state.payment;
  const [period, setPeriod] = useState(initial?.period ?? format(new Date(), 'yyyy-MM'));
  const [months, setMonths] = useState('1');
  const [amount, setAmount] = useState(String(initial?.amount ?? defaultAmount));
  const [method, setMethod] = useState<'cash' | 'bank' | 'other'>(initial?.method ?? 'cash');
  const [status, setStatus] = useState<Payment['status']>(initial?.status ?? 'paid');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const monthCount = Math.max(1, parseInt(months, 10) || 1);
  const perMonth = parseFloat(amount);
  const multi = !isEdit && monthCount > 1;
  const previewPeriods = listPeriods(period, monthCount);
  const lastPeriod = previewPeriods[previewPeriods.length - 1] ?? period;

  function handleSave() {
    const a = parseFloat(amount);
    if (!amount || isNaN(a) || a <= 0) { Alert.alert('Задължително', 'Моля, въведете валидна сума.'); return; }
    if (!/^\d{4}-\d{2}$/.test(period)) { Alert.alert('Задължително', 'Въведете период във формат ГГГГ-ММ.'); return; }

    if (isEdit) {
      const conflict = takenPeriods.includes(period) && initial?.period !== period;
      if (conflict) { Alert.alert('Дублиран период', `Вече има записано плащане за ${formatPeriod(period)}.`); return; }
      onSubmit([{ period, amount: a, method, status, notes: notes.trim() || null }]);
      return;
    }

    const m = parseInt(months, 10);
    if (isNaN(m) || m < 1 || m > 36) { Alert.alert('Невалиден брой', 'Броят месеци трябва да е от 1 до 36.'); return; }
    const periods = listPeriods(period, m);
    const conflicts = periods.filter((p) => takenPeriods.includes(p));
    if (conflicts.length > 0) {
      Alert.alert('Дублиран период', `Вече има записано плащане за ${conflicts.map(formatPeriod).join(', ')}.`);
      return;
    }
    onSubmit(periods.map((p) => ({ period: p, amount: a, method, status, notes: notes.trim() || null })));
  }

  return (
    <SheetModal
      visible
      onClose={onClose}
      onSave={handleSave}
      saveLabel={isEdit ? 'Запази' : multi ? `Добави ${monthCount}` : 'Добави'}
      title={isEdit ? 'Редактиране на плащане' : 'Запиши плащане'}>
      <Field label={isEdit ? 'Период *' : 'Начален период *'} hint="Формат ГГГГ-ММ">
        <Input value={period} onChangeText={setPeriod} placeholder="ГГГГ-ММ" />
      </Field>

      {!isEdit ? (
        <Field label="Брой месеци" hint="Предплащане за няколко месеца наведнъж (напр. 12 = една година)">
          <Input value={months} onChangeText={setMonths} placeholder="1" keyboardType="number-pad" />
        </Field>
      ) : null}

      <Field label={`${multi ? 'Сума на месец' : 'Сума'} * (${currency === 'BGN' ? 'лв.' : '€'})`}>
        <Input value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" />
      </Field>

      {multi ? (
        <View style={{ backgroundColor: t.primarySoft, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.xl }}>
          <Text style={{ fontSize: 13, color: t.textSecondary }}>
            {monthCount} месеца · {formatPeriod(period)} – {formatPeriod(lastPeriod)}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '800', color: t.primary, marginTop: 4 }}>
            Общо: {formatMoney(isNaN(perMonth) ? 0 : perMonth * monthCount, currency)}
          </Text>
        </View>
      ) : null}

      <Field label="Статус">
        <ChipGroup options={PAYMENT_STATUSES.filter((s) => s.value !== 'overdue')} value={status} onChange={setStatus} />
      </Field>

      <Field label="Начин на плащане">
        <ChipGroup options={PAYMENT_METHODS} value={method} onChange={setMethod} />
      </Field>

      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>

      {isEdit && initial ? (
        <Button label="Изтриване на плащане" variant="danger" onPress={() => onDelete(initial)} fullWidth />
      ) : null}
    </SheetModal>
  );
}

function EditPropertyModal({ visible, property, onClose, onSave }: {
  visible: boolean;
  property: Property;
  onClose: () => void;
  onSave: (data: { name: string; address: string | null; type: Property['type']; notes: string | null }) => void;
}) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? '');
  const [type, setType] = useState<Property['type']>(property.type);
  const [notes, setNotes] = useState(property.notes ?? '');

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете името на имота.'); return; }
    onSave({ name: name.trim(), address: address.trim() || null, type, notes: notes.trim() || null });
  }

  return (
    <SheetModal visible={visible} onClose={onClose} onSave={handleSave} title="Редактиране на имот">
      <Field label="Име *">
        <Input value={name} onChangeText={setName} placeholder="напр. Ап. 3, ул. Осма" />
      </Field>
      <Field label="Адрес">
        <Input value={address} onChangeText={setAddress} placeholder="По избор" />
      </Field>
      <Field label="Тип">
        <ChipGroup options={PROPERTY_TYPES.map((v) => ({ value: v, label: TYPE_LABELS[v] }))} value={type} onChange={setType} />
      </Field>
      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>
    </SheetModal>
  );
}
