import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';
import { leases, payments, properties, tenants } from './schema';

/**
 * Any drizzle SQLite database bound to our schema — the real expo-sqlite client
 * at runtime, or an in-memory better-sqlite3 instance in tests. Typing against
 * the base class keeps these helpers driver-agnostic and unit-testable.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;

/**
 * Soft-delete stamp. Both columns are written with the same timestamp so a
 * deleted row's updatedAt reflects the delete — the sync engine treats a
 * soft-delete as just another update to push (last-write-wins on updatedAt).
 */
const stamp = (now: string) => ({ deletedAt: now, updatedAt: now });

async function softDeletePaymentsForLeases(db: AppDatabase, leaseIds: string[], now: string) {
  if (leaseIds.length === 0) return;
  await db
    .update(payments)
    .set(stamp(now))
    .where(and(inArray(payments.leaseId, leaseIds), isNull(payments.deletedAt)));
}

/** Soft-delete a single payment. */
export async function softDeletePayment(
  db: AppDatabase,
  id: string,
  now: string = new Date().toISOString(),
) {
  await db.update(payments).set(stamp(now)).where(eq(payments.id, id));
}

/**
 * Soft-delete a property and cascade the stamp to its leases and those leases'
 * payments (property → leases → payments). Already-deleted descendants are left
 * untouched so their timestamps aren't churned.
 */
export async function softDeleteProperty(
  db: AppDatabase,
  id: string,
  now: string = new Date().toISOString(),
) {
  const rows = await db.select({ id: leases.id }).from(leases).where(eq(leases.propertyId, id));
  await softDeletePaymentsForLeases(db, rows.map((r) => r.id), now);
  await db.update(leases).set(stamp(now)).where(and(eq(leases.propertyId, id), isNull(leases.deletedAt)));
  await db.update(properties).set(stamp(now)).where(eq(properties.id, id));
}

/**
 * Soft-delete a tenant and cascade the stamp to their leases and those leases'
 * payments (tenant → leases → payments).
 */
export async function softDeleteTenant(
  db: AppDatabase,
  id: string,
  now: string = new Date().toISOString(),
) {
  const rows = await db.select({ id: leases.id }).from(leases).where(eq(leases.tenantId, id));
  await softDeletePaymentsForLeases(db, rows.map((r) => r.id), now);
  await db.update(leases).set(stamp(now)).where(and(eq(leases.tenantId, id), isNull(leases.deletedAt)));
  await db.update(tenants).set(stamp(now)).where(eq(tenants.id, id));
}
