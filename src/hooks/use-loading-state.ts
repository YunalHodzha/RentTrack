import { useEffect, useState } from 'react';
import { useSyncStore } from '@/store/sync';

/**
 * Връща `true` само ако `active` е стоял непрекъснато `true` поне `delayMs`.
 * Така спинъри/skeleton-и не проблясват при моментални операции (локалните
 * SQLite четения свършват за един кадър) — показват се само при реално бавни.
 */
export function useDelayedFlag(active: boolean, delayMs = 220): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) { setShown(false); return; }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}

export type LoadingPhase = 'skeleton' | 'pending' | 'ready';

/**
 * Решава какво да рендира екран с данни, без да „мига":
 *  - `skeleton` — има реална забавена заетост (на практика само първоначалния
 *    облачен pull на ново устройство, когато още няма локални редове);
 *  - `pending` — кратък под-delay прозорец на моменталното локално четене →
 *    рендирай нищо (празно), за да не проблесне „все още няма…";
 *  - `ready` — показвай данните или empty състоянието.
 *
 * @param loaded дали първото локално четене е завършило
 * @param isEmpty дали в момента няма какво да се покаже
 */
export function useLoadingState(loaded: boolean, isEmpty: boolean, delayMs = 220): LoadingPhase {
  // Само първият облачен pull (никога не е синхронизирано + тече sync).
  const initialSyncing = useSyncStore((s) => s.status === 'syncing' && s.lastSyncedAt === null);
  const busy = isEmpty && (!loaded || initialSyncing);
  const showSkeleton = useDelayedFlag(busy, delayMs);
  if (showSkeleton) return 'skeleton';
  if (busy) return 'pending';
  return 'ready';
}
