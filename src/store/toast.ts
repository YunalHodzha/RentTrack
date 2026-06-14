import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

/** По избор — действие/CTA в toast-а (напр. „Добави договор" след създаване). */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

/** Колко toast-а да се виждат едновременно (по-старите изпадат от стека). */
const MAX_VISIBLE = 3;

let nextId = 1;

interface ToastState {
  toasts: ToastItem[];
  show: (type: ToastType, message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (type, message, action) =>
    set((state) => {
      // Не дублирай същото съобщение, ако то вече е най-отгоре в стека (напр. два
      // бързи поредни провала с еднакъв текст). Toast-ове с действие са нарочни
      // CTA-та — тях ги показваме винаги, дори текстът да съвпада.
      const last = state.toasts[state.toasts.length - 1];
      if (!action && last && last.type === type && last.message === message) return state;
      const item: ToastItem = { id: nextId++, type, message, action };
      return { toasts: [...state.toasts, item].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Императивен API за обратна връзка, ползваем отвсякъде — екрани, services и
 * дори други stores (sync двигателя). Авто-скриването и анимацията се движат от
 * `ToastHost` в дизайн системата. Подай `action` за CTA в toast-а.
 */
export const toast = {
  success: (message: string, action?: ToastAction) => useToastStore.getState().show('success', message, action),
  error: (message: string, action?: ToastAction) => useToastStore.getState().show('error', message, action),
  info: (message: string, action?: ToastAction) => useToastStore.getState().show('info', message, action),
};
