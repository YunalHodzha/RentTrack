import { eq, and } from 'drizzle-orm';
import { db } from './client';
import { payments, leases } from './schema';
import { isPaymentOverdue } from '@/lib/domain';

export async function markOverduePayments() {
  const today = new Date().toISOString().split('T')[0];
  const allPayments = await db.select().from(payments).where(eq(payments.status, 'pending'));

  for (const payment of allPayments) {
    const [lease] = await db.select().from(leases).where(eq(leases.id, payment.leaseId)).limit(1);
    if (!lease) continue;

    if (isPaymentOverdue(payment.period, lease.paymentDay, today)) {
      await db.update(payments).set({ status: 'overdue' }).where(eq(payments.id, payment.id));
    }
  }
}
