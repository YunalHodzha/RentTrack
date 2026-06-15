import { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Field, Input, Button, useTheme, spacing } from '@/components/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useAuthStore } from '@/store/auth';
import { toast } from '@/store/toast';
import { isSupabaseConfigured } from '@/services/supabase';

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Full-screen auth gate. The app is locked behind sign-in (Phase 4B decision),
 * so this is rendered by the root layout whenever there is no active session.
 */
export function AuthScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, requestPasswordReset } = useAuthStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // При отворена клавиатура подравняваме формата отгоре (вместо центрирана), за да
  // не остане полето за парола под клавиатурата на Android.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
      const { error } = isSignup
        ? await signUp(trimmedEmail, password)
        : await signIn(trimmedEmail, password);

      if (error) {
        toast.error(isSignup ? 'Регистрацията е неуспешна. Опитайте отново.' : 'Входът е неуспешен. Проверете имейла и паролата.');
      } else if (isSignup) {
        toast.info('Проверете имейла си за потвърждение');
        setMode('signin');
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
              {isReset ? 'Възстановяване на парола' : isSignup ? 'Създайте акаунт' : 'Влезте в акаунта си'}
            </Text>
          </View>

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
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
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

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
            {isReset ? (
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
