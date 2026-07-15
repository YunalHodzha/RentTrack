import { useEffect, useState } from 'react';
import { Field, PasswordInput, Button, SheetModal } from '@/components/ui';
import { toast } from '@/store/toast';
import { supabase } from '@/services/supabase';

/**
 * Смяна на паролата за вече вписан потребител (от Настройки). Иска текущата
 * парола за потвърждение — оттам минава като `current_password` към
 * `updateUser` (supabase-js ≥ v2.102). Различно от reset-password потока,
 * който сменя паролата през recovery линк без стара парола.
 */
export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string }>({});
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
        if (/invalid.*(login|password|credential)|incorrect password|current password/i.test(error.message)) {
          setErrors({ current: 'Текущата парола е грешна' });
        } else if (/different from the old password/i.test(error.message)) {
          setErrors({ password: 'Новата парола трябва да е различна от старата' });
        } else {
          toast.error('Неуспешна смяна на паролата. Опитайте отново.');
        }
        return;
      }
      toast.success('Паролата е сменена успешно');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
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
      <Button
        label={submitting ? 'Моля, изчакайте…' : 'Запази'}
        onPress={handleSave}
        disabled={submitting}
        fullWidth
      />
    </SheetModal>
  );
}
