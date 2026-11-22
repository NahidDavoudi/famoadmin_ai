import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMutationError,
  createOptimisticQueueStore,
  type CompletedOptimisticMutation,
} from './optimistic-queue';
import {
  findPossibleDuplicateAdmission,
  matchesAdmissionFilters,
} from './admissions-queue';
import type { AdmissionRecord } from '../types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('createOptimisticQueueStore enforces maxConcurrency=2 and preserves submission order', async () => {
  let active = 0;
  let peakActive = 0;
  const sentHeaders: string[] = [];
  const completedOrder: number[] = [];

  const store = createOptimisticQueueStore<{ name: string }, { id: number; name: string }>({
    maxConcurrency: 2,
    drainDebounceMs: 30,
    enableBeforeUnload: false,
    executor: async (item, { idempotencyKey }) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      sentHeaders.push(idempotencyKey);
      // Make item #1 slower than #2 to verify submission order is preserved
      await delay(item.payload.name === 'A' ? 60 : 20);
      active -= 1;
      return { id: 100 + item.createdAtSeq, name: item.payload.name };
    },
    parseError: (err) => ({
      status: 0,
      code: null,
      message: (err as Error)?.message || 'error',
      fieldErrors: {},
      isConsentRequired: false,
    }),
    getItemLabel: (it) => it.payload.name,
  });

  let drainedCalls = 0;
  store.subscribeCompleted((c: CompletedOptimisticMutation<{ id: number; name: string }>) => {
    completedOrder.push(c.createdAtSeq);
  });
  store.subscribeDrained(() => {
    drainedCalls += 1;
  });

  store.enqueueCreate({ payload: { name: 'A' }, optimisticRecord: { id: -1, name: 'A' } });
  store.enqueueCreate({ payload: { name: 'B' }, optimisticRecord: { id: -2, name: 'B' } });
  store.enqueueCreate({ payload: { name: 'C' }, optimisticRecord: { id: -3, name: 'C' } });
  store.enqueueCreate({ payload: { name: 'D' }, optimisticRecord: { id: -4, name: 'D' } });

  // Immediately after enqueue: 4 pending items in exact submission order A, B, C, D
  const snap = store.getSnapshot();
  assert.equal(snap.pendingCount, 4);
  assert.deepEqual(
    snap.items.map((i) => i.payload.name),
    ['A', 'B', 'C', 'D']
  );

  await delay(180);

  assert.equal(peakActive, 2);
  assert.equal(store.getSnapshot().pendingCount, 0);
  assert.equal(completedOrder.length, 4);
  assert.equal(new Set(sentHeaders).size, 4);
  assert.equal(drainedCalls, 1);
});

test('classifyMutationError distinguishes 422 validation, offline pre-send, timeout ambiguous, and 5xx', () => {
  const val = classifyMutationError(
    new Error('validation'),
    {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'عنوان الزامی است',
      fieldErrors: { admission_title: 'عنوان الزامی است' },
      isConsentRequired: false,
    },
    { isOffline: false }
  );
  assert.equal(val.itemStatus, 'needs_edit');
  assert.equal(val.errorKind, 'validation');
  assert.equal(val.isAmbiguous, false);

  const offline = classifyMutationError(
    new TypeError('Failed to fetch'),
    { status: 0, code: null, message: 'Failed to fetch', fieldErrors: {}, isConsentRequired: false },
    { isOffline: true }
  );
  assert.equal(offline.itemStatus, 'failed');
  assert.equal(offline.errorKind, 'network_pre_send');
  assert.equal(offline.isAmbiguous, false);

  const timeout = classifyMutationError(
    Object.assign(new Error('Aborted'), { name: 'AbortError' }),
    { status: 0, code: null, message: 'Aborted', fieldErrors: {}, isConsentRequired: false },
    { isOffline: false, isTimedOut: true }
  );
  assert.equal(timeout.itemStatus, 'failed');
  assert.equal(timeout.errorKind, 'network_ambiguous');
  assert.equal(timeout.isAmbiguous, true);

  const srv500 = classifyMutationError(
    new Error('Internal Server Error'),
    { status: 502, code: 'SERVER_ERROR', message: 'Bad Gateway', fieldErrors: {}, isConsentRequired: false },
    { isOffline: false }
  );
  assert.equal(srv500.itemStatus, 'failed');
  assert.equal(srv500.errorKind, 'server_5xx');
  assert.equal(srv500.isAmbiguous, true);
});

test('retry preserves exact Idempotency-Key while updateAndResubmit rotates Idempotency-Key', async () => {
  const keysUsed: string[] = [];
  let mode: 'fail_network' | 'fail_422' | 'succeed' = 'fail_network';

  const store = createOptimisticQueueStore<{ name: string }, { id: number; name: string }>({
    maxConcurrency: 2,
    drainDebounceMs: 10,
    enableBeforeUnload: false,
    executor: async (item, { idempotencyKey }) => {
      keysUsed.push(idempotencyKey);
      if (mode === 'fail_network') {
        const err = Object.assign(new Error('Server 503'), { status: 503 });
        throw err;
      }
      if (mode === 'fail_422') {
        const err = Object.assign(new Error('Validation'), { status: 422 });
        throw err;
      }
      return { id: 77, name: item.payload.name };
    },
    parseError: (err) => {
      const status = Number((err as { status?: number })?.status || 0);
      return {
        status,
        code: status === 422 ? 'VALIDATION_ERROR' : null,
        message: (err as Error)?.message || 'error',
        fieldErrors: status === 422 ? { name: 'نام نامعتبر است' } : {},
        isConsentRequired: false,
      };
    },
    getItemLabel: (it) => it.payload.name,
  });

  const item = store.enqueueCreate({
    payload: { name: 'آرش' },
    optimisticRecord: { id: -1, name: 'آرش' },
  });
  await delay(30);

  assert.equal(store.getSnapshot().failedCount, 1);
  assert.equal(store.getById(item.queueId)?.isAmbiguous, true);

  // Retry -> must reuse the EXACT same Idempotency-Key
  mode = 'fail_422';
  assert.equal(store.retry(item.queueId), true);
  await delay(30);
  assert.equal(keysUsed[0], keysUsed[1]);
  assert.equal(store.getSnapshot().needsEditCount, 1);
  // Cannot blindly retry a needs_edit item
  assert.equal(store.retry(item.queueId), false);

  // Edit & resubmit -> rotates Idempotency-Key and succeeds
  mode = 'succeed';
  assert.equal(
    store.updateAndResubmit(item.queueId, {
      payload: { name: 'آرش کریمی' },
      optimisticRecord: { id: -1, name: 'آرش کریمی' },
    }),
    true
  );
  await delay(30);
  assert.notEqual(keysUsed[1], keysUsed[2]);
  assert.equal(store.getSnapshot().items.length, 0);
});

test('enqueueUpdate locks target record while pending and unlocks after completion', async () => {
  const store = createOptimisticQueueStore<{ name: string }, { id: number; name: string }>({
    maxConcurrency: 2,
    drainDebounceMs: 10,
    enableBeforeUnload: false,
    executor: async (item) => {
      await delay(50);
      return { id: item.targetId!, name: item.payload.name };
    },
    parseError: () => ({
      status: 0,
      code: null,
      message: 'err',
      fieldErrors: {},
      isConsentRequired: false,
    }),
    getItemLabel: (it) => it.payload.name,
  });

  const first = store.enqueueUpdate({
    targetId: 42,
    payload: { name: 'ویرایش ۱' },
    optimisticRecord: { id: 42, name: 'ویرایش ۱' },
  });
  assert.ok(first);
  assert.equal(store.isTargetLocked(42), true);

  // Concurrent edit on same targetId is rejected
  const second = store.enqueueUpdate({
    targetId: 42,
    payload: { name: 'ویرایش ۲' },
    optimisticRecord: { id: 42, name: 'ویرایش ۲' },
  });
  assert.equal(second, null);

  await delay(80);
  assert.equal(store.isTargetLocked(42), false);
});

test('matchesAdmissionFilters and findPossibleDuplicateAdmission work accurately', () => {
  const rec: AdmissionRecord = {
    id: 10,
    student_name: 'سارا محمدی',
    year: 1404,
    exam_type: 'konkur',
    field: 'تجربی',
    admission_title: 'پزشکی دانشگاه تهران',
    rank: '120',
    display_order: 1,
    photo_url: null,
    status: 'published',
    consent_obtained: true,
  };

  assert.equal(matchesAdmissionFilters(rec, { search: '', year: '', status: '', page: 1 }), true);
  assert.equal(matchesAdmissionFilters(rec, { search: '', year: '1403', status: '', page: 1 }), false);
  assert.equal(matchesAdmissionFilters(rec, { search: '', year: '', status: 'draft', page: 1 }), false);
  assert.equal(matchesAdmissionFilters(rec, { search: 'شریف', year: '', status: '', page: 1 }), false);
  assert.equal(matchesAdmissionFilters(rec, { search: 'سارا', year: '1404', status: 'published', page: 1 }), true);
  assert.equal(matchesAdmissionFilters(rec, { search: '', year: '', status: '', page: 2 }), false);

  const dup = findPossibleDuplicateAdmission(
    {
      student_name: '  سارا   محمدي ',
      year: 1404,
      admission_title: 'پزشکی دانشگاه تهران',
    },
    [rec]
  );
  assert.equal(dup?.id, 10);

  const noDup = findPossibleDuplicateAdmission(
    {
      student_name: 'سارا محمدی',
      year: 1405,
      admission_title: 'پزشکی دانشگاه تهران',
    },
    [rec]
  );
  assert.equal(noDup, null);
});
