import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  Screen, Header, Card, SectionTitle, Field, Input, ChipGroup, Button, SheetModal,
  useTheme, spacing, Divider,
} from '@/components/ui';
import { useSettingsStore } from '@/store/settings';
import { useAuthStore } from '@/store/auth';
import { useSyncStore } from '@/store/sync';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { syncNow, withSyncPaused } from '@/services/sync-runtime';
import { isSupabaseConfigured } from '@/services/supabase';
import { schedulePaymentReminders, cancelScheduledReminders } from '@/services/notifications';
import { shareDataExport } from '@/services/export';
import { parseImportFile, applyImport } from '@/services/import';
import { deleteAccount } from '@/services/account';
import { db } from '@/db/client';
import { currentUserId } from '@/db/owner';
import type { Currency } from '@/lib/domain';

const CURRENCIES = [
  { value: 'EUR' as const, label: 'EUR €' },
  { value: 'BGN' as const, label: 'BGN лв.' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const { defaultCurrency, notificationDaysBefore, updateDefaultCurrency, updateNotificationDaysBefore } = useSettingsStore();
  const { user, signOut } = useAuthStore();
  const { status: syncStatus, lastSyncedAt, error: syncError } = useSyncStore();
  const [localCurrency, setLocalCurrency] = useState<Currency>(defaultCurrency);
  const [localDaysBefore, setLocalDaysBefore] = useState(String(notificationDaysBefore));
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLocalCurrency(defaultCurrency);
      setLocalDaysBefore(String(notificationDaysBefore));
    }, [defaultCurrency, notificationDaysBefore])
  );

  async function handleSaveSettings() {
    const days = parseInt(localDaysBefore, 10);
    if (isNaN(days) || days < 0 || days > 30) {
      toast.error('Брой дни трябва да е между 0 и 30');
      return;
    }

    try {
      await updateDefaultCurrency(localCurrency);
      await updateNotificationDaysBefore(days);
      await schedulePaymentReminders();
      toast.success('Настройките са запазени');
    } catch {
      toast.error('Неуспешно запазване на настройките');
    }
  }

  async function handleExportJSON() {
    try {
      await shareDataExport('json');
    } catch (error) {
      toast.error('Неуспешен експорт на JSON данните');
      console.error(error);
    }
  }

  async function handleExportCSV() {
    try {
      await shareDataExport('csv');
    } catch (error) {
      toast.error('Неуспешен експорт на CSV данните');
      console.error(error);
    }
  }

  async function handleSignOut() {
    if (await confirm({ title: 'Изход', message: 'Сигурни ли сте, че искате да излезете?', confirmLabel: 'Изход', tone: 'danger' })) {
      await signOut();
      // Напомнянията са за-потребителски — без вписан потребител не бива да
      // гърмят. Следващият вход ги пренасрочва (root layout ефекта по userId).
      await cancelScheduledReminders();
      toast.success('Излязохте от профила');
    }
  }

  async function handleImportJSON() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const json = await new File(asset.uri).text();

      // Валидация преди каквото и да е писане — невалиден файл = нула промени.
      let file: ReturnType<typeof parseImportFile>;
      try {
        file = parseImportFile(json);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Файлът не е валиден RentTrack експорт.');
        return;
      }

      const uid = currentUserId();
      if (!uid) {
        toast.error('Няма вписан потребител.');
        return;
      }

      const ok = await confirm({
        title: 'Възстановяване на данни',
        message:
          `Това ще ЗАМЕНИ всички данни в приложението И в облака с тези от файла ` +
          `(${file.properties.length} имота, ${file.tenants.length} наематели, ${file.leases.length} договора, ${file.payments.length} плащания). Сигурни ли сте?`,
        confirmLabel: 'Възстанови',
        tone: 'danger',
      });
      if (!ok) return;

      try {
        // Под sync mutex-а, за да не пише фонов sync по средата; после веднага
        // качваме tombstone-ите и новите редове (тихо при offline — следващият
        // тригер ги поема). Екраните се презареждат при фокус (useFocusReload).
        const counts = await withSyncPaused(() => applyImport(db, file, uid));
        void syncNow();
        await schedulePaymentReminders();
        toast.success(`Възстановени: ${counts.properties} имота, ${counts.tenants} наематели, ${counts.leases} договора, ${counts.payments} плащания`);
      } catch (err) {
        toast.error('Неуспешно внасяне на данните — нищо не е променено.');
        console.error(err);
      }
    } catch (error) {
      toast.error('Неуспешно отваряне на файла');
      console.error(error);
    }
  }

  // Редът (RPC → локален wipe → signOut) живее в services/account.ts. Модалът
  // се затваря преди toast-а (RN Modal го крие отдолу). При грешка нищо не е
  // изтрито — нито в облака, нито локално.
  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      const { error } = await deleteAccount();
      setDeleteAccountVisible(false);
      if (error) {
        toast.error('Изтриването е неуспешно — нищо не е изтрито. Опитайте отново.');
        console.error(error);
      } else {
        // Потребителят вече е изхвърлен към екрана за вход от auth gate-а.
        toast.success('Акаунтът и всички данни са изтрити');
      }
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <Header title="Настройки" />

        <SectionTitle>Акаунт</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          {user?.email ? (
            <>
              <Text style={{ fontSize: 13, color: t.textSecondary, marginBottom: 2 }}>Влезли сте като</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.text, marginBottom: spacing.lg }}>{user.email}</Text>
            </>
          ) : null}
          <Button label="Изход" variant="danger" onPress={handleSignOut} fullWidth />
        </Card>

        <SectionTitle>Синхронизация</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          {isSupabaseConfigured ? (
            <>
              <Text style={{ fontSize: 13, color: t.textSecondary }}>
                {syncStatus === 'syncing'
                  ? 'Синхронизиране…'
                  : syncStatus === 'error'
                    ? `Грешка: ${syncError ?? 'неуспешна синхронизация'}`
                    : lastSyncedAt
                      ? `Последна синхронизация: ${new Date(lastSyncedAt).toLocaleString('bg-BG')}`
                      : 'Все още няма синхронизация'}
              </Text>
              <Button
                label={syncStatus === 'syncing' ? 'Синхронизиране…' : 'Синхронизирай сега'}
                variant="secondary"
                onPress={() => { syncNow({ notifySuccess: true, notifyError: true }); }}
                disabled={syncStatus === 'syncing'}
                fullWidth
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>
              Облачната синхронизация не е конфигурирана. Данните се пазят само на това устройство.
              За включване задайте Supabase ключовете в .env (виж .env.example).
            </Text>
          )}
        </Card>

        <SectionTitle>Валута</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 13, color: t.textSecondary, marginBottom: spacing.md }}>
            Предпочитана валута по подразбиране
          </Text>
          <ChipGroup options={CURRENCIES} value={localCurrency} onChange={setLocalCurrency} />
        </Card>

        <SectionTitle>Известия</SectionTitle>
        <Card>
          <Field label="Дни преди падежа за напомяне" hint="0-30 дни">
            <Input
              value={localDaysBefore}
              onChangeText={setLocalDaysBefore}
              placeholder="3"
              keyboardType="number-pad"
            />
          </Field>
          <Divider />
          <Text style={{ fontSize: 13, color: t.textMuted, marginTop: spacing.md }}>
            Пример: ако денят е 3, уведомленията се изпращат 3 дни преди падежа на плащането.
          </Text>
        </Card>

        <Button
          label="Запази настройки"
          onPress={handleSaveSettings}
          fullWidth
          style={{ marginTop: spacing.xxl }}
        />

        <SectionTitle style={{ marginTop: spacing.xxl }}>Експорт на данни</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={{ fontSize: 13, color: t.textMuted, marginBottom: spacing.lg }}>
            Експортирайте всички данни в JSON или CSV формат за архив или анализ.
          </Text>
          <View style={{ gap: spacing.md }}>
            <Button label="Експорт като JSON" variant="secondary" onPress={handleExportJSON} fullWidth />
            <Button label="Експорт като CSV" variant="secondary" onPress={handleExportCSV} fullWidth />
          </View>
        </Card>

        {/* Аварийните/рядко ползваните функции стоят свити, за да не седят
            наравно с ежедневните настройки. Логиката на импорта не е пипана. */}
        <SectionTitle>Разширени</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          <TouchableOpacity
            onPress={() => setAdvancedOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={advancedOpen ? 'Скрий разширените настройки' : 'Покажи разширените настройки'}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>Възстановяване от архив</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: t.textMuted }}>{advancedOpen ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {advancedOpen ? (
            <View style={{ marginTop: spacing.lg }}>
              <Button label="Внеси от JSON" variant="secondary" onPress={handleImportJSON} fullWidth />
              <Text style={{ fontSize: 12, color: t.textMuted, marginTop: spacing.md, lineHeight: 17 }}>
                Замества всички данни с тези от файла. Ползва се за възстановяване от архив.
              </Text>
            </View>
          ) : null}
        </Card>

        <SectionTitle>Опасна зона</SectionTitle>
        <Card>
          <Text style={{ fontSize: 13, color: t.textMuted, marginBottom: spacing.lg, lineHeight: 19 }}>
            Изтрива акаунта ви и всички данни — от облака и от това устройство. Действието е безвъзвратно.
          </Text>
          <Button label="Изтриване на акаунт" variant="danger" onPress={() => setDeleteAccountVisible(true)} fullWidth />
        </Card>

      </ScrollView>

      <DeleteAccountModal
        visible={deleteAccountVisible}
        busy={deletingAccount}
        onClose={() => setDeleteAccountVisible(false)}
        onConfirm={handleDeleteAccount}
      />
    </Screen>
  );
}

/**
 * Потвърждение за изтриване на акаунт. По-тежко от confirm() диалога нарочно:
 * финалният бутон се отключва само след изписано ИЗТРИЙ — стандартната защита
 * за необратими действия на ниво акаунт.
 */
function DeleteAccountModal({ visible, busy, onClose, onConfirm }: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const armed = confirmText.trim().toUpperCase() === 'ИЗТРИЙ';

  // Нулираме полето при всяко затваряне, за да не остане модалът „зареден"
  // при повторно отваряне.
  useEffect(() => { if (!visible) setConfirmText(''); }, [visible]);

  return (
    <SheetModal visible={visible} onClose={onClose} title="Изтриване на акаунт">
      <Text style={{ fontSize: 14, color: t.text, lineHeight: 21, marginBottom: spacing.lg }}>
        Това ще изтрие акаунта ви и всички данни — имоти, наематели, договори и плащания — от облака и от това устройство. Действието е безвъзвратно и данните не могат да бъдат възстановени.
      </Text>
      <Field label="Напишете ИЗТРИЙ, за да потвърдите">
        <Input
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="ИЗТРИЙ"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Field>
      <Button
        label={busy ? 'Изтриване…' : 'Изтрий акаунта завинаги'}
        variant="danger"
        onPress={onConfirm}
        disabled={!armed || busy}
        fullWidth
      />
    </SheetModal>
  );
}
