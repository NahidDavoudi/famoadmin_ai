import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiPagination, SortOrder } from '../types';

export interface TableSortColumnOption<K extends string = string> {
  key: K;
  label: string;
  defaultOrder?: SortOrder;
  hint?: string;
}

export interface TableSortState<K extends string = string> {
  sort: K;
  order: SortOrder;
  page: number;
}

export interface TableSortConfig<K extends string = string> {
  allowedKeys: readonly K[];
  defaultSort: K;
  defaultOrder: SortOrder;
  columns: readonly TableSortColumnOption<K>[];
  paginationParam?: 'perPage' | 'per_page';
  syncUrl?: boolean;
  /** Only active view reads/writes URL query params when multiple tables share a page */
  isActive?: boolean;
}

export interface TableSortControls<K extends string = string> {
  sort: K;
  order: SortOrder;
  page: number;
  allowedKeys: readonly K[];
  options: readonly TableSortColumnOption<K>[];
  toggleSort: (key: K) => void;
  setSortKey: (key: K) => void;
  toggleDirection: () => void;
  setPage: (nextPage: number) => void;
  resetPage: () => void;
  syncFromResponse: (pagination?: ApiPagination | null) => void;
  getAriaSort: (key: string) => 'ascending' | 'descending' | 'none';
  startRequest: () => { seq: number; signal: AbortSignal; isLatest: () => boolean };
}

export function normalizeSortOrder(
  value: unknown,
  fallback: SortOrder = 'desc'
): SortOrder {
  if (typeof value !== 'string') return fallback;
  const lowered = value.trim().toLowerCase();
  if (lowered === 'asc' || lowered === 'desc') return lowered;
  return fallback;
}

export function normalizePage(value: unknown, fallback = 1): number {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    return fallback;
  }
  return num;
}

export function isAllowedSortKey<K extends string>(
  value: unknown,
  allowedKeys: readonly K[]
): value is K {
  return typeof value === 'string' && (allowedKeys as readonly string[]).includes(value);
}

export function getColumnDefaultOrder<K extends string>(
  key: K,
  config: Pick<TableSortConfig<K>, 'columns' | 'defaultOrder'>
): SortOrder {
  const col = config.columns.find((c) => c.key === key);
  return col?.defaultOrder ?? config.defaultOrder;
}

export function resolveSortStateFromSearch<K extends string>(
  searchString: string,
  config: Pick<TableSortConfig<K>, 'allowedKeys' | 'defaultSort' | 'defaultOrder'>
): TableSortState<K> {
  const params = new URLSearchParams(searchString.startsWith('?') ? searchString : `?${searchString}`);
  const rawSort = params.get('sort');
  const rawOrder = params.get('order');
  const rawPage = params.get('page');

  const sortValid = isAllowedSortKey(rawSort, config.allowedKeys);
  const sort = sortValid ? rawSort : config.defaultSort;
  // If sort in URL was invalid, ignore URL order too and fall back to defaults
  const order = sortValid
    ? normalizeSortOrder(rawOrder, config.defaultOrder)
    : config.defaultOrder;
  const page = normalizePage(rawPage, 1);

  return { sort, order, page };
}

export function computeNextSortState<K extends string>(
  current: TableSortState<K>,
  clickedKey: K,
  config: Pick<TableSortConfig<K>, 'allowedKeys' | 'columns' | 'defaultOrder'>
): TableSortState<K> {
  if (!isAllowedSortKey(clickedKey, config.allowedKeys)) {
    return current;
  }

  if (current.sort === clickedKey) {
    return {
      sort: clickedKey,
      order: current.order === 'asc' ? 'desc' : 'asc',
      page: 1,
    };
  }

  return {
    sort: clickedKey,
    order: getColumnDefaultOrder(clickedKey, config),
    page: 1,
  };
}

export function reconcileServerPaginationSort<K extends string>(
  current: TableSortState<K>,
  pagination: ApiPagination | null | undefined,
  config: Pick<TableSortConfig<K>, 'allowedKeys' | 'defaultOrder'>
): TableSortState<K> {
  if (!pagination) return current;

  const nextSort = isAllowedSortKey(pagination.sort, config.allowedKeys)
    ? pagination.sort
    : current.sort;
  const nextOrder =
    pagination.order !== undefined && pagination.order !== null
      ? normalizeSortOrder(pagination.order, current.order)
      : current.order;

  if (nextSort === current.sort && nextOrder === current.order) {
    return current;
  }

  return {
    ...current,
    sort: nextSort,
    order: nextOrder,
  };
}

export function buildSearchWithSortState(
  currentSearch: string,
  state: TableSortState<string>
): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch
  );
  params.set('sort', state.sort);
  params.set('order', state.order);
  params.set('page', String(normalizePage(state.page, 1)));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface RequestGuard {
  start: () => { seq: number; signal: AbortSignal; isLatest: () => boolean };
  abortCurrent: () => void;
  getCurrentSeq: () => number;
}

export function createRequestGuard(): RequestGuard {
  let seq = 0;
  let controller: AbortController | null = null;

  return {
    start() {
      seq += 1;
      const mySeq = seq;
      if (controller) {
        controller.abort();
      }
      controller = new AbortController();
      return {
        seq: mySeq,
        signal: controller.signal,
        isLatest: () => mySeq === seq,
      };
    },
    abortCurrent() {
      seq += 1;
      if (controller) {
        controller.abort();
        controller = null;
      }
    },
    getCurrentSeq() {
      return seq;
    },
  };
}

export function useTableSort<K extends string>(
  config: TableSortConfig<K>,
  onStateChange?: (next: TableSortState<K>) => void
): TableSortControls<K> {
  const syncUrl = config.syncUrl !== false;
  const isActive = config.isActive !== false;

  const [state, setState] = useState<TableSortState<K>>(() => {
    if (syncUrl && isActive && typeof window !== 'undefined') {
      return resolveSortStateFromSearch(window.location.search, config);
    }
    return {
      sort: config.defaultSort,
      order: config.defaultOrder,
      page: 1,
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const guardRef = useRef<RequestGuard | null>(null);
  if (!guardRef.current) {
    guardRef.current = createRequestGuard();
  }

  useEffect(() => {
    return () => {
      guardRef.current?.abortCurrent();
    };
  }, []);

  const writeUrl = useCallback(
    (next: TableSortState<K>) => {
      if (!syncUrl || !isActive || typeof window === 'undefined') return;
      const nextSearch = buildSearchWithSortState(window.location.search, next);
      const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    },
    [syncUrl, isActive]
  );

  // Sync URL on mount or when this table becomes active
  useEffect(() => {
    if (!syncUrl || !isActive || typeof window === 'undefined') return;
    const resolved = resolveSortStateFromSearch(window.location.search, config);
    const cur = stateRef.current;
    if (
      resolved.sort !== cur.sort ||
      resolved.order !== cur.order ||
      resolved.page !== cur.page
    ) {
      // Only adopt URL params if URL actually had a valid sort for this table;
      // otherwise preserve current table state and reflect it in URL.
      const urlParams = new URLSearchParams(window.location.search);
      if (isAllowedSortKey(urlParams.get('sort'), config.allowedKeys)) {
        stateRef.current = resolved;
        setState(resolved);
      }
    }
    writeUrl(stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, syncUrl]);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (!syncUrl || !isActive || typeof window === 'undefined') return;
    const handlePopState = () => {
      const next = resolveSortStateFromSearch(window.location.search, config);
      stateRef.current = next;
      setState(next);
      onStateChangeRef.current?.(next);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, syncUrl]);

  const applyNextState = useCallback(
    (next: TableSortState<K>, triggerCallback = true) => {
      stateRef.current = next;
      setState(next);
      writeUrl(next);
      if (triggerCallback) {
        onStateChangeRef.current?.(next);
      }
    },
    [writeUrl]
  );

  const toggleSort = useCallback(
    (key: K) => {
      const next = computeNextSortState(stateRef.current, key, config);
      applyNextState(next, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyNextState]
  );

  const setSortKey = useCallback(
    (key: K) => {
      if (!isAllowedSortKey(key, config.allowedKeys)) return;
      const next: TableSortState<K> = {
        sort: key,
        order:
          key === stateRef.current.sort
            ? stateRef.current.order
            : getColumnDefaultOrder(key, config),
        page: 1,
      };
      applyNextState(next, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyNextState]
  );

  const toggleDirection = useCallback(() => {
    const next: TableSortState<K> = {
      ...stateRef.current,
      order: stateRef.current.order === 'asc' ? 'desc' : 'asc',
      page: 1,
    };
    applyNextState(next, true);
  }, [applyNextState]);

  const setPage = useCallback(
    (nextPage: number) => {
      const normalized = normalizePage(nextPage, 1);
      const next: TableSortState<K> = {
        ...stateRef.current,
        page: normalized,
      };
      applyNextState(next, false);
    },
    [applyNextState]
  );

  const resetPage = useCallback(() => {
    if (stateRef.current.page === 1) return;
    const next: TableSortState<K> = {
      ...stateRef.current,
      page: 1,
    };
    stateRef.current = next;
    setState(next);
    writeUrl(next);
  }, [writeUrl]);

  const syncFromResponse = useCallback(
    (pagination?: ApiPagination | null) => {
      if (!pagination) return;
      const reconciled = reconcileServerPaginationSort(stateRef.current, pagination, config);
      if (
        reconciled.sort !== stateRef.current.sort ||
        reconciled.order !== stateRef.current.order
      ) {
        stateRef.current = reconciled;
        setState(reconciled);
        writeUrl(reconciled);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [writeUrl]
  );

  const getAriaSort = useCallback(
    (key: string): 'ascending' | 'descending' | 'none' => {
      if (state.sort !== key) return 'none';
      return state.order === 'asc' ? 'ascending' : 'descending';
    },
    [state.sort, state.order]
  );

  const startRequest = useCallback(() => {
    return guardRef.current!.start();
  }, []);

  return useMemo(
    () => ({
      sort: state.sort,
      order: state.order,
      page: state.page,
      allowedKeys: config.allowedKeys,
      options: config.columns,
      toggleSort,
      setSortKey,
      toggleDirection,
      setPage,
      resetPage,
      syncFromResponse,
      getAriaSort,
      startRequest,
    }),
    [
      state.sort,
      state.order,
      state.page,
      config.allowedKeys,
      config.columns,
      toggleSort,
      setSortKey,
      toggleDirection,
      setPage,
      resetPage,
      syncFromResponse,
      getAriaSort,
      startRequest,
    ]
  );
}
