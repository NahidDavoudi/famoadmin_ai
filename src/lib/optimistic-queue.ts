/**
 * Reusable framework-agnostic optimistic mutation queue store.
 *
 * Lives outside React components so closing modals or switching pages never
 * drops in-flight, queued, or failed mutations. Designed to be consumed via
 * `useOptimisticQueue(store)` in any module of the admin panel.
 */

export type OptimisticItemStatus = 'pending' | 'needs_edit' | 'failed';
export type OptimisticOperation = 'create' | 'update';
export type OptimisticErrorKind =
  | 'validation'
  | 'network_pre_send'
  | 'network_ambiguous'
  | 'server_5xx';

export interface OptimisticQueueItem<TPayload, TOptimisticRecord> {
  queueId: string;
  idempotencyKey: string;
  operation: OptimisticOperation;
  /** Real server ID when operation === 'update', null when 'create' */
  targetId: number | null;
  /** Unique negative temporary ID for stable React keys on 'create' */
  tempId: number;
  /** Monotonic submission sequence to preserve exact submission order */
  createdAtSeq: number;
  status: OptimisticItemStatus;
  /** True while the HTTP request for this item is currently active */
  inFlight: boolean;
  payload: TPayload;
  optimisticRecord: TOptimisticRecord;
  errorMessage: string | null;
  errorCode: string | null;
  errorKind: OptimisticErrorKind | null;
  /** True when the request may already have reached and committed on the server */
  isAmbiguous: boolean;
  fieldErrors: Record<string, string>;
  isConsentRequired: boolean;
  /** True if item was restored from sessionStorage and had a File that cannot survive reload */
  hasDetachedFileAfterReload: boolean;
  /** Optional in-memory blob preview URL; revoked automatically when item leaves queue */
  previewUrl: string | null;
  attempts: number;
}

export interface CompletedOptimisticMutation<TRecord> {
  queueId: string;
  operation: OptimisticOperation;
  targetId: number | null;
  tempId: number;
  createdAtSeq: number;
  record: TRecord;
  completedAt: number;
}

export interface OptimisticQueueSnapshot<TPayload, TRecord> {
  items: readonly OptimisticQueueItem<TPayload, TRecord>[];
  pendingCount: number;
  failedCount: number;
  needsEditCount: number;
  totalAttentionCount: number;
  lastAnnouncement: string;
  lastCompleted: CompletedOptimisticMutation<TRecord> | null;
  /** Monotonic version incremented on every state change */
  version: number;
}

export interface ParsedMutationError {
  status: number;
  code: string | null;
  message: string;
  fieldErrors: Record<string, string>;
  isConsentRequired: boolean;
}

export interface ClassifiedMutationError {
  itemStatus: 'needs_edit' | 'failed';
  errorKind: OptimisticErrorKind;
  isAmbiguous: boolean;
  message: string;
  code: string | null;
  fieldErrors: Record<string, string>;
  isConsentRequired: boolean;
}

export interface SerializedQueueItem<TSerializedPayload, TRecord> {
  queueId: string;
  idempotencyKey: string;
  operation: OptimisticOperation;
  targetId: number | null;
  tempId: number;
  createdAtSeq: number;
  status: 'needs_edit' | 'failed';
  payload: TSerializedPayload;
  optimisticRecord: TRecord;
  errorMessage: string | null;
  errorCode: string | null;
  errorKind: OptimisticErrorKind | null;
  isAmbiguous: boolean;
  fieldErrors: Record<string, string>;
  isConsentRequired: boolean;
  hadFile: boolean;
  attempts: number;
}

export interface OptimisticQueueOptions<TPayload, TRecord, TSerializedPayload = TPayload> {
  /** Max concurrent in-flight HTTP requests (default: 2) */
  maxConcurrency?: number;
  /** Per-request timeout in ms before marking as ambiguous timeout failure (default: 25000) */
  requestTimeoutMs?: number;
  /** Debounce delay in ms before calling onQueueDrained after queue empties (default: 1500) */
  drainDebounceMs?: number;
  /** Optional sessionStorage key for persisting failed/needs_edit payloads until tab closes */
  sessionStorageKey?: string;
  /** Enable window beforeunload guard while pending/failed/needs_edit items exist (default: true) */
  enableBeforeUnload?: boolean;
  /** Executes the real network request */
  executor: (
    item: OptimisticQueueItem<TPayload, TRecord>,
    ctx: { idempotencyKey: string; signal: AbortSignal }
  ) => Promise<TRecord>;
  /** Maps raw thrown error into structured API fields */
  parseError: (err: unknown) => ParsedMutationError;
  /** Human-readable label for a queued item used in aria-live announcements */
  getItemLabel: (item: OptimisticQueueItem<TPayload, TRecord>) => string;
  /** Optional serializer to strip non-serializable fields like File before sessionStorage write */
  serializePayload?: (payload: TPayload) => { data: TSerializedPayload; hadFile: boolean };
  /** Optional deserializer to reconstruct payload from sessionStorage */
  deserializePayload?: (data: TSerializedPayload) => TPayload;
  /** Optional cleanup hook when an item is removed/completed (e.g. revoking blob URLs) */
  onCleanupPreviewUrl?: (url: string) => void;
}

export interface OptimisticQueueStore<TPayload, TRecord> {
  getSnapshot: () => OptimisticQueueSnapshot<TPayload, TRecord>;
  subscribe: (listener: () => void) => () => void;
  subscribeCompleted: (
    listener: (completed: CompletedOptimisticMutation<TRecord>) => void
  ) => () => void;
  subscribeDrained: (listener: () => void) => () => void;
  enqueueCreate: (args: {
    payload: TPayload;
    optimisticRecord: TRecord;
    previewUrl?: string | null;
  }) => OptimisticQueueItem<TPayload, TRecord>;
  enqueueUpdate: (args: {
    targetId: number;
    payload: TPayload;
    optimisticRecord: TRecord;
    previewUrl?: string | null;
  }) => OptimisticQueueItem<TPayload, TRecord> | null;
  retry: (queueId: string) => boolean;
  updateAndResubmit: (
    queueId: string,
    args: {
      payload: TPayload;
      optimisticRecord: TRecord;
      previewUrl?: string | null;
    }
  ) => boolean;
  dismiss: (queueId: string) => void;
  isTargetLocked: (targetId: number) => boolean;
  getById: (queueId: string) => OptimisticQueueItem<TPayload, TRecord> | undefined;
  clearAll: () => void;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Classifies a thrown error into validation (`needs_edit`), pre-send network failure
 * (`failed`, non-ambiguous), or ambiguous timeout/network/5xx failure (`failed`, ambiguous).
 */
export function classifyMutationError(
  err: unknown,
  parsed: ParsedMutationError,
  options: { isOffline?: boolean; isTimedOut?: boolean } = {}
): ClassifiedMutationError {
  const isOffline =
    options.isOffline !== undefined
      ? options.isOffline
      : typeof navigator !== 'undefined' && navigator.onLine === false;

  // 1. Server validation / business-rule errors (422, 400, CONSENT_REQUIRED, fieldErrors)
  const hasFieldErrors = Object.keys(parsed.fieldErrors || {}).length > 0;
  if (
    parsed.status === 422 ||
    parsed.status === 400 ||
    parsed.isConsentRequired ||
    parsed.code === 'VALIDATION_ERROR' ||
    hasFieldErrors
  ) {
    return {
      itemStatus: 'needs_edit',
      errorKind: 'validation',
      isAmbiguous: false,
      message: parsed.message || 'اطلاعات واردشده نیازمند اصلاح است',
      code: parsed.code,
      fieldErrors: parsed.fieldErrors,
      isConsentRequired: parsed.isConsentRequired,
    };
  }

  // 2. Explicit 401/403/404 — non-ambiguous, not retryable blindly as ambiguous duplicate
  if (parsed.status === 401 || parsed.status === 403 || parsed.status === 404) {
    return {
      itemStatus: 'failed',
      errorKind: 'network_pre_send',
      isAmbiguous: false,
      message: parsed.message || 'خطای دسترسی یا یافت‌نشدن رکورد',
      code: parsed.code,
      fieldErrors: {},
      isConsentRequired: false,
    };
  }

  // 3. Server 5xx — server may have committed before throwing 5xx/502/504
  if (parsed.status >= 500) {
    return {
      itemStatus: 'failed',
      errorKind: 'server_5xx',
      isAmbiguous: true,
      message: parsed.message || 'خطای داخلی سرور؛ ممکن است عملیات انجام شده باشد',
      code: parsed.code,
      fieldErrors: {},
      isConsentRequired: false,
    };
  }

  // 4. Request timed out after being sent -> ambiguous!
  const errName = (err as Error | null | undefined)?.name || '';
  if (options.isTimedOut || errName === 'AbortError' || errName === 'TimeoutError') {
    return {
      itemStatus: 'failed',
      errorKind: 'network_ambiguous',
      isAmbiguous: true,
      message: 'زمان پاسخ سرور به پایان رسید (Timeout) — ممکن است قبلاً ثبت شده باشد',
      code: 'TIMEOUT',
      fieldErrors: {},
      isConsentRequired: false,
    };
  }

  // 5. Offline before send -> clear pre-send failure (not ambiguous)
  if (isOffline) {
    return {
      itemStatus: 'failed',
      errorKind: 'network_pre_send',
      isAmbiguous: false,
      message: 'اتصال اینترنت قطع است. پس از برقراری اتصال می‌توانید دوباره ارسال کنید.',
      code: 'OFFLINE',
      fieldErrors: {},
      isConsentRequired: false,
    };
  }

  // 6. Online network failure (dropped connection / CORS / reset mid-flight) -> ambiguous!
  return {
    itemStatus: 'failed',
    errorKind: 'network_ambiguous',
    isAmbiguous: true,
    message:
      parsed.message && parsed.message !== 'Failed to fetch'
        ? parsed.message
        : 'خطا در ارتباط با سرور پس از ارسال درخواست — ممکن است قبلاً ثبت شده باشد',
    code: parsed.code || 'NETWORK_ERROR',
    fieldErrors: {},
    isConsentRequired: false,
  };
}

export function createOptimisticQueueStore<TPayload, TRecord, TSerializedPayload = TPayload>(
  options: OptimisticQueueOptions<TPayload, TRecord, TSerializedPayload>
): OptimisticQueueStore<TPayload, TRecord> {
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? 2);
  const requestTimeoutMs = Math.max(1000, options.requestTimeoutMs ?? 25_000);
  const drainDebounceMs = Math.max(0, options.drainDebounceMs ?? 1500);
  const enableBeforeUnload = options.enableBeforeUnload !== false;

  let items: OptimisticQueueItem<TPayload, TRecord>[] = [];
  let seqCounter = 0;
  let tempIdCounter = -1;
  let activeCount = 0;
  let version = 0;
  let lastAnnouncement = '';
  let lastCompleted: CompletedOptimisticMutation<TRecord> | null = null;
  let hadSuccessSinceDrain = false;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  let beforeUnloadBound = false;

  const listeners = new Set<() => void>();
  const completedListeners = new Set<(c: CompletedOptimisticMutation<TRecord>) => void>();
  const drainedListeners = new Set<() => void>();

  const revokePreview = (url: string | null | undefined) => {
    if (!url) return;
    if (options.onCleanupPreviewUrl) {
      options.onCleanupPreviewUrl(url);
    } else if (url.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(url);
    }
  };

  const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
    const hasUnfinished = items.length > 0;
    if (!hasUnfinished) return;
    event.preventDefault();
    event.returnValue = '';
  };

  const syncBeforeUnloadGuard = () => {
    if (!enableBeforeUnload || typeof window === 'undefined') return;
    const shouldGuard = items.length > 0;
    if (shouldGuard && !beforeUnloadBound) {
      window.addEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadBound = true;
    } else if (!shouldGuard && beforeUnloadBound) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadBound = false;
    }
  };

  const persistFailedItems = () => {
    if (!options.sessionStorageKey || typeof sessionStorage === 'undefined') return;
    try {
      const toSave = items.filter((it) => it.status === 'failed' || it.status === 'needs_edit');
      if (toSave.length === 0) {
        sessionStorage.removeItem(options.sessionStorageKey);
        return;
      }
      const serialized: SerializedQueueItem<TSerializedPayload, TRecord>[] = toSave.map((it) => {
        const payloadPack = options.serializePayload
          ? options.serializePayload(it.payload)
          : { data: it.payload as unknown as TSerializedPayload, hadFile: false };
        return {
          queueId: it.queueId,
          idempotencyKey: it.idempotencyKey,
          operation: it.operation,
          targetId: it.targetId,
          tempId: it.tempId,
          createdAtSeq: it.createdAtSeq,
          status: it.status as 'failed' | 'needs_edit',
          payload: payloadPack.data,
          optimisticRecord: it.optimisticRecord,
          errorMessage: it.errorMessage,
          errorCode: it.errorCode,
          errorKind: it.errorKind,
          isAmbiguous: it.isAmbiguous,
          fieldErrors: it.fieldErrors,
          isConsentRequired: it.isConsentRequired,
          hadFile: payloadPack.hadFile || it.hasDetachedFileAfterReload,
          attempts: it.attempts,
        };
      });
      sessionStorage.setItem(options.sessionStorageKey, JSON.stringify(serialized));
    } catch {
      // Ignore storage quota/security errors
    }
  };

  const restorePersistedItems = () => {
    if (!options.sessionStorageKey || typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(options.sessionStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SerializedQueueItem<TSerializedPayload, TRecord>[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      items = parsed.map((saved) => {
        seqCounter = Math.max(seqCounter, Number(saved.createdAtSeq) || 0);
        if (saved.tempId < 0) {
          tempIdCounter = Math.min(tempIdCounter, saved.tempId - 1);
        }
        const restoredPayload = options.deserializePayload
          ? options.deserializePayload(saved.payload)
          : (saved.payload as unknown as TPayload);
        return {
          queueId: saved.queueId || generateUuid(),
          idempotencyKey: saved.idempotencyKey || generateUuid(),
          operation: saved.operation === 'update' ? 'update' : 'create',
          targetId: saved.targetId ?? null,
          tempId: saved.tempId ?? tempIdCounter--,
          createdAtSeq: saved.createdAtSeq || ++seqCounter,
          status: saved.status === 'needs_edit' ? 'needs_edit' : 'failed',
          inFlight: false,
          payload: restoredPayload,
          optimisticRecord: saved.optimisticRecord,
          errorMessage: saved.errorMessage ?? null,
          errorCode: saved.errorCode ?? null,
          errorKind: saved.errorKind ?? null,
          isAmbiguous: Boolean(saved.isAmbiguous),
          fieldErrors: saved.fieldErrors ?? {},
          isConsentRequired: Boolean(saved.isConsentRequired),
          hasDetachedFileAfterReload: Boolean(saved.hadFile),
          previewUrl: null,
          attempts: saved.attempts || 1,
        };
      });
      syncBeforeUnloadGuard();
    } catch {
      // Ignore malformed storage
    }
  };

  restorePersistedItems();

  const buildSnapshot = (): OptimisticQueueSnapshot<TPayload, TRecord> => {
    let pendingCount = 0;
    let failedCount = 0;
    let needsEditCount = 0;
    for (const item of items) {
      if (item.status === 'pending') pendingCount += 1;
      else if (item.status === 'failed') failedCount += 1;
      else if (item.status === 'needs_edit') needsEditCount += 1;
    }
    return {
      items,
      pendingCount,
      failedCount,
      needsEditCount,
      totalAttentionCount: failedCount + needsEditCount,
      lastAnnouncement,
      lastCompleted,
      version,
    };
  };

  let snapshot = buildSnapshot();

  const emit = (announcement?: string) => {
    if (announcement !== undefined) {
      lastAnnouncement = announcement;
    }
    version += 1;
    items = [...items].sort((a, b) => a.createdAtSeq - b.createdAtSeq);
    snapshot = buildSnapshot();
    persistFailedItems();
    syncBeforeUnloadGuard();
    for (const listener of listeners) {
      listener();
    }
  };

  const scheduleDrainIfIdle = () => {
    const hasPending = items.some((it) => it.status === 'pending');
    if (hasPending || activeCount > 0 || !hadSuccessSinceDrain) return;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(() => {
      drainTimer = null;
      const stillPending = items.some((it) => it.status === 'pending');
      if (stillPending || activeCount > 0) return;
      hadSuccessSinceDrain = false;
      for (const listener of drainedListeners) {
        listener();
      }
    }, drainDebounceMs);
  };

  const runItem = async (queueId: string) => {
    const item = items.find((it) => it.queueId === queueId);
    if (!item || item.status !== 'pending' || item.inFlight) return;

    item.inFlight = true;
    item.attempts += 1;
    activeCount += 1;
    emit();

    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    try {
      const serverRecord = await options.executor(item, {
        idempotencyKey: item.idempotencyKey,
        signal: controller.signal,
      });
      clearTimeout(timeoutHandle);

      // Item might have been dismissed while in flight
      const existing = items.find((it) => it.queueId === queueId);
      if (existing) {
        revokePreview(existing.previewUrl);
        items = items.filter((it) => it.queueId !== queueId);
      }

      const completed: CompletedOptimisticMutation<TRecord> = {
        queueId: item.queueId,
        operation: item.operation,
        targetId: item.targetId,
        tempId: item.tempId,
        createdAtSeq: item.createdAtSeq,
        record: serverRecord,
        completedAt: Date.now(),
      };
      lastCompleted = completed;
      hadSuccessSinceDrain = true;

      const label = options.getItemLabel(item);
      emit(`ذخیره «${label}» با موفقیت انجام شد.`);
      for (const listener of completedListeners) {
        listener(completed);
      }
    } catch (err) {
      clearTimeout(timeoutHandle);
      const parsed = options.parseError(err);
      const classified = classifyMutationError(err, parsed, { isTimedOut: timedOut });

      const current = items.find((it) => it.queueId === queueId);
      if (current) {
        current.inFlight = false;
        current.status = classified.itemStatus;
        current.errorMessage = classified.message;
        current.errorCode = classified.code;
        current.errorKind = classified.errorKind;
        current.isAmbiguous = classified.isAmbiguous;
        current.fieldErrors = classified.fieldErrors;
        current.isConsentRequired = classified.isConsentRequired;

        const label = options.getItemLabel(current);
        const announcement =
          classified.itemStatus === 'needs_edit'
            ? `ثبت «${label}» نیازمند ویرایش است: ${classified.message}`
            : `ثبت «${label}» ناموفق بود: ${classified.message}`;
        emit(announcement);
      }
    } finally {
      activeCount = Math.max(0, activeCount - 1);
      pump();
      scheduleDrainIfIdle();
    }
  };

  const pump = () => {
    if (activeCount >= maxConcurrency) return;
    while (activeCount < maxConcurrency) {
      const next = items.find((it) => it.status === 'pending' && !it.inFlight);
      if (!next) break;
      void runItem(next.queueId);
    }
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    subscribeCompleted: (listener) => {
      completedListeners.add(listener);
      return () => {
        completedListeners.delete(listener);
      };
    },

    subscribeDrained: (listener) => {
      drainedListeners.add(listener);
      return () => {
        drainedListeners.delete(listener);
      };
    },

    enqueueCreate: ({ payload, optimisticRecord, previewUrl = null }) => {
      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }
      const item: OptimisticQueueItem<TPayload, TRecord> = {
        queueId: generateUuid(),
        idempotencyKey: generateUuid(),
        operation: 'create',
        targetId: null,
        tempId: tempIdCounter--,
        createdAtSeq: ++seqCounter,
        status: 'pending',
        inFlight: false,
        payload,
        optimisticRecord,
        errorMessage: null,
        errorCode: null,
        errorKind: null,
        isAmbiguous: false,
        fieldErrors: {},
        isConsentRequired: false,
        hasDetachedFileAfterReload: false,
        previewUrl,
        attempts: 0,
      };
      items = [...items, item];
      emit(`«${options.getItemLabel(item)}» در صف ذخیره قرار گرفت.`);
      pump();
      return item;
    },

    enqueueUpdate: ({ targetId, payload, optimisticRecord, previewUrl = null }) => {
      // Prevent concurrent edit of a record that already has a pending update
      const locked = items.some(
        (it) => it.operation === 'update' && it.targetId === targetId && it.status === 'pending'
      );
      if (locked) return null;

      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }

      // Replace any older failed/needs_edit entry for the same targetId
      const previous = items.find((it) => it.operation === 'update' && it.targetId === targetId);
      if (previous) {
        revokePreview(previous.previewUrl);
        items = items.filter((it) => it.queueId !== previous.queueId);
      }

      const item: OptimisticQueueItem<TPayload, TRecord> = {
        queueId: generateUuid(),
        idempotencyKey: generateUuid(),
        operation: 'update',
        targetId,
        tempId: targetId,
        createdAtSeq: ++seqCounter,
        status: 'pending',
        inFlight: false,
        payload,
        optimisticRecord,
        errorMessage: null,
        errorCode: null,
        errorKind: null,
        isAmbiguous: false,
        fieldErrors: {},
        isConsentRequired: false,
        hasDetachedFileAfterReload: false,
        previewUrl,
        attempts: 0,
      };
      items = [...items, item];
      emit(`ویرایش «${options.getItemLabel(item)}» در صف ذخیره قرار گرفت.`);
      pump();
      return item;
    },

    retry: (queueId) => {
      const target = items.find((it) => it.queueId === queueId);
      if (!target || target.status !== 'failed') return false;

      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }

      // Preserve the EXACT same payload and idempotencyKey on retry
      target.status = 'pending';
      target.inFlight = false;
      target.errorMessage = null;
      target.errorCode = null;
      target.errorKind = null;
      target.isAmbiguous = false;
      emit(`ارسال مجدد «${options.getItemLabel(target)}» آغاز شد.`);
      pump();
      return true;
    },

    updateAndResubmit: (queueId, { payload, optimisticRecord, previewUrl }) => {
      const target = items.find((it) => it.queueId === queueId);
      if (!target || target.status === 'pending') return false;

      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }

      if (previewUrl !== undefined && previewUrl !== target.previewUrl) {
        revokePreview(target.previewUrl);
        target.previewUrl = previewUrl;
      }

      // Payload changed -> fresh idempotencyKey
      target.idempotencyKey = generateUuid();
      target.payload = payload;
      target.optimisticRecord = optimisticRecord;
      target.status = 'pending';
      target.inFlight = false;
      target.errorMessage = null;
      target.errorCode = null;
      target.errorKind = null;
      target.isAmbiguous = false;
      target.fieldErrors = {};
      target.isConsentRequired = false;
      target.hasDetachedFileAfterReload = false;

      emit(`ارسال مجدد «${options.getItemLabel(target)}» پس از ویرایش آغاز شد.`);
      pump();
      return true;
    },

    dismiss: (queueId) => {
      const target = items.find((it) => it.queueId === queueId);
      if (!target) return;
      revokePreview(target.previewUrl);
      items = items.filter((it) => it.queueId !== queueId);
      emit(`«${options.getItemLabel(target)}» از صف حذف شد.`);
    },

    isTargetLocked: (targetId) =>
      items.some(
        (it) => it.operation === 'update' && it.targetId === targetId && it.status === 'pending'
      ),

    getById: (queueId) => items.find((it) => it.queueId === queueId),

    clearAll: () => {
      if (drainTimer) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }
      for (const it of items) {
        revokePreview(it.previewUrl);
      }
      items = [];
      hadSuccessSinceDrain = false;
      emit('');
    },
  };
}
