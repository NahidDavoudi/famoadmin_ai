import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchWithSortState,
  computeNextSortState,
  createRequestGuard,
  reconcileServerPaginationSort,
  resolveSortStateFromSearch,
  type TableSortConfig,
} from './table-sort';

type StudentKey = 'created_at' | 'name' | 'grade' | 'field' | 'status';

const STUDENTS_CONFIG: TableSortConfig<StudentKey> = {
  allowedKeys: ['created_at', 'name', 'grade', 'field', 'status'],
  defaultSort: 'created_at',
  defaultOrder: 'desc',
  columns: [
    { key: 'created_at', label: 'تاریخ ثبت‌نام', defaultOrder: 'desc' },
    { key: 'name', label: 'نام', defaultOrder: 'asc' },
    { key: 'grade', label: 'پایه', defaultOrder: 'asc' },
    { key: 'field', label: 'رشته', defaultOrder: 'asc' },
    { key: 'status', label: 'وضعیت', defaultOrder: 'desc' },
  ],
};

test('computeNextSortState toggles active column direction and resets page to 1', () => {
  const initial = { sort: 'created_at' as StudentKey, order: 'desc' as const, page: 4 };

  // Clicking active column toggles desc -> asc and resets page to 1
  const toggled = computeNextSortState(initial, 'created_at', STUDENTS_CONFIG);
  assert.deepEqual(toggled, { sort: 'created_at', order: 'asc', page: 1 });

  // Clicking again toggles asc -> desc
  const toggledBack = computeNextSortState(toggled, 'created_at', STUDENTS_CONFIG);
  assert.deepEqual(toggledBack, { sort: 'created_at', order: 'desc', page: 1 });

  // Clicking a different whitelisted column switches to its defaultOrder and resets page to 1
  const switched = computeNextSortState(
    { sort: 'created_at', order: 'desc', page: 3 },
    'name',
    STUDENTS_CONFIG
  );
  assert.deepEqual(switched, { sort: 'name', order: 'asc', page: 1 });

  // Clicking an unknown non-whitelisted key is ignored
  const ignored = computeNextSortState(switched, 'hacked_col' as StudentKey, STUDENTS_CONFIG);
  assert.deepEqual(ignored, switched);
});

test('resolveSortStateFromSearch restores valid URL params and falls back on invalid values', () => {
  const valid = resolveSortStateFromSearch('?tab=students&sort=grade&order=asc&page=3', STUDENTS_CONFIG);
  assert.deepEqual(valid, { sort: 'grade', order: 'asc', page: 3 });

  // Invalid sort key falls back to defaultSort and defaultOrder
  const invalidSort = resolveSortStateFromSearch('?sort=unknown_col&order=asc&page=2', STUDENTS_CONFIG);
  assert.deepEqual(invalidSort, { sort: 'created_at', order: 'desc', page: 2 });

  // Invalid order & negative page fall back safely
  const invalidOrderAndPage = resolveSortStateFromSearch(
    '?sort=name&order=sideways&page=-5',
    STUDENTS_CONFIG
  );
  assert.deepEqual(invalidOrderAndPage, { sort: 'name', order: 'desc', page: 1 });

  // Non-numeric page falls back to 1
  const nanPage = resolveSortStateFromSearch('?sort=name&order=asc&page=abc', STUDENTS_CONFIG);
  assert.deepEqual(nanPage, { sort: 'name', order: 'asc', page: 1 });
});

test('buildSearchWithSortState preserves unrelated query parameters', () => {
  const next = buildSearchWithSortState('?tab=students&foo=bar&sort=created_at&page=3', {
    sort: 'name',
    order: 'asc',
    page: 1,
  });
  const params = new URLSearchParams(next);
  assert.equal(params.get('tab'), 'students');
  assert.equal(params.get('foo'), 'bar');
  assert.equal(params.get('sort'), 'name');
  assert.equal(params.get('order'), 'asc');
  assert.equal(params.get('page'), '1');
});

test('reconcileServerPaginationSort syncs active UI to valid server pagination metadata only', () => {
  const current = { sort: 'name' as StudentKey, order: 'asc' as const, page: 1 };

  const synced = reconcileServerPaginationSort(
    current,
    { page: 1, per_page: 20, total: 50, total_pages: 3, sort: 'grade', order: 'desc' },
    STUDENTS_CONFIG
  );
  assert.deepEqual(synced, { sort: 'grade', order: 'desc', page: 1 });

  // Ignores unknown sort returned by server and preserves request sort
  const ignoredInvalid = reconcileServerPaginationSort(
    current,
    { page: 1, per_page: 20, total: 50, total_pages: 3, sort: 'bad_field', order: 'desc' },
    STUDENTS_CONFIG
  );
  assert.deepEqual(ignoredInvalid, { sort: 'name', order: 'desc', page: 1 });
});

test('createRequestGuard aborts superseded requests and marks stale responses as not latest', () => {
  const guard = createRequestGuard();
  const req1 = guard.start();
  assert.equal(req1.signal.aborted, false);
  assert.equal(req1.isLatest(), true);

  const req2 = guard.start();
  assert.equal(req1.signal.aborted, true);
  assert.equal(req1.isLatest(), false);
  assert.equal(req2.signal.aborted, false);
  assert.equal(req2.isLatest(), true);

  guard.abortCurrent();
  assert.equal(req2.signal.aborted, true);
  assert.equal(req2.isLatest(), false);
});
