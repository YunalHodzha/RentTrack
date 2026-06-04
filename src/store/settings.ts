import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  defaultCurrency: 'EUR' | 'BGN';
  notificationDaysBefore: number;
}

const defaultSettings: AppSettings = {
  defaultCurrency: 'EUR',
  notificationDaysBefore: 3,
};

interface SettingsStore extends AppSettings {
  loadSettings: () => Promise<void>;
  updateDefaultCurrency: (currency: 'EUR' | 'BGN') => Promise<void>;
  updateNotificationDaysBefore: (days: number) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...defaultSettings,

  loadSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem('renttrack_settings');
      if (stored) {
        const settings = JSON.parse(stored) as AppSettings;
        set(settings);
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
}));
