import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { leases, properties, tenants } from '@/db/schema';
import type { AppDatabase } from '@/db/soft-delete';
import { softDeleteProperty } from '@/db/soft-delete';
import { runSync, type CursorStore, type RemoteRow, type SyncRemote, type TableName } from '@/services/sync';

function makeDb(): AppDatabase {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', '..', '..', 'drizzle');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    raw.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return drizzle(raw, { schema }) as unknown as AppDatabase;
}

/** In-memory stand-in for Supabase: a shared store so two local DBs can sync against it. */
class FakeRemote implements SyncRemote {
  store: Record<TableName, Map<string, RemoteRow>> = {
    properties: new Map(), tenants: new Map(), leases: new Map(), payments: new Map(),
  };

  async push(table: TableName, rows: RemoteRow[]) {
    for (const r of rows) this.store[table].set(r.id as string, { ...r });
  }

  async pull(table: TableName, since: string): Promise<RemoteRow[]> {
    return [...this.store[table].values()].filter((r) => (r.updated_at as string) > since);
  }
}

function memoryCursor(): CursorStore {
  let value = '';
  return { get: async () => value, set: async (v) => { value = v; } };
}

const USER = 'user-1';

async function addProperty(db: AppDatabase, id: string, name: string, userId: string | null = USER, updatedAt?: string) {
  await db.insert(properties).values({
    id, userId, type: 'apartment', name, status: 'free',
    ...(updatedAt ? { createdAt: updatedAt, updatedAt } : {}),
  });
}

describe('sync engine', () => {
  it('pushes local rows to the remote', async () => {
    const db = makeDb();
    const remote = new FakeRemote();
    await addProperty(db, 'p1', 'Ап. 1');

    const res = await runSync(db, remote, memoryCursor(), USER);

    expect(res.pushed).toBe(1);
    const pushed = remote.store.properties.get('p1');
    expect(pushed?.name).toBe('Ап. 1');
    expect(pushed?.user_id).toBe(USER); // camelCase -> snake_case mapping
  });

  it('pulls remote rows into the local DB', async () => {
    const db = makeDb();
    const remote = new FakeRemote();
    remote.store.properties.set('p9', {
      id: 'p9', user_id: USER, type: 'garage', name: 'Гараж', address: null, status: 'free',
      notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const res = await runSync(db, remote, memoryCursor(), USER);

    expect(res.pulled).toBe(1);
    const [local] = await db.select().from(properties).where(eq(properties.id, 'p9'));
    expect(local.name).toBe('Гараж');
    expect(local.type).toBe('garage');
  });

  it('reconciles by last-write-wins (newer remote overwrites, older does not)', async () => {
    const remote = new FakeRemote();

    // Local has an old version.
    const db = makeDb();
    await addProperty(db, 'p1', 'Старо име', USER, '2026-01-01T00:00:00.000Z');

    // Remote has a newer version.
    remote.store.properties.set('p1', {
      id: 'p1', user_id: USER, type: 'apartment', name: 'Ново име', address: null, status: 'free',
      notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z', deleted_at: null,
    });

    await runSync(db, remote, memoryCursor(), USER);
    const [afterNewer] = await db.select().from(properties).where(eq(properties.id, 'p1'));
    expect(afterNewer.name).toBe('Ново име'); // newer remote won

    // Now an OLDER remote update must NOT overwrite the local newer value.
    remote.store.properties.set('p1', {
      ...remote.store.properties.get('p1')!, name: 'Древно име', updated_at: '2025-01-01T00:00:00.000Z',
    });
    await runSync(db, remote, memoryCursor(), USER);
    const [afterOlder] = await db.select().from(properties).where(eq(properties.id, 'p1'));
    expect(afterOlder.name).toBe('Ново име'); // unchanged
  });

  it('propagates soft-deletes as tombstones', async () => {
    const remote = new FakeRemote();
    const cursor = memoryCursor();
    const db = makeDb();
    await addProperty(db, 'p1', 'Ап. 1', USER, '2026-01-01T00:00:00.000Z');
    await runSync(db, remote, cursor, USER); // push it up

    // Soft-delete locally (with a newer stamp), then sync — the tombstone should reach the remote.
    await softDeleteProperty(db, 'p1', '2026-03-01T00:00:00.000Z');
    await runSync(db, remote, cursor, USER);

    expect(remote.store.properties.get('p1')?.deleted_at).toBe('2026-03-01T00:00:00.000Z');
  });

  it('claims pre-auth local rows (null userId) and pushes them', async () => {
    const db = makeDb();
    const remote = new FakeRemote();
    await addProperty(db, 'p1', 'Без собственик', null); // pre-auth row

    await runSync(db, remote, memoryCursor(), USER);

    const [local] = await db.select().from(properties).where(eq(properties.id, 'p1'));
    expect(local.userId).toBe(USER);
    expect(remote.store.properties.get('p1')?.user_id).toBe(USER);
  });

  it('does not re-push or re-pull when nothing changed (echo-free)', async () => {
    const db = makeDb();
    const remote = new FakeRemote();
    const cursor = memoryCursor();
    await addProperty(db, 'p1', 'Ап. 1');

    const first = await runSync(db, remote, cursor, USER);
    expect(first.pushed).toBe(1);

    const second = await runSync(db, remote, cursor, USER);
    expect(second.pushed).toBe(0);
    expect(second.pulled).toBe(0);
  });

  it('propagates a change from one device to another via the shared remote', async () => {
    const remote = new FakeRemote();
    const dbA = makeDb();
    const dbB = makeDb();

    // Device A creates a property + tenant + lease, then syncs.
    await addProperty(dbA, 'p1', 'Ап. 1');
    await dbA.insert(tenants).values({ id: 't1', userId: USER, name: 'Иван' });
    await dbA.insert(leases).values({
      id: 'l1', userId: USER, propertyId: 'p1', tenantId: 't1',
      rentAmount: 500, currency: 'EUR', paymentDay: 1, startDate: '2026-01-01', status: 'active',
    });
    await runSync(dbA, remote, memoryCursor(), USER);

    // Device B (fresh) syncs and should receive all three, parents before children.
    await runSync(dbB, remote, memoryCursor(), USER);

    const propsB = await dbB.select().from(properties).where(isNull(properties.deletedAt));
    const leasesB = await dbB.select().from(leases);
    expect(propsB).toHaveLength(1);
    expect(leasesB).toHaveLength(1);
    expect(leasesB[0].propertyId).toBe('p1');
  });
});
