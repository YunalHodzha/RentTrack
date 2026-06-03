import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/core';
import { db } from '@/db/client';
import { properties } from '@/db/schema';
import { useAppStore } from '@/store';
import type { NewProperty, Property } from '@/db/schema';

const PROPERTY_TYPES = ['apartment', 'garage', 'land', 'office', 'other'] as const;

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Апартамент',
  garage: 'Гараж',
  land: 'Земя',
  office: 'Офис',
  other: 'Друго',
};

const STATUS_COLORS: Record<Property['status'], string> = {
  free: '#16A34A',
  rented: '#2563EB',
  unavailable: '#6B7280',
};

const STATUS_LABELS: Record<Property['status'], string> = {
  free: 'Свободен',
  rented: 'Под наем',
  unavailable: 'Недостъпен',
};

export default function PropertiesScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { properties: list, setProperties } = useAppStore();
  const [modalVisible, setModalVisible] = useState(false);

  const bg = isDark ? '#111827' : '#F9FAFB';
  const card = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const border = isDark ? '#374151' : '#E5E7EB';

  async function loadProperties() {
    const rows = await db.select().from(properties);
    setProperties(rows);
  }

  useFocusEffect(useCallback(() => { loadProperties(); }, []));

  async function handleAdd(data: NewProperty) {
    await db.insert(properties).values(data);
    await loadProperties();
    setModalVisible(false);
  }

  const renderItem = ({ item }: { item: Property }) => (
    <TouchableOpacity
      onPress={() => router.push(`/property/${item.id}`)}
      style={{ backgroundColor: card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: text }}>{item.name}</Text>
          {item.address ? <Text style={{ fontSize: 13, color: sub, marginTop: 2 }}>{item.address}</Text> : null}
          <Text style={{ fontSize: 12, color: sub, marginTop: 4 }}>{TYPE_LABELS[item.type] ?? item.type}</Text>
        </View>
        <View style={{ backgroundColor: STATUS_COLORS[item.status] + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[item.status] }}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: card, borderBottomWidth: 1, borderBottomColor: border }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: text }}>Имоти</Text>
        <Text style={{ fontSize: 14, color: sub, marginTop: 2 }}>{list.length} общо</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ fontSize: 48 }}>🏠</Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: text, marginTop: 16 }}>Все още няма имоти</Text>
            <Text style={{ fontSize: 14, color: sub, marginTop: 8, textAlign: 'center' }}>
              Натиснете + за да добавите първия си имот
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{ position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>

      <AddPropertyModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleAdd}
        isDark={isDark}
      />
    </View>
  );
}

function AddPropertyModal({ visible, onClose, onSave, isDark }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: NewProperty) => void;
  isDark: boolean;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<NewProperty['type']>('apartment');
  const [notes, setNotes] = useState('');

  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const inputBg = isDark ? '#374151' : '#F3F4F6';
  const border = isDark ? '#4B5563' : '#E5E7EB';

  function reset() {
    setName(''); setAddress(''); setType('apartment'); setNotes('');
  }

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете ime на имота.'); return; }
    onSave({ name: name.trim(), address: address.trim() || null, type, status: 'free', notes: notes.trim() || null, createdAt: new Date().toISOString() });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: border }}>
          <TouchableOpacity onPress={handleClose}><Text style={{ color: '#2563EB', fontSize: 16 }}>Отказ</Text></TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: text }}>Добавяне на имот</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Запази</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Field label="Иme *" isDark={isDark}>
            <TextInput value={name} onChangeText={setName} placeholder="напр. Ап. 3, ул. Осма" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </Field>

          <Field label="Адрес" isDark={isDark}>
            <TextInput value={address} onChangeText={setAddress} placeholder="По избор" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </Field>

          <Field label="Тип" isDark={isDark}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PROPERTY_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: type === t ? '#2563EB' : inputBg }}>
                  <Text style={{ color: type === t ? '#fff' : text, fontSize: 14 }}>{TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Бележки" isDark={isDark}>
            <TextInput value={notes} onChangeText={setNotes} placeholder="По избор" placeholderTextColor={sub} multiline numberOfLines={3} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }} />
          </Field>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, children, isDark }: { label: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}
