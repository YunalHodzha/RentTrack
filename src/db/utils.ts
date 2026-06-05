import { eq } from 'drizzle-orm';
import { db } from './client';
import { payments, leases } from './schema';
import { ownedAndLive, currentUserId } from './owner';
import { isPaymentOverdue } from '@/lib/domain';

/**
 * Mark the signed-in user's pending payments overdue once their due day passes.
 * Scoped to the current user so it can't sweep another account's rows in the
 * shared local cache. No-ops when signed out.
 */
export async function markOverduePayments(userId = currentUserId()) {
  if (!userId) return;
  const today = new Date().toISOString().split('T')[0];
  const allPayments = await db.select().from(payments)
    .where(ownedAndLive(payments, userId, eq(payments.status, 'pending')));

  for (const payment of allPayments) {
    const [lease] = await db.select().from(leases)
      .where(ownedAndLive(leases, userId, eq(leases.id, payment.leaseId))).limit(1);
    if (!lease) continue;

    if (isPaymentOverdue(payment.period, lease.paymentDay, today)) {
      await db.update(payments).set({ status: 'overdue' }).where(eq(payments.id, payment.id));
    }
  }
}
