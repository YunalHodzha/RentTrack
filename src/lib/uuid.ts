import * as Crypto from 'expo-crypto';

/**
 * Generate a valid RFC 4122 version 4 UUID.
 *
 * Uses expo-crypto's randomUUID(), which produces a proper UUID with correct
 * version and variant bits — required for Postgres `uuid` columns during cloud sync.
 */
export function generateId(): string {
  return Crypto.randomUUID();
}
