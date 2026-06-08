import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

/** Колко toast-а да се виждат едновременно (по-старите изпадат от стека). */
const MAX_VISIBLE = 3;

let nextId = 1;

interface ToastState {
  toasts: ToastItem[];
  show: (type: ToastType, message: string) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (type, message) =>
    set((state) => {
      // Не дублирай същото съобщение, ако то вече е най-отгоре в стека (напр. два
      // бързи поредни провала с еднакъв текст).
      const last = state.toasts[state.toasts.length - 1];
      if (last && last.type === type && last.message === message) return state;
      const item: ToastItem = { id: nextId++, type, message };
      return { toasts: [...state.toasts, item].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Императивен API за обратна връзка, ползваем отвсякъде — екрани, services и
 * дори други stores (sync двигателя). Авто-скриването и анимацията се движат от
 * `ToastHost` в дизайн системата.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  info: (message: string) => useToastStore.getState().show('info', message),
};
