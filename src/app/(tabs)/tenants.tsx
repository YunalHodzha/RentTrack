import { useCallback, useState } from 'react';
import { View, Text, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { tenants, leases } from '@/db/schema';
import { useAppStore } from '@/store';
import { toast } from '@/store/toast';
import { useFocusReload } from '@/hooks/use-focus-reload';
import { eq } from 'drizzle-orm';
import { ownedAndLive, currentUserId, withOwner } from '@/db/owner';
import type { NewTenant, Tenant } from '@/db/schema';
import { generateId } from '@/lib/uuid';
import {
  Screen, Header, Card, Avatar, Badge, FAB, EmptyState, ListSkeleton, ErrorState, Button,
  SheetModal, Field, Input, useTheme, spacing,
} from '@/components/ui';
import { useLoadingState } from '@/hooks/use-loading-state';

export default function TenantsScreen() {
  const t = useTheme();
  const { tenants: list, setTenants } = useAppStore();
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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

  async function handleAdd(data: NewTenant) {
    try {
      await db.insert(tenants).values(withOwner(data));
      await loadTenants();
      toast.success('Наемателят е добавен');
    } catch {
      toast.error('Неуспешно добавяне на наемателя');
    } finally {
      setModalVisible(false);
    }
  }

  const renderItem = ({ item }: { item: Tenant }) => (
    <Card onPress={() => router.push(`/tenant/${item.id}`)} style={{ marginBottom: spacing.md }}>
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
  );

  return (
    <Screen>
      <Header title="Наематели" subtitle={`${list.length} ${list.length === 1 ? 'наемател' : 'наематели'}`} />

      {error && list.length === 0 ? (
        <ErrorState message="Наемателите не можаха да се заредят." onRetry={loadTenants} />
      ) : phase === 'skeleton' ? (
        <ListSkeleton />
      ) : phase === 'pending' ? null : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="👥"
              title="Все още няма наематели"
              message="Добавете първия си наемател, за да започнете."
              action={<Button label="Добави наемател" onPress={() => setModalVisible(true)} />}
            />
          }
        />
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

  function reset() { setName(''); setPhone(''); setEmail(''); setNotes(''); }

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете името на наемателя.'); return; }
    onSave({ id: generateId(), name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <SheetModal visible={visible} onClose={handleClose} onSave={handleSave} title="Нов наемател">
      <Field label="Име *">
        <Input value={name} onChangeText={setName} placeholder="Пълно име" />
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
