import { useState } from 'react';
import { View, Text } from 'react-native';
import { format } from 'date-fns';
import type { Payment } from '@/db/schema';
import {
  SheetModal, Field, Input, ChipGroup, Button, DateField, MonthField,
  useTheme, spacing, radius,
} from '@/components/ui';
import {
  PAYMENT_METHODS, PAYMENT_STATUSES, formatMoney, formatPeriod, listPeriods, type Currency,
} from '@/lib/domain';
import type { PaymentInput } from '@/services/payments';

export type { PaymentInput };

/** Режим на модала: добавяне (вкл. предплащане) или редакция на съществуващ ред. */
export type PaymentModalState = { mode: 'add' | 'edit'; payment?: Payment } | null;

/**
 * Формата за плащане — споделена между екрана на имота и бързото действие от
 * таблото. Самото записване минава през `savePayments` (services/payments).
 * Родителят монтира модала условно (без `visible` пропс).
 */
export function PaymentModal({ state, currency, defaultAmount, takenPeriods, onClose, onSubmit, onDelete }: {
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
  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<{ amount?: string; period?: string; months?: string }>({});

  const monthCount = Math.max(1, parseInt(months, 10) || 1);
  const perMonth = parseFloat(amount);
  const multi = !isEdit && monthCount > 1;
  const previewPeriods = listPeriods(period, monthCount);
  const lastPeriod = previewPeriods[previewPeriods.length - 1] ?? period;

  function clearError(key: keyof typeof errors) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function handleSave() {
    const next: typeof errors = {};
    const a = parseFloat(amount);
    if (!amount || isNaN(a) || a <= 0) next.amount = 'Въведете валидна сума';
    if (!/^\d{4}-\d{2}$/.test(period)) next.period = 'Изберете период';

    const paid = status === 'paid' ? paidDate : null;

    if (isEdit) {
      if (!next.period && takenPeriods.includes(period) && initial?.period !== period) {
        next.period = 'Вече има плащане за този период';
      }
      if (Object.values(next).some(Boolean)) { setErrors(next); return; }
      onSubmit([{ period, amount: a, method, status, paidDate: paid, notes: notes.trim() || null }]);
      return;
    }

    const m = parseInt(months, 10);
    if (isNaN(m) || m < 1 || m > 36) next.months = 'Броят месеци трябва да е от 1 до 36';
    if (!next.period && !next.months) {
      const conflicts = listPeriods(period, m).filter((p) => takenPeriods.includes(p));
      if (conflicts.length === 1) next.period = 'Вече има плащане за този период';
      else if (conflicts.length > 1) next.period = `Вече има плащания за: ${conflicts.map(formatPeriod).join(', ')}`;
    }
    if (Object.values(next).some(Boolean)) { setErrors(next); return; }
    onSubmit(listPeriods(period, m).map((p) => ({ period: p, amount: a, method, status, paidDate: paid, notes: notes.trim() || null })));
  }

  return (
    <SheetModal
      visible
      onClose={onClose}
      onSave={handleSave}
      saveLabel={isEdit ? 'Запази' : multi ? `Добави ${monthCount}` : 'Добави'}
      title={isEdit ? 'Редактиране на плащане' : 'Запиши плащане'}>
      <Field label={isEdit ? 'Период *' : 'Начален период *'} error={errors.period}>
        <MonthField value={period} onChange={(v) => { setPeriod(v); clearError('period'); }} />
      </Field>

      {!isEdit ? (
        <Field label="Брой месеци" hint="Предплащане за няколко месеца наведнъж (напр. 12 = една година)" error={errors.months}>
          {/* Дублираният период зависи и от броя месеци, затова редакция тук чисти и неговата грешка. */}
          <Input value={months} onChangeText={(v) => { setMonths(v); clearError('months'); clearError('period'); }} placeholder="1" keyboardType="number-pad" error={!!errors.months} />
        </Field>
      ) : null}

      <Field label={`${multi ? 'Сума на месец' : 'Сума'} * (${currency === 'BGN' ? 'лв.' : '€'})`} error={errors.amount}>
        <Input value={amount} onChangeText={(v) => { setAmount(v); clearError('amount'); }} placeholder="0" keyboardType="decimal-pad" error={!!errors.amount} />
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

      {status === 'paid' ? (
        <Field label="Дата на плащане">
          <DateField value={paidDate} onChange={setPaidDate} />
        </Field>
      ) : null}

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
