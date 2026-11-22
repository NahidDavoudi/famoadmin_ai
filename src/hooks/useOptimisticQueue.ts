import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type {
  CompletedOptimisticMutation,
  OptimisticQueueSnapshot,
  OptimisticQueueStore,
} from '../lib/optimistic-queue';

export interface UseOptimisticQueueCallbacks<TRecord> {
  /** Fired immediately when any queued create/update succeeds with the server record */
  onCompleted?: (completed: CompletedOptimisticMutation<TRecord>) => void;
  /** Fired (debounced) when the queue drains to 0 pending after at least one success */
  onDrained?: () => void;
}

/**
 * Reusable React hook subscribing any component/page to a module-level
 * OptimisticQueueStore via React 19's `useSyncExternalStore`.
 */
export function useOptimisticQueue<TPayload, TRecord>(
  store: OptimisticQueueStore<TPayload, TRecord>,
  callbacks?: UseOptimisticQueueCallbacks<TRecord>
): OptimisticQueueSnapshot<TPayload, TRecord> {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  const onCompleted = callbacks?.onCompleted;
  const onDrained = callbacks?.onDrained;

  useEffect(() => {
    if (!onCompleted) return;
    return store.subscribeCompleted(onCompleted);
  }, [store, onCompleted]);

  useEffect(() => {
    if (!onDrained) return;
    return store.subscribeDrained(onDrained);
  }, [store, onDrained]);

  return snapshot;
}

/**
 * Reusable localStorage-backed boolean preference for "Keep modal open" checkboxes.
 */
export function useKeepOpenPreference(
  storageKey: string,
  defaultValue = false
): [boolean, (next: boolean) => void] {
  const [keepOpen, setKeepOpenState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === '1' || saved === 'true') return true;
      if (saved === '0' || saved === 'false') return false;
    } catch {
      // Ignore storage restrictions
    }
    return defaultValue;
  });

  const setKeepOpen = useCallback(
    (next: boolean) => {
      setKeepOpenState(next);
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        // Ignore storage restrictions
      }
    },
    [storageKey]
  );

  return [keepOpen, setKeepOpen];
}
