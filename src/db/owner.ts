import { useAuthStore } from '@/store/auth';

// Re-export the pure scoped-WHERE builder so consumers have a single import for
// all per-user data access. The builder itself stays auth-free in `./scoped` so
// it can be unit-tested without pulling in the auth store / React Native.
export { ownedAndLive } from './scoped';

/** The signed-in user's id, or null when signed out. */
export function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null;
}

/**
 * The signed-in user's id, throwing if signed out. Use on writes: the app is
 * gated behind auth, so a missing id is a defensive invariant violation, not a
 * normal path — failing loudly beats silently creating an unowned row.
 */
export function requireUserId(): string {
  const uid = currentUserId();
  if (!uid) throw new Error('Запис без вписан потребител е блокиран.');
  return uid;
}

/** Stamp the current user's id onto an insert payload (writes are user-owned). */
export function withOwner<T extends object>(values: T): T & { userId: string } {
  return { ...values, userId: requireUserId() };
}
