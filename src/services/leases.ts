import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { leases, properties } from '@/db/schema';
import { withOwner } from '@/db/owner';
import { generateId } from '@/lib/uuid';
import type { Currency } from '@/lib/domain';

/** Данните за нов договор — общи за двете точки на влизане (имот и наемател). */
export type NewLeaseInput = {
  tenantId: string;
  propertyId: string;
  rentAmount: number;
  currency: Currency;
  paymentDay: number;
  startDate: string;
  endDate: string | null;
  depositAmount: number | null;
  notes: string | null;
};

/**
 * Създава активен договор и маркира имота като отдаден. Една точка за двата
 * екрана (от имот: избран наемател; от наемател: избран имот), за да не се
 * дублира логиката. updatedAt се bump-ва и за договора, и за имота (LWW sync).
 */
export async function createActiveLease(data: NewLeaseInput): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(leases).values(
    withOwner({ id: generateId(), status: 'active', createdAt: now, updatedAt: now, ...data }),
  );
  await db.update(properties).set({ status: 'rented', updatedAt: now }).where(eq(properties.id, data.propertyId));
}
