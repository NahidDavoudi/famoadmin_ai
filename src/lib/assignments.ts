import type {
  AssignmentFilterStatus,
  AssignmentHistoryEntry,
  AssignmentInitialFillItem,
  AssignmentInitialFillReport,
  AssignmentStudentRow,
  Supporter,
  SupportAssignment,
} from '../types';
import { safeNumber, safeTrim } from './exam-math';
import { formatGregorianToJalali } from './jalali';

/**
 * Formats an ISO or SQL datetime string into a Jalali date (`1403/08/15`) or `'—'`.
 */
export function formatAssignmentJalaliDate(isoOrSql: unknown): string {
  const raw = safeTrim(isoOrSql);
  if (!raw) return '—';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return formatGregorianToJalali(match[1]);
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return formatGregorianToJalali(`${yyyy}-${mm}-${dd}`);
  }
  return '—';
}

/**
 * Normalizes a raw `SupportAssignment` response from `POST /api/v1/assignments` or `DELETE /api/v1/assignments/{studentId}`.
 */
export function normalizeSupportAssignment(raw: Record<string, unknown>): SupportAssignment {
  const supporterObj =
    raw.supporter && typeof raw.supporter === 'object'
      ? (raw.supporter as Record<string, unknown>)
      : {};
  const supporterIdRaw = raw.supporter_id ?? supporterObj.id;
  const supporterId =
    supporterIdRaw !== null && supporterIdRaw !== undefined && supporterIdRaw !== '' && Number(supporterIdRaw) > 0
      ? safeNumber(supporterIdRaw)
      : null;

  return {
    student_id: safeNumber(raw.student_id ?? raw.id),
    supporter_id: supporterId,
    supporter_name:
      safeTrim(raw.supporter_name ?? supporterObj.name) || null,
    assigned_at:
      safeTrim(raw.assigned_at ?? raw.started_at ?? raw.created_at) || null,
    note: safeTrim(raw.note) || null,
  };
}

/**
 * Normalizes a student row from `GET /api/v1/assignments/students` or
 * `GET /api/v1/assignments/supporters/{supporterId}/students`.
 */
export function normalizeAssignmentStudentRow(
  raw: Record<string, unknown>,
  supportersById?: Map<number, Supporter>
): AssignmentStudentRow {
  const studentObj =
    raw.student && typeof raw.student === 'object'
      ? (raw.student as Record<string, unknown>)
      : {};
  const supporterObj =
    raw.supporter && typeof raw.supporter === 'object'
      ? (raw.supporter as Record<string, unknown>)
      : {};
  const assignmentObj =
    raw.assignment && typeof raw.assignment === 'object'
      ? (raw.assignment as Record<string, unknown>)
      : {};

  const studentId = safeNumber(
    raw.student_id ?? studentObj.id ?? raw.id
  );
  const supporterIdRaw =
    raw.supporter_id ??
    assignmentObj.supporter_id ??
    supporterObj.id ??
    raw.active_supporter_id;

  const supporterId =
    supporterIdRaw !== null &&
    supporterIdRaw !== undefined &&
    supporterIdRaw !== '' &&
    Number(supporterIdRaw) > 0
      ? safeNumber(supporterIdRaw)
      : null;

  const matchedSupporter =
    supporterId && supportersById ? supportersById.get(supporterId) : undefined;

  const supporterName =
    safeTrim(
      raw.supporter_name ??
        assignmentObj.supporter_name ??
        supporterObj.name ??
        matchedSupporter?.name
    ) || null;

  const assignedAt =
    safeTrim(
      raw.assigned_at ??
        assignmentObj.assigned_at ??
        assignmentObj.started_at ??
        raw.assignment_date
    ) || null;

  const note =
    safeTrim(raw.note ?? assignmentObj.note ?? raw.assignment_note) || null;

  const statusVal =
    raw.is_active ??
    raw.status ??
    studentObj.is_active ??
    studentObj.status ??
    1;
  const isActive: 0 | 1 =
    statusVal === 0 || statusVal === '0' || statusVal === false || statusVal === 'inactive'
      ? 0
      : 1;

  return {
    student_id: studentId,
    name:
      safeTrim(raw.name ?? raw.student_name ?? studentObj.name) ||
      `دانش‌آموز #${studentId}`,
    phone: safeTrim(raw.phone ?? raw.student_phone ?? studentObj.phone),
    national_id:
      safeTrim(raw.national_id ?? studentObj.national_id) || null,
    grade: safeNumber(raw.grade ?? studentObj.grade) || 12,
    field:
      safeTrim(raw.field ?? studentObj.field) || 'تجربی',
    is_active: isActive,
    supporter_id: supporterId,
    supporter_name: supporterName,
    assigned_at: assignedAt,
    note,
  };
}

/**
 * Normalizes a history entry from `GET /api/v1/assignments/history/{studentId}`.
 */
export function normalizeAssignmentHistoryEntry(
  raw: Record<string, unknown>,
  fallbackIndex = 0
): AssignmentHistoryEntry {
  const supporterObj =
    raw.supporter && typeof raw.supporter === 'object'
      ? (raw.supporter as Record<string, unknown>)
      : {};

  const supporterIdRaw = raw.supporter_id ?? supporterObj.id;
  const supporterId =
    supporterIdRaw !== null &&
    supporterIdRaw !== undefined &&
    supporterIdRaw !== '' &&
    Number(supporterIdRaw) > 0
      ? safeNumber(supporterIdRaw)
      : null;

  const unassignedAt =
    safeTrim(raw.unassigned_at ?? raw.ended_at ?? raw.revoked_at) || null;

  const isActiveRaw = raw.is_active ?? raw.active;
  const isActive =
    isActiveRaw !== undefined && isActiveRaw !== null
      ? Boolean(Number(isActiveRaw) === 1 || isActiveRaw === true)
      : !unassignedAt;

  return {
    id: safeNumber(raw.id) || fallbackIndex + 1,
    student_id: safeNumber(raw.student_id),
    supporter_id: supporterId,
    supporter_name:
      safeTrim(raw.supporter_name ?? supporterObj.name) ||
      (supporterId ? `پشتیبان #${supporterId}` : null),
    assigned_at:
      safeTrim(raw.assigned_at ?? raw.started_at ?? raw.created_at) || null,
    unassigned_at: unassignedAt,
    is_active: isActive,
    assigned_by_name:
      safeTrim(raw.assigned_by_name ?? raw.actor_name ?? raw.created_by_name) || null,
    note: safeTrim(raw.note) || null,
  };
}

/**
 * Normalizes the report returned by `POST /api/v1/assignments/initial-fill`.
 */
export function normalizeInitialFillReport(
  raw: Record<string, unknown> | null | undefined,
  requestedDryRun = true
): AssignmentInitialFillReport {
  if (!raw || typeof raw !== 'object') {
    return {
      dry_run: requestedDryRun,
      total_candidates: 0,
      assigned_count: 0,
      skipped_count: 0,
      ambiguous_count: 0,
      no_match_count: 0,
      items: [],
    };
  }

  const dryRun =
    raw.dry_run !== undefined ? Boolean(raw.dry_run) : requestedDryRun;

  const rawItemsSource =
    Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.results)
        ? raw.results
        : Array.isArray(raw.details)
          ? raw.details
          : Array.isArray(raw.assignments)
            ? raw.assignments
            : [];

  const items: AssignmentInitialFillItem[] = (
    rawItemsSource as Array<Record<string, unknown>>
  ).map((item) => {
    const rawOutcome = safeTrim(
      item.outcome ?? item.status ?? item.action
    ).toLowerCase();

    let outcome: AssignmentInitialFillItem['outcome'] = 'assigned';
    if (
      rawOutcome === 'would_assign' ||
      (dryRun && (rawOutcome === 'assigned' || rawOutcome === 'match' || !rawOutcome))
    ) {
      outcome = dryRun ? 'would_assign' : 'assigned';
    } else if (rawOutcome.includes('ambig') || rawOutcome.includes('multiple')) {
      outcome = 'ambiguous';
    } else if (rawOutcome.includes('no_match') || rawOutcome.includes('unmatched') || rawOutcome.includes('none')) {
      outcome = 'no_match';
    } else if (rawOutcome.includes('skip')) {
      outcome = 'skipped';
    }

    const supIdRaw = item.supporter_id;
    const supId =
      supIdRaw !== null && supIdRaw !== undefined && supIdRaw !== '' && Number(supIdRaw) > 0
        ? safeNumber(supIdRaw)
        : null;

    return {
      student_id: safeNumber(item.student_id ?? item.id),
      student_name:
        safeTrim(item.student_name ?? item.name) ||
        `دانش‌آموز #${safeNumber(item.student_id ?? item.id)}`,
      grade:
        item.grade !== undefined && item.grade !== null && item.grade !== ''
          ? safeNumber(item.grade)
          : null,
      field: safeTrim(item.field) || null,
      supporter_id: supId,
      supporter_name:
        safeTrim(item.supporter_name) || (supId ? `پشتیبان #${supId}` : null),
      outcome,
      reason: safeTrim(item.reason ?? item.message ?? item.note) || null,
    };
  });

  const assignedFromItems = items.filter(
    (i) => i.outcome === 'assigned' || i.outcome === 'would_assign'
  ).length;
  const ambiguousFromItems = items.filter((i) => i.outcome === 'ambiguous').length;
  const noMatchFromItems = items.filter((i) => i.outcome === 'no_match').length;
  const skippedFromItems = items.filter((i) => i.outcome === 'skipped').length;

  const assignedCount =
    raw.assigned_count !== undefined
      ? safeNumber(raw.assigned_count)
      : typeof raw.assigned === 'number'
        ? safeNumber(raw.assigned)
        : raw.would_assign_count !== undefined
          ? safeNumber(raw.would_assign_count)
          : assignedFromItems;

  const ambiguousCount =
    raw.ambiguous_count !== undefined
      ? safeNumber(raw.ambiguous_count)
      : typeof raw.ambiguous === 'number'
        ? safeNumber(raw.ambiguous)
        : ambiguousFromItems;

  const noMatchCount =
    raw.no_match_count !== undefined
      ? safeNumber(raw.no_match_count)
      : typeof raw.no_match === 'number'
        ? safeNumber(raw.no_match)
        : typeof raw.unmatched === 'number'
          ? safeNumber(raw.unmatched)
          : noMatchFromItems;

  const skippedCount =
    raw.skipped_count !== undefined
      ? safeNumber(raw.skipped_count)
      : typeof raw.skipped === 'number'
        ? safeNumber(raw.skipped)
        : skippedFromItems;

  const totalCandidates =
    raw.total_candidates !== undefined
      ? safeNumber(raw.total_candidates)
      : raw.total !== undefined
        ? safeNumber(raw.total)
        : items.length ||
          assignedCount + skippedCount + ambiguousCount + noMatchCount;

  return {
    dry_run: dryRun,
    total_candidates: totalCandidates,
    assigned_count: assignedCount,
    skipped_count: skippedCount,
    ambiguous_count: ambiguousCount,
    no_match_count: noMatchCount,
    items,
  };
}

/**
 * Orders active supporters by how closely they match a student's `(grade, field)`.
 * Returns `{ exactMatches, fieldMatches, otherSupporters }`.
 */
export function categorizeSupportersForStudent(
  student: { grade?: number | null; field?: string | null },
  supporters: Supporter[]
): {
  exactMatches: Supporter[];
  fieldMatches: Supporter[];
  otherSupporters: Supporter[];
} {
  const activeSupporters = supporters.filter(
    (s) => s.is_active !== false && s.is_active !== 0
  );
  const sGrade = safeNumber(student.grade);
  const sField = safeTrim(student.field);

  const exactMatches: Supporter[] = [];
  const fieldMatches: Supporter[] = [];
  const otherSupporters: Supporter[] = [];

  for (const sup of activeSupporters) {
    const sameField = sField && safeTrim(sup.field) === sField;
    const sameGrade = sGrade > 0 && safeNumber(sup.grade) === sGrade;

    if (sameField && sameGrade) {
      exactMatches.push(sup);
    } else if (sameField) {
      fieldMatches.push(sup);
    } else {
      otherSupporters.push(sup);
    }
  }

  return { exactMatches, fieldMatches, otherSupporters };
}

export interface AssignmentStatsSummary {
  total: number;
  assigned: number;
  unassigned: number;
}

/**
 * Computes assigned vs unassigned counts across a list of `AssignmentStudentRow`.
 */
export function computeAssignmentStats(
  rows: AssignmentStudentRow[]
): AssignmentStatsSummary {
  let assigned = 0;
  let unassigned = 0;
  for (const r of rows) {
    if (r.supporter_id && r.supporter_id > 0) {
      assigned += 1;
    } else {
      unassigned += 1;
    }
  }
  return {
    total: rows.length,
    assigned,
    unassigned,
  };
}

/**
 * Filters a list of `AssignmentStudentRow` by `status`, `supporter_id`, `field`, `grade`, `include_inactive`, and `search`.
 */
export function filterAssignmentStudents(
  rows: AssignmentStudentRow[],
  filters: {
    status?: AssignmentFilterStatus;
    supporter_id?: number | string;
    field?: string;
    grade?: number | string;
    include_inactive?: boolean;
    search?: string;
  }
): AssignmentStudentRow[] {
  const st = filters.status || 'all';
  const supId =
    filters.supporter_id !== undefined && filters.supporter_id !== ''
      ? safeNumber(filters.supporter_id)
      : null;
  const fieldVal = safeTrim(filters.field);
  const gradeVal =
    filters.grade !== undefined && filters.grade !== ''
      ? safeNumber(filters.grade)
      : null;
  const includeInactive = Boolean(filters.include_inactive);
  const q = safeTrim(filters.search).toLowerCase();

  return rows.filter((row) => {
    if (!includeInactive && row.is_active === 0) return false;
    const isAssigned = Boolean(row.supporter_id && row.supporter_id > 0);
    if (st === 'assigned' && !isAssigned) return false;
    if (st === 'unassigned' && isAssigned) return false;
    if (supId && row.supporter_id !== supId) return false;
    if (fieldVal && safeTrim(row.field) !== fieldVal) return false;
    if (gradeVal && row.grade !== gradeVal) return false;

    if (q) {
      const haystack = [
        row.name,
        row.phone,
        row.national_id,
        row.field,
        row.supporter_name,
        row.note,
      ]
        .map((v) => safeTrim(v).toLowerCase())
        .join(' ');
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}
