import { and, eq, gt, isNull } from 'drizzle-orm';
import { leases, payments, properties, tenants } from '@/db/schema';
import type { NewLease, NewPayment, NewProperty, NewTenant } from '@/db/schema';
import type { AppDatabase } from '@/db/soft-delete';

/**
 * Phase 4C sync engine — local-first, last-write-wins on `updatedAt`.
 *
 * Model (per the roadmap): SQLite is the working store + offline cache; Supabase
 * is the source of truth. Each run pushes local rows changed since a per-device
 * cursor, then pulls remote changes and reconciles by LWW. Soft-deletes ride
 * along as ordinary rows (a bumped `updatedAt` + a `deletedAt` stamp), so
 * deletions propagate without a separate tombstone channel.
 *
 * Order is pull-then-push. Pulling first reconciles remote changes into the
 * local store by LWW, so by the time we push, local holds the winning version of
 * every row — a blind upsert can't clobber a newer remote row with a stale local
 * one. To stay echo-free, rows that were just applied from the remote are
 * excluded from the push (the remote already has them); only genuinely
 * local-newer or local-only rows go up.
 *
 * Cursor: a single high-water mark = max `updatedAt` this device has produced or
 * observed. Both phases use `> cursor`; after a run the cursor advances to the
 * max timestamp seen. The offline "queue" is implicit: while offline the cursor
 * doesn't advance, so the next successful run pushes everything accumulated since.
 *
 * Known limitation: reconciliation trusts device clocks. Two *different* rows
 * written on different devices within the same millisecond, straddling the
 * cursor boundary, could be missed. Acceptable for a personal app on
 * NTP-synced phones; a server-sequence cursor would be the fix if it ever bites.
 */

/** Tables in parent-first order so foreign keys are satisfied when applying pulls. */
const TABLE_ORDER = ['properties', 'tenants', 'leases', 'payments'] as const;
export type TableName = (typeof TABLE_ORDER)[number];

/** A remote row as stored in Postgres: snake_case keys. */
export type RemoteRow = Record<string, unknown>;

/** Transport seam — real impl talks to Supabase; tests use an in-memory fake. */
export interface SyncRemote {
  /** Upsert rows (snake_case, conflict on id) for a table. */
  push(table: TableName, rows: RemoteRow[]): Promise<void>;
  /** Fetch rows whose updated_at > since (RLS scopes them to the current user). */
  pull(table: TableName, since: string): Promise<RemoteRow[]>;
}

/** Persistence seam for the per-device cursor — real impl uses AsyncStorage. */
export interface CursorStore {
  get(): Promise<string>;
  set(value: string): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  cursor: string;
}

const maxStr = (a: string, b: string) => (b > a ? b : a);

// ---------- camelCase <-> snake_case key mapping ----------
// Drizzle returns JS objects with camelCase keys; Postgres columns are
// snake_case. The mapping is purely mechanical, so a generic converter keeps the
// two schemas in lock-step without a hand-maintained field list.

function camelToSnake(obj: Record<string, unknown>): RemoteRow {
  const out: RemoteRow = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

function snakeToCamel(obj: RemoteRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

/**
 * Claim pre-auth local rows for the signed-in user (idempotent: only rows with a
 * null user_id are touched). Setting user_id bumps updated_at via $onUpdate, so
 * claimed rows are picked up by the very next push.
 */
async function claimLocalRows(db: AppDatabase, userId: string) {
  await db.update(properties).set({ userId }).where(isNull(properties.userId));
  await db.update(tenants).set({ userId }).where(isNull(tenants.userId));
  await db.update(leases).set({ userId }).where(isNull(leases.userId));
  await db.update(payments).set({ userId }).where(isNull(payments.userId));
}

/** Local rows for a table changed since the cursor and owned by the user (incl. soft-deletes). */
async function selectChanged(db: AppDatabase, table: TableName, since: string, userId: string) {
  switch (table) {
    case 'properties':
      return db.select().from(properties).where(and(gt(properties.updatedAt, since), eq(properties.userId, userId)));
    case 'tenants':
      return db.select().from(tenants).where(and(gt(tenants.updatedAt, since), eq(tenants.userId, userId)));
    case 'leases':
      return db.select().from(leases).where(and(gt(leases.updatedAt, since), eq(leases.userId, userId)));
    case 'payments':
      return db.select().from(payments).where(and(gt(payments.updatedAt, since), eq(payments.userId, userId)));
  }
}

/**
 * Apply one pulled remote row by last-write-wins. Inserts if absent; updates only
 * when the incoming updated_at is strictly newer. Timestamps are written
 * explicitly so $onUpdate/$defaultFn don't overwrite the remote values (which
 * would otherwise mark the row dirty and echo it back).
 */
async function applyRemoteRow(
  db: AppDatabase,
  table: TableName,
  remoteRow: RemoteRow,
): Promise<{ changed: boolean; updatedAt: string }> {
  const row = snakeToCamel(remoteRow);
  const id = row.id as string;
  const updatedAt = row.updatedAt as string;

  switch (table) {
    case 'properties': {
      const [local] = await db.select().from(properties).where(eq(properties.id, id));
      if (!local) { await db.insert(properties).values(row as NewProperty); return { changed: true, updatedAt }; }
      if (updatedAt > local.updatedAt) { await db.update(properties).set(row as NewProperty).where(eq(properties.id, id)); return { changed: true, updatedAt }; }
      return { changed: false, updatedAt };
    }
    case 'tenants': {
      const [local] = await db.select().from(tenants).where(eq(tenants.id, id));
      if (!local) { await db.insert(tenants).values(row as NewTenant); return { changed: true, updatedAt }; }
      if (updatedAt > local.updatedAt) { await db.update(tenants).set(row as NewTenant).where(eq(tenants.id, id)); return { changed: true, updatedAt }; }
      return { changed: false, updatedAt };
    }
    case 'leases': {
      const [local] = await db.select().from(leases).where(eq(leases.id, id));
      if (!local) { await db.insert(leases).values(row as NewLease); return { changed: true, updatedAt }; }
      if (updatedAt > local.updatedAt) { await db.update(leases).set(row as NewLease).where(eq(leases.id, id)); return { changed: true, updatedAt }; }
      return { changed: false, updatedAt };
    }
    case 'payments': {
      const [local] = await db.select().from(payments).where(eq(payments.id, id));
      if (!local) { await db.insert(payments).values(row as NewPayment); return { changed: true, updatedAt }; }
      if (updatedAt > local.updatedAt) { await db.update(payments).set(row as NewPayment).where(eq(payments.id, id)); return { changed: true, updatedAt }; }
      return { changed: false, updatedAt };
    }
  }
}

/**
 * Run one full sync cycle: claim → pull (parent-first, LWW) → push (parent-first,
 * excluding just-applied rows) → advance cursor. Throws on transport errors
 * (e.g. offline) without advancing the cursor, so the next run retries the same
 * range.
 */
export async function runSync(
  db: AppDatabase,
  remote: SyncRemote,
  cursor: CursorStore,
  userId: string,
): Promise<SyncResult> {
  await claimLocalRows(db, userId);

  const since = await cursor.get();
  let maxSeen = since;
  let pushed = 0;
  let pulled = 0;

  // Pull first so local holds the LWW winner before we push. Track which rows we
  // applied from the remote, to skip pushing them straight back (echo-free).
  const applied: Record<TableName, Set<string>> = {
    properties: new Set(), tenants: new Set(), leases: new Set(), payments: new Set(),
  };
  for (const table of TABLE_ORDER) {
    const remoteRows = await remote.pull(table, since);
    for (const rr of remoteRows) {
      const { changed, updatedAt } = await applyRemoteRow(db, table, rr);
      if (changed) { pulled += 1; applied[table].add(rr.id as string); }
      maxSeen = maxStr(maxSeen, updatedAt);
    }
  }

  // Push local changes the remote doesn't already have the winner for.
  for (const table of TABLE_ORDER) {
    const rows = (await selectChanged(db, table, since, userId)).filter((r) => !applied[table].has(r.id));
    if (rows.length > 0) {
      await remote.push(table, rows.map((r) => camelToSnake(r)));
      pushed += rows.length;
      for (const r of rows) maxSeen = maxStr(maxSeen, r.updatedAt);
    }
  }

  await cursor.set(maxSeen);
  return { pushed, pulled, cursor: maxSeen };
}
