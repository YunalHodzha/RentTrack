import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { leases, payments, properties, tenants } from '@/db/schema';
import type { Property, Tenant } from '@/db/schema';
import type { AppDatabase } from '@/db/soft-delete';
import { runSync, type CursorStore, type RemoteRow, type SyncRemote, type TableName } from '@/services/sync';
import { applyImport, parseImportFile, type ImportFile } from '@/services/import';

// In-memory база + fake remote по модела на sync.test.ts.
function makeDb(): AppDatabase {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', '..', '..', 'drizzle');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    raw.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return drizzle(raw, { schema }) as unknown as AppDatabase;
}

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
// Фиксиран „момент на импорта", по-късен от реалните seed timestamp-и, за да е
// детерминистично updatedAt > курсора (push-ва се) и LWW (импортът печели).
const IMPORT_AT = '2030-01-01T00:00:00.000Z';

const property = (id: string, name: string): Property => ({
  id, userId: USER, type: 'apartment', name, address: null, status: 'free', notes: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
});
const tenant = (id: string, name: string): Tenant => ({
  id, userId: USER, name, phone: null, email: null, notes: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
});
const emptyFile = (overrides: Partial<ImportFile>): ImportFile => ({
  version: 1, exportDate: '2026-06-11T00:00:00.000Z',
  properties: [], tenants: [], leases: [], payments: [], ...overrides,
});

describe('parseImportFile', () => {
  it('rejects invalid JSON without touching anything', () => {
    expect(() => parseImportFile('{nope')).toThrow('Невалиден JSON файл.');
  });

  it('rejects JSON that is not a RentTrack export', () => {
    expect(() => parseImportFile('{"properties": []}')).toThrow('не е валиден RentTrack експорт');
    expect(() => parseImportFile('[1,2,3]')).toThrow('не е валиден RentTrack експорт');
  });

  it('rejects unsupported versions', () => {
    const json = JSON.stringify(emptyFile({ version: 99 }));
    expect(() => parseImportFile(json)).toThrow('Неподдържана версия');
  });

  it('accepts legacy exports without version (exportDate only)', () => {
    const legacy = { ...emptyFile({}), version: undefined };
    expect(parseImportFile(JSON.stringify(legacy)).properties).toEqual([]);
  });

  it('rejects rows without a valid id', () => {
    const json = JSON.stringify(emptyFile({ properties: [{ name: 'без id' } as unknown as Property] }));
    expect(() => parseImportFile(json)).toThrow('без валиден идентификатор');
  });
});

describe('applyImport + sync (two-device restore)', () => {
  it('device B ends up with exactly the file contents after A imports and both sync', async () => {
    const remote = new FakeRemote();
    const dbA = makeDb();
    const cursorA = memoryCursor();

    // Устройство A: p1, p2, наемател t1 → качени в облака.
    await dbA.insert(properties).values([property('p1', 'Ап. 1'), property('p2', 'Ап. 2')]);
    await dbA.insert(tenants).values(tenant('t1', 'Иван'));
    await runSync(dbA, remote, cursorA, USER);

    // Файлът: p2 с ново име + нов p3; без p1 и t1 (трябва да изчезнат навсякъде).
    const file = emptyFile({
      properties: [property('p2', 'Ап. 2 (преименуван)'), property('p3', 'Гараж нов')],
    });

    await applyImport(dbA, file, USER, IMPORT_AT);

    // Локално на A: p1/t1 tombstone-нати, p2 обновен, p3 вмъкнат.
    const liveA = await dbA.select().from(properties).where(isNull(properties.deletedAt));
    expect(liveA.map((p) => p.id).sort()).toEqual(['p2', 'p3']);
    const [p1A] = await dbA.select().from(properties).where(eq(properties.id, 'p1'));
    expect(p1A.deletedAt).toBe(IMPORT_AT);
    const [t1A] = await dbA.select().from(tenants).where(eq(tenants.id, 't1'));
    expect(t1A.deletedAt).toBe(IMPORT_AT);

    // A качва промените (курсорът НЕ е нулиран — качват се само новите версии).
    await runSync(dbA, remote, cursorA, USER);

    // Устройство B: чисто, собствен курсор → дърпа всичко.
    const dbB = makeDb();
    await runSync(dbB, remote, memoryCursor(), USER);

    const liveB = await dbB.select().from(properties).where(isNull(properties.deletedAt));
    expect(liveB.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'p2', name: 'Ап. 2 (преименуван)' },
      { id: 'p3', name: 'Гараж нов' },
    ]);
    // Старите редове са пристигнали като tombstone-и, не са изчезнали мълчаливо.
    const [p1B] = await dbB.select().from(properties).where(eq(properties.id, 'p1'));
    expect(p1B.deletedAt).toBe(IMPORT_AT);
    const [t1B] = await dbB.select().from(tenants).where(eq(tenants.id, 't1'));
    expect(t1B.deletedAt).toBe(IMPORT_AT);
  });

  it('a later pull does not resurrect old cloud rows (LWW: import wins)', async () => {
    const remote = new FakeRemote();
    const dbA = makeDb();
    const cursorA = memoryCursor();

    await dbA.insert(properties).values(property('p1', 'Старо име'));
    await runSync(dbA, remote, cursorA, USER);

    // Импорт, който запазва p1, но с ново име; облакът още носи старата версия.
    await applyImport(dbA, emptyFile({ properties: [property('p1', 'Ново име')] }), USER, IMPORT_AT);
    await runSync(dbA, remote, cursorA, USER);

    // Нов pull (нулев курсор → дърпа всичко) не връща старото име.
    await runSync(dbA, remote, memoryCursor(), USER);
    const [p1] = await dbA.select().from(properties).where(eq(properties.id, 'p1'));
    expect(p1.name).toBe('Ново име');
    expect(remote.store.properties.get('p1')?.name).toBe('Ново име');
  });

  it('stamps the current user and revives soft-deleted rows present in the file', async () => {
    const db = makeDb();
    // Ред от „друг живот": без собственик и soft-изтрит.
    await db.insert(properties).values({ ...property('p9', 'Чужд/изтрит'), userId: null, deletedAt: '2026-02-01T00:00:00.000Z' });

    await applyImport(db, emptyFile({ properties: [property('p9', 'Възстановен')] }), USER, IMPORT_AT);

    const [p9] = await db.select().from(properties).where(eq(properties.id, 'p9'));
    expect(p9.userId).toBe(USER);
    expect(p9.deletedAt).toBeNull();
    expect(p9.name).toBe('Възстановен');
    expect(p9.updatedAt).toBe(IMPORT_AT);
  });

  it('replaces a payment for the same lease+period without tripping the partial unique index', async () => {
    const db = makeDb();
    await db.insert(properties).values(property('p1', 'Ап. 1'));
    await db.insert(tenants).values(tenant('t1', 'Иван'));
    await db.insert(leases).values({
      id: 'l1', userId: USER, propertyId: 'p1', tenantId: 't1', rentAmount: 500,
      currency: 'EUR', paymentDay: 1, startDate: '2026-01-01', status: 'active',
    });
    await db.insert(payments).values({ id: 'payOld', userId: USER, leaseId: 'l1', period: '2026-01', amount: 500, status: 'paid' });

    // Файлът носи ДРУГ запис за същия (l1, 2026-01) — старият трябва да се
    // tombstone-не преди insert-а, иначе гърми unique_lease_period.
    const file = emptyFile({
      properties: [property('p1', 'Ап. 1')],
      tenants: [tenant('t1', 'Иван')],
      leases: [{
        id: 'l1', userId: USER, propertyId: 'p1', tenantId: 't1', rentAmount: 500, currency: 'EUR',
        paymentDay: 1, startDate: '2026-01-01', endDate: null, depositAmount: null, status: 'active', notes: null,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
      }],
      payments: [{
        id: 'payNew', userId: USER, leaseId: 'l1', period: '2026-01', amount: 450, paidDate: null,
        status: 'paid', method: null, notes: null,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
      }],
    });

    const counts = await applyImport(db, file, USER, IMPORT_AT);
    expect(counts).toEqual({ properties: 1, tenants: 1, leases: 1, payments: 1 });

    const livePayments = await db.select().from(payments).where(isNull(payments.deletedAt));
    expect(livePayments).toHaveLength(1);
    expect(livePayments[0].id).toBe('payNew');
    expect(livePayments[0].amount).toBe(450);
  });
});
