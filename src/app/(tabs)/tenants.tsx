import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { tenants, leases } from '@/db/schema';
import { useAppStore } from '@/store';
import { toast } from '@/store/toast';
import { confirm } from '@/store/confirm';
import { softDeleteTenant } from '@/db/soft-delete';
import { syncNow } from '@/services/sync-runtime';
import { isSupabaseConfigured } from '@/services/supabase';
import { useFocusReload } from '@/hooks/use-focus-reload';
import { eq } from 'drizzle-orm';
import { ownedAndLive, currentUserId, withOwner } from '@/db/owner';
import type { NewTenant, Tenant } from '@/db/schema';
import { generateId } from '@/lib/uuid';
import {
  Screen, Header, Card, Avatar, Badge, FAB, EmptyState, ListSkeleton, ErrorState, Button,
  SheetModal, Field, Input, SwipeableRow, useTheme, spacing,
} from '@/components/ui';
import { useLoadingState } from '@/hooks/use-loading-state';
import { deleteCascadeWarning } from '@/lib/domain';

export default function TenantsScreen() {
  const t = useTheme();
  const { tenants: list, setTenants } = useAppStore();
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const loadTenants = useCallback(async () => {
    const uid = currentUserId();
    if (!uid) { setTenants([]); setActiveIds(new Set()); setLoaded(true); return; }
    try {
      setError(false);
      const [rows, activeLeases] = await Promise.all([
        db.select().from(tenants).where(ownedAndLive(tenants, uid)),
        db.select().from(leases).where(ownedAndLive(leases, uid, eq(leases.status, 'active'))),
      ]);
      setTenants(rows);
      setActiveIds(new Set(activeLeases.map((l) => l.tenantId)));
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [setTenants]);

  useFocusReload(loadTenants);

  const phase = useLoadingState(loaded, list.length === 0);

  // Pull-to-refresh: реален ръчен sync (mutex-нат) + reload. Резултатът минава
  // през toast-а от Част 1. Без Supabase — само локален reload, без toast.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (isSupabaseConfigured) await syncNow({ notifySuccess: true, notifyError: true });
      await loadTenants();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAdd(data: NewTenant) {
    try {
      await db.insert(tenants).values(withOwner(data));
      await loadTenants();
      // Верижно CTA: водим към новия наемател, където договор се добавя с picker
      // за свободен имот (Задача 2). Дискретно, в toast-а.
      toast.success('Наемателят е добавен', {
        label: 'Добави договор',
        onPress: () => router.push(`/tenant/${data.id}`),
      });
    } catch {
      toast.error('Неуспешно добавяне на наемателя');
    } finally {
      setModalVisible(false);
    }
  }

  // Swipe-to-delete: същата проверка за активен договор, същият confirm диалог
  // (вкл. предупреждението за историята) и същият soft-delete + toast като в
  // детайлния екран. Проверката чете от базата, не от activeIds, за да е свежа.
  async function handleSwipeDelete(item: Tenant): Promise<boolean> {
    const uid = currentUserId();
    if (!uid) return false;
    try {
      const tenantLeases = await db.select().from(leases)
        .where(ownedAndLive(leases, uid, eq(leases.tenantId, item.id)));
      if (tenantLeases.some((l) => l.status === 'active')) {
        toast.error('Изтриването е блокирано: има активен договор');
        return false;
      }
      const base = `Сигурни ли сте, че искате да изтриете „${item.name}“?`;
      const ok = await confirm({
        title: 'Изтриване на наемател',
        message: tenantLeases.length > 0 ? `${base} ${deleteCascadeWarning(item.name)}` : base,
        confirmLabel: 'Изтрий',
        tone: 'danger',
      });
      if (!ok) return false;
      await softDeleteTenant(db, item.id);
      toast.success('Наемателят е изтрит');
      return true;
    } catch {
      toast.error('Неуспешно изтриране на наемателя');
      return false;
    }
  }

  // Клиентско търсене по име/телефон над заредения списък (моментално).
  const q = query.trim().toLowerCase();
  const filtered = q
    ? list.filter((tn) => `${tn.name} ${tn.phone ?? ''}`.toLowerCase().includes(q))
    : list;

  const renderItem = ({ item }: { item: Tenant }) => (
    <SwipeableRow onDelete={() => handleSwipeDelete(item)} onDeleted={loadTenants}>
      <Card onPress={() => router.push(`/tenant/${item.id}`)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar name={item.name} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }} numberOfLines={1}>{item.name}</Text>
            {item.phone ? <Text style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}>{item.phone}</Text> : null}
            {item.email ? <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 1 }} numberOfLines={1}>{item.email}</Text> : null}
          </View>
          {activeIds.has(item.id) ? <Badge label="Активен наем" tone="success" /> : null}
        </View>
      </Card>
    </SwipeableRow>
  );

  return (
    <Screen>
      <Header title="Наематели" subtitle={`${list.length} ${list.length === 1 ? 'наемател' : 'наематели'}`} />

      {error && list.length === 0 ? (
        <ErrorState message="Наемателите не можаха да се заредят." onRetry={loadTenants} />
      ) : phase === 'skeleton' ? (
        <ListSkeleton />
      ) : phase === 'pending' ? null : (
        <View style={{ flex: 1 }}>
          {list.length > 0 ? (
            <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              <Input value={query} onChangeText={setQuery} placeholder="Търсене по име или телефон" autoCapitalize="none" />
            </View>
          ) : null}
          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.primary} colors={[t.primary]} />
            }
            ListEmptyComponent={
              list.length === 0 ? (
                <EmptyState
                  icon="👥"
                  title="Все още няма наематели"
                  message="Добавете първия си наемател, за да започнете."
                  action={<Button label="Добави наемател" onPress={() => setModalVisible(true)} />}
                />
              ) : (
                <EmptyState icon="🔍" title="Няма съвпадения" message="Опитайте друго търсене." />
              )
            }
          />
        </View>
      )}

      <FAB onPress={() => setModalVisible(true)} />

      <AddTenantModal visible={modalVisible} onClose={() => setModalVisible(false)} onSave={handleAdd} />
    </Screen>
  );
}

function AddTenantModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: NewTenant) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  function reset() { setName(''); setPhone(''); setEmail(''); setNotes(''); setNameError(undefined); }

  function handleSave() {
    if (!name.trim()) { setNameError('Въведете име'); return; }
    onSave({ id: generateId(), name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <SheetModal visible={visible} onClose={handleClose} onSave={handleSave} title="Нов наемател">
      <Field label="Име *" error={nameError}>
        <Input value={name} onChangeText={(v) => { setName(v); setNameError(undefined); }} placeholder="Пълно име" error={!!nameError} />
      </Field>
      <Field label="Телефон">
        <Input value={phone} onChangeText={setPhone} placeholder="По избор" keyboardType="phone-pad" />
      </Field>
      <Field label="Имейл">
        <Input value={email} onChangeText={setEmail} placeholder="По избор" keyboardType="email-address" autoCapitalize="none" />
      </Field>
      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>
    </SheetModal>
  );
}
