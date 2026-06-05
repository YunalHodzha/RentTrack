import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * Build a WHERE clause that scopes a query to a single user's *live* rows: it
 * always applies BOTH the ownership filter (`user_id = uid`) and the soft-delete
 * filter (`deleted_at IS NULL`), plus any extra conditions the caller passes.
 *
 * The local SQLite DB is a shared, multi-user cache (server-side RLS scopes the
 * remote, but the local rows are not). Routing every read through this helper is
 * what stops the per-user leak from creeping back in — a query physically cannot
 * forget the ownership filter, because the filter is the helper.
 *
 * Kept dependency-free (drizzle only, no auth/RN imports) so it's unit-testable
 * in the Node jest environment. The current-user accessors live in `./owner`.
 */
export function ownedAndLive(
  table: { userId: AnySQLiteColumn; deletedAt: AnySQLiteColumn },
  uid: string,
  ...extra: (SQL | undefined)[]
): SQL {
  return and(eq(table.userId, uid), isNull(table.deletedAt), ...extra)!;
}
