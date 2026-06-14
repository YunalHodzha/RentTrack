import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { payments } from '@/db/schema';
import type { Payment } from '@/db/schema';
import { withOwner } from '@/db/owner';
import { generateId } from '@/lib/uuid';

/** Вход за един ред плащане от формата (PaymentModal). */
export type PaymentInput = {
  period: string;
  amount: number;
  method: 'cash' | 'bank' | 'other';
  status: Payment['status'];
  paidDate: string | null;
  notes: string | null;
};

/**
 * Записва плащане(ия) за договор. В режим `edit` обновява `prev` (един ред); в
 * `add` вмъква по един ред на месец (предплащане). paidDate се нормализира спрямо
 * статуса (днешна дата за „платено" без подадена дата). Една логика за екрана на
 * имота и за бързото действие от таблото — без дублиране.
 */
export async function savePayments(
  leaseId: string,
  mode: 'add' | 'edit',
  rows: PaymentInput[],
  prev?: Payment,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  if (mode === 'edit' && prev) {
    const data = rows[0];
    const paidDate = data.status === 'paid' ? (data.paidDate ?? prev.paidDate ?? today) : prev.paidDate ?? null;
    await db.update(payments).set({ ...data, paidDate, updatedAt: now }).where(eq(payments.id, prev.id));
  } else {
    for (const data of rows) {
      const paidDate = data.status === 'paid' ? (data.paidDate ?? today) : null;
      await db.insert(payments).values(withOwner({ id: generateId(), leaseId, createdAt: now, updatedAt: now, ...data, paidDate }));
    }
  }
}
