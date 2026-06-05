import { useCallback, useState } from 'react';
import { View, Text, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/core';
import { db } from '@/db/client';
import { tenants, leases } from '@/db/schema';
import { useAppStore } from '@/store';
import { useSyncStore } from '@/store/sync';
import { eq, and, isNull } from 'drizzle-orm';
import type { NewTenant, Tenant } from '@/db/schema';
import { generateId } from '@/lib/uuid';
import {
  Screen, Header, Card, Avatar, Badge, FAB, EmptyState, SheetModal, Field, Input,
  useTheme, spacing,
} from '@/components/ui';

export default function TenantsScreen() {
  const t = useTheme();
  const { tenants: list, setTenants } = useAppStore();
  const syncVersion = useSyncStore((s) => s.version);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);

  async function loadTenants() {
    const [rows, activeLeases] = await Promise.all([
      db.select().from(tenants).where(isNull(tenants.deletedAt)),
      db.select().from(leases).where(and(eq(leases.status, 'active'), isNull(leases.deletedAt))),
    ]);
    setTenants(rows);
    setActiveIds(new Set(activeLeases.map((l) => l.tenantId)));
  }

  useFocusEffect(useCallback(() => { loadTenants(); }, [syncVersion]));

  async function handleAdd(data: NewTenant) {
    await db.insert(tenants).values(data);
    await loadTenants();
    setModalVisible(false);
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
            message="Натиснете бутона +, за да добавите първия си наемател."
          />
        }
      />

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
