import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Field, PasswordInput, Button, SheetModal, useTheme, spacing } from '@/components/ui';
import { toast } from '@/store/toast';
import { supabase } from '@/services/supabase';
import { reportError } from '@/services/sentry';

/**
 * Смяна на паролата за вече вписан потребител (от Настройки). Иска текущата
 * парола за потвърждение — оттам минава като `current_password` към
 * `updateUser` (supabase-js ≥ v2.102). Различно от reset-password потока,
 * който сменя паролата през recovery линк без стара парола.
 */
export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // `general` е мястото за несортирани сървърни/мрежови грешки — toast не върши
  // работа тук, защото ToastHost е под отворения RN Modal (вж. бележката в ui.tsx).
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string; general?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Нулираме полетата при всяко затваряне, за да не остане модалът „зареден".
  useEffect(() => {
    if (!visible) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    }
  }, [visible]);

  async function handleSave() {
    const next: typeof errors = {};
    if (!currentPassword) next.current = 'Въведете текущата си парола';
    if (newPassword.length < 6) next.password = 'Паролата трябва да е поне 6 символа';
    if (confirmPassword !== newPassword) next.confirm = 'Паролите не съвпадат';
    if (newPassword && newPassword === currentPassword) next.password = 'Новата парола трябва да е различна от текущата';
    setErrors(next);
    if (next.current || next.password || next.confirm || !supabase) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      });
      if (error) {
        // GoTrue връща „Current password required…" и при попълнена, но невярна
        // текуща парола (емпирично) — празното поле се хваща клиентски по-горе.
        if (/current password required|incorrect|invalid.*password/i.test(error.message)) {
          setErrors({ current: 'Текущата парола е грешна' });
        } else if (/different from the old password/i.test(error.message)) {
          setErrors({ password: 'Новата парола трябва да е различна от старата' });
        } else {
          setErrors({ general: 'Неуспешна смяна на паролата. Опитайте отново.' });
        }
        return;
      }
      toast.success('Паролата е сменена успешно');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (e) {
      // Изключение (мрежова грешка и т.н.) — иначе се губи като unhandled
      // rejection без никакъв UI.
      reportError(e);
      setErrors({ general: 'Неочаквана грешка. Опитайте отново.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Смяна на парола">
      <Field label="Текуща парола" error={errors.current}>
        <PasswordInput
          value={currentPassword}
          onChangeText={(v) => { setCurrentPassword(v); setErrors((e) => ({ ...e, current: undefined })); }}
          placeholder="••••••••"
          autoCapitalize="none"
          textContentType="password"
          error={!!errors.current}
        />
      </Field>
      <Field label="Нова парола" hint="Поне 6 символа" error={errors.password}>
        <PasswordInput
          value={newPassword}
          onChangeText={(v) => { setNewPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
          placeholder="••••••••"
          autoCapitalize="none"
          textContentType="newPassword"
          error={!!errors.password}
        />
      </Field>
      <Field label="Повторете новата парола" error={errors.confirm}>
        <PasswordInput
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirm: undefined })); }}
          placeholder="••••••••"
          autoCapitalize="none"
          textContentType="newPassword"
          error={!!errors.confirm}
        />
      </Field>
      {errors.general ? (
        <Text accessibilityRole="alert" style={{ fontSize: 13, fontWeight: '600', color: t.danger, marginBottom: spacing.md }}>
          {errors.general}
        </Text>
      ) : null}
      <Button
        label={submitting ? 'Моля, изчакайте…' : 'Запази'}
        onPress={handleSave}
        disabled={submitting}
        fullWidth
      />
    </SheetModal>
  );
}
