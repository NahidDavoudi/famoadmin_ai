import type {
  AdmissionExamType,
  AdmissionRecord,
  AdmissionStatus,
  AdmissionUpsertInput,
  TestimonialAuthorRole,
  TestimonialRecord,
  TestimonialSource,
  TestimonialStatus,
  UserRole,
} from '../types';
import { normalizeIntegerInput, parseStrictInteger, toEnglishDigits } from './jalali';

export const ADMISSION_CONSENT_LABEL =
  'رضایت شاگرد/ولی برای انتشار نام و عکس دریافت شده است';

export const CONSENT_REQUIRED_MESSAGE =
  'برای انتشار عمومی این قبولی، دریافت و ثبت رضایت شاگرد یا ولی الزامی است.';

export const ADMISSION_EXAM_TYPES: ReadonlyArray<{ value: AdmissionExamType; label: string }> = [
  { value: 'konkur', label: 'کنکور سراسری' },
  { value: 'tizhooshan', label: 'تیزهوشان (سمپاد)' },
  { value: 'nemoone', label: 'نمونه دولتی' },
  { value: 'olympiad', label: 'المپیاد علمی' },
  { value: 'other', label: 'سایر آزمون‌ها' },
];

export const TESTIMONIAL_AUTHOR_ROLES: ReadonlyArray<{
  value: TestimonialAuthorRole;
  label: string;
}> = [
  { value: 'student', label: 'دانش‌آموز' },
  { value: 'parent', label: 'والدین' },
  { value: 'graduate', label: 'قبول‌شده / فارغ‌التحصیل' },
  { value: 'other', label: 'سایر' },
];

export const BULK_REJECT_MAX_BATCH = 100;

export function canAccessAdminOnlySections(role?: UserRole | string | null): boolean {
  return String(role || '').toLowerCase() === 'admin';
}

export function getExamTypeLabel(examType?: string | null): string {
  const key = String(examType || '').trim();
  const found = ADMISSION_EXAM_TYPES.find((item) => item.value === key);
  return found ? found.label : key || 'کنکور سراسری';
}

export function getAuthorRoleLabel(role?: string | null): string {
  const key = String(role || '').trim();
  const found = TESTIMONIAL_AUTHOR_ROLES.find((item) => item.value === key);
  return found ? found.label : key || 'دانش‌آموز';
}

export function normalizeBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    return clean === '1' || clean === 'true' || clean === 'yes';
  }
  return false;
}

export function normalizeAdmission(raw: Record<string, unknown>): AdmissionRecord {
  const statusRaw = String(raw.status ?? '').trim().toLowerCase();
  const status: AdmissionStatus =
    statusRaw === 'published' || raw.is_published === true || raw.is_published === 1
      ? 'published'
      : 'draft';

  const consentRaw =
    raw.consent_confirmed !== undefined
      ? raw.consent_confirmed
      : raw.consent_obtained !== undefined
        ? raw.consent_obtained
        : raw.has_consent !== undefined
          ? raw.has_consent
          : raw.consent;

  const photoRaw =
    raw.image_url ?? raw.photo_url ?? raw.photo ?? raw.avatar_url ?? null;

  const rankRaw = raw.rank_value ?? raw.rank ?? raw.national_rank ?? null;

  const examRaw = String(raw.exam_type ?? 'konkur').trim() || 'konkur';
  const normalizedExamType = examRaw === 'nemooneh' ? 'nemoone' : examRaw;

  return {
    id: Number(raw.id) || 0,
    student_name: String(raw.student_name ?? raw.name ?? '').trim(),
    year:
      parseStrictInteger(
        (raw.jalali_year ?? raw.year ?? raw.admission_year) as string | number | null | undefined
      ) ?? 1404,
    exam_type: normalizedExamType,
    field: String(raw.field ?? raw.major ?? '').trim(),
    admission_title: String(
      raw.result_title ??
        raw.admission_title ??
        raw.title ??
        raw.university ??
        raw.university_title ??
        ''
    ).trim(),
    rank:
      rankRaw === null || rankRaw === undefined || String(rankRaw).trim() === ''
        ? null
        : String(rankRaw).trim(),
    display_order:
      parseStrictInteger(
        (raw.display_order ?? raw.sort_order ?? 0) as string | number | null | undefined
      ) ?? 0,
    photo_url:
      photoRaw && String(photoRaw).trim() !== '' && String(photoRaw).trim() !== 'null'
        ? String(photoRaw).trim()
        : null,
    status,
    consent_obtained: normalizeBoolean(consentRaw),
    created_at: raw.created_at ? String(raw.created_at) : null,
    updated_at: raw.updated_at ? String(raw.updated_at) : null,
  };
}

export function normalizeTestimonial(raw: Record<string, unknown>): TestimonialRecord {
  const statusRaw = String(raw.status ?? 'pending').trim().toLowerCase();
  const status: TestimonialStatus =
    statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';

  const sourceRaw = String(raw.source ?? 'public_form').trim().toLowerCase();
  const source: TestimonialSource = sourceRaw === 'admin' ? 'admin' : 'public_form';

  const roleRaw = String(raw.author_role ?? raw.role ?? 'student').trim().toLowerCase() || 'student';
  const normalizedRole: TestimonialAuthorRole = roleRaw === 'alumni' ? 'graduate' : roleRaw;

  const ratingNum = Number(raw.rating ?? 5);
  const clampedRating = Number.isFinite(ratingNum)
    ? Math.min(5, Math.max(1, Math.round(ratingNum)))
    : 5;

  const courseObj = raw.course as Record<string, unknown> | null | undefined;
  const instructorObj = raw.instructor as Record<string, unknown> | null | undefined;

  const courseId =
    raw.course_id !== undefined && raw.course_id !== null && String(raw.course_id) !== ''
      ? Number(raw.course_id)
      : courseObj && courseObj.id
        ? Number(courseObj.id)
        : null;

  const instructorId =
    raw.instructor_id !== undefined &&
    raw.instructor_id !== null &&
    String(raw.instructor_id) !== ''
      ? Number(raw.instructor_id)
      : instructorObj && instructorObj.id
        ? Number(instructorObj.id)
        : null;

  const metaRaw =
    raw.author_meta ?? raw.author_subtitle ?? raw.role_description ?? raw.subtitle ?? null;

  return {
    id: Number(raw.id) || 0,
    author_name: String(raw.author_name ?? raw.name ?? '').trim(),
    author_role: normalizedRole,
    author_subtitle:
      metaRaw !== null && metaRaw !== undefined ? String(metaRaw).trim() || null : null,
    rating: clampedRating,
    content: String(raw.content ?? raw.body ?? raw.text ?? '').trim(),
    status,
    source,
    course_id: Number.isFinite(courseId as number) && (courseId as number) > 0 ? courseId : null,
    course_name:
      raw.course_name
        ? String(raw.course_name).trim()
        : courseObj && courseObj.name
          ? String(courseObj.name).trim()
          : null,
    instructor_id:
      Number.isFinite(instructorId as number) && (instructorId as number) > 0
        ? instructorId
        : null,
    instructor_name:
      raw.instructor_name
        ? String(raw.instructor_name).trim()
        : instructorObj && instructorObj.name
          ? String(instructorObj.name).trim()
          : null,
    rejection_reason:
      raw.rejection_reason !== undefined && raw.rejection_reason !== null
        ? String(raw.rejection_reason).trim() || null
        : null,
    created_at: raw.created_at ? String(raw.created_at) : null,
    updated_at: raw.updated_at ? String(raw.updated_at) : null,
  };
}

export interface AdmissionFormValues {
  student_name: string;
  year: string;
  exam_type: AdmissionExamType;
  field: string;
  admission_title: string;
  rank: string;
  display_order: string;
  status: AdmissionStatus;
  consent_obtained: boolean;
}

export function validateAdmissionForm(values: AdmissionFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = values.student_name.trim();
  if (!name) {
    errors.student_name = 'وارد کردن نام دانش‌آموز الزامی است';
  } else if (name.length < 2) {
    errors.student_name = 'نام دانش‌آموز باید حداقل ۲ کاراکتر باشد';
  }

  const yearNum = parseStrictInteger(values.year);
  if (yearNum === null || yearNum < 1380 || yearNum > 1450) {
    errors.year = 'سال شمسی معتبر وارد کنید (مثلاً 1404 یا ۱۴۰۴)';
  }

  if (!values.exam_type || !String(values.exam_type).trim()) {
    errors.exam_type = 'انتخاب نوع آزمون الزامی است';
  }

  if (!values.field || !values.field.trim()) {
    errors.field = 'انتخاب رشته الزامی است';
  }

  const title = values.admission_title.trim();
  if (!title) {
    errors.admission_title = 'وارد کردن عنوان قبولی یا دانشگاه الزامی است';
  }

  const orderStr = toEnglishDigits(values.display_order).trim();
  if (orderStr !== '') {
    const orderNum = parseStrictInteger(orderStr);
    if (orderNum === null || orderNum < 0) {
      errors.display_order = 'ترتیب نمایش باید عدد صحیح غیرمنفی باشد';
    }
  }

  if (values.status === 'published' && !values.consent_obtained) {
    errors.status = CONSENT_REQUIRED_MESSAGE;
    errors.consent_obtained = CONSENT_REQUIRED_MESSAGE;
  }

  return errors;
}

/**
 * Returns true if the user is editing a currently published admission and unchecked consent,
 * meaning saving will automatically unpublish it and requires a pre-save warning.
 */
export function shouldWarnConsentUnpublish(
  original: Pick<AdmissionRecord, 'status' | 'consent_obtained'> | null | undefined,
  nextConsent: boolean
): boolean {
  if (!original) return false;
  return original.status === 'published' && !nextConsent;
}

/**
 * Default values when creating a new admission record:
 * consent checked by default and status ready for public publishing.
 */
export function getDefaultNewAdmissionFormState(todayJalaliYear: number): AdmissionFormValues {
  return {
    student_name: '',
    year: String(todayJalaliYear),
    exam_type: 'konkur',
    field: 'تجربی',
    admission_title: '',
    rank: '',
    display_order: '0',
    status: 'published',
    consent_obtained: true,
  };
}

/**
 * Computes the next form state after "Save & Add Another" (ذخیره و ثبت بعدی):
 * clears student-specific fields while keeping batch settings (year, exam_type,
 * field, consent, status) and auto-incrementing positive display_order values.
 */
export function getNextRapidAdmissionFormState(prev: AdmissionFormValues): AdmissionFormValues {
  const prevOrder = parseStrictInteger(prev.display_order) ?? 0;
  const nextOrder = prevOrder > 0 ? String(prevOrder + 1) : '0';
  const nextStatus: AdmissionStatus = prev.consent_obtained ? prev.status : 'draft';

  return {
    student_name: '',
    year: prev.year,
    exam_type: prev.exam_type,
    field: prev.field,
    admission_title: '',
    rank: '',
    display_order: nextOrder,
    status: nextStatus,
    consent_obtained: prev.consent_obtained,
  };
}

export function buildAdmissionFormData(input: AdmissionUpsertInput): FormData {
  const fd = new FormData();
  const cleanName = input.student_name.trim();
  const cleanYear = normalizeIntegerInput(input.year, 4);
  const cleanExamType = String(input.exam_type).trim() === 'nemooneh' ? 'nemoone' : String(input.exam_type).trim();
  const cleanTitle = input.admission_title.trim();
  const cleanOrder = String(parseStrictInteger(input.display_order) ?? 0);
  const cleanConsent = input.consent_obtained ? '1' : '0';
  const cleanRank =
    input.rank !== undefined && input.rank !== null && String(input.rank).trim() !== ''
      ? toEnglishDigits(String(input.rank)).trim()
      : '';

  // Exact live OpenAPI AdmissionWriteRequest + multipart fields
  fd.append('student_name', cleanName);
  fd.append('jalali_year', cleanYear);
  fd.append('exam_type', cleanExamType);
  fd.append('field', input.field.trim());
  fd.append('result_title', cleanTitle);
  fd.append('rank_value', cleanRank);
  fd.append('display_order', cleanOrder);
  const effectiveStatus: AdmissionStatus = input.consent_obtained ? input.status : 'draft';
  fd.append('status', effectiveStatus);
  fd.append('consent_confirmed', cleanConsent);

  if (input.photo instanceof File) {
    fd.append('image', input.photo);
  } else if (input.remove_photo) {
    fd.append('remove_image', '1');
  }

  return fd;
}

export interface TestimonialFormValues {
  author_name: string;
  author_role: TestimonialAuthorRole;
  author_subtitle: string;
  rating: number;
  content: string;
  status: TestimonialStatus;
  course_id: string;
  instructor_id: string;
}

export function validateTestimonialForm(values: TestimonialFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = values.author_name.trim();
  if (!name) {
    errors.author_name = 'وارد کردن نام نویسنده نظر الزامی است';
  } else if (name.length < 2) {
    errors.author_name = 'نام نویسنده باید حداقل ۲ کاراکتر باشد';
  }

  if (!values.author_role || !String(values.author_role).trim()) {
    errors.author_role = 'انتخاب نقش الزامی است';
  }

  if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) {
    errors.rating = 'امتیاز باید بین ۱ تا ۵ ستاره باشد';
  }

  const body = values.content.trim();
  if (!body) {
    errors.content = 'وارد کردن متن نظر الزامی است';
  } else if (body.length < 10) {
    errors.content = 'متن نظر باید حداقل ۱۰ کاراکتر باشد';
  } else if (body.length > 1500) {
    errors.content = 'متن نظر نباید بیشتر از ۱۵۰۰ کاراکتر باشد';
  }

  return errors;
}

/**
 * Splits an array of testimonial IDs into deduplicated batches of at most `maxBatchSize` (default 100)
 * to comply with the backend's 100-item per-request limit on POST /api/v1/testimonials/bulk-reject.
 */
export function chunkBulkRejectIds(
  ids: readonly number[],
  maxBatchSize = BULK_REJECT_MAX_BATCH
): number[][] {
  const limit = Math.max(1, Math.floor(maxBatchSize));
  const uniqueValid: number[] = [];
  const seen = new Set<number>();

  for (const raw of ids) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      uniqueValid.push(n);
    }
  }

  const chunks: number[][] = [];
  for (let i = 0; i < uniqueValid.length; i += limit) {
    chunks.push(uniqueValid.slice(i, i + limit));
  }
  return chunks;
}

export interface StructuredApiErrorLike {
  code?: string | null;
  status?: number;
  message?: string;
  details?: Record<string, string | string[]> | null;
}

/**
 * Extracts normalized 422 field errors and special error codes (such as CONSENT_REQUIRED)
 * from an ApiRequestError or plain Error.
 */
export function extractApiFieldErrors(
  err: unknown,
  fieldAliasMap: Record<string, string> = {}
): {
  code: string | null;
  isConsentRequired: boolean;
  message: string;
  fieldErrors: Record<string, string>;
} {
  const e = err as StructuredApiErrorLike | null | undefined;
  const code = e?.code ? String(e.code).trim().toUpperCase() : null;
  const isConsentRequired = code === 'CONSENT_REQUIRED';
  const fieldErrors: Record<string, string> = {};

  if (e?.details && typeof e.details === 'object') {
    for (const [rawKey, rawVal] of Object.entries(e.details)) {
      const mappedKey = fieldAliasMap[rawKey] || rawKey;
      if (Array.isArray(rawVal)) {
        const first = rawVal.find((v) => String(v || '').trim() !== '');
        if (first) fieldErrors[mappedKey] = String(first).trim();
      } else if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
        fieldErrors[mappedKey] = String(rawVal).trim();
      }
    }
  }

  if (isConsentRequired) {
    const consentMsg =
      (e?.message && e.message.trim()) || CONSENT_REQUIRED_MESSAGE;
    fieldErrors.consent_obtained = fieldErrors.consent_obtained || consentMsg;
    fieldErrors.status = fieldErrors.status || consentMsg;
    return {
      code,
      isConsentRequired: true,
      message: consentMsg,
      fieldErrors,
    };
  }

  return {
    code,
    isConsentRequired: false,
    message: (e?.message && String(e.message).trim()) || 'خطا در ارتباط با سرور',
    fieldErrors,
  };
}
