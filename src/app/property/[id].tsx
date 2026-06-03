import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, ActivityIndicator, useColorScheme,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/core';
import { db } from '@/db/client';
import { properties, leases, tenants, payments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { format } from 'date-fns';
import type { Property, Lease, Tenant, Payment } from '@/db/schema';

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Апартамент',
  garage: 'Гараж',
  land: 'Земя',
  office: 'Офис',
  other: 'Друго',
};

const STATUS_LABELS: Record<string, string> = {
  free: 'Свободен',
  rented: 'Под наем',
  unavailable: 'Недостъпен',
};

const STATUS_COLORS: Record<string, string> = {
  free: '#16A34A',
  rented: '#2563EB',
  unavailable: '#6B7280',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'В брой',
  bank: 'Банков превод',
  other: 'Друго',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Платено',
  partial: 'Частично',
  pending: 'Очаква се',
};

const PROPERTY_TYPES = ['apartment', 'garage', 'land', 'office', 'other'] as const;

const PAYMENT_METHODS = [
  { key: 'cash' as const, label: 'В брой' },
  { key: 'bank' as const, label: 'Банков превод' },
  { key: 'other' as const, label: 'Друго' },
];

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [property, setProperty] = useState<Property | null>(null);
  const [activeLease, setActiveLease] = useState<Lease | null>(null);
  const [leaseTenant, setLeaseTenant] = useState<Tenant | null>(null);
  const [propertyPayments, setPropertyPayments] = useState<Payment[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const [addLeaseVisible, setAddLeaseVisible] = useState(false);
  const [recordPaymentVisible, setRecordPaymentVisible] = useState(false);
  const [editPropertyVisible, setEditPropertyVisible] = useState(false);

  const bg = isDark ? '#111827' : '#F9FAFB';
  const card = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const border = isDark ? '#374151' : '#E5E7EB';

  async function loadData() {
    if (!id) return;
    const propId = Number(id);

    const [prop] = await db.select().from(properties).where(eq(properties.id, propId)).limit(1);
    if (!prop) { router.back(); return; }
    setProperty(prop);

    const [lease] = await db.select().from(leases)
      .where(and(eq(leases.propertyId, propId), eq(leases.status, 'active')))
      .limit(1);
    setActiveLease(lease ?? null);

    if (lease) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, lease.tenantId)).limit(1);
      setLeaseTenant(tenant ?? null);
      const pays = await db.select().from(payments).where(eq(payments.leaseId, lease.id));
      setPropertyPayments(pays.sort((a, b) => b.period.localeCompare(a.period)));
    } else {
      setLeaseTenant(null);
      setPropertyPayments([]);
    }

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, [id]));

  async function handleAddLease(data: {
    tenantId: number; rentAmount: number; currency: 'EUR' | 'BGN';
    paymentDay: number; startDate: string; depositAmount: number | null; notes: string | null;
  }) {
    if (!property) return;
    await db.insert(leases).values({ propertyId: property.id, status: 'active', ...data });
    await db.update(properties).set({ status: 'rented' }).where(eq(properties.id, property.id));
    await loadData();
    setAddLeaseVisible(false);
  }

  async function handleEndLease() {
    if (!activeLease || !property) return;
    Alert.alert(
      'Приключи договора',
      'Сигурни ли сте? Имотът ще бъде маркиран като свободен.',
      [
        { text: 'Отказ', style: 'cancel' },
        {
          text: 'Приключи',
          style: 'destructive',
          onPress: async () => {
            const today = new Date().toISOString().split('T')[0];
            await db.update(leases).set({ status: 'ended', endDate: today }).where(eq(leases.id, activeLease.id));
            await db.update(properties).set({ status: 'free' }).where(eq(properties.id, property.id));
            await loadData();
          },
        },
      ]
    );
  }

  async function handleRecordPayment(data: {
    period: string; amount: number; method: 'cash' | 'bank' | 'other'; notes: string | null;
  }) {
    if (!activeLease) return;
    await db.insert(payments).values({
      leaseId: activeLease.id,
      paidDate: new Date().toISOString().split('T')[0],
      status: 'paid',
      ...data,
    });
    await loadData();
    setRecordPaymentVisible(false);
  }

  async function handleEditProperty(data: {
    name: string; address: string | null; type: Property['type']; notes: string | null;
  }) {
    if (!property) return;
    await db.update(properties).set(data).where(eq(properties.id, property.id));
    await loadData();
    setEditPropertyVisible(false);
  }

  async function handleDeleteProperty() {
    if (!property) return;
    if (activeLease) {
      Alert.alert('Грешка', 'Не може да изтриете имот с активен договор. Първо приключете договора.');
      return;
    }
    Alert.alert(
      'Изтриване на имот',
      `Сигурни ли сте, че искате да изтриете „${property.name}"?`,
      [
        { text: 'Отказ', style: 'cancel' },
        {
          text: 'Изтрий',
          style: 'destructive',
          onPress: async () => {
            const allLeases = await db.select().from(leases).where(eq(leases.propertyId, property.id));
            for (const lease of allLeases) {
              await db.delete(payments).where(eq(payments.leaseId, lease.id));
            }
            await db.delete(leases).where(eq(leases.propertyId, property.id));
            await db.delete(properties).where(eq(properties.id, property.id));
            router.back();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (!property) return null;

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const currentPayment = propertyPayments.find((p) => p.period === currentPeriod);

  return (
    <>
      <Stack.Screen
        options={{
          title: property.name,
          headerBackTitle: 'Назад',
          headerStyle: { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
          headerTintColor: '#2563EB',
          headerTitleStyle: { color: isDark ? '#F9FAFB' : '#111827' },
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Информация за имота */}
        <View style={{ margin: 16, backgroundColor: card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: text }}>{property.name}</Text>
              {property.address ? <Text style={{ fontSize: 14, color: sub, marginTop: 4 }}>{property.address}</Text> : null}
              <Text style={{ fontSize: 13, color: sub, marginTop: 4 }}>{TYPE_LABELS[property.type] ?? property.type}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <View style={{ backgroundColor: STATUS_COLORS[property.status] + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[property.status] }}>
                  {STATUS_LABELS[property.status]}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditPropertyVisible(true)}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: border }}>
                <Text style={{ fontSize: 12, color: sub }}>Редактирай</Text>
              </TouchableOpacity>
            </View>
          </View>
          {property.notes ? (
            <Text style={{ fontSize: 13, color: sub, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: border }}>
              {property.notes}
            </Text>
          ) : null}
        </View>

        {/* Договор за наем */}
        <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: text, marginBottom: 10 }}>Договор за наем</Text>

          {activeLease && leaseTenant ? (
            <View style={{ backgroundColor: card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: border }}>
              <InfoRow label="Наемател" value={leaseTenant.name} textColor={text} subColor={sub} />
              <InfoRow label="Наем" value={`€${activeLease.rentAmount.toFixed(0)} / месец`} textColor={text} subColor={sub} />
              <InfoRow label="Ден за плащане" value={`${activeLease.paymentDay}-то число`} textColor={text} subColor={sub} />
              <InfoRow label="Начало" value={activeLease.startDate} textColor={text} subColor={sub} />
              {activeLease.depositAmount ? (
                <InfoRow label="Депозит" value={`€${activeLease.depositAmount.toFixed(0)}`} textColor={text} subColor={sub} />
              ) : null}
              {activeLease.notes ? (
                <Text style={{ fontSize: 13, color: sub, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: border }}>
                  {activeLease.notes}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={() => setRecordPaymentVisible(true)}
                  style={{ flex: 1, backgroundColor: '#2563EB', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Запиши плащане</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEndLease}
                  style={{ flex: 1, backgroundColor: isDark ? '#374151' : '#F3F4F6', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: border }}>
                  <Text style={{ color: '#D97706', fontSize: 14, fontWeight: '600' }}>Приключи</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: card, borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: border }}>
              <Text style={{ fontSize: 14, color: sub, marginBottom: 16 }}>Няма активен договор</Text>
              <TouchableOpacity
                onPress={async () => {
                  const rows = await db.select().from(tenants);
                  setAllTenants(rows);
                  setAddLeaseVisible(true);
                }}
                style={{ backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>+ Добавяне на договор</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Статус на текущ месец */}
        {activeLease ? (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: text, marginBottom: 8 }}>
              Текущ месец ({currentPeriod})
            </Text>
            {currentPayment ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' }} />
                <Text style={{ fontSize: 14, color: '#16A34A', fontWeight: '600' }}>
                  Платено €{currentPayment.amount.toFixed(0)}{currentPayment.paidDate ? ` · ${currentPayment.paidDate}` : ''}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D97706' }} />
                <Text style={{ fontSize: 14, color: '#D97706', fontWeight: '600' }}>Не е записано плащане</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* История на плащанията */}
        {propertyPayments.length > 0 ? (
          <View style={{ marginHorizontal: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: text, marginBottom: 10 }}>История на плащанията</Text>
            {propertyPayments.map((payment) => (
              <View
                key={payment.id}
                style={{ backgroundColor: card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: text }}>{payment.period}</Text>
                  {payment.method ? <Text style={{ fontSize: 12, color: sub, marginTop: 2 }}>{METHOD_LABELS[payment.method] ?? payment.method}</Text> : null}
                  {payment.paidDate ? <Text style={{ fontSize: 12, color: sub }}>{payment.paidDate}</Text> : null}
                  {payment.notes ? <Text style={{ fontSize: 12, color: sub, fontStyle: 'italic' }}>{payment.notes}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#16A34A' }}>€{payment.amount.toFixed(0)}</Text>
                  <Text style={{ fontSize: 11, color: sub, marginTop: 2 }}>
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Изтриване */}
        {!activeLease ? (
          <TouchableOpacity
            onPress={handleDeleteProperty}
            style={{ marginHorizontal: 16, marginTop: 24, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EF4444', alignItems: 'center' }}>
            <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '600' }}>Изтриване на имот</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {addLeaseVisible ? (
        <AddLeaseModal
          visible={addLeaseVisible}
          tenantList={allTenants}
          onClose={() => setAddLeaseVisible(false)}
          onSave={handleAddLease}
          isDark={isDark}
        />
      ) : null}

      {recordPaymentVisible && activeLease ? (
        <RecordPaymentModal
          visible={recordPaymentVisible}
          defaultAmount={activeLease.rentAmount}
          onClose={() => setRecordPaymentVisible(false)}
          onSave={handleRecordPayment}
          isDark={isDark}
        />
      ) : null}

      {editPropertyVisible ? (
        <EditPropertyModal
          visible={editPropertyVisible}
          property={property}
          onClose={() => setEditPropertyVisible(false)}
          onSave={handleEditProperty}
          isDark={isDark}
        />
      ) : null}
    </>
  );
}

function InfoRow({ label, value, textColor, subColor }: { label: string; value: string; textColor: string; subColor: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 14, color: subColor }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: textColor, flexShrink: 1, textAlign: 'right', marginLeft: 16 }}>{value}</Text>
    </View>
  );
}

function AddLeaseModal({ visible, tenantList, onClose, onSave, isDark }: {
  visible: boolean;
  tenantList: Tenant[];
  onClose: () => void;
  onSave: (data: { tenantId: number; rentAmount: number; currency: 'EUR' | 'BGN'; paymentDay: number; startDate: string; depositAmount: number | null; notes: string | null }) => void;
  isDark: boolean;
}) {
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [rentAmount, setRentAmount] = useState('');
  const [currency, setCurrency] = useState<'EUR' | 'BGN'>('EUR');
  const [paymentDay, setPaymentDay] = useState('1');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [depositAmount, setDepositAmount] = useState('');
  const [notes, setNotes] = useState('');

  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const inputBg = isDark ? '#374151' : '#F3F4F6';
  const border = isDark ? '#4B5563' : '#E5E7EB';
  const selectedBg = isDark ? '#1E3A5F' : '#EFF6FF';

  function reset() {
    setSelectedTenantId(null); setRentAmount(''); setCurrency('EUR');
    setPaymentDay('1'); setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setDepositAmount(''); setNotes('');
  }

  function handleSave() {
    if (!selectedTenantId) { Alert.alert('Задължително', 'Моля, изберете наемател.'); return; }
    const amount = parseFloat(rentAmount);
    if (!rentAmount || isNaN(amount) || amount <= 0) { Alert.alert('Задължително', 'Моля, въведете валидна наемна сума.'); return; }
    const day = parseInt(paymentDay, 10);
    if (isNaN(day) || day < 1 || day > 31) { Alert.alert('Задължително', 'Денят за плащане трябва да е от 1 до 31.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { Alert.alert('Задължително', 'Въведете дата в формат ГГГГ-ММ-ДД.'); return; }
    const deposit = depositAmount ? parseFloat(depositAmount) : null;
    onSave({ tenantId: selectedTenantId, rentAmount: amount, currency, paymentDay: day, startDate, depositAmount: deposit && !isNaN(deposit) ? deposit : null, notes: notes.trim() || null });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: border }}>
          <TouchableOpacity onPress={handleClose}><Text style={{ color: '#2563EB', fontSize: 16 }}>Отказ</Text></TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: text }}>Добавяне на договор</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Запази</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ModalField label="Наемател *" isDark={isDark}>
            {tenantList.length === 0 ? (
              <View style={{ backgroundColor: inputBg, borderRadius: 10, padding: 14 }}>
                <Text style={{ color: sub, fontSize: 14 }}>Добавете наематели от раздел „Наематели"</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {tenantList.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTenantId(t.id)}
                    style={{ padding: 12, borderRadius: 10, backgroundColor: selectedTenantId === t.id ? selectedBg : inputBg, borderWidth: 1, borderColor: selectedTenantId === t.id ? '#2563EB' : 'transparent' }}>
                    <Text style={{ color: selectedTenantId === t.id ? '#2563EB' : text, fontWeight: selectedTenantId === t.id ? '600' : '400' }}>{t.name}</Text>
                    {t.phone ? <Text style={{ fontSize: 12, color: sub, marginTop: 2 }}>{t.phone}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ModalField>

          <ModalField label="Наемна сума *" isDark={isDark}>
            <TextInput value={rentAmount} onChangeText={setRentAmount} placeholder="0" placeholderTextColor={sub} keyboardType="decimal-pad" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Валута" isDark={isDark}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['EUR', 'BGN'] as const).map((c) => (
                <TouchableOpacity key={c} onPress={() => setCurrency(c)} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: currency === c ? '#2563EB' : inputBg }}>
                  <Text style={{ color: currency === c ? '#fff' : text, fontWeight: '600' }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ModalField>

          <ModalField label="Ден за плащане (1–31) *" isDark={isDark}>
            <TextInput value={paymentDay} onChangeText={setPaymentDay} placeholder="1" placeholderTextColor={sub} keyboardType="number-pad" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Начална дата *" isDark={isDark}>
            <TextInput value={startDate} onChangeText={setStartDate} placeholder="ГГГГ-ММ-ДД" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Депозит" isDark={isDark}>
            <TextInput value={depositAmount} onChangeText={setDepositAmount} placeholder="По избор" placeholderTextColor={sub} keyboardType="decimal-pad" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Бележки" isDark={isDark}>
            <TextInput value={notes} onChangeText={setNotes} placeholder="По избор" placeholderTextColor={sub} multiline numberOfLines={3} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }} />
          </ModalField>
        </ScrollView>
      </View>
    </Modal>
  );
}

function RecordPaymentModal({ visible, defaultAmount, onClose, onSave, isDark }: {
  visible: boolean;
  defaultAmount: number;
  onClose: () => void;
  onSave: (data: { period: string; amount: number; method: 'cash' | 'bank' | 'other'; notes: string | null }) => void;
  isDark: boolean;
}) {
  const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const [amount, setAmount] = useState(String(defaultAmount));
  const [method, setMethod] = useState<'cash' | 'bank' | 'other'>('cash');
  const [notes, setNotes] = useState('');

  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const inputBg = isDark ? '#374151' : '#F3F4F6';
  const border = isDark ? '#4B5563' : '#E5E7EB';

  function reset() {
    setPeriod(format(new Date(), 'yyyy-MM')); setAmount(String(defaultAmount)); setMethod('cash'); setNotes('');
  }

  function handleSave() {
    const a = parseFloat(amount);
    if (!amount || isNaN(a) || a <= 0) { Alert.alert('Задължително', 'Моля, въведете валидна сума.'); return; }
    if (!/^\d{4}-\d{2}$/.test(period)) { Alert.alert('Задължително', 'Въведете период в формат ГГГГ-ММ.'); return; }
    onSave({ period, amount: a, method, notes: notes.trim() || null });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: border }}>
          <TouchableOpacity onPress={handleClose}><Text style={{ color: '#2563EB', fontSize: 16 }}>Отказ</Text></TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: text }}>Запиши плащане</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Запази</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ModalField label="Период *" isDark={isDark}>
            <TextInput value={period} onChangeText={setPeriod} placeholder="ГГГГ-ММ" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Сума *" isDark={isDark}>
            <TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={sub} keyboardType="decimal-pad" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Начин на плащане" isDark={isDark}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity key={m.key} onPress={() => setMethod(m.key)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: method === m.key ? '#2563EB' : inputBg }}>
                  <Text style={{ color: method === m.key ? '#fff' : text, fontSize: 14 }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ModalField>

          <ModalField label="Бележки" isDark={isDark}>
            <TextInput value={notes} onChangeText={setNotes} placeholder="По избор" placeholderTextColor={sub} multiline numberOfLines={3} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }} />
          </ModalField>
        </ScrollView>
      </View>
    </Modal>
  );
}

function EditPropertyModal({ visible, property, onClose, onSave, isDark }: {
  visible: boolean;
  property: Property;
  onClose: () => void;
  onSave: (data: { name: string; address: string | null; type: Property['type']; notes: string | null }) => void;
  isDark: boolean;
}) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? '');
  const [type, setType] = useState<Property['type']>(property.type);
  const [notes, setNotes] = useState(property.notes ?? '');

  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const inputBg = isDark ? '#374151' : '#F3F4F6';
  const border = isDark ? '#4B5563' : '#E5E7EB';

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете иme на имота.'); return; }
    onSave({ name: name.trim(), address: address.trim() || null, type, notes: notes.trim() || null });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: border }}>
          <TouchableOpacity onPress={onClose}><Text style={{ color: '#2563EB', fontSize: 16 }}>Отказ</Text></TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: text }}>Редактиране на имот</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Запази</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <ModalField label="Иme *" isDark={isDark}>
            <TextInput value={name} onChangeText={setName} placeholder="напр. Ап. 3, ул. Осма" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Адрес" isDark={isDark}>
            <TextInput value={address} onChangeText={setAddress} placeholder="По избор" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </ModalField>

          <ModalField label="Тип" isDark={isDark}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PROPERTY_TYPES.map((t) => (
                <TouchableOpacity key={t} onPress={() => setType(t)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: type === t ? '#2563EB' : inputBg }}>
                  <Text style={{ color: type === t ? '#fff' : text, fontSize: 14 }}>{TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ModalField>

          <ModalField label="Бележки" isDark={isDark}>
            <TextInput value={notes} onChangeText={setNotes} placeholder="По избор" placeholderTextColor={sub} multiline numberOfLines={3} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }} />
          </ModalField>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModalField({ label, children, isDark }: { label: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}
