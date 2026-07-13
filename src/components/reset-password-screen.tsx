import { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Card, Field, PasswordInput, Button, Loading, useTheme, spacing } from '@/components/ui';
import { toast } from '@/store/toast';
import { supabase } from '@/services/supabase';

/**
 * Екран „нова парола", отварян от reset линка в имейла (deep link към
 * /reset-password). Клиентът е с implicit auth flow (supabase-js default),
 * затова токените пристигат в URL fragment-а (#access_token=...&refresh_token=...),
 * не като ?code= — Linking парсва само query-то, затова fragment-ът се вади
 * ръчно от суровия URL. Рендира се от root auth gate-а (достъпен без вход);
 * route-ът /reset-password е входната точка при вече монтиран Stack.
 */

type Phase = 'establishing' | 'ready' | 'invalid';

/** Токените/грешката от fragment-а на recovery URL-а. */
function parseFragment(url: string): URLSearchParams | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  return new URLSearchParams(url.slice(hashIndex + 1));
}

export function ResetPasswordScreen({ url, onDone }: { url: string | null; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('establishing');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Установяване на сесия от recovery токените — еднократно за подадения URL.
  useEffect(() => {
    let cancelled = false;
    async function establish() {
      if (!supabase || !url) { setPhase('invalid'); return; }
      const params = parseFragment(url);
      const accessToken = params?.get('access_token');
      const refreshToken = params?.get('refresh_token');
      // Изтекъл/използван линк: Supabase връща #error_code=otp_expired&... вместо токени.
      if (!params || params.get('error') || !accessToken || !refreshToken) {
        setPhase('invalid');
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (cancelled) return;
      setPhase(error ? 'invalid' : 'ready');
    }
    void establish();
    return () => { cancelled = true; };
  }, [url]);

  async function handleSave() {
    const next: typeof errors = {};
    if (password.length < 6) next.password = 'Паролата трябва да е поне 6 символа';
    if (confirmPassword !== password) next.confirm = 'Паролите не съвпадат';
    setErrors(next);
    if (next.password || next.confirm || !supabase) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(
          /different from the old password/i.test(error.message)
            ? 'Новата парола трябва да е различна от старата'
            : 'Неуспешна смяна на паролата. Опитайте отново.',
        );
        return;
      }
      toast.success('Паролата е сменена успешно');
      // Сесията вече е активна (setSession от линка) — направо в приложението.
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'establishing') return <Loading />;

  if (phase === 'invalid') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, paddingTop: insets.top }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
            <Text style={{ fontSize: 34 }}>🔒</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, marginTop: spacing.sm }}>
              Невалиден линк
            </Text>
            <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: spacing.md, textAlign: 'center', lineHeight: 20 }}>
              Линкът за нова парола е невалиден или е изтекъл. Заявете нов от „Забравена парола?" на екрана за вход.
            </Text>
          </View>
          <Button label="Обратно към вход" onPress={onDone} fullWidth />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
            <Text style={{ fontSize: 34 }}>🔑</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: t.text, marginTop: spacing.sm }}>Нова парола</Text>
            <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: 4 }}>
              Изберете нова парола за акаунта си
            </Text>
          </View>

          <Card>
            <Field label="Нова парола" hint="Поне 6 символа" error={errors.password}>
              <PasswordInput
                value={password}
                onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
                placeholder="••••••••"
                autoCapitalize="none"
                textContentType="newPassword"
                error={!!errors.password}
              />
            </Field>
            <Field label="Повторете паролата" error={errors.confirm}>
              <PasswordInput
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirm: undefined })); }}
                placeholder="••••••••"
                autoCapitalize="none"
                textContentType="newPassword"
                error={!!errors.confirm}
              />
            </Field>

            <Button
              label={submitting ? 'Моля, изчакайте…' : 'Запази'}
              onPress={handleSave}
              disabled={submitting}
              fullWidth
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
