import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncStore {
  status: SyncStatus;
  /** ISO time of the last successful sync, or null. */
  lastSyncedAt: string | null;
  /** Bumped after every successful sync so focused screens can reload. */
  version: number;
  error: string | null;

  markSyncing: () => void;
  markSynced: () => void;
  markError: (message: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  version: 0,
  error: null,

  markSyncing: () => set({ status: 'syncing', error: null }),
  markSynced: () => set((s) => ({ status: 'idle', lastSyncedAt: new Date().toISOString(), version: s.version + 1, error: null })),
  markError: (message) => set({ status: 'error', error: message }),
}));
