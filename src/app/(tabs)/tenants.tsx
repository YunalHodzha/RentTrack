import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, useColorScheme,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/core';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { useAppStore } from '@/store';
import type { NewTenant, Tenant } from '@/db/schema';

export default function TenantsScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { tenants: list, setTenants } = useAppStore();
  const [modalVisible, setModalVisible] = useState(false);

  const bg = isDark ? '#111827' : '#F9FAFB';
  const card = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const border = isDark ? '#374151' : '#E5E7EB';

  async function loadTenants() {
    const rows = await db.select().from(tenants);
    setTenants(rows);
  }

  useFocusEffect(useCallback(() => { loadTenants(); }, []));

  async function handleAdd(data: NewTenant) {
    await db.insert(tenants).values(data);
    await loadTenants();
    setModalVisible(false);
  }

  const renderItem = ({ item }: { item: Tenant }) => (
    <View style={{ backgroundColor: card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563EB20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#2563EB' }}>{item.name[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: text }}>{item.name}</Text>
          {item.phone ? <Text style={{ fontSize: 13, color: sub, marginTop: 2 }}>{item.phone}</Text> : null}
          {item.email ? <Text style={{ fontSize: 13, color: sub }}>{item.email}</Text> : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: card, borderBottomWidth: 1, borderBottomColor: border }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: text }}>Наематели</Text>
        <Text style={{ fontSize: 14, color: sub, marginTop: 2 }}>{list.length} общо</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ fontSize: 48 }}>👥</Text>
            <Text style={{ fontSize: 18, fontWeight: '600', color: text, marginTop: 16 }}>Все още няма наематели</Text>
            <Text style={{ fontSize: 14, color: sub, marginTop: 8, textAlign: 'center' }}>
              Натиснете + за да добавите първия си наемател
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{ position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }}>
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>

      <AddTenantModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleAdd}
        isDark={isDark}
      />
    </View>
  );
}

function AddTenantModal({ visible, onClose, onSave, isDark }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: NewTenant) => void;
  isDark: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const bg = isDark ? '#1F2937' : '#FFFFFF';
  const text = isDark ? '#F9FAFB' : '#111827';
  const sub = isDark ? '#9CA3AF' : '#6B7280';
  const inputBg = isDark ? '#374151' : '#F3F4F6';
  const border = isDark ? '#4B5563' : '#E5E7EB';

  function reset() { setName(''); setPhone(''); setEmail(''); setNotes(''); }

  function handleSave() {
    if (!name.trim()) { Alert.alert('Задължително', 'Моля, въведете имeто на наемателя.'); return; }
    onSave({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null, createdAt: new Date().toISOString() });
    reset();
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: border }}>
          <TouchableOpacity onPress={handleClose}><Text style={{ color: '#2563EB', fontSize: 16 }}>Отказ</Text></TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '600', color: text }}>Добавяне на наемател</Text>
          <TouchableOpacity onPress={handleSave}><Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Запази</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Field label="Иme *" isDark={isDark}>
            <TextInput value={name} onChangeText={setName} placeholder="Пълно иmе" placeholderTextColor={sub} style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </Field>
          <Field label="Телефон" isDark={isDark}>
            <TextInput value={phone} onChangeText={setPhone} placeholder="По избор" placeholderTextColor={sub} keyboardType="phone-pad" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
          </Field>
          <Field label="Имейл" isDark={isDark}>
            <TextInput value={email} onChangeText={setEmail} placeholder="По избор" placeholderTextColor={sub} keyboardType="email-address" autoCapitalize="none" style={{ backgroundColor: inputBg, borderRadius: 10, padding: 12, color: text, fontSize: 16 }} />
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
