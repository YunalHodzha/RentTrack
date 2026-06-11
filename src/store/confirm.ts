import { create } from 'zustand';

/** Тон на потвърждението — разрушителните действия се оцветяват в `danger`. */
export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (result: boolean) => void;
}

let nextId = 1;

interface ConfirmState {
  current: ConfirmRequest | null;
  request: (opts: ConfirmOptions) => Promise<boolean>;
  /** Затваря текущия диалог и резолва промиса с избора на потребителя. */
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  request: (opts) =>
    new Promise<boolean>((resolve) => {
      // Само един диалог наведнъж — ако някак има висящ, го отказваме.
      const pending = get().current;
      if (pending) pending.resolve(false);
      set({ current: { ...opts, id: nextId++, resolve } });
    }),
  close: (result) => {
    const cur = get().current;
    if (cur) cur.resolve(result);
    set({ current: null });
  },
}));

/**
 * Императивно потвърждение по същия модел като toast-а. Връща `Promise<boolean>`:
 *
 *   if (await confirm({ title, message, confirmLabel, tone: 'danger' })) { ...изтрий... }
 *
 * Диалогът се рисува от `ConfirmHost` (дизайн системата), монтиран веднъж в root.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().request(opts);
}
