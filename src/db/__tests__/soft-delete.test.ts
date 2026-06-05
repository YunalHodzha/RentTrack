import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../schema';
import { leases, payments, properties, tenants } from '../schema';
import { softDeletePayment, softDeleteProperty, softDeleteTenant, type AppDatabase } from '../soft-delete';

/**
 * Spin up an in-memory SQLite identical to the app's by applying the real
 * drizzle-kit migrations. Reading every *.sql from the drizzle/ folder (sorted)
 * keeps the test in lock-step with the generated schema, so it also guards the
 * migrations themselves. better-sqlite3 is sync, so it's cast to the
 * driver-agnostic AppDatabase the helpers accept.
 */
function makeDb(): { db: AppDatabase; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const drizzleDir = path.join(__dirname, '..', '..', '..', 'drizzle');
  const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) raw.exec(fs.readFileSync(path.join(drizzleDir, f), 'utf8'));
  const db = drizzle(raw, { schema }) as unknown as AppDatabase;
  return { db, raw };
}

const OLD = '2020-01-01T00:00:00.000Z';

async function seedPropertyWithChildren(db: AppDatabase) {
  await db.insert(properties).values({ id: 'p1', type: 'apartment', name: 'Ап. 1', status: 'rented' });
  await db.insert(tenants).values({ id: 't1', name: 'Иван' });
  await db.insert(leases).values({
    id: 'l1', propertyId: 'p1', tenantId: 't1', rentAmount: 500,
    currency: 'EUR', paymentDay: 1, startDate: '2026-01-01', status: 'active',
  });
  await db.insert(payments).values({ id: 'pay1', leaseId: 'l1', period: '2026-01', amount: 500, status: 'paid' });
  await db.insert(payments).values({ id: 'pay2', leaseId: 'l1', period: '2026-02', amount: 500, status: 'paid' });
}

describe('soft-delete foundations', () => {
  describe('updatedAt $onUpdate', () => {
    it('bumps updatedAt on every update even when not set explicitly', async () => {
      const { db } = makeDb();
      await db.insert(properties).values({
        id: 'p1', type: 'apartment', name: 'Старо', status: 'free',
        createdAt: OLD, updatedAt: OLD,
      });

      // Update a different column without touching updatedAt.
      await db.update(properties).set({ name: 'Ново' }).where(eq(properties.id, 'p1'));

      const [row] = await db.select().from(properties).where(eq(properties.id, 'p1'));
      expect(row.name).toBe('Ново');
      expect(row.updatedAt).not.toBe(OLD);
      expect(Date.parse(row.updatedAt)).toBeGreaterThan(Date.parse(OLD));
      // createdAt must stay put.
      expect(row.createdAt).toBe(OLD);
    });

    it('keeps an explicitly provided updatedAt', async () => {
      const { db } = makeDb();
      await db.insert(properties).values({ id: 'p1', type: 'apartment', name: 'A', status: 'free' });
      await db.update(properties).set({ name: 'B', updatedAt: OLD }).where(eq(properties.id, 'p1'));
      const [row] = await db.select().from(properties).where(eq(properties.id, 'p1'));
      expect(row.updatedAt).toBe(OLD);
    });
  });

  describe('softDeleteProperty', () => {
    it('stamps the property and cascades to leases and payments', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);

      await softDeleteProperty(db, 'p1', 'NOW');

      const [prop] = await db.select().from(properties).where(eq(properties.id, 'p1'));
      const [lease] = await db.select().from(leases).where(eq(leases.id, 'l1'));
      const pays = await db.select().from(payments).where(eq(payments.leaseId, 'l1'));

      expect(prop.deletedAt).toBe('NOW');
      expect(prop.updatedAt).toBe('NOW');
      expect(lease.deletedAt).toBe('NOW');
      expect(pays.every((p) => p.deletedAt === 'NOW')).toBe(true);
    });

    it('excludes soft-deleted rows from isNull(deletedAt) reads but keeps them in the table', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);
      await softDeleteProperty(db, 'p1', 'NOW');

      const visible = await db.select().from(properties).where(isNull(properties.deletedAt));
      expect(visible).toHaveLength(0);

      const all = await db.select().from(properties);
      expect(all).toHaveLength(1); // soft delete, not hard delete
    });

    it('does not re-stamp descendants that were already soft-deleted', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);

      // pay1 is deleted on its own first, then the whole property is deleted.
      await softDeletePayment(db, 'pay1', 'FIRST');
      await softDeleteProperty(db, 'p1', 'SECOND');

      const [pay1] = await db.select().from(payments).where(eq(payments.id, 'pay1'));
      const [pay2] = await db.select().from(payments).where(eq(payments.id, 'pay2'));
      expect(pay1.deletedAt).toBe('FIRST'); // untouched by the later cascade
      expect(pay2.deletedAt).toBe('SECOND');
    });
  });

  describe('softDeleteTenant', () => {
    it('stamps the tenant and cascades to leases and payments', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);

      await softDeleteTenant(db, 't1', 'NOW');

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, 't1'));
      const [lease] = await db.select().from(leases).where(eq(leases.id, 'l1'));
      const pays = await db.select().from(payments).where(eq(payments.leaseId, 'l1'));

      expect(tenant.deletedAt).toBe('NOW');
      expect(lease.deletedAt).toBe('NOW');
      expect(pays.every((p) => p.deletedAt === 'NOW')).toBe(true);

      // The property itself is not the tenant's child, so it stays live.
      const [prop] = await db.select().from(properties).where(eq(properties.id, 'p1'));
      expect(prop.deletedAt).toBeNull();
    });
  });

  describe('softDeletePayment', () => {
    it('stamps only the targeted payment', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);

      await softDeletePayment(db, 'pay1', 'NOW');

      const remaining = await db.select().from(payments)
        .where(and(eq(payments.leaseId, 'l1'), isNull(payments.deletedAt)));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('pay2');
    });
  });

  describe('partial unique (lease_id, period)', () => {
    it('rejects two live payments for the same lease+period', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);
      await expect(
        db.insert(payments).values({ id: 'dup', leaseId: 'l1', period: '2026-01', amount: 500, status: 'paid' }),
      ).rejects.toThrow();
    });

    it('allows re-using a period after the previous payment is soft-deleted', async () => {
      const { db } = makeDb();
      await seedPropertyWithChildren(db);

      // pay1 covers 2026-01; delete it, then a new payment for 2026-01 must succeed.
      await softDeletePayment(db, 'pay1', 'NOW');
      await db.insert(payments).values({ id: 'pay1b', leaseId: 'l1', period: '2026-01', amount: 450, status: 'paid' });

      const live = await db.select().from(payments)
        .where(and(eq(payments.leaseId, 'l1'), eq(payments.period, '2026-01'), isNull(payments.deletedAt)));
      expect(live).toHaveLength(1);
      expect(live[0].id).toBe('pay1b');
    });
  });
});
