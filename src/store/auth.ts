import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { useAppStore } from '@/store';

interface AuthStore {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been restored on app start. */
  initializing: boolean;

  /** Restore any persisted session and subscribe to auth changes. Call once on startup. */
  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

let subscribed = false;

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  initializing: true,

  init: async () => {
    if (!supabase) {
      // Unconfigured backend: nothing to restore, just stop the splash gate.
      set({ initializing: false });
      return;
    }

    const { data } = await supabase.auth.getSession();
    set({ session: data.session, user: data.session?.user ?? null, initializing: false });

    if (!subscribed) {
      subscribed = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    }
  },

  signUp: async (email, password) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.' };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ session: null, user: null });
    // Clear the previous user's cached rows so they don't linger in the UI when
    // a different account signs in on this device (local DB rows stay, but are
    // now hidden by the per-user read filter).
    useAppStore.getState().reset();
  },
}));
