import {
  calculateSubjectMetrics,
  isValidIranianPhone,
  isValidNationalId,
  type SubjectDraft,
} from './exam-math';

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export interface StudentFormInput {
  name: string;
  phone: string;
  national_id: string;
  grade: string;
  field: string;
}

export function validateStudentForm(
  input: StudentFormInput
): FieldErrors<'name' | 'phone' | 'national_id' | 'grade' | 'field'> {
  const errors: FieldErrors<'name' | 'phone' | 'national_id' | 'grade' | 'field'> = {};

  if (!input.name.trim()) {
    errors.name = 'نام و نام خانوادگی الزامی است';
  }

  if (!input.phone.trim()) {
    errors.phone = 'شماره موبایل الزامی است';
  } else if (!isValidIranianPhone(input.phone)) {
    errors.phone = 'شماره موبایل معتبر نیست (مثال: 09123456789)';
  }

  if (!input.national_id.trim()) {
    errors.national_id = 'کد ملی الزامی است';
  } else if (!isValidNationalId(input.national_id)) {
    errors.national_id = 'کد ملی باید دقیقاً ۱۰ رقم باشد';
  }

  const gradeNum = Number(input.grade);
  if (!String(input.grade).trim() || Number.isNaN(gradeNum) || gradeNum < 7 || gradeNum > 12) {
    errors.grade = 'پایه تحصیلی باید بین ۷ تا ۱۲ باشد';
  }

  if (!input.field.trim()) {
    errors.field = 'انتخاب رشته تحصیلی الزامی است';
  }

  return errors;
}

export interface CourseFormInput {
  name: string;
  display_order?: string;
}

export function validateCourseForm(
  input: CourseFormInput
): FieldErrors<'name' | 'display_order'> {
  const errors: FieldErrors<'name' | 'display_order'> = {};

  if (!input.name.trim()) {
    errors.name = 'وارد کردن نام دوره الزامی است';
  }

  if (input.display_order !== undefined && String(input.display_order).trim() === '') {
    errors.display_order = 'ترتیب نمایش الزامی است';
  } else if (Number(input.display_order) < 0) {
    errors.display_order = 'ترتیب نمایش نمی‌تواند منفی باشد';
  }

  return errors;
}

export interface InstructorFormInput {
  name: string;
  title: string;
  display_order?: string;
}

export function validateInstructorForm(
  input: InstructorFormInput
): FieldErrors<'name' | 'title' | 'display_order'> {
  const errors: FieldErrors<'name' | 'title' | 'display_order'> = {};

  if (!input.name.trim()) {
    errors.name = 'نام و نام خانوادگی استاد الزامی است';
  }

  if (!input.title.trim()) {
    errors.title = 'عنوان یا سمت استاد الزامی است';
  }

  if (input.display_order !== undefined && String(input.display_order).trim() === '') {
    errors.display_order = 'ترتیب نمایش الزامی است';
  } else if (Number(input.display_order) < 0) {
    errors.display_order = 'ترتیب نمایش نمی‌تواند منفی باشد';
  }

  return errors;
}

export interface SupporterFormInput {
  name: string;
  phone: string;
  grade: string;
  field: string;
  username: string;
  password: string;
}

export function validateSupporterForm(
  input: SupporterFormInput,
  isEditing: boolean
): FieldErrors<'name' | 'phone' | 'grade' | 'field' | 'username' | 'password'> {
  const errors: FieldErrors<'name' | 'phone' | 'grade' | 'field' | 'username' | 'password'> = {};

  if (!input.name.trim()) {
    errors.name = 'نام و نام خانوادگی پشتیبان الزامی است';
  }

  if (!isEditing) {
    if (!input.phone.trim()) {
      errors.phone = 'شماره موبایل الزامی است';
    } else if (!isValidIranianPhone(input.phone)) {
      errors.phone = 'فرمت شماره موبایل معتبر نیست (مثال: 09123456789)';
    }
  }

  if (!String(input.grade).trim()) {
    errors.grade = 'انتخاب پایه تحصیلی الزامی است';
  }

  if (!input.field.trim()) {
    errors.field = 'انتخاب رشته یا درس الزامی است';
  }

  if (!isEditing && !input.username.trim()) {
    errors.username = 'نام کاربری برای ورود به پنل الزامی است';
  }

  if (!isEditing && !input.password) {
    errors.password = 'وارد کردن رمز عبور الزامی است';
  } else if (input.password && input.password.length < 4) {
    errors.password = 'رمز عبور باید حداقل ۴ کاراکتر باشد';
  }

  return errors;
}

export interface FileUploadFormInput {
  studentId: string;
  examDate: string;
  hasFile: boolean;
}

export function validateFileUploadForm(
  input: FileUploadFormInput
): FieldErrors<'studentId' | 'examDate' | 'file'> {
  const errors: FieldErrors<'studentId' | 'examDate' | 'file'> = {};

  if (!input.studentId.trim()) {
    errors.studentId = 'انتخاب دانش‌آموز الزامی است';
  }

  if (!input.examDate.trim()) {
    errors.examDate = 'انتخاب تاریخ آزمون الزامی است';
  }

  if (!input.hasFile) {
    errors.file = 'انتخاب فایل برای آپلود الزامی است';
  }

  return errors;
}

export interface BlogPostFormInput {
  title: string;
  slug: string;
  category: string;
  content: string;
  cover_image?: string;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function validateBlogPostForm(
  input: BlogPostFormInput
): FieldErrors<'title' | 'slug' | 'category' | 'content' | 'cover_image'> {
  const errors: FieldErrors<'title' | 'slug' | 'category' | 'content' | 'cover_image'> = {};

  if (!input.title.trim()) {
    errors.title = 'عنوان پست وبلاگ الزامی است';
  }

  if (!input.slug.trim()) {
    errors.slug = 'اسلاگ (آدرس URL) الزامی است';
  }

  if (!input.category.trim()) {
    errors.category = 'انتخاب دسته‌بندی الزامی است';
  }

  if (!stripHtmlToText(input.content)) {
    errors.content = 'محتوای کامل پست نمی‌تواند خالی باشد';
  }

  if (
    input.cover_image &&
    input.cover_image.trim() !== '' &&
    !/^(https?:\/\/|\/)/i.test(input.cover_image.trim())
  ) {
    errors.cover_image = 'آدرس تصویر باید با http:// یا https:// شروع شود';
  }

  return errors;
}

export interface SubjectRowErrors {
  subject?: string;
  total_q?: string;
  correct?: string;
  wrong?: string;
}

export interface ExamEntryValidationResult {
  studentError?: string;
  rowErrors: Record<string, SubjectRowErrors>;
  isValid: boolean;
}

export function validateExamEntryForm(input: {
  hasStudent: boolean;
  studentQuery: string;
  rows: SubjectDraft[];
}): ExamEntryValidationResult {
  let studentError: string | undefined;
  if (!input.hasStudent) {
    studentError = input.studentQuery.trim()
      ? 'لطفاً نام دانش‌آموز را از لیست پیشنهادی انتخاب کنید'
      : 'انتخاب دانش‌آموز الزامی است';
  }

  const rowErrors: Record<string, SubjectRowErrors> = {};
  const nonBlankRows = input.rows.filter(
    (r) =>
      r.subject.trim() !== '' ||
      String(r.total_q).trim() !== '' ||
      String(r.correct).trim() !== '' ||
      String(r.wrong).trim() !== ''
  );

  const rowsToValidate = nonBlankRows.length > 0 ? nonBlankRows : input.rows.slice(0, 1);

  for (const row of rowsToValidate) {
    const rErr: SubjectRowErrors = {};
    if (!row.subject.trim()) {
      rErr.subject = 'نام درس الزامی است';
    }

    const totalStr = String(row.total_q).trim();
    const totalNum = Number(totalStr);
    if (!totalStr) {
      rErr.total_q = 'الزامی';
    } else if (Number.isNaN(totalNum) || totalNum < 1) {
      rErr.total_q = 'حداقل ۱ سوال';
    }

    const correctStr = String(row.correct).trim();
    const wrongStr = String(row.wrong).trim();
    const correctNum = correctStr === '' ? 0 : Number(correctStr);
    const wrongNum = wrongStr === '' ? 0 : Number(wrongStr);

    if (correctStr === '') {
      rErr.correct = 'الزامی';
    } else if (Number.isNaN(correctNum) || correctNum < 0) {
      rErr.correct = 'نامعتبر';
    }

    if (wrongStr === '') {
      rErr.wrong = 'الزامی';
    } else if (Number.isNaN(wrongNum) || wrongNum < 0) {
      rErr.wrong = 'نامعتبر';
    }

    if (!rErr.total_q && !rErr.correct && !rErr.wrong) {
      const metrics = calculateSubjectMetrics(totalNum, correctNum, wrongNum);
      if (!metrics.isValid) {
        rErr.correct = 'مجموع > کل';
        rErr.wrong = 'مجموع > کل';
      }
    }

    if (Object.keys(rErr).length > 0) {
      rowErrors[row.id] = rErr;
    }
  }

  return {
    studentError,
    rowErrors,
    isValid: !studentError && Object.keys(rowErrors).length === 0,
  };
}

export function validateReportDateFilter(input: {
  dateFrom: string;
  dateTo: string;
}): FieldErrors<'dateFrom' | 'dateTo'> {
  const errors: FieldErrors<'dateFrom' | 'dateTo'> = {};
  if (!input.dateFrom.trim()) {
    errors.dateFrom = 'تاریخ شروع الزامی است';
  }
  if (!input.dateTo.trim()) {
    errors.dateTo = 'تاریخ پایان الزامی است';
  } else if (input.dateFrom && input.dateTo < input.dateFrom) {
    errors.dateTo = 'تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد';
  }
  return errors;
}
