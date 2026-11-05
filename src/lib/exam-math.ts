import type { AcademicField, Student } from '../types';

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
 * ((correct - wrong / 3) / total) * 100
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

  const rawPercentage = ((correct - wrong / 3) / total) * 100;
  const rounded = Math.round(rawPercentage * 10) / 10;

  return {
    skipped,
    percentage: rounded,
    isValid: true,
  };
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
