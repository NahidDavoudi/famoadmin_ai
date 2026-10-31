import type { Student } from '../types';

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

export function isValidIranianPhone(phone: string): boolean {
  return /^09\d{9}$/.test(phone.trim());
}

export function isValidNationalId(nationalId: string): boolean {
  return /^\d{10}$/.test(nationalId.trim());
}

export interface StudentFilterCriteria {
  search?: string;
  field?: string;
  grade?: string | number;
  status?: '' | 'active' | 'inactive' | '1' | '0';
}

export function filterStudentsList(students: Student[], criteria: StudentFilterCriteria): Student[] {
  return students.filter((s) => {
    if (criteria.search && criteria.search.trim() !== '') {
      const q = criteria.search.trim().toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchPhone = (s.phone || '').includes(q);
      const matchNationalId = (s.national_id || '').includes(q);
      if (!matchName && !matchPhone && !matchNationalId) return false;
    }

    if (criteria.field && criteria.field !== '') {
      if (s.field !== criteria.field) return false;
    }

    if (criteria.grade !== undefined && criteria.grade !== '') {
      if (Number(s.grade) !== Number(criteria.grade)) return false;
    }

    if (criteria.status === 'active' || criteria.status === '1') {
      if (Number(s.is_active) !== 1) return false;
    } else if (criteria.status === 'inactive' || criteria.status === '0') {
      if (Number(s.is_active) !== 0) return false;
    }

    return true;
  });
}
