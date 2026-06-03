import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: isDark ? '#6B7280' : '#9CA3AF',
        tabBarStyle: {
          backgroundColor: isDark ? '#111827' : '#FFFFFF',
          borderTopColor: isDark ? '#1F2937' : '#E5E7EB',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Табло', tabBarIcon: ({ color }) => <TabIcon name="dashboard" color={color} /> }}
      />
      <Tabs.Screen
        name="properties"
        options={{ title: 'Имоти', tabBarIcon: ({ color }) => <TabIcon name="properties" color={color} /> }}
      />
      <Tabs.Screen
        name="tenants"
        options={{ title: 'Наематели', tabBarIcon: ({ color }) => <TabIcon name="tenants" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    dashboard: '📊',
    properties: '🏠',
    tenants: '👥',
  };
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20 }}>{icons[name]}</Text>;
}
