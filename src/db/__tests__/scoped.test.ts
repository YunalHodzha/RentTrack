import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { properties, tenants, leases, payments } from '@/db/schema';
import type { AppDatabase } from '@/db/soft-delete';
import { softDeleteProperty } from '@/db/soft-delete';
import { ownedAndLive } from '@/db/scoped';

function makeDb(): AppDatabase {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', '..', '..', 'drizzle');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    raw.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return drizzle(raw, { schema }) as unknown as AppDatabase;
}

/** Seed a full property→tenant→lease→payment graph owned by `uid`. */
async function seedGraph(db: AppDatabase, uid: string) {
  await db.insert(properties).values({ id: `prop-${uid}`, userId: uid, type: 'apartment', name: `Имот на ${uid}`, status: 'rented' });
  await db.insert(tenants).values({ id: `ten-${uid}`, userId: uid, name: `Наемател на ${uid}` });
  await db.insert(leases).values({ id: `lease-${uid}`, userId: uid, propertyId: `prop-${uid}`, tenantId: `ten-${uid}`, rentAmount: 500, currency: 'EUR', paymentDay: 1, startDate: '2026-01-01', status: 'active' });
  await db.insert(payments).values({ id: `pay-${uid}`, userId: uid, leaseId: `lease-${uid}`, period: '2026-01', amount: 500, status: 'paid' });
}

describe('per-user scoped reads (ownedAndLive)', () => {
  it("a read scoped to A returns only A's rows and never B's", async () => {
    const db = makeDb();
    await seedGraph(db, 'A');
    await seedGraph(db, 'B');

    for (const table of [properties, tenants, leases, payments]) {
      const aRows = await db.select().from(table).where(ownedAndLive(table, 'A'));
      const bRows = await db.select().from(table).where(ownedAndLive(table, 'B'));
      expect(aRows.map((r) => r.userId)).toEqual(['A']);
      expect(bRows.map((r) => r.userId)).toEqual(['B']);
      // The cross-user leak the fix guards against: A must never see B's row.
      expect(aRows.some((r) => r.userId === 'B')).toBe(false);
    }
  });

  it('still excludes soft-deleted rows for the owning user', async () => {
    const db = makeDb();
    await seedGraph(db, 'A');

    let aProps = await db.select().from(properties).where(ownedAndLive(properties, 'A'));
    expect(aProps).toHaveLength(1);

    await softDeleteProperty(db, 'prop-A');

    aProps = await db.select().from(properties).where(ownedAndLive(properties, 'A'));
    expect(aProps).toHaveLength(0);
    // The cascade also tombstones the lease + payment.
    const aLeases = await db.select().from(leases).where(ownedAndLive(leases, 'A'));
    const aPays = await db.select().from(payments).where(ownedAndLive(payments, 'A'));
    expect(aLeases).toHaveLength(0);
    expect(aPays).toHaveLength(0);
  });

  it('composes extra conditions alongside the ownership + live filters', async () => {
    const db = makeDb();
    await db.insert(properties).values([
      { id: 'p1', userId: 'A', type: 'apartment', name: 'Свободен', status: 'free' },
      { id: 'p2', userId: 'A', type: 'apartment', name: 'Нает', status: 'rented' },
      { id: 'p3', userId: 'B', type: 'apartment', name: 'Чужд нает', status: 'rented' },
    ]);

    const rented = await db.select().from(properties)
      .where(ownedAndLive(properties, 'A', eq(properties.status, 'rented')));
    expect(rented.map((r) => r.id)).toEqual(['p2']);
  });
});
