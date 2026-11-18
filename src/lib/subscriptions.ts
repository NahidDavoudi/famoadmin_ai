import type { Subscription, SubscriptionStatus } from '../types';
import { safeNumber, safeTrim } from './exam-math';
import { formatGregorianToJalali } from './jalali';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'فعال',
  pending: 'در انتظار تأیید (معلق)',
  cancelled: 'لغو شده',
  expired: 'منقضی شده',
  rejected: 'رد شده',
};

export const SUBSCRIPTION_STATUS_OPTIONS: Array<{
  value: SubscriptionStatus;
  label: string;
}> = [
  { value: 'active', label: 'فعال' },
  { value: 'pending', label: 'در انتظار تأیید (معلق)' },
  { value: 'cancelled', label: 'لغو شده' },
  { value: 'expired', label: 'منقضی شده' },
  { value: 'rejected', label: 'رد شده' },
];

/**
 * Normalizes raw status string (including `'canceled'` or `'suspended'`) into canonical `SubscriptionStatus`.
 */
export function normalizeSubscriptionStatus(
  rawStatus: unknown,
  rawIsActive?: unknown
): SubscriptionStatus {
  const s = safeTrim(rawStatus).toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'pending' || s === 'suspended' || s === 'hold' || s === 'paused') return 'pending';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'expired') return 'expired';
  if (s === 'rejected') return 'rejected';

  if (rawIsActive !== undefined && rawIsActive !== null) {
    return Number(rawIsActive) === 1 ? 'active' : 'pending';
  }
  return 'pending';
}

/**
 * Resolves `is_active` (0 | 1) consistently from an explicit value or status.
 */
export function resolveSubscriptionIsActive(
  status: SubscriptionStatus,
  explicitIsActive?: unknown
): 0 | 1 {
  if (explicitIsActive === 0 || explicitIsActive === '0' || explicitIsActive === false) {
    return 0;
  }
  if (explicitIsActive === 1 || explicitIsActive === '1' || explicitIsActive === true) {
    return status === 'active' ? 1 : 0;
  }
  return status === 'active' ? 1 : 0;
}

/**
 * Returns Tailwind CSS classes for rendering a subscription status badge.
 */
export function getSubscriptionStatusBadgeClass(
  status: SubscriptionStatus,
  isActive?: 0 | 1
): string {
  if (status === 'active' && isActive !== 0) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status === 'pending' || (status === 'active' && isActive === 0)) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (status === 'cancelled' || status === 'rejected') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

/**
 * Returns human-readable Persian label for a subscription's status and `is_active` flag.
 */
export function getSubscriptionStatusLabel(
  status: SubscriptionStatus,
  isActive?: 0 | 1
): string {
  if (status === 'active' && isActive === 0) {
    return 'معلق (غیرفعال)';
  }
  return SUBSCRIPTION_STATUS_LABELS[status] || 'نامشخص';
}

/**
 * Normalizes a raw backend subscription payload into a strongly typed `Subscription`.
 */
export function normalizeSubscription(raw: Record<string, unknown>): Subscription {
  const courseObj =
    raw.course && typeof raw.course === 'object'
      ? (raw.course as Record<string, unknown>)
      : {};
  const studentObj =
    raw.student && typeof raw.student === 'object'
      ? (raw.student as Record<string, unknown>)
      : {};

  const id = safeNumber(raw.id);
  const courseId = safeNumber(raw.course_id ?? courseObj.id);
  const studentId = safeNumber(raw.student_id ?? studentObj.id);

  const status = normalizeSubscriptionStatus(raw.status, raw.is_active);
  const isActive: 0 | 1 =
    raw.is_active !== undefined && raw.is_active !== null
      ? Number(raw.is_active) === 1
        ? 1
        : 0
      : resolveSubscriptionIsActive(status);

  const courseName =
    safeTrim(courseObj.name ?? raw.course_name ?? raw.course_title) || null;
  const coursePrice =
    courseObj.price !== undefined && courseObj.price !== null
      ? (courseObj.price as number | string)
      : raw.course_price !== undefined && raw.course_price !== null
        ? (raw.course_price as number | string)
        : null;

  const studentName =
    safeTrim(studentObj.name ?? raw.student_name ?? raw.full_name) || null;
  const studentPhone =
    safeTrim(studentObj.phone ?? raw.student_phone ?? raw.phone) || null;
  const studentGradeRaw = studentObj.grade ?? raw.student_grade ?? raw.grade;
  const studentGrade =
    studentGradeRaw !== undefined && studentGradeRaw !== null && studentGradeRaw !== ''
      ? safeNumber(studentGradeRaw)
      : null;
  const studentField =
    safeTrim(studentObj.field ?? raw.student_field ?? raw.field) || null;

  return {
    id,
    course_id: courseId,
    student_id: studentId,
    status,
    is_active: isActive,
    note: safeTrim(raw.note) || null,
    started_at: safeTrim(raw.started_at) || null,
    end_at: safeTrim(raw.end_at) || null,
    created_at: safeTrim(raw.created_at) || undefined,
    updated_at: safeTrim(raw.updated_at) || undefined,
    course: {
      id: courseId,
      name: courseName,
      price: coursePrice,
      icon: safeTrim(courseObj.icon) || null,
      description: safeTrim(courseObj.description) || null,
    },
    student: {
      id: studentId,
      name: studentName,
      phone: studentPhone,
      grade: studentGrade,
      field: studentField,
    },
  };
}

/**
 * Extracts `YYYY-MM-DD` from an ISO or SQL datetime string for `<input type="date">`.
 */
export function formatSubscriptionDateInput(isoOrSql: unknown): string {
  const raw = safeTrim(isoOrSql);
  if (!raw) return '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

/**
 * Formats an ISO or SQL datetime string into a Jalali date (`1403/08/15`) or `'—'`.
 */
export function formatSubscriptionJalaliDate(isoOrSql: unknown): string {
  const ymd = formatSubscriptionDateInput(isoOrSql);
  if (!ymd) return '—';
  return formatGregorianToJalali(ymd);
}

/**
 * Formats course price cleanly in Persian with thousands separators.
 */
export function formatCoursePrice(price: unknown): string {
  const raw = safeTrim(price);
  if (!raw || raw === '0') return 'رایگان';
  const numericOnly = Number(raw.replace(/,/g, ''));
  if (!Number.isNaN(numericOnly) && numericOnly > 0 && /^\d+$/.test(raw.replace(/,/g, ''))) {
    return `${numericOnly.toLocaleString('fa-IR')} تومان`;
  }
  return raw;
}

export interface SubscriptionFormInput {
  student_id: string | number;
  course_id: string | number;
  status?: string;
  started_at?: string;
  end_at?: string;
  note?: string;
}

export interface SubscriptionFormErrors {
  student_id?: string;
  course_id?: string;
  end_at?: string;
  note?: string;
}

/**
 * Validates subscription creation / update form fields.
 */
export function validateSubscriptionForm(
  input: SubscriptionFormInput
): SubscriptionFormErrors {
  const errors: SubscriptionFormErrors = {};
  const studentId = safeNumber(input.student_id);
  const courseId = safeNumber(input.course_id);

  if (!studentId || studentId <= 0) {
    errors.student_id = 'لطفاً دانش‌آموز را انتخاب کنید';
  }
  if (!courseId || courseId <= 0) {
    errors.course_id = 'لطفاً دوره آموزشی را انتخاب کنید';
  }

  const startYmd = formatSubscriptionDateInput(input.started_at);
  const endYmd = formatSubscriptionDateInput(input.end_at);
  if (startYmd && endYmd && endYmd < startYmd) {
    errors.end_at = 'تاریخ پایان اشتراک نمی‌تواند قبل از تاریخ شروع باشد';
  }

  const noteStr = safeTrim(input.note);
  if (noteStr.length > 1000) {
    errors.note = 'یادداشت اشتراک حداکثر می‌تواند ۱۰۰۰ کاراکتر باشد';
  }

  return errors;
}

export interface SubscriptionStatsSummary {
  total: number;
  active: number;
  pending: number;
  cancelled: number;
  expired: number;
  rejected: number;
}

/**
 * Computes summary counts by status across a list of subscriptions.
 */
export function computeSubscriptionStats(
  items: Subscription[]
): SubscriptionStatsSummary {
  const stats: SubscriptionStatsSummary = {
    total: items.length,
    active: 0,
    pending: 0,
    cancelled: 0,
    expired: 0,
    rejected: 0,
  };

  for (const sub of items) {
    if (sub.status === 'active' && sub.is_active === 1) {
      stats.active += 1;
    } else if (sub.status === 'pending' || (sub.status === 'active' && sub.is_active === 0)) {
      stats.pending += 1;
    } else if (sub.status === 'cancelled') {
      stats.cancelled += 1;
    } else if (sub.status === 'expired') {
      stats.expired += 1;
    } else if (sub.status === 'rejected') {
      stats.rejected += 1;
    }
  }

  return stats;
}

/**
 * Filters a list of subscriptions by search query, course_id, student_id, status, and is_active.
 */
export function filterSubscriptions(
  items: Subscription[],
  filters: {
    search?: string;
    course_id?: number | string;
    student_id?: number | string;
    status?: SubscriptionStatus | '';
    is_active?: 0 | 1 | '';
  }
): Subscription[] {
  const q = safeTrim(filters.search).toLowerCase();
  const cId =
    filters.course_id !== undefined && filters.course_id !== ''
      ? safeNumber(filters.course_id)
      : null;
  const sId =
    filters.student_id !== undefined && filters.student_id !== ''
      ? safeNumber(filters.student_id)
      : null;
  const st = safeTrim(filters.status) as SubscriptionStatus | '';
  const act =
    filters.is_active === 0 || filters.is_active === 1 ? filters.is_active : null;

  return items.filter((sub) => {
    if (cId && sub.course_id !== cId) return false;
    if (sId && sub.student_id !== sId) return false;
    if (st && sub.status !== st) return false;
    if (act !== null && sub.is_active !== act) return false;

    if (q) {
      const haystack = [
        sub.student?.name,
        sub.student?.phone,
        sub.student?.field,
        sub.course?.name,
        sub.note,
      ]
        .map((v) => safeTrim(v).toLowerCase())
        .join(' ');
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}
