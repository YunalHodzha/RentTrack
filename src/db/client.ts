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

export async function initDatabase() {
  await sqlite.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // One-time transition: a dev database created by the old raw-SQL
  // initDatabase() has the app tables but no __drizzle_migrations record, so
  // the first migration's CREATE TABLE would fail ("table already exists").
  // Since pre-migration data is disposable, drop the legacy tables so the
  // migration can recreate them cleanly. Once migrated, __drizzle_migrations
  // exists and this branch is skipped.
  const migrationsTracked = await tableExists('__drizzle_migrations');
  const legacyTables = await tableExists('properties');
  if (!migrationsTracked && legacyTables) {
    await sqlite.execAsync(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS payments;
      DROP TABLE IF EXISTS leases;
      DROP TABLE IF EXISTS properties;
      DROP TABLE IF EXISTS tenants;
      PRAGMA foreign_keys = ON;
    `);
  }

  // drizzle-kit migrations are the single source of truth for the schema.
  // The generated SQL in drizzle/ is applied here; regenerate with
  // `npx drizzle-kit generate` after changing src/db/schema.ts.
  await migrate(db, migrations);
}
