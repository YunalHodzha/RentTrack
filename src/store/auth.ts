import { create } from 'zustand';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { setSentryUser } from '@/services/sentry';
import { useAppStore } from '@/store';

interface AuthStore {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been restored on app start. */
  initializing: boolean;

  /** Restore any persisted session and subscribe to auth changes. Call once on startup. */
  init: () => Promise<void>;
  /**
   * awaitingConfirmation = true при включен „Confirm email" в Supabase:
   * акаунтът е създаден, но без сесия — потребителят трябва да отвори
   * линка за потвърждение от имейла си.
   */
  signUp: (email: string, password: string) => Promise<{ error: string | null; awaitingConfirmation: boolean }>;
  /** emailNotConfirmed = true при опит за вход с още непотвърден имейл. */
  signIn: (email: string, password: string) => Promise<{ error: string | null; emailNotConfirmed: boolean }>;
  signOut: () => Promise<void>;
  /** Изпраща имейл с линк за нова парола, водещ обратно в приложението. */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Повторно изпращане на линка за потвърждение след регистрация. */
  resendConfirmationEmail: (email: string) => Promise<{ error: string | null }>;
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
    // Crash reporting контекст: само userId (без имейл — PII политика в sentry.ts).
    setSentryUser(data.session?.user?.id ?? null);

    if (!subscribed) {
      subscribed = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
        setSentryUser(session?.user?.id ?? null);
      });
    }
  },

  signUp: async (email, password) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.', awaitingConfirmation: false };
    // Линкът за потвърждение да върне в приложението (imotnik://#access_token=...),
    // а не към Site URL. Трябва да е добавен в Supabase → Redirect URLs.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: Linking.createURL('') },
    });
    if (error) return { error: error.message, awaitingConfirmation: false };
    // При включен „Confirm email" Supabase връща user без session — чака потвърждение.
    // (Същото връща и за вече регистриран имейл — нарочно, срещу изброяване на акаунти.)
    return { error: null, awaitingConfirmation: Boolean(data.user && !data.session) };
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.', emailNotConfirmed: false };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return {
      error: error?.message ?? null,
      emailNotConfirmed:
        (error && 'code' in error && error.code === 'email_not_confirmed') ||
        /email not confirmed/i.test(error?.message ?? ''),
    };
  },

  requestPasswordReset: async (email) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.' };
    // createURL дава правилния deep link и в Expo Go (exp://.../--/reset-password),
    // и в dev/production build (imotnik://reset-password). Без водеща наклонена
    // черта в пътя — иначе createURL дава imotnik:///reset-password (тройна
    // черта). URL-ът трябва да е добавен в Supabase → Authentication → URL
    // Configuration → Redirect URLs.
    const redirectTo = Linking.createURL('reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message ?? null };
  },

  resendConfirmationEmail: async (email) => {
    if (!supabase) return { error: 'Supabase не е конфигуриран.' };
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: Linking.createURL('') },
    });
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
