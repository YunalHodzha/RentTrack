import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Respect the bottom safe-area inset (Android nav buttons / iOS home indicator)
  // so the tab bar never sits underneath the system navigation.
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
          borderTopWidth: 1,
          height: 58 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Табло', tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} /> }}
      />
      <Tabs.Screen
        name="properties"
        options={{ title: 'Имоти', tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="tenants"
        options={{ title: 'Наематели', tabBarIcon: ({ focused }) => <TabIcon icon="👥" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Настройки', tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', opacity: focused ? 1 : 0.55 }}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
    </View>
  );
}
