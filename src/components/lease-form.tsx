import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { format } from 'date-fns';
import type { Tenant, Property } from '@/db/schema';
import {
  SheetModal, Field, Input, ChipGroup, Button, DateField,
  useTheme, spacing, radius,
} from '@/components/ui';
import { TYPE_LABELS, type Currency } from '@/lib/domain';
import type { NewLeaseInput } from '@/services/leases';

/**
 * Една форма за договор, две точки на влизане:
 *  - `pickTenant`  — от екрана на имота: имотът е фиксиран, избира се наемател
 *                    (с inline създаване на нов наемател).
 *  - `pickProperty`— от екрана на наемателя: наемателят е фиксиран, избира се
 *                    свободен имот (без активен договор).
 *
 * Останалите полета (наем, валута, ден за плащане, дати, депозит, бележки) и
 * валидацията са общи — затова формата живее тук, а не дублирана във всеки екран.
 * Родителят монтира модала условно, затова няма `visible` пропс (state-ът се
 * нулира при размонтиране).
 */

type Base = {
  onClose: () => void;
  onSave: (data: NewLeaseInput) => void;
};

type PickTenantProps = Base & {
  mode: 'pickTenant';
  propertyId: string;
  tenants: Tenant[];
  onCreateTenant: (data: { name: string; phone: string | null }) => Promise<Tenant>;
};

type PickPropertyProps = Base & {
  mode: 'pickProperty';
  tenantId: string;
  /** Имоти без активен договор. */
  properties: Property[];
};

export type LeaseFormModalProps = PickTenantProps | PickPropertyProps;

export function LeaseFormModal(props: LeaseFormModalProps) {
  const t = useTheme();

  // Subject: единият край е фиксиран от точката на влизане, другият се избира.
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(
    props.mode === 'pickProperty' ? props.tenantId : null,
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    props.mode === 'pickTenant' ? props.propertyId : null,
  );
  // Локално копие, за да се появи веднага новосъздаден наемател в списъка.
  const [tenantList, setTenantList] = useState<Tenant[]>(props.mode === 'pickTenant' ? props.tenants : []);

  const [rentAmount, setRentAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [paymentDay, setPaymentDay] = useState('1');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; amount?: string; day?: string; startDate?: string; endDate?: string; newName?: string }>({});

  // Inline „нов наемател" (само в pickTenant режим).
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  function clearError(key: keyof typeof errors) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function resetNewTenant() { setShowNewTenant(false); setNewName(''); setNewPhone(''); clearError('newName'); }

  async function handleCreateTenant() {
    if (props.mode !== 'pickTenant') return;
    if (!newName.trim()) { setErrors((e) => ({ ...e, newName: 'Въведете име' })); return; }
    setCreating(true);
    try {
      const tenant = await props.onCreateTenant({ name: newName.trim(), phone: newPhone.trim() || null });
      setTenantList((prev) => [...prev, tenant]);
      setSelectedTenantId(tenant.id);
      clearError('subject');
      resetNewTenant();
    } catch {
      // Toast не се вижда над отворен SheetModal, затова грешката е inline.
      setErrors((e) => ({ ...e, newName: 'Неуспешно добавяне на наемател' }));
    } finally {
      setCreating(false);
    }
  }

  function handleSave() {
    const next: typeof errors = {};
    if (props.mode === 'pickTenant' && !selectedTenantId) next.subject = 'Изберете наемател';
    if (props.mode === 'pickProperty' && !selectedPropertyId) next.subject = 'Изберете имот';
    const amount = parseFloat(rentAmount);
    if (!rentAmount || isNaN(amount) || amount <= 0) next.amount = 'Въведете валидна сума';
    const day = parseInt(paymentDay, 10);
    if (isNaN(day) || day < 1 || day > 31) next.day = 'Денят трябва да е между 1 и 31';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) next.startDate = 'Изберете начална дата';
    if (endDate && endDate < startDate) next.endDate = 'Крайната дата не може да е преди началната';
    if (Object.values(next).some(Boolean)) { setErrors(next); return; }
    const deposit = depositAmount ? parseFloat(depositAmount) : null;
    props.onSave({
      tenantId: selectedTenantId!,
      propertyId: selectedPropertyId!,
      rentAmount: amount,
      currency,
      paymentDay: day,
      startDate,
      endDate,
      depositAmount: deposit && !isNaN(deposit) ? deposit : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <SheetModal visible onClose={props.onClose} onSave={handleSave} title="Нов договор">
      {props.mode === 'pickTenant' ? (
        <Field label="Наемател *" error={errors.subject}>
          <View style={{ gap: spacing.sm }}>
            {tenantList.map((tenant) => {
              const active = selectedTenantId === tenant.id;
              return (
                <TouchableOpacity
                  key={tenant.id}
                  activeOpacity={0.8}
                  onPress={() => { setSelectedTenantId(tenant.id); clearError('subject'); }}
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
                <Input value={newName} onChangeText={(v) => { setNewName(v); clearError('newName'); }} placeholder="Име на наемателя *" error={!!errors.newName} />
                {errors.newName ? (
                  <Text accessibilityRole="alert" style={{ fontSize: 12, fontWeight: '600', color: t.danger }}>{errors.newName}</Text>
                ) : null}
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
      ) : (
        <Field label="Имот *" error={errors.subject}>
          <View style={{ gap: spacing.sm }}>
            {props.properties.map((property) => {
              const active = selectedPropertyId === property.id;
              const sub = [TYPE_LABELS[property.type] ?? property.type, property.address].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity
                  key={property.id}
                  activeOpacity={0.8}
                  onPress={() => { setSelectedPropertyId(property.id); clearError('subject'); }}
                  style={{
                    padding: 14, borderRadius: radius.md,
                    backgroundColor: active ? t.primarySoft : t.inputBg,
                    borderWidth: 1, borderColor: active ? t.primary : t.inputBorder,
                  }}>
                  <Text style={{ color: active ? t.primary : t.text, fontWeight: active ? '800' : '500', fontSize: 15 }}>{property.name}</Text>
                  {sub ? <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{sub}</Text> : null}
                </TouchableOpacity>
              );
            })}

            {props.properties.length === 0 ? (
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>
                Няма свободни имоти. Всички имоти вече имат активен договор — добавете нов имот или приключете съществуващ договор.
              </Text>
            ) : null}
          </View>
        </Field>
      )}

      <Field label="Наемна сума *" error={errors.amount}>
        <Input value={rentAmount} onChangeText={(v) => { setRentAmount(v); clearError('amount'); }} placeholder="0" keyboardType="decimal-pad" error={!!errors.amount} />
      </Field>

      <Field label="Валута">
        <ChipGroup options={[{ value: 'EUR', label: 'EUR €' }, { value: 'BGN', label: 'BGN лв.' }]} value={currency} onChange={setCurrency} />
      </Field>

      <Field label="Ден за плащане *" hint="Число от 1 до 31" error={errors.day}>
        <Input value={paymentDay} onChangeText={(v) => { setPaymentDay(v); clearError('day'); }} placeholder="1" keyboardType="number-pad" error={!!errors.day} />
      </Field>

      <Field label="Начална дата *" error={errors.startDate}>
        {/* Крайната дата зависи от началната, затова редакция тук чисти и нейната грешка. */}
        <DateField value={startDate} onChange={(v) => { setStartDate(v); clearError('startDate'); clearError('endDate'); }} />
      </Field>

      <Field label="Крайна дата" hint="По избор — за срочен договор; справките очакват плащания само до този месец" error={errors.endDate}>
        <DateField value={endDate} onChange={(v) => { setEndDate(v); clearError('endDate'); }} onClear={() => { setEndDate(null); clearError('endDate'); }} placeholder="По избор" />
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
