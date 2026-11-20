import { formatGregorianToJalali, getTodayGregorianIso } from './jalali';
import { safeTrim, safeNumber } from './exam-math';

export type ActivityLogCategory =
  | 'students'
  | 'appointments'
  | 'attendance'
  | 'tutoring'
  | 'exams'
  | 'assignments'
  | 'courses'
  | 'instructors'
  | 'supporters'
  | 'blog'
  | 'files'
  | 'reports'
  | 'auth'
  | 'system';

export type ActivityActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'start_session'
  | 'end_session'
  | 'send_sms'
  | 'status_change'
  | 'login'
  | 'verify_2fa'
  | 'auth'
  | 'other';

export type StaffRoleFilter = '' | 'admin' | 'supporter' | 'teacher';

export interface ActivityLogItem {
  id: string;
  actor_user_id?: number | null;
  actor_linked_id?: number | null;
  actor_name: string;
  actor_role: string;
  action_type: ActivityActionType;
  raw_action?: string;
  category: ActivityLogCategory;
  raw_module?: string;
  category_label: string;
  target_id?: number | string | null;
  title: string;
  description: string;
  details_json?: Record<string, unknown> | null;
  method?: string;
  endpoint?: string;
  created_at: string;
  jalali_datetime: string;
  source: 'server' | 'client';
}

export interface ActivityLogQueryParams {
  role?: string;
  actor_user_id?: number | string | null;
  actor_linked_id?: number | string | null;
  module?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export interface ActiveActorStat {
  actor_user_id: number | null;
  actor_linked_id: number | null;
  actor_name: string;
  role: string;
  total_actions: number;
  last_activity_at: string | null;
  last_activity_jalali: string;
}

export interface ActivityLogsStats {
  total_logs: number;
  today_logs: number;
  by_role: {
    admin: number;
    supporter: number;
    teacher: number;
    other: number;
  };
  by_module: Array<{
    module: ActivityLogCategory;
    label: string;
    count: number;
  }>;
  active_actors: ActiveActorStat[];
}

export const CATEGORY_LABELS: Record<ActivityLogCategory, string> = {
  students: 'دانش‌آموزان',
  appointments: 'نوبت‌دهی هفتگی',
  attendance: 'حضور و غیاب',
  tutoring: 'کلاس‌های رفع اشکال',
  exams: 'آزمون و کارنامه',
  assignments: 'تخصیص پشتیبان',
  courses: 'دوره‌های آموزشی',
  instructors: 'اساتید',
  supporters: 'پشتیبان‌ها',
  blog: 'وبلاگ',
  files: 'فایل‌های آزمون',
  reports: 'گزارش‌ها',
  auth: 'احراز هویت و ورود',
  system: 'سیستم',
};

export const ACTION_TYPE_LABELS: Record<ActivityActionType, string> = {
  create: 'ایجاد / ثبت',
  update: 'ویرایش',
  delete: 'حذف',
  start_session: 'شروع جلسه رفع اشکال',
  end_session: 'پایان جلسه رفع اشکال',
  send_sms: 'ارسال پیامک',
  status_change: 'تغییر وضعیت',
  login: 'ورود به سامانه',
  verify_2fa: 'تأیید دو مرحله‌ای',
  auth: 'ورود / خروج',
  other: 'سایر عملیات',
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: 'ادمین (مدیر)',
  supporter: 'پشتیبان',
  teacher: 'استاد / مدرس',
  instructor: 'استاد / مدرس',
  student: 'دانش‌آموز',
};

const STORAGE_KEY = 'famo_activity_logs_v1';
const MAX_LOCAL_LOGS = 250;

/**
 * Formats an ISO timestamp or `YYYY-MM-DD HH:MM:SS` string into a readable
 * Persian Jalali date + time string (`YYYY/MM/DD - HH:MM`).
 */
export function formatActivityJalaliDateTime(isoOrSql: unknown): string {
  const raw = safeTrim(isoOrSql);
  if (!raw) return '-';

  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const jalaliDate = formatGregorianToJalali(`${yyyy}-${mm}-${dd}`);
    return `${jalaliDate} - ${hh}:${min}`;
  }

  const datePart = raw.slice(0, 10);
  const timePart = raw.slice(11, 16);
  const jalali = formatGregorianToJalali(datePart);
  return timePart ? `${jalali} - ${timePart}` : jalali;
}

/**
 * Normalizes a raw module/category string from backend `staff_activity_logs` into `ActivityLogCategory`.
 */
export function normalizeModuleKey(rawModule: unknown): ActivityLogCategory {
  const m = safeTrim(rawModule).toLowerCase();
  if (!m) return 'system';
  if (m in CATEGORY_LABELS) return m as ActivityLogCategory;
  if (m.includes('appoint') || m.includes('sms')) return 'appointments';
  if (m.includes('tutor') || m.includes('class') || m.includes('remedial')) return 'tutoring';
  if (m.includes('attend')) return 'attendance';
  if (m.includes('student') || m.includes('parent')) return 'students';
  if (m.includes('exam') || m.includes('score')) return 'exams';
  if (m.includes('assign') || m.includes('homework')) return 'assignments';
  if (m.includes('course') || m.includes('subscri')) return 'courses';
  if (m.includes('instruct') || m.includes('teacher')) return 'instructors';
  if (m.includes('support')) return 'supporters';
  if (m.includes('blog') || m.includes('post')) return 'blog';
  if (m.includes('file') || m.includes('upload')) return 'files';
  if (m.includes('report')) return 'reports';
  if (m.includes('auth') || m.includes('login') || m.includes('2fa')) return 'auth';
  return 'system';
}

/**
 * Normalizes a raw action string from backend `staff_activity_logs` into `ActivityActionType`.
 */
export function normalizeActionKey(rawAction: unknown): ActivityActionType {
  const a = safeTrim(rawAction).toLowerCase();
  if (!a) return 'other';
  if (a in ACTION_TYPE_LABELS) return a as ActivityActionType;
  if (a === 'start_session' || a === 'open_session' || a === 'enter_class') return 'start_session';
  if (a === 'end_session' || a === 'close_session' || a === 'exit_class') return 'end_session';
  if (a === 'login' || a === 'sign_in') return 'login';
  if (a === 'verify_2fa' || a === '2fa' || a === 'otp_verify') return 'verify_2fa';
  if (a === 'logout' || a === 'sign_out') return 'auth';
  if (a.includes('sms') || a.includes('send')) return 'send_sms';
  if (a.includes('status') || a.includes('toggle')) return 'status_change';
  if (a.includes('create') || a.includes('add') || a.includes('insert') || a === 'post')
    return 'create';
  if (
    a.includes('update') ||
    a.includes('edit') ||
    a.includes('patch') ||
    a.includes('put') ||
    a.includes('upsert') ||
    a.includes('reset')
  )
    return 'update';
  if (a.includes('delete') || a.includes('remove') || a.includes('destroy')) return 'delete';
  return 'other';
}

/**
 * Normalizes a role string (`admin`, `supporter`, `teacher`, or Persian equivalents)
 * into a canonical role key.
 */
export function normalizeRoleKey(rawRole: unknown): 'admin' | 'supporter' | 'teacher' | 'other' {
  const r = safeTrim(rawRole).toLowerCase();
  if (r === 'admin' || r.includes('مدیر') || r.includes('ادمین')) return 'admin';
  if (r === 'supporter' || r.includes('پشتیبان')) return 'supporter';
  if (r === 'teacher' || r === 'instructor' || r.includes('استاد') || r.includes('مدرس'))
    return 'teacher';
  return 'other';
}

/**
 * Formats request details object or string into a concise Persian preview and parsed object.
 */
export function parseActivityDetails(rawDetails: unknown): {
  descriptionText: string;
  detailsObj: Record<string, unknown> | null;
} {
  if (!rawDetails) {
    return { descriptionText: '', detailsObj: null };
  }
  if (typeof rawDetails === 'string') {
    const trimmed = rawDetails.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            descriptionText: summarizeDetailsObject(parsed as Record<string, unknown>),
            detailsObj: parsed as Record<string, unknown>,
          };
        }
      } catch {
        // treat as plain string
      }
    }
    return { descriptionText: trimmed, detailsObj: null };
  }
  if (typeof rawDetails === 'object' && !Array.isArray(rawDetails)) {
    const obj = rawDetails as Record<string, unknown>;
    return {
      descriptionText: summarizeDetailsObject(obj),
      detailsObj: obj,
    };
  }
  return { descriptionText: String(rawDetails), detailsObj: null };
}

function summarizeDetailsObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  const ignoredKeys = new Set(['password', 'token', 'code', 'otp']);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    if (ignoredKeys.has(k.toLowerCase())) {
      parts.push(`${k}: ***`);
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}: ${String(v)}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}: [${v.length} مورد]`);
    }
    if (parts.length >= 4) break;
  }
  return parts.join(' • ');
}

/**
 * Translates an HTTP mutation (`POST`, `PUT`, `PATCH`, `DELETE`) on an API path
 * into a human-readable Persian activity log entry explaining what was done.
 */
export function describeApiMutation(
  methodRaw: string,
  pathRaw: string,
  bodyObj?: Record<string, unknown> | null
): Omit<
  ActivityLogItem,
  'id' | 'actor_name' | 'actor_role' | 'created_at' | 'jalali_datetime' | 'source'
> | null {
  const method = safeTrim(methodRaw).toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }

  const cleanPath = safeTrim(pathRaw).split('?')[0];
  const body = bodyObj || {};

  // Ignore background/read-only token refresh or ping endpoints
  if (
    cleanPath.startsWith('/bot/ping') ||
    cleanPath.startsWith('/activity-logs') ||
    cleanPath.startsWith('/admin/activity-logs') ||
    cleanPath.startsWith('/admin/stats/activity-logs')
  ) {
    return null;
  }

  // 1. Auth
  if (cleanPath.startsWith('/auth/login')) {
    return {
      action_type: 'login',
      category: 'auth',
      category_label: CATEGORY_LABELS.auth,
      title: 'ورود به سامانه',
      description: `ورود کاربر ${safeTrim(body.username) ? `«${safeTrim(body.username)}»` : ''}`.trim(),
      method,
      endpoint: cleanPath,
    };
  }
  if (cleanPath.startsWith('/auth/verify-2fa')) {
    return {
      action_type: 'verify_2fa',
      category: 'auth',
      category_label: CATEGORY_LABELS.auth,
      title: 'تأیید دو مرحله‌ای (2FA)',
      description: `تأیید کد امنیتی دو مرحله‌ای برای کاربر شناسه ${safeTrim(body.user_id) || '-'}`,
      method,
      endpoint: cleanPath,
    };
  }
  if (cleanPath.startsWith('/auth/logout')) {
    return {
      action_type: 'auth',
      category: 'auth',
      category_label: CATEGORY_LABELS.auth,
      title: 'خروج از حساب کاربری',
      description: 'کاربر از پنل مدیریت خارج شد',
      method,
      endpoint: cleanPath,
    };
  }

  // 2. Students & Parent Contacts
  if (cleanPath.includes('/parent-contacts')) {
    const parentName = safeTrim(body.parent_name || body.full_name);
    const phone = safeTrim(body.phone || body.mobile);
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'حذف شماره تماس ولی',
        description: `اطلاعات تماس ولی (${cleanPath}) حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'students',
      category_label: CATEGORY_LABELS.students,
      title: method === 'POST' ? 'افزودن شماره تماس ولی' : 'ویرایش شماره تماس ولی',
      description: `ثبت/ویرایش مخاطب ولی ${parentName ? `«${parentName}»` : ''} ${phone ? `(${phone})` : ''}`.trim(),
      method,
      endpoint: cleanPath,
    };
  }

  if (cleanPath.startsWith('/students')) {
    const studentName = safeTrim(body.name);
    if (cleanPath.endsWith('/toggle-status')) {
      return {
        action_type: 'status_change',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'تغییر وضعیت حساب دانش‌آموز',
        description: `وضعیت فعال/غیرفعال دانش‌آموز (${cleanPath.split('/')[2]}) تغییر یافت`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath.endsWith('/create-account')) {
      return {
        action_type: 'create',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'ایجاد حساب کاربری دانش‌آموز',
        description: `حساب کاربری برای دانش‌آموز شناسه ${cleanPath.split('/')[2]} ساخته شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath.endsWith('/reset-password')) {
      return {
        action_type: 'update',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'بازنشانی رمز عبور دانش‌آموز',
        description: `رمز عبور دانش‌آموز شناسه ${cleanPath.split('/')[2]} به کد ملی بازنشانی شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (method === 'POST') {
      return {
        action_type: 'create',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'افزودن دانش‌آموز جدید',
        description: `دانش‌آموز ${studentName ? `«${studentName}»` : ''} (پایه ${safeTrim(body.grade)} - ${safeTrim(body.field)}) ثبت شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (method === 'PUT' || method === 'PATCH') {
      return {
        action_type: 'update',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'ویرایش مشخصات دانش‌آموز',
        description: `مشخصات دانش‌آموز ${studentName ? `«${studentName}»` : `شناسه ${cleanPath.split('/')[2]}`} بروزرسانی شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'students',
        category_label: CATEGORY_LABELS.students,
        title: 'حذف دانش‌آموز',
        description: `دانش‌آموز شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
  }

  // 3. Appointments & SMS
  if (cleanPath === '/appointments/sms/send') {
    const ids = Array.isArray(body.student_ids) ? body.student_ids.length : 0;
    const weekStart = safeTrim(body.week_start || body.week_date);
    return {
      action_type: 'send_sms',
      category: 'appointments',
      category_label: CATEGORY_LABELS.appointments,
      title: 'ارسال پیامک یادآوری نوبت‌ها',
      description: `ارسال پیامک نوبت هفتگی${ids ? ` برای ${ids} دانش‌آموز` : ''}${weekStart ? ` (هفته ${formatGregorianToJalali(weekStart)})` : ''}`,
      method,
      endpoint: cleanPath,
    };
  }

  if (cleanPath.startsWith('/appointments')) {
    if (cleanPath.endsWith('/status')) {
      return {
        action_type: 'status_change',
        category: 'appointments',
        category_label: CATEGORY_LABELS.appointments,
        title: 'تغییر وضعیت نوبت هفتگی',
        description: `وضعیت نوبت شناسه ${cleanPath.split('/')[2]} به «${safeTrim(body.status)}» تغییر یافت`,
        method,
        endpoint: cleanPath,
      };
    }
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'appointments',
        category_label: CATEGORY_LABELS.appointments,
        title: 'حذف نوبت هفتگی',
        description: `نوبت شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    const time = safeTrim(body.start_time);
    const date = safeTrim(body.appointment_date);
    const studentId = safeTrim(body.student_id);
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'appointments',
      category_label: CATEGORY_LABELS.appointments,
      title: method === 'POST' ? 'ثبت نوبت هفتگی' : 'ویرایش ساعت نوبت هفتگی',
      description: `ثبت ساعت ${time || '-'} برای دانش‌آموز شناسه ${studentId || '-'}${date ? ` در تاریخ ${formatGregorianToJalali(date)}` : ''}`,
      method,
      endpoint: cleanPath,
    };
  }

  // 4. Attendance & Tutoring Classrooms
  if (cleanPath.startsWith('/attendance')) {
    if (cleanPath.endsWith('/times')) {
      return {
        action_type: 'update',
        category: 'attendance',
        category_label: CATEGORY_LABELS.attendance,
        title: 'ثبت ساعات حضور و آزمون روزانه',
        description: `بروزرسانی ساعت ورود/آزمون در لیست حضور و غیاب (ردیف ${cleanPath.split('/')[2]})`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath.endsWith('/guests')) {
      return {
        action_type: 'create',
        category: 'attendance',
        category_label: CATEGORY_LABELS.attendance,
        title: 'افزودن دانش‌آموز مهمان به حضور و غیاب',
        description: `دانش‌آموز مهمان «${safeTrim(body.full_name || body.student_name || body.guest_name)}» به ماتریس روزانه اضافه شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: 'status_change',
      category: 'attendance',
      category_label: CATEGORY_LABELS.attendance,
      title: 'بروزرسانی ماتریس حضور در کلاس',
      description: `تغییر وضعیت کلاس رفع اشکال در تاریخ ${formatGregorianToJalali(safeTrim(body.date)) || '-'}`,
      method,
      endpoint: cleanPath,
    };
  }

  if (cleanPath.startsWith('/tutoring')) {
    if (cleanPath.startsWith('/tutoring/classrooms')) {
      if (method === 'DELETE') {
        return {
          action_type: 'delete',
          category: 'tutoring',
          category_label: CATEGORY_LABELS.tutoring,
          title: 'حذف ستون کلاس رفع اشکال',
          description: `کلاس رفع اشکال شناسه ${cleanPath.split('/')[3]} حذف شد`,
          method,
          endpoint: cleanPath,
        };
      }
      const classTitle = safeTrim(body.title || body.name || body.subject);
      return {
        action_type: 'create',
        category: 'tutoring',
        category_label: CATEGORY_LABELS.tutoring,
        title: 'افزودن ستون کلاس رفع اشکال',
        description: `کلاس رفع اشکال «${classTitle || 'جدید'}» ایجاد شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath.endsWith('/end')) {
      return {
        action_type: 'end_session',
        category: 'tutoring',
        category_label: CATEGORY_LABELS.tutoring,
        title: 'ثبت خروج دانش‌آموز از کلاس رفع اشکال',
        description: `پایان جلسه رفع اشکال (شناسه جلسه ${cleanPath.split('/')[3]}) ثبت شد`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath === '/tutoring/sessions') {
      return {
        action_type: 'start_session',
        category: 'tutoring',
        category_label: CATEGORY_LABELS.tutoring,
        title: 'ثبت ورود دانش‌آموز به کلاس رفع اشکال',
        description: `ورود دانش‌آموز شناسه ${safeTrim(body.student_id)} به کلاس شناسه ${safeTrim(body.classroom_id)} ثبت شد`,
        method,
        endpoint: cleanPath,
      };
    }
  }

  // 5. Exams
  if (cleanPath.startsWith('/exams')) {
    if (cleanPath.startsWith('/exams/comments')) {
      return {
        action_type: 'update',
        category: 'exams',
        category_label: CATEGORY_LABELS.exams,
        title: 'ثبت نظر استاد روی کارنامه',
        description: `ثبت/ویرایش نظر آموزشی برای دانش‌آموز شناسه ${safeTrim(body.student_id)}`,
        method,
        endpoint: cleanPath,
      };
    }
    if (cleanPath.startsWith('/exams/share-links')) {
      if (method === 'DELETE' || cleanPath.endsWith('/revoke')) {
        const linkId = cleanPath.split('/')[3] || '-';
        return {
          action_type: 'delete',
          category: 'exams',
          category_label: CATEGORY_LABELS.exams,
          title: 'ابطال لینک اشتراک کارنامه',
          description: `لینک اشتراک‌گذاری کارنامه (شناسه ${linkId}) ابطال شد`,
          method,
          endpoint: cleanPath,
        };
      }
      const isSms = cleanPath.endsWith('/send-sms') || Boolean(body.send_sms);
      const examDate = safeTrim(body.exam_date);
      return {
        action_type: isSms ? 'send_sms' : 'create',
        category: 'exams',
        category_label: CATEGORY_LABELS.exams,
        title: isSms ? 'ارسال پیامک لینک کارنامه به والد' : 'ساخت لینک ۱۴ روزه اشتراک کارنامه',
        description: `${isSms ? 'ساخت و ارسال پیامک لینک کارنامه' : 'صدور لینک اختصاصی ۱۴ روزه کارنامه'} برای دانش‌آموز شناسه ${safeTrim(body.student_id)} (آزمون ${examDate ? formatGregorianToJalali(examDate) : '-'})`,
        method,
        endpoint: cleanPath,
      };
    }
    if (method === 'PATCH' || method === 'PUT') {
      const examId = cleanPath.split('/')[2] || '-';
      const subject = safeTrim(body.subject);
      return {
        action_type: 'update',
        category: 'exams',
        category_label: CATEGORY_LABELS.exams,
        title: 'ویرایش نتیجه آزمون',
        description: `ویرایش نمره درس ${subject ? `«${subject}» ` : ''}(ردیف آزمون شناسه ${examId})`,
        method,
        endpoint: cleanPath,
      };
    }
    const subjectsCount = Array.isArray(body.subjects) ? body.subjects.length : 0;
    const examDate = safeTrim(body.exam_date);
    return {
      action_type: 'create',
      category: 'exams',
      category_label: CATEGORY_LABELS.exams,
      title: 'ثبت نتایج آزمون',
      description: `ثبت کارنامه (${subjectsCount} درس) برای دانش‌آموز شناسه ${safeTrim(body.student_id)} در تاریخ ${examDate ? formatGregorianToJalali(examDate) : '-'}`,
      method,
      endpoint: cleanPath,
    };
  }

  // 6. Courses
  if (cleanPath.startsWith('/courses')) {
    const courseName = safeTrim(body.name);
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'courses',
        category_label: CATEGORY_LABELS.courses,
        title: 'حذف دوره آموزشی',
        description: `دوره شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'courses',
      category_label: CATEGORY_LABELS.courses,
      title: method === 'POST' ? 'ایجاد دوره آموزشی جدید' : 'ویرایش دوره آموزشی',
      description: `دوره ${courseName ? `«${courseName}»` : `شناسه ${cleanPath.split('/')[2]}`} ذخیره شد`,
      method,
      endpoint: cleanPath,
    };
  }

  // 6b. Subscriptions (/api/v1/subscriptions*)
  if (cleanPath.startsWith('/subscriptions')) {
    const subId = cleanPath.split('/')[2];
    const studentId = safeTrim(body.student_id);
    const courseId = safeTrim(body.course_id);
    const status = safeTrim(body.status);

    if (cleanPath.endsWith('/status')) {
      return {
        action_type: 'status_change',
        category: 'courses',
        category_label: CATEGORY_LABELS.courses,
        title: 'تغییر وضعیت اشتراک دوره',
        description: `وضعیت اشتراک شناسه ${subId || '-'}${status ? ` به «${status}»` : ''} تغییر یافت`,
        method,
        endpoint: cleanPath,
      };
    }

    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'courses',
        category_label: CATEGORY_LABELS.courses,
        title: 'حذف / لغو اشتراک دوره',
        description: `اشتراک دوره شناسه ${subId || '-'} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }

    if (method === 'POST') {
      return {
        action_type: 'create',
        category: 'courses',
        category_label: CATEGORY_LABELS.courses,
        title: 'ثبت‌نام دانش‌آموز در دوره (ایجاد اشتراک)',
        description: `اشتراک دوره (دانش‌آموز: ${studentId || '-'}، دوره: ${courseId || '-'}) ثبت شد`,
        method,
        endpoint: cleanPath,
      };
    }

    return {
      action_type: 'update',
      category: 'courses',
      category_label: CATEGORY_LABELS.courses,
      title: 'ویرایش اشتراک دوره',
      description: `اطلاعات اشتراک شناسه ${subId || '-'} بروزرسانی شد`,
      method,
      endpoint: cleanPath,
    };
  }

  // 7. Instructors
  if (cleanPath.startsWith('/instructors')) {
    const instName = safeTrim(body.name);
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'instructors',
        category_label: CATEGORY_LABELS.instructors,
        title: 'حذف استاد',
        description: `استاد شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'instructors',
      category_label: CATEGORY_LABELS.instructors,
      title: method === 'POST' ? 'افزودن استاد جدید' : 'ویرایش اطلاعات استاد',
      description: `مشخصات استاد ${instName ? `«${instName}»` : `شناسه ${cleanPath.split('/')[2]}`} ذخیره شد`,
      method,
      endpoint: cleanPath,
    };
  }

  // 8. Supporters
  if (cleanPath.startsWith('/supporters')) {
    const suppName = safeTrim(body.name);
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'supporters',
        category_label: CATEGORY_LABELS.supporters,
        title: 'حذف پشتیبان',
        description: `پشتیبان شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'supporters',
      category_label: CATEGORY_LABELS.supporters,
      title: method === 'POST' ? 'افزودن پشتیبان جدید' : 'ویرایش اطلاعات پشتیبان',
      description: `پشتیبان ${suppName ? `«${suppName}»` : `شناسه ${cleanPath.split('/')[2]}`} ذخیره شد`,
      method,
      endpoint: cleanPath,
    };
  }

  // 8b. Student → Supporter Assignments (/api/v1/assignments*)
  if (cleanPath.startsWith('/assignments')) {
    const studentId = safeTrim(body.student_id) || cleanPath.split('/')[2];
    const supporterId = safeTrim(body.supporter_id);

    if (cleanPath.endsWith('/initial-fill')) {
      const dryRun = body.dry_run !== false;
      return {
        action_type: dryRun ? 'other' : 'create',
        category: 'assignments',
        category_label: CATEGORY_LABELS.assignments,
        title: dryRun
          ? 'پیش‌نمایش تخصیص خودکار پشتیبان'
          : 'اجرای تخصیص خودکار اولیه پشتیبان بر اساس پایه و رشته',
        description: dryRun
          ? 'پیش‌نمایش آزمایشی تخصیص خودکار اولیه دانش‌آموزان به پشتیبان اجرا شد'
          : 'تخصیص خودکار اولیه دانش‌آموزان بدون پشتیبان بر اساس پایه و رشته اعمال شد',
        method,
        endpoint: cleanPath,
      };
    }

    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'assignments',
        category_label: CATEGORY_LABELS.assignments,
        title: 'لغو تخصیص پشتیبان دانش‌آموز',
        description: `تخصیص پشتیبان دانش‌آموز شناسه ${studentId || '-'} لغو شد`,
        method,
        endpoint: cleanPath,
      };
    }

    return {
      action_type: 'create',
      category: 'assignments',
      category_label: CATEGORY_LABELS.assignments,
      title: 'تخصیص / تغییر پشتیبان دانش‌آموز',
      description: `دانش‌آموز شناسه ${studentId || '-'} به پشتیبان شناسه ${supporterId || '-'} تخصیص یافت`,
      method,
      endpoint: cleanPath,
    };
  }

  // 9. Blog
  if (cleanPath.startsWith('/blog')) {
    const title = safeTrim(body.title);
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'blog',
        category_label: CATEGORY_LABELS.blog,
        title: 'حذف مقاله وبلاگ',
        description: `مقاله شناسه ${cleanPath.split('/')[3]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: method === 'POST' ? 'create' : 'update',
      category: 'blog',
      category_label: CATEGORY_LABELS.blog,
      title: method === 'POST' ? 'انتشار مقاله جدید در وبلاگ' : 'ویرایش مقاله وبلاگ',
      description: `مقاله ${title ? `«${title}»` : `شناسه ${cleanPath.split('/')[3]}`} ذخیره شد`,
      method,
      endpoint: cleanPath,
    };
  }

  // 10. Files
  if (cleanPath.startsWith('/files')) {
    if (method === 'DELETE') {
      return {
        action_type: 'delete',
        category: 'files',
        category_label: CATEGORY_LABELS.files,
        title: 'حذف فایل آزمون',
        description: `فایل آزمون شناسه ${cleanPath.split('/')[2]} حذف شد`,
        method,
        endpoint: cleanPath,
      };
    }
    return {
      action_type: 'create',
      category: 'files',
      category_label: CATEGORY_LABELS.files,
      title: 'آپلود فایل آزمون',
      description: 'یک فایل کارنامه/آزمون جدید در سیستم بارگذاری شد',
      method,
      endpoint: cleanPath,
    };
  }

  return {
    action_type: method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update',
    category: 'system',
    category_label: CATEGORY_LABELS.system,
    title: `عملیات ${method}`,
    description: `درخواست ${method} به مسیر ${cleanPath} انجام شد`,
    method,
    endpoint: cleanPath,
  };
}

/**
 * Normalizes a server-side `staff_activity_logs` record
 * (from `GET /api/v1/admin/activity-logs` or `GET /api/v1/admin/stats/activity-logs`).
 */
export function normalizeServerActivityLog(raw: Record<string, unknown>): ActivityLogItem {
  const rawModule = safeTrim(raw.module || raw.category || 'system');
  const category = normalizeModuleKey(rawModule);
  const rawAction = safeTrim(raw.action || raw.action_type || 'other');
  const action_type = normalizeActionKey(rawAction);
  const createdAt = safeTrim(raw.created_at || raw.timestamp || new Date().toISOString());

  const actorUserIdRaw = raw.actor_user_id ?? raw.user_id;
  const actorLinkedIdRaw = raw.actor_linked_id ?? raw.linked_id ?? raw.profile_id;
  const targetIdRaw = raw.target_id ?? raw.record_id ?? raw.entity_id;

  const parsedDetails = parseActivityDetails(
    raw.details ?? raw.request_details ?? raw.payload ?? raw.description
  );

  const summaryText = safeTrim(
    raw.summary || raw.title || ACTION_TYPE_LABELS[action_type] || 'عملیات ثبت‌شده'
  );

  return {
    id: `srv-${safeTrim(raw.id || Math.random().toString(36).slice(2, 9))}`,
    actor_user_id:
      actorUserIdRaw !== null && actorUserIdRaw !== undefined && actorUserIdRaw !== ''
        ? safeNumber(actorUserIdRaw)
        : null,
    actor_linked_id:
      actorLinkedIdRaw !== null && actorLinkedIdRaw !== undefined && actorLinkedIdRaw !== ''
        ? safeNumber(actorLinkedIdRaw)
        : null,
    actor_name: safeTrim(
      raw.actor_name || raw.full_name || raw.user_name || raw.username || 'کاربر سیستم'
    ),
    actor_role: safeTrim(raw.role || raw.actor_role || 'admin'),
    action_type,
    raw_action: rawAction || action_type,
    category,
    raw_module: rawModule || category,
    category_label: CATEGORY_LABELS[category] || rawModule || 'سیستم',
    target_id:
      targetIdRaw !== null && targetIdRaw !== undefined && targetIdRaw !== ''
        ? (targetIdRaw as number | string)
        : null,
    title: summaryText,
    description: parsedDetails.descriptionText,
    details_json: parsedDetails.detailsObj,
    method: safeTrim(raw.method || raw.http_method) || undefined,
    endpoint: safeTrim(raw.endpoint || raw.path || raw.uri) || undefined,
    created_at: createdAt,
    jalali_datetime: formatActivityJalaliDateTime(createdAt),
    source: 'server',
  };
}

/**
 * Computes aggregate `ActivityLogsStats` from a list of `ActivityLogItem[]`
 * (used as fallback or enrichment when `/api/v1/admin/activity-logs/stats` is combined).
 */
export function computeActivityLogStatsFromItems(logs: ActivityLogItem[]): ActivityLogsStats {
  const todayIso = getTodayGregorianIso();
  let todayLogs = 0;
  const byRole = { admin: 0, supporter: 0, teacher: 0, other: 0 };
  const moduleMap = new Map<ActivityLogCategory, number>();
  const actorMap = new Map<
    string,
    {
      actor_user_id: number | null;
      actor_linked_id: number | null;
      actor_name: string;
      role: string;
      total_actions: number;
      last_activity_at: string | null;
    }
  >();

  for (const item of logs) {
    if (safeTrim(item.created_at).startsWith(todayIso)) {
      todayLogs++;
    }

    const rKey = normalizeRoleKey(item.actor_role);
    byRole[rKey] = (byRole[rKey] || 0) + 1;

    moduleMap.set(item.category, (moduleMap.get(item.category) || 0) + 1);

    const actorKey =
      item.actor_user_id != null
        ? `uid:${item.actor_user_id}`
        : item.actor_linked_id != null
          ? `lid:${rKey}:${item.actor_linked_id}`
          : `name:${item.actor_name}`;

    const existing = actorMap.get(actorKey);
    if (!existing) {
      actorMap.set(actorKey, {
        actor_user_id: item.actor_user_id ?? null,
        actor_linked_id: item.actor_linked_id ?? null,
        actor_name: item.actor_name,
        role: rKey === 'other' ? item.actor_role : rKey,
        total_actions: 1,
        last_activity_at: item.created_at || null,
      });
    } else {
      existing.total_actions += 1;
      if (
        item.created_at &&
        (!existing.last_activity_at || item.created_at > existing.last_activity_at)
      ) {
        existing.last_activity_at = item.created_at;
      }
    }
  }

  const by_module = Array.from(moduleMap.entries())
    .map(([module, count]) => ({
      module,
      label: CATEGORY_LABELS[module] || module,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const active_actors: ActiveActorStat[] = Array.from(actorMap.values())
    .sort((a, b) => b.total_actions - a.total_actions)
    .slice(0, 12)
    .map((a) => ({
      ...a,
      last_activity_jalali: formatActivityJalaliDateTime(a.last_activity_at),
    }));

  return {
    total_logs: logs.length,
    today_logs: todayLogs,
    by_role: byRole,
    by_module,
    active_actors,
  };
}

/**
 * Normalizes the response of `GET /api/v1/admin/activity-logs/stats`
 * (or `GET /api/v1/admin/stats/activity-logs/stats`), falling back gracefully to `fallbackLogs`.
 */
export function normalizeActivityLogsStats(
  raw: Record<string, unknown> | null | undefined,
  fallbackLogs: ActivityLogItem[] = []
): ActivityLogsStats {
  const computed = computeActivityLogStatsFromItems(fallbackLogs);
  if (!raw || typeof raw !== 'object') {
    return computed;
  }

  const total_logs =
    raw.total_logs !== undefined ? safeNumber(raw.total_logs) : computed.total_logs;
  const today_logs =
    raw.today_logs !== undefined ? safeNumber(raw.today_logs) : computed.today_logs;

  // Parse by_role (supports object `{ admin: 10, supporter: 5, teacher: 3 }` or array `[{ role: 'admin', count: 10 }]`)
  const by_role = { admin: 0, supporter: 0, teacher: 0, other: 0 };
  if (Array.isArray(raw.by_role)) {
    for (const entry of raw.by_role) {
      if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const rKey = normalizeRoleKey(rec.role ?? rec.actor_role);
        const cnt = safeNumber(rec.count ?? rec.total ?? rec.total_actions);
        by_role[rKey] += cnt;
      }
    }
  } else if (raw.by_role && typeof raw.by_role === 'object') {
    for (const [k, v] of Object.entries(raw.by_role as Record<string, unknown>)) {
      const rKey = normalizeRoleKey(k);
      by_role[rKey] += safeNumber(v);
    }
  } else {
    Object.assign(by_role, computed.by_role);
  }

  // Parse by_module (supports object `{ appointments: 12, tutoring: 5 }` or array `[{ module: 'appointments', count: 12 }]`)
  let by_module = computed.by_module;
  if (Array.isArray(raw.by_module) && raw.by_module.length > 0) {
    const modTotals = new Map<ActivityLogCategory, number>();
    for (const entry of raw.by_module) {
      if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        const modKey = normalizeModuleKey(rec.module ?? rec.category);
        const cnt = safeNumber(rec.count ?? rec.total ?? rec.total_actions);
        modTotals.set(modKey, (modTotals.get(modKey) || 0) + cnt);
      }
    }
    by_module = Array.from(modTotals.entries())
      .map(([module, count]) => ({
        module,
        label: CATEGORY_LABELS[module] || module,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  } else if (raw.by_module && typeof raw.by_module === 'object' && !Array.isArray(raw.by_module)) {
    const modTotals = new Map<ActivityLogCategory, number>();
    for (const [k, v] of Object.entries(raw.by_module as Record<string, unknown>)) {
      const modKey = normalizeModuleKey(k);
      modTotals.set(modKey, (modTotals.get(modKey) || 0) + safeNumber(v));
    }
    if (modTotals.size > 0) {
      by_module = Array.from(modTotals.entries())
        .map(([module, count]) => ({
          module,
          label: CATEGORY_LABELS[module] || module,
          count,
        }))
        .sort((a, b) => b.count - a.count);
    }
  }

  // Parse active_actors
  let active_actors = computed.active_actors;
  if (Array.isArray(raw.active_actors) && raw.active_actors.length > 0) {
    active_actors = raw.active_actors
      .filter((a) => a && typeof a === 'object')
      .map((a) => {
        const rec = a as Record<string, unknown>;
        const uid = rec.actor_user_id ?? rec.user_id;
        const lid = rec.actor_linked_id ?? rec.linked_id ?? rec.profile_id;
        const lastAt = safeTrim(
          rec.last_activity_at ||
            rec.last_active_at ||
            rec.last_seen_at ||
            rec.latest_at ||
            rec.updated_at ||
            rec.created_at
        );
        const rawRole = safeTrim(rec.role || rec.actor_role || 'admin');
        const normRole = normalizeRoleKey(rawRole);
        return {
          actor_user_id: uid != null && uid !== '' ? safeNumber(uid) : null,
          actor_linked_id: lid != null && lid !== '' ? safeNumber(lid) : null,
          actor_name: safeTrim(
            rec.actor_name || rec.full_name || rec.user_name || rec.name || 'کاربر سیستم'
          ),
          role: normRole === 'other' ? rawRole : normRole,
          total_actions: safeNumber(
            rec.total_actions ?? rec.actions_count ?? rec.count ?? rec.total ?? 0
          ),
          last_activity_at: lastAt || null,
          last_activity_jalali: formatActivityJalaliDateTime(lastAt),
        };
      });
  }

  return {
    total_logs,
    today_logs,
    by_role,
    by_module,
    active_actors,
  };
}

export function getLocalActivityLogs(): ActivityLogItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordClientActivityLog(params: {
  actorName: string;
  actorRole?: string;
  actorUserId?: number | null;
  actorLinkedId?: number | null;
  method: string;
  path: string;
  bodyObj?: Record<string, unknown> | null;
}): ActivityLogItem | null {
  const described = describeApiMutation(params.method, params.path, params.bodyObj);
  if (!described) return null;

  const nowIso = new Date().toISOString();
  const entry: ActivityLogItem = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actor_user_id: params.actorUserId ?? null,
    actor_linked_id: params.actorLinkedId ?? null,
    actor_name: safeTrim(params.actorName) || 'مدیر سیستم',
    actor_role: safeTrim(params.actorRole) || 'admin',
    ...described,
    created_at: nowIso,
    jalali_datetime: formatActivityJalaliDateTime(nowIso),
    source: 'client',
  };

  try {
    if (typeof localStorage !== 'undefined') {
      const existing = getLocalActivityLogs();
      const updated = [entry, ...existing].slice(0, MAX_LOCAL_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // Ignore storage quota errors
  }

  return entry;
}

export function clearLocalActivityLogs(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export interface ActivityLogFilterCriteria {
  search?: string;
  role?: string;
  category?: string;
  actionType?: string;
  actor?: string;
  actorUserId?: number | string | null;
  actorLinkedId?: number | string | null;
  from?: string;
  to?: string;
}

export function filterActivityLogs(
  logs: ActivityLogItem[],
  criteria: ActivityLogFilterCriteria
): ActivityLogItem[] {
  const q = safeTrim(criteria.search).toLowerCase();
  const roleFilter = safeTrim(criteria.role).toLowerCase();
  const cat = safeTrim(criteria.category);
  const act = safeTrim(criteria.actionType);
  const actor = safeTrim(criteria.actor).toLowerCase();
  const actorUserId =
    criteria.actorUserId !== undefined && criteria.actorUserId !== null && criteria.actorUserId !== ''
      ? safeNumber(criteria.actorUserId)
      : null;
  const actorLinkedId =
    criteria.actorLinkedId !== undefined &&
    criteria.actorLinkedId !== null &&
    criteria.actorLinkedId !== ''
      ? safeNumber(criteria.actorLinkedId)
      : null;
  const fromDate = safeTrim(criteria.from);
  const toDate = safeTrim(criteria.to);

  return logs.filter((item) => {
    if (roleFilter) {
      const itemRole = normalizeRoleKey(item.actor_role);
      if (itemRole !== roleFilter && item.actor_role.toLowerCase() !== roleFilter) {
        return false;
      }
    }
    if (cat && item.category !== cat && item.raw_module !== cat) return false;
    if (act && item.action_type !== act && item.raw_action !== act) return false;
    if (actorUserId !== null && item.actor_user_id !== actorUserId) return false;
    if (actorLinkedId !== null && item.actor_linked_id !== actorLinkedId) return false;
    if (actor && !item.actor_name.toLowerCase().includes(actor)) return false;

    if (fromDate || toDate) {
      const itemDate = safeTrim(item.created_at).slice(0, 10);
      if (fromDate && itemDate && itemDate < fromDate) return false;
      if (toDate && itemDate && itemDate > toDate) return false;
    }

    if (q) {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchActor = item.actor_name.toLowerCase().includes(q);
      const matchCat = item.category_label.toLowerCase().includes(q);
      const matchEndpoint = (item.endpoint || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchActor && !matchCat && !matchEndpoint) return false;
    }
    return true;
  });
}

/**
 * Merges and deduplicates activity logs from multiple sources, sorted newest first.
 */
export function mergeActivityLogs(
  serverLogs: ActivityLogItem[],
  smsLogsAsActivity: ActivityLogItem[],
  clientLogs: ActivityLogItem[]
): ActivityLogItem[] {
  const combined = [...serverLogs, ...smsLogsAsActivity, ...clientLogs];
  combined.sort((a, b) => {
    const tA = new Date(a.created_at).getTime() || safeNumber(a.id);
    const tB = new Date(b.created_at).getTime() || safeNumber(b.id);
    return tB - tA;
  });
  return combined;
}
