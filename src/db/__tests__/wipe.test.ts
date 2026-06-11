import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { leases, payments, properties, tenants } from '../schema';
import type { AppDatabase } from '../soft-delete';
import { wipeLocalAccountData, syncCursorKey, type KeyValueStorage } from '../wipe';

// In-memory база през реалните drizzle миграции — по модела на soft-delete.test.ts.
function makeDb(): AppDatabase {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const drizzleDir = path.join(__dirname, '..', '..', '..', 'drizzle');
  const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) raw.exec(fs.readFileSync(path.join(drizzleDir, f), 'utf8'));
  return drizzle(raw, { schema }) as unknown as AppDatabase;
}

/** AsyncStorage двойник: Map + removeItem, за да проверим кой ключ е изтрит. */
function makeStorage(initial: Record<string, string>): KeyValueStorage & { keys: () => string[] } {
  const map = new Map(Object.entries(initial));
  return {
    removeItem: async (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
}

async function seed(db: AppDatabase) {
  await db.insert(properties).values({ id: 'p1', userId: 'user-1', type: 'apartment', name: 'Ап. 1', status: 'rented' });
  await db.insert(tenants).values({ id: 't1', userId: 'user-1', name: 'Иван' });
  await db.insert(leases).values({
    id: 'l1', userId: 'user-1', propertyId: 'p1', tenantId: 't1', rentAmount: 500,
    currency: 'EUR', paymentDay: 1, startDate: '2026-01-01', status: 'active',
  });
  await db.insert(payments).values({ id: 'pay1', userId: 'user-1', leaseId: 'l1', period: '2026-01', amount: 500, status: 'paid' });
  // Soft-изтрит ред: GDPR wipe-ът трябва да премахне и него (hard delete).
  await db.insert(payments).values({
    id: 'pay2', userId: 'user-1', leaseId: 'l1', period: '2026-02', amount: 500, status: 'paid',
    deletedAt: '2026-03-01T00:00:00.000Z',
  });
}

describe('wipeLocalAccountData', () => {
  it('hard-deletes every row from the four tables, including soft-deleted ones', async () => {
    const db = makeDb();
    await seed(db);
    const storage = makeStorage({ [syncCursorKey('user-1')]: '2026-06-01T00:00:00.000Z' });

    await wipeLocalAccountData(db, 'user-1', storage);

    expect(await db.select().from(payments)).toHaveLength(0);
    expect(await db.select().from(leases)).toHaveLength(0);
    expect(await db.select().from(tenants)).toHaveLength(0);
    expect(await db.select().from(properties)).toHaveLength(0);
  });

  it('removes the per-user sync cursor and leaves other keys alone', async () => {
    const db = makeDb();
    await seed(db);
    const storage = makeStorage({
      [syncCursorKey('user-1')]: '2026-06-01T00:00:00.000Z',
      [syncCursorKey('user-2')]: '2026-05-01T00:00:00.000Z',
      renttrack_preauth_migrated: '1',
    });

    await wipeLocalAccountData(db, 'user-1', storage);

    expect(storage.keys()).not.toContain(syncCursorKey('user-1'));
    expect(storage.keys()).toContain(syncCursorKey('user-2'));
    expect(storage.keys()).toContain('renttrack_preauth_migrated');
  });

  it('works on an already-empty database', async () => {
    const db = makeDb();
    const storage = makeStorage({});
    await expect(wipeLocalAccountData(db, 'user-1', storage)).resolves.toBeUndefined();
    expect(await db.select().from(properties)).toHaveLength(0);
  });
});
