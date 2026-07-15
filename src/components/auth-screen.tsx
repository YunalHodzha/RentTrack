import { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Field, Input, PasswordInput, Button, useTheme, spacing } from '@/components/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useAuthStore } from '@/store/auth';
import { toast } from '@/store/toast';
import { isSupabaseConfigured } from '@/services/supabase';

type Mode = 'signin' | 'signup' | 'reset' | 'confirm';

/** Секунди cooldown на „Изпрати отново", за да не се спами Supabase. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Full-screen auth gate. The app is locked behind sign-in (Phase 4B decision),
 * so this is rendered by the root layout whenever there is no active session.
 */
export function AuthScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, requestPasswordReset, resendConfirmationEmail } = useAuthStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Имейлът, чакащ потвърждение (режим 'confirm') — може да е различен от полето.
  const [pendingEmail, setPendingEmail] = useState('');
  const [resendIn, setResendIn] = useState(0);
  // При отворена клавиатура подравняваме формата отгоре (вместо центрирана), за да
  // не остане полето за парола под клавиатурата на Android.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const isConfirm = mode === 'confirm';

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Отброяване на cooldown-а на „Изпрати отново" (тик по секунда).
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  /** Превключва към екрана „Проверете имейла си" за дадения имейл. */
  function showConfirmScreen(emailAddress: string, justSent: boolean) {
    setPendingEmail(emailAddress);
    setMode('confirm');
    // Ако имейл току-що е изпратен (регистрация), cooldown-ът тръгва веднага.
    if (justSent) setResendIn(RESEND_COOLDOWN_SECONDS);
  }

  async function handleResend() {
    setSubmitting(true);
    try {
      const { error } = await resendConfirmationEmail(pendingEmail);
      if (error) {
        toast.error('Неуспешно изпращане. Опитайте отново след малко.');
      } else {
        toast.info('Изпратихме нов линк за потвърждение');
        setResendIn(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!isSupabaseConfigured) {
      toast.error('Supabase не е конфигуриран (.env)');
      return;
    }
    const trimmedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      toast.error('Въведете валиден имейл адрес');
      return;
    }

    if (isReset) {
      setSubmitting(true);
      try {
        const { error } = await requestPasswordReset(trimmedEmail);
        if (error) {
          // Грешка тук е транспортна/rate limit — Supabase не издава дали имейлът
          // съществува, и ние също не бива (затова неутралното съобщение долу).
          toast.error('Неуспешно изпращане. Проверете връзката и опитайте отново.');
        } else {
          toast.info('Ако съществува акаунт с този имейл, изпратихме линк за нова парола');
          setMode('signin');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (password.length < 6) {
      toast.error('Паролата трябва да е поне 6 символа');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        const { error, awaitingConfirmation } = await signUp(trimmedEmail, password);
        if (error) {
          toast.error('Регистрацията е неуспешна. Опитайте отново.');
        } else if (awaitingConfirmation) {
          // Confirm email е включен: акаунтът чака потвърждение през линка в имейла.
          showConfirmScreen(trimmedEmail, true);
        }
        // Иначе сесията е активна и auth слушателят сменя този екран с приложението.
        return;
      }

      const { error, emailNotConfirmed } = await signIn(trimmedEmail, password);
      if (emailNotConfirmed) {
        toast.error('Имейлът ви още не е потвърден');
        showConfirmScreen(trimmedEmail, false);
      } else if (error) {
        toast.error('Входът е неуспешен. Проверете имейла и паролата.');
      } else {
        // На успешен вход auth слушателят сменя този екран с приложението.
        toast.success('Влязохте успешно');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: keyboardOpen ? 'flex-start' : 'center', padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
            <BrandLogo size={68} color={t.isDark ? t.mint : t.emerald} />
            <Text style={{ fontSize: 26, fontWeight: '800', color: t.text, marginTop: spacing.sm }}>Имотник</Text>
            <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: 4 }}>
              {isConfirm ? 'Потвърдете имейла си' : isReset ? 'Възстановяване на парола' : isSignup ? 'Създайте акаунт' : 'Влезте в акаунта си'}
            </Text>
          </View>

          {isConfirm ? (
            <Card>
              <Text style={{ fontSize: 34, textAlign: 'center', marginBottom: spacing.md }}>📬</Text>
              <Text style={{ fontSize: 14, color: t.textSecondary, marginBottom: spacing.lg, lineHeight: 20, textAlign: 'center' }}>
                Изпратихме линк за потвърждение на{' '}
                <Text style={{ fontWeight: '800', color: t.text }}>{pendingEmail}</Text>.
                {' '}Отворете го от телефона си.
              </Text>
              <Button
                label={
                  submitting
                    ? 'Моля, изчакайте…'
                    : resendIn > 0
                      ? `Изпрати отново (${resendIn} сек.)`
                      : 'Изпрати отново'
                }
                onPress={handleResend}
                disabled={submitting || resendIn > 0}
                fullWidth
              />
            </Card>
          ) : (
            <Card>
              <Field label="Имейл">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </Field>
              {isReset ? (
                <Text style={{ fontSize: 13, color: t.textMuted, marginBottom: spacing.lg, lineHeight: 18 }}>
                  Ще изпратим линк за нова парола на посочения имейл.
                </Text>
              ) : (
                <Field label="Парола" hint={isSignup ? 'Поне 6 символа' : undefined}>
                  <PasswordInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    autoCapitalize="none"
                    textContentType={isSignup ? 'newPassword' : 'password'}
                  />
                </Field>
              )}

              {mode === 'signin' ? (
                <Text
                  onPress={() => setMode('reset')}
                  style={{ fontSize: 13, fontWeight: '700', color: t.primary, textAlign: 'right', marginBottom: spacing.lg }}>
                  Забравена парола?
                </Text>
              ) : null}

              <Button
                label={submitting ? 'Моля, изчакайте…' : isReset ? 'Изпрати линк' : isSignup ? 'Регистрация' : 'Вход'}
                onPress={handleSubmit}
                disabled={submitting}
                fullWidth
              />
            </Card>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
            {isConfirm ? (
              <Text
                onPress={() => setMode('signin')}
                style={{ fontSize: 14, fontWeight: '800', color: t.primary }}>
                Назад към вход
              </Text>
            ) : isReset ? (
              <Text
                onPress={() => setMode('signin')}
                style={{ fontSize: 14, fontWeight: '800', color: t.primary }}>
                Обратно към вход
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 14, color: t.textSecondary }}>
                  {isSignup ? 'Вече имате акаунт? ' : 'Нямате акаунт? '}
                </Text>
                <Text
                  onPress={() => setMode(isSignup ? 'signin' : 'signup')}
                  style={{ fontSize: 14, fontWeight: '800', color: t.primary }}>
                  {isSignup ? 'Вход' : 'Регистрация'}
                </Text>
              </>
            )}
          </View>

          {!isSupabaseConfigured ? (
            <Text style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: spacing.xxl }}>
              ⚠️ Supabase не е конфигуриран (.env). Виж .env.example.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
