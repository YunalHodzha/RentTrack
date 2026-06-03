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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'free',
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      rent_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      payment_day INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      deposit_amount REAL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lease_id INTEGER NOT NULL REFERENCES leases(id),
      period TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      method TEXT,
      notes TEXT
    );
  `);
}
