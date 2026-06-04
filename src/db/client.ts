import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as schema from './schema';
import migrations from '../../drizzle/migrations';

const sqlite = SQLite.openDatabaseSync('renttrack.db');
export const db = drizzle(sqlite, { schema });

export async function initDatabase() {
  await sqlite.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // drizzle-kit migrations are the single source of truth for the schema.
  // The generated SQL in drizzle/ is applied here; regenerate with
  // `npx drizzle-kit generate` after changing src/db/schema.ts.
  await migrate(db, migrations);
}
