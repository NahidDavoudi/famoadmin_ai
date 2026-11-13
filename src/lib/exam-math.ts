import type { AcademicField, ExamDetailsResponse, SubjectResult, Student } from '../types';
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
