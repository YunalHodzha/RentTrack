import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const sqlite = SQLite.openDatabaseSync('renttrack.db');
export const db = drizzle(sqlite, { schema });

export async function initDatabase() {
  await sqlite.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'free',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS leases (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      rent_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      payment_day REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      deposit_amount REAL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leases_property_id ON leases(property_id);
    CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id);

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      method TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(lease_id, period)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_lease_id ON payments(lease_id);
  `);
}
