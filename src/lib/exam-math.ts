import type {
  AcademicField,
  ExamComment,
  ExamDetailsResponse,
  ExamListItem,
  ExamShareLinkItem,
  ExamShareLinkStatus,
  ExamStudentSummary,
  SubjectResult,
  Student,
  UpdateExamResultRequest,
} from '../types';
import { formatGregorianToJalali } from './jalali';

export interface SubjectDraft {
  id: string;
  subject: string;
  chapter: string;
  total_q: string;
  correct: string;
  wrong: string;
}

export interface CalculatedSubjectMetrics {
  skipped: number | null;
  percentage: number | null;
  isValid: boolean;
}

export const VALID_ACADEMIC_FIELDS: readonly AcademicField[] = [
  'ریاضی',
  'تجربی',
  'انسانی',
  'زبان',
  'هنر',
  'عمومی',
  'راهنمایی',
] as const;

export const VALID_GRADES: readonly number[] = [7, 8, 9, 10, 11, 12] as const;

/**
 * Calculates skipped count and exam score percentage using standard Iranian Konkur formula:
 * ((correct * 3 - wrong) / (total * 3)) * 100
 */
export function calculateSubjectMetrics(
  totalRaw: number | string,
  correctRaw: number | string,
  wrongRaw: number | string
): CalculatedSubjectMetrics {
  const total = typeof totalRaw === 'number' ? totalRaw : parseInt(String(totalRaw), 10) || 0;
  const correct = typeof correctRaw === 'number' ? correctRaw : parseInt(String(correctRaw), 10) || 0;
  const wrong = typeof wrongRaw === 'number' ? wrongRaw : parseInt(String(wrongRaw), 10) || 0;

  if (total <= 0) {
    return { skipped: null, percentage: null, isValid: false };
  }

  const skipped = total - correct - wrong;
  if (skipped < 0 || correct < 0 || wrong < 0 || correct > total || wrong > total) {
    return { skipped, percentage: null, isValid: false };
  }

  const rawPercentage = ((correct * 3 - wrong) / (total * 3)) * 100;
  const rounded = Math.round(rawPercentage * 10) / 10;

  return {
    skipped,
    percentage: rounded,
    isValid: true,
  };
}

/**
 * Normalizes a single exam subject row and recalculates `skipped` and Konkur `percentage`
 * (((correct * 3 - wrong) / (total_q * 3)) * 100) whenever `total_q > 0`, overriding
 * backend simple ratios (`correct / total_q * 100`) that omit negative marking.
 */
export function normalizeExamSubject(sub: Partial<SubjectResult> | null | undefined): SubjectResult {
  const total_q = safeNumber(sub?.total_q);
  const correct = safeNumber(sub?.correct);
  const wrong = safeNumber(sub?.wrong);
  const calc = calculateSubjectMetrics(total_q, correct, wrong);

  let skipped = safeNumber(sub?.skipped);
  let percentage = safeNumber(sub?.percentage);

  if (calc.isValid && calc.percentage !== null && calc.skipped !== null) {
    skipped = calc.skipped;
    percentage = calc.percentage;
  } else if (total_q > 0 && correct >= 0 && wrong >= 0) {
    skipped = Math.max(0, total_q - correct - wrong);
    percentage = Math.round((((correct * 3 - wrong) / (total_q * 3)) * 100) * 10) / 10;
  }

  return {
    ...sub,
    ...(sub?.id !== undefined && sub?.id !== null ? { id: safeNumber(sub.id) } : {}),
    subject: safeTrim(sub?.subject),
    chapter: sub?.chapter ? safeTrim(sub.chapter) : null,
    total_q,
    correct,
    wrong,
    skipped,
    percentage,
  };
}

/**
 * Normalizes a student's exam report card (`ExamDetailsResponse`), computing Konkur
 * negative-marking percentages per subject and the overall `avg_percentage`.
 */
export function normalizeExamDetails(
  raw: Partial<ExamDetailsResponse> | null | undefined
): ExamDetailsResponse {
  const subjects = Array.isArray(raw?.subjects)
    ? raw.subjects.map((sub) => normalizeExamSubject(sub))
    : [];

  const avg_percentage =
    subjects.length > 0
      ? Math.round((subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length) * 10) / 10
      : safeNumber(raw?.avg_percentage);

  return {
    ...raw,
    student: {
      id: safeNumber(raw?.student?.id),
      name: safeTrim(raw?.student?.name),
      grade: safeNumber(raw?.student?.grade, 12),
      field: (safeTrim(raw?.student?.field) || 'تجربی') as AcademicField,
    },
    exam_date: raw?.exam_date ? safeTrim(raw.exam_date) : undefined,
    subjects,
    avg_percentage,
  };
}

export interface TeacherFeedbackRow {
  id: string;
  subject: string;
  chapter: string;
  percentage: number | null;
  instructorName: string;
  comment: string;
}

/**
 * Creates initial teacher feedback rows for a student's printable report card,
 * generating one entry per subject in the exam (or default rows if empty).
 */
export function createInitialTeacherFeedbacks(
  details: Pick<ExamDetailsResponse, 'subjects'> | null | undefined
): TeacherFeedbackRow[] {
  const subjects = details?.subjects || [];
  if (subjects.length === 0) {
    return [
      {
        id: 'feedback-0',
        subject: '',
        chapter: '',
        percentage: null,
        instructorName: '',
        comment: '',
      },
    ];
  }

  return subjects.map((sub, idx) => ({
    id: `feedback-${idx}-${safeTrim(sub.subject)}`,
    subject: safeTrim(sub.subject),
    chapter: safeTrim(sub.chapter),
    percentage: safeNumber(sub.percentage),
    instructorName: '',
    comment: '',
  }));
}

export interface RawStudentExamHistoryRow {
  exam_date?: string;
  date?: string;
  subject?: string;
  chapter?: string | null;
  total_q?: number | string;
  correct?: number | string;
  wrong?: number | string;
  skipped?: number | string;
  percentage?: number | string;
  avg_percentage?: number | string;
  subject_count?: number | string;
}

export interface StudentExamTrendPoint {
  exam_date: string;
  jalali_date: string;
  subject_count: number;
  avg_percentage: number;
  delta: number | null;
  is_current: boolean;
}

/**
 * Builds up to `limit` (default 5) chronological exam trend points for a student,
 * computing Konkur negative-marking percentages per exam date and change deltas.
 */
export function buildStudentExamTrend(
  rawRows: RawStudentExamHistoryRow[] | null | undefined,
  options?: {
    currentExamDate?: string | null;
    currentDetails?: ExamDetailsResponse | null;
    limit?: number;
  }
): StudentExamTrendPoint[] {
  const limit = options?.limit ?? 5;
  const currentExamDate = safeTrim(options?.currentExamDate);

  // Map exam_date -> { subjectPercentages: number[], fallbackAvg: number | null, fallbackCount: number }
  const byDate = new Map<
    string,
    { subjectPercentages: number[]; fallbackAvg: number | null; fallbackCount: number }
  >();

  const ensureDateBucket = (dateStr: string) => {
    let bucket = byDate.get(dateStr);
    if (!bucket) {
      bucket = { subjectPercentages: [], fallbackAvg: null, fallbackCount: 0 };
      byDate.set(dateStr, bucket);
    }
    return bucket;
  };

  if (Array.isArray(rawRows)) {
    for (const row of rawRows) {
      const dateStr = safeTrim(row?.exam_date || row?.date);
      if (!dateStr) continue;
      const bucket = ensureDateBucket(dateStr);

      const hasSubjectBreakdown =
        row?.total_q !== undefined && safeNumber(row.total_q) > 0;

      if (hasSubjectBreakdown) {
        const normalized = normalizeExamSubject({
          subject: row.subject,
          chapter: row.chapter,
          total_q: safeNumber(row.total_q),
          correct: safeNumber(row.correct),
          wrong: safeNumber(row.wrong),
          skipped: safeNumber(row.skipped),
          percentage: safeNumber(row.percentage),
        });
        bucket.subjectPercentages.push(normalized.percentage);
      } else if (row?.avg_percentage !== undefined || row?.percentage !== undefined) {
        bucket.fallbackAvg = safeNumber(row.avg_percentage ?? row.percentage);
        bucket.fallbackCount = Math.max(1, safeNumber(row.subject_count, 1));
      }
    }
  }

  // Ensure the currently viewed report card exam is included with its exact Konkur subjects
  if (currentExamDate && options?.currentDetails) {
    const details = normalizeExamDetails(options.currentDetails);
    const bucket = ensureDateBucket(currentExamDate);
    if (details.subjects.length > 0) {
      bucket.subjectPercentages = details.subjects.map((s) => s.percentage);
    } else {
      bucket.fallbackAvg = details.avg_percentage;
      bucket.fallbackCount = 1;
    }
  }

  const allPoints: Omit<StudentExamTrendPoint, 'delta'>[] = [];
  for (const [exam_date, bucket] of byDate.entries()) {
    const subject_count =
      bucket.subjectPercentages.length > 0
        ? bucket.subjectPercentages.length
        : bucket.fallbackCount;
    const avg_percentage =
      bucket.subjectPercentages.length > 0
        ? Math.round(
            (bucket.subjectPercentages.reduce((sum, p) => sum + p, 0) /
              bucket.subjectPercentages.length) *
              10
          ) / 10
        : Math.round(safeNumber(bucket.fallbackAvg) * 10) / 10;

    allPoints.push({
      exam_date,
      jalali_date: formatGregorianToJalali(exam_date) || exam_date,
      subject_count,
      avg_percentage,
      is_current: exam_date === currentExamDate,
    });
  }

  // Sort chronologically ascending (oldest -> newest)
  allPoints.sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  // Slice to `limit` (5) exams while ensuring `currentExamDate` is visible if present
  let sliced = allPoints;
  if (allPoints.length > limit) {
    const currentIdx = currentExamDate
      ? allPoints.findIndex((p) => p.exam_date === currentExamDate)
      : -1;
    if (currentIdx !== -1 && currentIdx < allPoints.length - limit) {
      const start = Math.max(0, currentIdx - (limit - 1));
      sliced = allPoints.slice(start, start + limit);
    } else {
      sliced = allPoints.slice(-limit);
    }
  }

  return sliced.map((pt, idx) => ({
    ...pt,
    delta:
      idx === 0
        ? null
        : Math.round((pt.avg_percentage - sliced[idx - 1].avg_percentage) * 10) / 10,
  }));
}

/**
 * Safely converts any value (string, number, null, undefined) to a trimmed string.
 */
export function safeTrim(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Safely converts any value (string, number, null, undefined) to a finite number.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Safely formats any numeric or string value with fixed decimal digits.
 */
export function formatFixed(value: unknown, digits = 1): string {
  return safeNumber(value, 0).toFixed(digits);
}

/**
 * Validates Iranian mobile phone number according to OpenAPI pattern:
 * ^(\+98|0098|98|0)?9[0-9]{9}$
 */
export function isValidIranianPhone(phone: unknown): boolean {
  return /^(\+98|0098|98|0)?9[0-9]{9}$/.test(safeTrim(phone));
}

/**
 * Normalizes an Iranian mobile number to 09XXXXXXXXX format.
 */
export function normalizeIranianPhone(phone: unknown): string {
  const trimmed = safeTrim(phone);
  const match = trimmed.match(/^(?:\+98|0098|98|0)?(9[0-9]{9})$/);
  return match ? `0${match[1]}` : trimmed;
}

/**
 * Basic 10-digit National ID check.
 */
export function isValidNationalId(nationalId: unknown): boolean {
  return /^\d{10}$/.test(safeTrim(nationalId));
}

/**
 * Strict Iranian 10-digit National ID (کد ملی) Mod-11 checksum validation
 * as required by POST /api/v1/auth/register in OpenAPI 3.1.0.
 */
export function isValidNationalIdChecksum(nationalId: unknown): boolean {
  const code = safeTrim(nationalId);
  if (!/^[0-9]{10}$/.test(code)) return false;
  // Reject repeated digits like 0000000000, 1111111111, etc.
  if (/^(\d)\1{9}$/.test(code)) return false;

  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(code[i]) * (10 - i);
  }
  const rem = sum % 11;
  return (rem < 2 && check === rem) || (rem >= 2 && check === 11 - rem);
}

/**
 * Computes a valid 10-digit Iranian National ID from a 9-digit prefix.
 */
export function computeNationalIdWithChecksum(nineDigits: string): string {
  const prefix = String(nineDigits ?? '').replace(/\D/g, '').padStart(9, '0').slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(prefix[i]) * (10 - i);
  }
  const rem = sum % 11;
  const check = rem < 2 ? rem : 11 - rem;
  return `${prefix}${check}`;
}

export interface StudentFilterCriteria {
  search?: string;
  field?: string;
  grade?: string | number;
  status?: '' | 'active' | 'inactive' | '1' | '0';
}

export function filterStudentsList(students: Student[], criteria: StudentFilterCriteria): Student[] {
  return students.filter((s) => {
    const q = safeTrim(criteria.search).toLowerCase();
    if (q !== '') {
      const matchName = String(s.name ?? '').toLowerCase().includes(q);
      const matchPhone = String(s.phone ?? '').includes(q);
      const matchNationalId = String(s.national_id ?? '').includes(q);
      if (!matchName && !matchPhone && !matchNationalId) return false;
    }

    if (criteria.field && criteria.field !== '') {
      if (s.field !== criteria.field) return false;
    }

    if (criteria.grade !== undefined && criteria.grade !== '') {
      if (Number(s.grade) !== Number(criteria.grade)) return false;
    }

    if (criteria.status === 'active' || criteria.status === '1') {
      if (Number(s.status ?? s.is_active) !== 1) return false;
    } else if (criteria.status === 'inactive' || criteria.status === '0') {
      if (Number(s.status ?? s.is_active) !== 0) return false;
    }

    return true;
  });
}

/**
 * Resolves the Persian role label for an exam comment author role.
 */
export function getAuthorRoleLabel(role?: string | null): string {
  switch (safeTrim(role).toLowerCase()) {
    case 'teacher':
      return 'استاد';
    case 'supporter':
      return 'پشتیبان';
    case 'admin':
      return 'مدیر آموزشگاه';
    default:
      return 'کادر آموزشی';
  }
}

export const getExamCommentRoleLabel = getAuthorRoleLabel;

/**
 * Normalizes an ExamComment item from the backend.
 */
export function normalizeExamComment(raw: Partial<ExamComment> | null | undefined): ExamComment {
  const roleRaw = safeTrim(raw?.author_role).toLowerCase();
  const author_role: 'teacher' | 'supporter' | 'admin' | undefined =
    roleRaw === 'teacher' || roleRaw === 'supporter' || roleRaw === 'admin'
      ? roleRaw
      : undefined;

  return {
    id: safeNumber(raw?.id),
    student_id: safeNumber(raw?.student_id),
    exam_date: safeTrim(raw?.exam_date),
    teacher_user_id: safeNumber(raw?.teacher_user_id),
    author_name: safeTrim(raw?.author_name) || getAuthorRoleLabel(author_role),
    author_role,
    body: safeTrim(raw?.body),
    created_at: safeTrim(raw?.created_at),
    updated_at: safeTrim(raw?.updated_at || raw?.created_at),
  };
}

/**
 * Validates an exam comment body according to ExamCommentUpsertRequest (1..2000 chars).
 */
export function validateExamCommentBody(body: unknown): string | null {
  const text = safeTrim(body);
  if (!text) {
    return 'متن نظر استاد یا مشاور نمی‌تواند خالی باشد';
  }
  if (text.length > 2000) {
    return 'متن نظر نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد';
  }
  return null;
}

/**
 * Combines filled per-subject teacher feedback rows and counselor note into a single
 * clean Persian comment string suitable for saving via PUT /api/v1/exams/comments.
 */
export function buildCombinedExamCommentBody(
  feedbacks: TeacherFeedbackRow[],
  counselorNote: string
): string {
  const parts: string[] = [];

  for (const row of feedbacks || []) {
    const commentText = safeTrim(row.comment);
    if (!commentText) continue;
    const subj = safeTrim(row.subject) || 'درس';
    const inst = safeTrim(row.instructorName);
    const header = inst ? `• ${subj} (استاد ${inst}):` : `• ${subj}:`;
    parts.push(`${header} ${commentText}`);
  }

  const cleanCounselor = safeTrim(counselorNote);
  if (cleanCounselor) {
    parts.push(`جمع‌بندی مشاور: ${cleanCounselor}`);
  }

  return parts.join('\n').slice(0, 2000);
}

export const composeCombinedExamComment = buildCombinedExamCommentBody;

/**
 * Determines the effective status ('active' | 'expired' | 'revoked') of an ExamShareLinkItem.
 */
export function resolveShareLinkStatus(
  link: Partial<ExamShareLinkItem> | null | undefined,
  nowMs = Date.now()
): ExamShareLinkStatus {
  const rawStatus = safeTrim(link?.status).toLowerCase();
  if (rawStatus === 'revoked' || safeTrim(link?.revoked_at) !== '') {
    return 'revoked';
  }
  if (rawStatus === 'expired') {
    return 'expired';
  }
  const expiresAtStr = safeTrim(link?.expires_at);
  if (expiresAtStr) {
    const expMs = Date.parse(expiresAtStr);
    if (Number.isFinite(expMs) && expMs <= nowMs) {
      return 'expired';
    }
  }
  return 'active';
}

/**
 * Normalizes an ExamShareLinkItem from GET /api/v1/exams/share-links or revoke responses.
 */
export function normalizeExamShareLinkItem(
  raw: Partial<ExamShareLinkItem> | null | undefined,
  nowMs = Date.now()
): ExamShareLinkItem {
  return {
    id: safeNumber(raw?.id),
    student_id: safeNumber(raw?.student_id),
    student_name: safeTrim(raw?.student_name) || undefined,
    exam_date: safeTrim(raw?.exam_date),
    status: resolveShareLinkStatus(raw, nowMs),
    expires_at: safeTrim(raw?.expires_at),
    revoked_at: safeTrim(raw?.revoked_at) || null,
    sms_sent_at: safeTrim(raw?.sms_sent_at) || null,
    last_viewed_at: safeTrim(raw?.last_viewed_at) || null,
    created_by: raw?.created_by !== null && raw?.created_by !== undefined ? safeNumber(raw.created_by) : null,
    created_at: safeTrim(raw?.created_at) || undefined,
  };
}


/**
 * Filters ExamShareLinkItem list by status ('active' | 'expired' | 'revoked') and search query.
 */
export function filterExamShareLinks(
  links: ExamShareLinkItem[],
  options?: {
    status?: '' | ExamShareLinkStatus;
    search?: string;
  }
): ExamShareLinkItem[] {
  const statusFilter = safeTrim(options?.status);
  const q = safeTrim(options?.search).toLowerCase();

  return (links || []).filter((item) => {
    if (statusFilter && item.status !== statusFilter) {
      return false;
    }
    if (q) {
      const nameMatch = safeTrim(item.student_name).toLowerCase().includes(q);
      const dateMatch = safeTrim(item.exam_date).toLowerCase().includes(q);
      const jalaliMatch = formatGregorianToJalali(item.exam_date).includes(q);
      const idMatch = String(item.id).includes(q) || String(item.student_id).includes(q);
      if (!nameMatch && !dateMatch && !jalaliMatch && !idMatch) {
        return false;
      }
    }
    return true;
  });
}

// ============================================================================
// Edit Exam Result (PATCH /api/v1/exams/{id}) Validation, RBAC & Helpers
// ============================================================================

/**
 * RBAC check: Only `admin` and `teacher` roles are permitted to edit exam results.
 * `supporter` and `student` must NOT see edit controls.
 */
export function canEditExamResults(role?: string | null): boolean {
  const normalized = safeTrim(role).toLowerCase();
  return normalized === 'admin' || normalized === 'teacher';
}

/**
 * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII English digits (0-9).
 */
export function normalizeDigitsToEnglish(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim();
}

/**
 * Strictly parses an integer from string/number (supporting Persian/Arabic digits).
 * Rejects decimals, floats, and non-numeric strings.
 */
export function parseStrictInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }
  const normalized = normalizeDigitsToEnglish(value);
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export interface RemainingQuestionsSummary {
  total: number | null;
  answeredAndSkippedSum: number | null;
  remaining: number | null;
  isOverflow: boolean;
}

/**
 * Computes `total_q - (correct + wrong + skipped)` for live remaining indicator.
 */
export function computeRemainingQuestions(
  totalRaw: unknown,
  correctRaw: unknown,
  wrongRaw: unknown,
  skippedRaw: unknown
): RemainingQuestionsSummary {
  const total = parseStrictInteger(totalRaw);
  const correct = parseStrictInteger(correctRaw) ?? 0;
  const wrong = parseStrictInteger(wrongRaw) ?? 0;
  const skipped = parseStrictInteger(skippedRaw) ?? 0;

  if (total === null) {
    return {
      total: null,
      answeredAndSkippedSum: null,
      remaining: null,
      isOverflow: false,
    };
  }

  const sum = correct + wrong + skipped;
  const remaining = total - sum;

  return {
    total,
    answeredAndSkippedSum: sum,
    remaining,
    isOverflow: remaining < 0,
  };
}

/**
 * Computes live percentage preview matching the backend generated column:
 * `ROUND((correct / total_q) * 100, 2)` -> `total_q > 0 ? ((correct / total_q) * 100).toFixed(2) : '0.00'`
 */
export function calculateRawExamPercentagePreview(
  totalRaw: unknown,
  correctRaw: unknown
): { formatted: string; numeric: number } {
  const total = parseStrictInteger(totalRaw);
  const correct = parseStrictInteger(correctRaw);
  if (total === null || total <= 0 || correct === null || correct < 0) {
    return { formatted: '0.00', numeric: 0 };
  }
  const ratio = (correct / total) * 100;
  const formatted = ratio.toFixed(2);
  return {
    formatted,
    numeric: Number(formatted),
  };
}

export interface ExamEditFormInput {
  exam_date: string;
  subject: string;
  chapter: string;
  total_q: string | number;
  correct: string | number;
  wrong: string | number;
  skipped: string | number;
  student_id?: string | number | null;
}

export type ExamEditFieldName =
  | 'exam_date'
  | 'subject'
  | 'chapter'
  | 'total_q'
  | 'correct'
  | 'wrong'
  | 'skipped'
  | 'balance';

export type ExamEditFieldErrors = Partial<Record<ExamEditFieldName, string>>;

/**
 * Client-side validation matching backend rules for PATCH /api/v1/exams/{id}:
 * - exam_date: Gregorian YYYY-MM-DD
 * - subject: non-empty string, max 50 chars
 * - chapter: optional string, max 100 chars
 * - total_q: integer >= 1
 * - correct, wrong, skipped: integers >= 0
 * - correct + wrong + skipped <= total_q
 */
export function validateExamEditForm(input: ExamEditFormInput): {
  errors: ExamEditFieldErrors;
  isValid: boolean;
} {
  const errors: ExamEditFieldErrors = {};

  const examDate = safeTrim(input.exam_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    errors.exam_date = 'تاریخ آزمون باید با فرمت معتبر انتخاب شود';
  }

  const subject = safeTrim(input.subject);
  if (!subject) {
    errors.subject = 'نام درس نمی‌تواند خالی باشد';
  } else if (subject.length > 50) {
    errors.subject = 'نام درس نباید بیشتر از ۵۰ کاراکتر باشد';
  }

  const chapter = safeTrim(input.chapter);
  if (chapter.length > 100) {
    errors.chapter = 'نام مبحث نباید بیشتر از ۱۰۰ کاراکتر باشد';
  }

  const totalQ = parseStrictInteger(input.total_q);
  if (totalQ === null) {
    errors.total_q = 'تعداد کل سوالات باید یک عدد صحیح باشد';
  } else if (totalQ < 1) {
    errors.total_q = 'تعداد کل سوالات باید حداقل ۱ باشد';
  }

  const correct = parseStrictInteger(input.correct);
  if (correct === null) {
    errors.correct = 'تعداد پاسخ صحیح باید عدد صحیح باشد';
  } else if (correct < 0) {
    errors.correct = 'تعداد صحیح نمی‌تواند منفی باشد';
  }

  const wrong = parseStrictInteger(input.wrong);
  if (wrong === null) {
    errors.wrong = 'تعداد پاسخ غلط باید عدد صحیح باشد';
  } else if (wrong < 0) {
    errors.wrong = 'تعداد غلط نمی‌تواند منفی باشد';
  }

  const skipped = parseStrictInteger(input.skipped);
  if (skipped === null) {
    errors.skipped = 'تعداد سوالات نزده باید عدد صحیح باشد';
  } else if (skipped < 0) {
    errors.skipped = 'تعداد نزده نمی‌تواند منفی باشد';
  }

  if (
    totalQ !== null &&
    totalQ >= 1 &&
    correct !== null &&
    correct >= 0 &&
    wrong !== null &&
    wrong >= 0 &&
    skipped !== null &&
    skipped >= 0
  ) {
    const sum = correct + wrong + skipped;
    if (sum > totalQ) {
      errors.balance = `مجموع صحیح (${correct}) + غلط (${wrong}) + نزده (${skipped}) برابر ${sum} است و نمی‌تواند از کل سوالات (${totalQ}) بیشتر باشد`;
    }
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

/**
 * Builds the exact JSON payload for PATCH /api/v1/exams/{id}.
 * Intentionally omits `percentage` since it is generated server-side,
 * converts Persian/Arabic digits to integers, and maps empty `chapter` to `null`.
 */
export function buildUpdateExamResultPayload(
  input: ExamEditFormInput
): UpdateExamResultRequest {
  const chapterTrimmed = safeTrim(input.chapter);
  const payload: UpdateExamResultRequest = {
    exam_date: safeTrim(input.exam_date),
    subject: safeTrim(input.subject),
    chapter: chapterTrimmed !== '' ? chapterTrimmed : null,
    total_q: parseStrictInteger(input.total_q) ?? 1,
    correct: parseStrictInteger(input.correct) ?? 0,
    wrong: parseStrictInteger(input.wrong) ?? 0,
    skipped: parseStrictInteger(input.skipped) ?? 0,
  };

  const studentId = parseStrictInteger(input.student_id);
  if (studentId !== null && studentId >= 1) {
    payload.student_id = studentId;
  }

  return payload;
}

/**
 * Normalizes a single flat exam row from GET /api/v1/exams or PATCH /api/v1/exams/{id}.
 * Preserves the server-computed `percentage` verbatim.
 */
export function normalizeExamListItem(
  raw: Partial<ExamListItem> | Record<string, unknown> | null | undefined
): ExamListItem {
  const r = (raw || {}) as Partial<ExamListItem>;
  return {
    id: safeNumber(r.id),
    student_id: safeNumber(r.student_id),
    file_id: r.file_id !== undefined && r.file_id !== null ? safeNumber(r.file_id) : null,
    exam_date: safeTrim(r.exam_date),
    subject: safeTrim(r.subject),
    chapter: safeTrim(r.chapter) || null,
    total_q: safeNumber(r.total_q),
    correct: safeNumber(r.correct),
    wrong: safeNumber(r.wrong),
    skipped: safeNumber(r.skipped),
    percentage: safeNumber(r.percentage),
    student_name: safeTrim(r.student_name) || undefined,
    grade: r.grade !== undefined && r.grade !== null ? safeNumber(r.grade) : null,
    field: safeTrim(r.field) || null,
    created_at: safeTrim(r.created_at) || undefined,
  };
}

/**
 * Groups flat exam rows from GET /api/v1/exams into ExamStudentSummary[] so that
 * `teacher` accounts can browse exam participants for a date without hitting
 * `GET /api/v1/exams/students` (which is restricted to `admin` and `supporter`).
 */
export function groupExamRowsByStudent(rows: ExamListItem[]): ExamStudentSummary[] {
  const byStudent = new Map<
    number,
    {
      student_id: number;
      name: string;
      grade: number;
      field: AcademicField;
      percentages: number[];
    }
  >();

  for (const row of rows || []) {
    const sid = safeNumber(row.student_id);
    if (!sid) continue;
    let bucket = byStudent.get(sid);
    if (!bucket) {
      bucket = {
        student_id: sid,
        name: safeTrim(row.student_name) || `دانش‌آموز #${sid}`,
        grade: safeNumber(row.grade, 12),
        field: (safeTrim(row.field) || 'تجربی') as AcademicField,
        percentages: [],
      };
      byStudent.set(sid, bucket);
    }
    bucket.percentages.push(safeNumber(row.percentage));
  }

  return Array.from(byStudent.values()).map((bucket) => {
    const count = bucket.percentages.length;
    const avg =
      count > 0
        ? Math.round((bucket.percentages.reduce((sum, p) => sum + p, 0) / count) * 10) / 10
        : 0;
    return {
      student_id: bucket.student_id,
      name: bucket.name,
      grade: bucket.grade,
      field: bucket.field,
      subject_count: count,
      avg_percentage: avg,
    };
  });
}

/**
 * Updates the current report card (`ExamDetailsResponse`) in-place after `PATCH /api/v1/exams/{id}`,
 * preserving `data.exam.percentage` verbatim on the updated subject row and recomputing `avg_percentage`.
 * If `exam_date` was moved to another date, removes the moved row from the current date's view.
 */
export function applyUpdatedExamRowToDetails(
  details: ExamDetailsResponse | null,
  updatedExam: ExamListItem,
  viewingExamDate?: string | null
): ExamDetailsResponse | null {
  if (!details) return null;
  const activeDate = safeTrim(viewingExamDate || details.exam_date);
  const movedToDifferentDate =
    Boolean(activeDate) &&
    Boolean(safeTrim(updatedExam.exam_date)) &&
    safeTrim(updatedExam.exam_date) !== activeDate;

  let nextSubjects: SubjectResult[];
  if (movedToDifferentDate) {
    nextSubjects = (details.subjects || []).filter((s) => s.id !== updatedExam.id);
  } else {
    nextSubjects = (details.subjects || []).map((s) =>
      s.id === updatedExam.id
        ? {
            ...s,
            id: updatedExam.id,
            student_id: updatedExam.student_id,
            exam_date: updatedExam.exam_date,
            subject: updatedExam.subject,
            chapter: updatedExam.chapter ?? null,
            total_q: updatedExam.total_q,
            correct: updatedExam.correct,
            wrong: updatedExam.wrong,
            skipped: updatedExam.skipped,
            percentage: updatedExam.percentage,
          }
        : s
    );
  }

  const nextAvg =
    nextSubjects.length > 0
      ? Math.round(
          (nextSubjects.reduce((sum, s) => sum + safeNumber(s.percentage), 0) /
            nextSubjects.length) *
            100
        ) / 100
      : 0;

  return {
    ...details,
    subjects: nextSubjects,
    avg_percentage: nextAvg,
  };
}

/**
 * Updates a flat exam list (`ExamListItem[]`) in-place after `PATCH /api/v1/exams/{id}`.
 */
export function applyUpdatedExamRowToList(
  list: ExamListItem[],
  updatedExam: ExamListItem
): ExamListItem[] {
  return (list || []).map((item) =>
    item.id === updatedExam.id
      ? {
          ...item,
          ...updatedExam,
          student_name: updatedExam.student_name || item.student_name,
          grade: updatedExam.grade ?? item.grade,
          field: updatedExam.field ?? item.field,
        }
      : item
  );
}



