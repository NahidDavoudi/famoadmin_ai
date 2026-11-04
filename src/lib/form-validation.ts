import {
  calculateSubjectMetrics,
  isValidIranianPhone,
  isValidNationalId,
  safeTrim,
  type SubjectDraft,
} from './exam-math';

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export function hasErrors<T extends string>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).some((msg) => Boolean(msg));
}

export interface StudentFormInput {
  name: string;
  phone: string | number;
  national_id: string | number;
  grade: string | number;
  field: string;
}

export function validateStudentForm(
  input: StudentFormInput
): FieldErrors<'name' | 'phone' | 'national_id' | 'grade' | 'field'> {
  const errors: FieldErrors<'name' | 'phone' | 'national_id' | 'grade' | 'field'> = {};

  const name = safeTrim(input.name);
  if (!name) {
    errors.name = 'نام و نام خانوادگی الزامی است';
  } else if (name.length < 2) {
    errors.name = 'نام و نام خانوادگی باید حداقل ۲ کاراکتر باشد';
  }

  const phone = safeTrim(input.phone);
  if (!phone) {
    errors.phone = 'شماره موبایل الزامی است';
  } else if (!isValidIranianPhone(phone)) {
    errors.phone = 'شماره موبایل معتبر نیست (مثال: 09123456789)';
  }

  const nationalId = safeTrim(input.national_id);
  if (!nationalId) {
    errors.national_id = 'کد ملی الزامی است';
  } else if (!isValidNationalId(nationalId)) {
    errors.national_id = 'کد ملی باید دقیقاً ۱۰ رقم باشد';
  }

  const gradeStr = safeTrim(input.grade);
  const gradeNum = Number(gradeStr);
  if (!gradeStr || Number.isNaN(gradeNum) || gradeNum < 7 || gradeNum > 12) {
    errors.grade = 'پایه تحصیلی باید بین ۷ تا ۱۲ باشد';
  }

  if (!safeTrim(input.field)) {
    errors.field = 'انتخاب رشته تحصیلی الزامی است';
  }

  return errors;
}

export interface CourseFormInput {
  name: string;
  display_order?: string | number;
}

export function validateCourseForm(
  input: CourseFormInput
): FieldErrors<'name' | 'display_order'> {
  const errors: FieldErrors<'name' | 'display_order'> = {};

  if (!safeTrim(input.name)) {
    errors.name = 'وارد کردن نام دوره الزامی است';
  }

  if (input.display_order !== undefined && safeTrim(input.display_order) === '') {
    errors.display_order = 'ترتیب نمایش الزامی است';
  } else if (Number(input.display_order) < 0) {
    errors.display_order = 'ترتیب نمایش نمی‌تواند منفی باشد';
  }

  return errors;
}

export interface InstructorFormInput {
  name: string;
  title: string;
  display_order?: string | number;
}

export function validateInstructorForm(
  input: InstructorFormInput
): FieldErrors<'name' | 'title' | 'display_order'> {
  const errors: FieldErrors<'name' | 'title' | 'display_order'> = {};

  if (!safeTrim(input.name)) {
    errors.name = 'نام و نام خانوادگی استاد الزامی است';
  }

  if (!safeTrim(input.title)) {
    errors.title = 'عنوان یا سمت استاد الزامی است';
  }

  if (input.display_order !== undefined && safeTrim(input.display_order) === '') {
    errors.display_order = 'ترتیب نمایش الزامی است';
  } else if (Number(input.display_order) < 0) {
    errors.display_order = 'ترتیب نمایش نمی‌تواند منفی باشد';
  }

  return errors;
}

export interface SupporterFormInput {
  name: string;
  phone: string | number;
  grade: string | number;
  field: string;
  chat_id?: string | number | null;
  username: string;
  password: string;
}

export function validateSupporterForm(
  input: SupporterFormInput,
  isEditing: boolean
): FieldErrors<'name' | 'phone' | 'grade' | 'field' | 'username' | 'password'> {
  const errors: FieldErrors<'name' | 'phone' | 'grade' | 'field' | 'username' | 'password'> = {};

  if (!safeTrim(input.name)) {
    errors.name = 'نام و نام خانوادگی پشتیبان الزامی است';
  }

  if (!isEditing) {
    const phone = safeTrim(input.phone);
    if (!phone) {
      errors.phone = 'شماره موبایل الزامی است';
    } else if (!isValidIranianPhone(phone)) {
      errors.phone = 'فرمت شماره موبایل معتبر نیست (مثال: 09123456789)';
    }
  }

  if (!safeTrim(input.grade)) {
    errors.grade = 'انتخاب پایه تحصیلی الزامی است';
  }

  if (!safeTrim(input.field)) {
    errors.field = 'انتخاب رشته یا درس الزامی است';
  }

  if (!isEditing && !safeTrim(input.username)) {
    errors.username = 'نام کاربری برای ورود به پنل الزامی است';
  }

  const pwd = String(input.password ?? '');
  if (!isEditing && !pwd) {
    errors.password = 'وارد کردن رمز عبور الزامی است';
  } else if (pwd && pwd.length < 4) {
    errors.password = 'رمز عبور باید حداقل ۴ کاراکتر باشد';
  }

  return errors;
}

export interface FileUploadFormInput {
  studentId: string | number;
  examDate: string;
  hasFile: boolean;
}

export function validateFileUploadForm(
  input: FileUploadFormInput
): FieldErrors<'studentId' | 'examDate' | 'file'> {
  const errors: FieldErrors<'studentId' | 'examDate' | 'file'> = {};

  if (!safeTrim(input.studentId)) {
    errors.studentId = 'انتخاب دانش‌آموز الزامی است';
  }

  if (!safeTrim(input.examDate)) {
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

export function stripHtmlToText(html: unknown): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function validateBlogPostForm(
  input: BlogPostFormInput
): FieldErrors<'title' | 'slug' | 'category' | 'content' | 'cover_image'> {
  const errors: FieldErrors<'title' | 'slug' | 'category' | 'content' | 'cover_image'> = {};

  if (!safeTrim(input.title)) {
    errors.title = 'عنوان پست وبلاگ الزامی است';
  }

  if (!safeTrim(input.slug)) {
    errors.slug = 'اسلاگ (آدرس URL) الزامی است';
  }

  if (!safeTrim(input.category)) {
    errors.category = 'انتخاب دسته‌بندی الزامی است';
  }

  if (!stripHtmlToText(input.content)) {
    errors.content = 'محتوای کامل پست نمی‌تواند خالی باشد';
  }

  const coverImage = safeTrim(input.cover_image);
  if (coverImage !== '' && !/^(https?:\/\/|\/)/i.test(coverImage)) {
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
    studentError = safeTrim(input.studentQuery)
      ? 'لطفاً نام دانش‌آموز را از لیست پیشنهادی انتخاب کنید'
      : 'انتخاب دانش‌آموز الزامی است';
  }

  const rowErrors: Record<string, SubjectRowErrors> = {};
  const nonBlankRows = input.rows.filter(
    (r) =>
      safeTrim(r.subject) !== '' ||
      safeTrim(r.total_q) !== '' ||
      safeTrim(r.correct) !== '' ||
      safeTrim(r.wrong) !== ''
  );

  const rowsToValidate = nonBlankRows.length > 0 ? nonBlankRows : input.rows.slice(0, 1);

  for (const row of rowsToValidate) {
    const rErr: SubjectRowErrors = {};
    if (!safeTrim(row.subject)) {
      rErr.subject = 'نام درس الزامی است';
    }

    const totalStr = safeTrim(row.total_q);
    const totalNum = Number(totalStr);
    if (!totalStr) {
      rErr.total_q = 'الزامی';
    } else if (Number.isNaN(totalNum) || totalNum < 1) {
      rErr.total_q = 'حداقل ۱ سوال';
    }

    const correctStr = safeTrim(row.correct);
    const wrongStr = safeTrim(row.wrong);
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
  const from = safeTrim(input.dateFrom);
  const to = safeTrim(input.dateTo);
  if (!from) {
    errors.dateFrom = 'تاریخ شروع الزامی است';
  }
  if (!to) {
    errors.dateTo = 'تاریخ پایان الزامی است';
  } else if (from && to < from) {
    errors.dateTo = 'تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد';
  }
  return errors;
}

export interface AppointmentFormInput {
  appointment_date: string;
  start_time: string;
}

export function validateAppointmentForm(
  input: AppointmentFormInput
): FieldErrors<'appointment_date' | 'start_time'> {
  const errors: FieldErrors<'appointment_date' | 'start_time'> = {};
  const dateStr = safeTrim(input.appointment_date);
  const startStr = safeTrim(input.start_time).slice(0, 5);

  if (!dateStr) {
    errors.appointment_date = 'انتخاب تاریخ نوبت الزامی است';
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (!startStr) {
    errors.start_time = 'وارد کردن ساعت شروع الزامی است';
  } else if (!timeRegex.test(startStr)) {
    errors.start_time = 'فرمت ساعت شروع معتبر نیست (مثال: 10:30)';
  }

  return errors;
}

export interface ParentContactFormInput {
  parent_name: string;
  phone: string;
}

export function validateParentContactForm(
  input: ParentContactFormInput
): FieldErrors<'parent_name' | 'phone'> {
  const errors: FieldErrors<'parent_name' | 'phone'> = {};
  const nameStr = safeTrim(input.parent_name);
  const phoneStr = safeTrim(input.phone);

  if (!nameStr) {
    errors.parent_name = 'نام ولی الزامی است';
  } else if (nameStr.length < 2) {
    errors.parent_name = 'نام ولی باید حداقل ۲ کاراکتر باشد';
  }

  if (!phoneStr) {
    errors.phone = 'شماره موبایل ولی الزامی است';
  } else if (!/^09\d{9}$/.test(phoneStr)) {
    errors.phone = 'شماره موبایل باید ۱۱ رقم و با 09 شروع شود';
  }

  return errors;
}

export interface WeekSessionFormInput {
  title: string;
  start_date_jalali: string;
  end_date_jalali: string;
}

export function validateWeekSessionForm(
  input: WeekSessionFormInput
): FieldErrors<'title' | 'start_date_jalali' | 'end_date_jalali'> {
  const errors: FieldErrors<'title' | 'start_date_jalali' | 'end_date_jalali'> = {};
  if (!safeTrim(input.title)) {
    errors.title = 'عنوان هفته یا جلسه الزامی است';
  }
  if (!safeTrim(input.start_date_jalali)) {
    errors.start_date_jalali = 'تاریخ شروع هفته الزامی است';
  }
  if (!safeTrim(input.end_date_jalali)) {
    errors.end_date_jalali = 'تاریخ پایان هفته الزامی است';
  }
  return errors;
}

export function validateRemedialClassForm(input: {
  class_name: string;
}): FieldErrors<'class_name'> {
  const errors: FieldErrors<'class_name'> = {};
  if (!safeTrim(input.class_name)) {
    errors.class_name = 'نام کلاس رفع اشکال الزامی است';
  }
  return errors;
}

