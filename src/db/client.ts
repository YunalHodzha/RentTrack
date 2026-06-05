import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as schema from './schema';
import migrations from '../../drizzle/migrations';

const sqlite = SQLite.openDatabaseSync('renttrack.db');
export const db = drizzle(sqlite, { schema });

async function tableExists(name: string): Promise<boolean> {
  const row = await sqlite.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name,
  );
  return row != null;
}

/** Number of migrations recorded as applied (0 if the tracking table is absent). */
async function appliedMigrationCount(): Promise<number> {
  if (!(await tableExists('__drizzle_migrations'))) return 0;
  const row = await sqlite.getFirstAsync<{ c: number }>(
    `SELECT count(*) AS c FROM __drizzle_migrations`,
  );
  return row?.c ?? 0;
}

export async function initDatabase() {
  await sqlite.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // One-time transition to migration-managed schema. Two pre-migration states
  // both need a clean slate, and pre-migration data is disposable per the review:
  //   1. Legacy dev DB: app tables created by the old raw-SQL initDatabase(),
  //      with no __drizzle_migrations table at all.
  //   2. Broken partial migration: an earlier migrate() created an (empty)
  //      __drizzle_migrations table, then failed on `CREATE TABLE leases`
  //      because the legacy table already existed — leaving 0 applied rows.
  // Detect both via "no applied migrations recorded, yet app tables exist", and
  // drop everything (including the tracking table) so migrate() starts fresh.
  // Once a migration is actually recorded, this branch is skipped.
  //
  // DESTRUCTIVE — gated behind __DEV__ so it can never wipe a real user's data
  // in a production build. These pre-migration states only ever existed on dev
  // machines (there are no shipped users yet). Before Phase 5 / first release,
  // this branch should be replaced with a non-destructive recovery path.
  if (__DEV__) {
    const applied = await appliedMigrationCount();
    const anyAppTable =
      (await tableExists('properties')) ||
      (await tableExists('leases')) ||
      (await tableExists('tenants')) ||
      (await tableExists('payments'));
    if (applied === 0 && anyAppTable) {
      await sqlite.execAsync(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS payments;
        DROP TABLE IF EXISTS leases;
        DROP TABLE IF EXISTS properties;
        DROP TABLE IF EXISTS tenants;
        DROP TABLE IF EXISTS __drizzle_migrations;
        PRAGMA foreign_keys = ON;
      `);
    }
  }

  // drizzle-kit migrations are the single source of truth for the schema.
  // The generated SQL in drizzle/ is applied here; regenerate with
  // `npx drizzle-kit generate` after changing src/db/schema.ts.
  await migrate(db, migrations);
}
