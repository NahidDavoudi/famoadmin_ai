import API, { ApiRequestError } from './api';
import { extractApiFieldErrors } from './admissions-testimonials';
import { toEnglishDigits } from './jalali';
import {
  createOptimisticQueueStore,
  type OptimisticQueueItem,
} from './optimistic-queue';
import type {
  AdmissionRecord,
  AdmissionStatus,
  AdmissionUpsertInput,
} from '../types';

export const ADMISSIONS_KEEP_OPEN_STORAGE_KEY = 'famo_admissions_keep_open';
export const ADMISSIONS_QUEUE_SESSION_KEY = 'famo_admissions_optimistic_queue_v1';

export const ADMISSION_ERROR_FIELD_ALIASES: Record<string, string> = {
  name: 'student_name',
  jalali_year: 'year',
  admission_year: 'year',
  result_title: 'admission_title',
  title: 'admission_title',
  university: 'admission_title',
  university_title: 'admission_title',
  rank_value: 'rank',
  major: 'field',
  sort_order: 'display_order',
  consent_confirmed: 'consent_obtained',
  consent: 'consent_obtained',
  has_consent: 'consent_obtained',
  image: 'photo',
};

export interface AdmissionActiveFilters {
  search: string;
  year: string;
  status: AdmissionStatus | '';
  page?: number;
}

export type SerializedAdmissionPayload = Omit<AdmissionUpsertInput, 'photo'> & {
  photo?: null;
};

/**
 * Checks whether an admission record matches the currently active page filters.
 * Used to tag optimistic rows created while a non-matching filter or page > 1 is active.
 */
export function matchesAdmissionFilters(
  record: Pick<AdmissionRecord, 'student_name' | 'year' | 'field' | 'admission_title' | 'rank' | 'status'>,
  filters: AdmissionActiveFilters
): boolean {
  if (filters.page !== undefined && filters.page > 1) {
    return false;
  }

  if (filters.status && record.status !== filters.status) {
    return false;
  }

  const normalizedFilterYear = toEnglishDigits(filters.year || '').trim();
  if (normalizedFilterYear && String(record.year) !== normalizedFilterYear) {
    return false;
  }

  const q = (filters.search || '').trim().toLowerCase();
  if (q) {
    const haystack = [
      record.student_name,
      record.admission_title,
      record.field,
      record.rank !== null && record.rank !== undefined ? String(record.rank) : '',
      String(record.year),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) {
      return false;
    }
  }

  return true;
}

function normalizeMatchText(val: string | number | null | undefined): string {
  return toEnglishDigits(String(val ?? ''))
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();
}

/**
 * Finds a likely duplicate admission already present in server records
 * by comparing normalized student_name + jalali year + admission_title.
 */
export function findPossibleDuplicateAdmission(
  candidate: Pick<AdmissionRecord, 'student_name' | 'year' | 'admission_title'>,
  serverRecords: readonly AdmissionRecord[]
): AdmissionRecord | null {
  const targetName = normalizeMatchText(candidate.student_name);
  const targetYear = Number(candidate.year);
  const targetTitle = normalizeMatchText(candidate.admission_title);

  if (!targetName || !targetTitle || !Number.isFinite(targetYear)) {
    return null;
  }

  for (const rec of serverRecords) {
    if (
      Number(rec.year) === targetYear &&
      normalizeMatchText(rec.student_name) === targetName &&
      normalizeMatchText(rec.admission_title) === targetTitle
    ) {
      return rec;
    }
  }
  return null;
}

export function buildOptimisticAdmissionRecord(
  input: AdmissionUpsertInput,
  options: { id: number; existingPhotoUrl?: string | null; previewUrl?: string | null }
): AdmissionRecord {
  const photoUrl = input.remove_photo
    ? null
    : options.previewUrl || options.existingPhotoUrl || null;

  return {
    id: options.id,
    student_name: input.student_name.trim(),
    year: input.year,
    exam_type: input.exam_type,
    field: input.field.trim(),
    admission_title: input.admission_title.trim(),
    rank: input.rank ?? null,
    display_order: input.display_order,
    photo_url: photoUrl,
    status: input.consent_obtained ? input.status : 'draft',
    consent_obtained: input.consent_obtained,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export type AdmissionQueueItem = OptimisticQueueItem<AdmissionUpsertInput, AdmissionRecord>;

/**
 * Module-level singleton optimistic queue for Admissions.
 * Survives modal close and SPA route navigation.
 */
export const admissionsQueueStore = createOptimisticQueueStore<
  AdmissionUpsertInput,
  AdmissionRecord,
  SerializedAdmissionPayload
>({
  maxConcurrency: 2,
  requestTimeoutMs: 25_000,
  drainDebounceMs: 1500,
  sessionStorageKey: ADMISSIONS_QUEUE_SESSION_KEY,
  enableBeforeUnload: true,
  executor: async (item, { idempotencyKey, signal }) => {
    if (item.operation === 'update' && item.targetId !== null) {
      const res = await API.updateAdmission(item.targetId, item.payload, {
        idempotencyKey,
        signal,
      });
      return res.data;
    }
    const res = await API.createAdmission(item.payload, {
      idempotencyKey,
      signal,
    });
    return res.data;
  },
  parseError: (err) => {
    const parsed = extractApiFieldErrors(err, ADMISSION_ERROR_FIELD_ALIASES);
    const status = err instanceof ApiRequestError ? err.status : Number((err as { status?: number })?.status || 0);
    return {
      status,
      code: parsed.code,
      message: parsed.message,
      fieldErrors: parsed.fieldErrors,
      isConsentRequired: parsed.isConsentRequired,
    };
  },
  getItemLabel: (item) => item.optimisticRecord.student_name || 'قبولی',
  serializePayload: (payload) => {
    const { photo, ...rest } = payload;
    return {
      data: { ...rest, photo: null },
      hadFile: Boolean(photo),
    };
  },
  deserializePayload: (data) => ({
    ...data,
    photo: null,
  }),
});
