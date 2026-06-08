import { useCallback, useState } from 'react';
import { View, Text, FlatList, Alert } from 'react-native';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { properties } from '@/db/schema';
import { ownedAndLive, currentUserId, withOwner } from '@/db/owner';
import { useAppStore } from '@/store';
import { toast } from '@/store/toast';
import { useFocusReload } from '@/hooks/use-focus-reload';
import type { NewProperty, Property } from '@/db/schema';
import { generateId } from '@/lib/uuid';
import {
  Screen, Header, Card, Badge, IconBadge, FAB, EmptyState, ListSkeleton, ErrorState, Button,
  SheetModal, Field, Input, ChipGroup, useTheme, spacing,
} from '@/components/ui';
import { useLoadingState } from '@/hooks/use-loading-state';
import { PROPERTY_TYPES, TYPE_LABELS, TYPE_ICONS, STATUS_LABELS, STATUS_TONE } from '@/lib/domain';

export default function PropertiesScreen() {
  const t = useTheme();
  const { properties: list, setProperties } = useAppStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const loadProperties = useCallback(async () => {
    const uid = currentUserId();
    if (!uid) { setProperties([]); setLoaded(true); return; }
    try {
      setError(false);
      const rows = await db.select().from(properties).where(ownedAndLive(properties, uid));
      setProperties(rows);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [setProperties]);

  useFocusReload(loadProperties);

  const phase = useLoadingState(loaded, list.length === 0);

  async function handleAdd(data: NewProperty) {
    // Затваряме модала и в двата случая (RN Modal крие toast-а отдолу), за да е
    // видима обратната връзка на екрана под него.
    try {
      await db.insert(properties).values(withOwner(data));
      await loadProperties();
      toast.success('Имотът е добавен');
    } catch {
      toast.error('Неуспешно добавяне на имота');
    } finally {
      setModalVisible(false);
    }
  }

  const renderItem = ({ item }: { item: Property }) => (
    <Card onPress={() => router.push(`/property/${item.id}`)} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge icon={TYPE_ICONS[item.type] ?? '📦'} tone={STATUS_TONE[item.status]} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }} numberOfLines={1}>{item.name}</Text>
          {item.address ? <Text style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }} numberOfLines={1}>{item.address}</Text> : null}
          <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{TYPE_LABELS[item.type] ?? item.type}</Text>
        </View>
        <Badge label={STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} />
      </View>
    </Card>
  );

  return (
    <Screen>
      <Header title="Имоти" subtitle={`${list.length} ${list.length === 1 ? 'имот' : 'имота'}`} />

      {error && list.length === 0 ? (
        <ErrorState message="Имотите не можаха да се заредят." onRetry={loadProperties} />
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
              icon="🏠"
              title="Все още няма имоти"
              message="Добавете първия си имот, за да започнете."
              action={<Button label="Добави имот" onPress={() => setModalVisible(true)} />}
            />
          }
        />
      )}

      <FAB onPress={() => setModalVisible(true)} />

      <AddPropertyModal visible={modalVisible} onClose={() => setModalVisible(false)} onSave={handleAdd} />
    </Screen>
  );
}

function AddPropertyModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: NewProperty) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<NewProperty['type']>('apartment');
  const [notes, setNotes] = useState('');

  function reset() { setName(''); setAddress(''); setType('apartment'); setNotes(''); }

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете името на имота.'); return; }
    onSave({ id: generateId(), name: name.trim(), address: address.trim() || null, type, status: 'free', notes: notes.trim() || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <SheetModal visible={visible} onClose={handleClose} onSave={handleSave} title="Нов имот">
      <Field label="Име *">
        <Input value={name} onChangeText={setName} placeholder="напр. Ап. 3, ул. Осма" />
      </Field>
      <Field label="Адрес">
        <Input value={address} onChangeText={setAddress} placeholder="По избор" />
      </Field>
      <Field label="Тип">
        <ChipGroup options={PROPERTY_TYPES.map((v) => ({ value: v, label: TYPE_LABELS[v] }))} value={type} onChange={setType} />
      </Field>
      <Field label="Бележки">
        <Input value={notes} onChangeText={setNotes} placeholder="По избор" multiline />
      </Field>
    </SheetModal>
  );
}
