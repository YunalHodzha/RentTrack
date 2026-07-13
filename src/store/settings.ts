import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  defaultCurrency: 'EUR' | 'BGN';
  notificationDaysBefore: number;
  themeMode: 'system' | 'light' | 'dark';
}

const defaultSettings: AppSettings = {
  defaultCurrency: 'EUR',
  notificationDaysBefore: 3,
  themeMode: 'system',
};

interface SettingsStore extends AppSettings {
  loadSettings: () => Promise<void>;
  updateDefaultCurrency: (currency: 'EUR' | 'BGN') => Promise<void>;
  updateNotificationDaysBefore: (days: number) => Promise<void>;
  updateThemeMode: (mode: 'system' | 'light' | 'dark') => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...defaultSettings,

  loadSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem('renttrack_settings');
      if (stored) {
        const settings = JSON.parse(stored) as Partial<AppSettings>;
        set({ ...defaultSettings, ...settings });
      } else {
        set(defaultSettings);
      }
    } catch {
      set(defaultSettings);
    }
  },

  updateDefaultCurrency: async (currency) => {
    set({ defaultCurrency: currency });
    try {
      const stored = await AsyncStorage.getItem('renttrack_settings');
      const settings = stored ? JSON.parse(stored) : defaultSettings;
      await AsyncStorage.setItem('renttrack_settings', JSON.stringify({ ...settings, defaultCurrency: currency }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  updateNotificationDaysBefore: async (days) => {
    const clamped = Math.max(0, Math.min(30, days));
    set({ notificationDaysBefore: clamped });
    try {
      const stored = await AsyncStorage.getItem('renttrack_settings');
      const settings = stored ? JSON.parse(stored) : defaultSettings;
      await AsyncStorage.setItem('renttrack_settings', JSON.stringify({ ...settings, notificationDaysBefore: clamped }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  updateThemeMode: async (mode) => {
    set({ themeMode: mode });
    try {
      const stored = await AsyncStorage.getItem('renttrack_settings');
      const settings = stored ? JSON.parse(stored) : defaultSettings;
      await AsyncStorage.setItem('renttrack_settings', JSON.stringify({ ...settings, themeMode: mode }));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
}));
