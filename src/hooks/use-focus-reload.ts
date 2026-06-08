import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/core';
import { useSyncStore } from '@/store/sync';

/**
 * Презарежда данните на екран при два повода:
 *  1. когато екранът се фокусира (връщане към таб / навигация назад);
 *  2. когато завърши фонова синхронизация и донесе нови данни, докато екранът е
 *     монтиран (следи sync version-а).
 *
 * `load` трябва да е стабилна (обвита в `useCallback`), иначе ефектите ще се
 * пускат на всеки render. Изнесено в hook, за да не се повтаря шаблонът из
 * списъчните екрани и за да няма колизия с `react-hooks/exhaustive-deps`.
 */
export function useFocusReload(load: () => void) {
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const syncVersion = useSyncStore((s) => s.version);
  const seenVersion = useRef(syncVersion);
  useEffect(() => {
    // Пропусни първоначалния render: фокус-ефектът вече зарежда при монтиране.
    if (seenVersion.current === syncVersion) return;
    seenVersion.current = syncVersion;
    load();
  }, [syncVersion, load]);
}
