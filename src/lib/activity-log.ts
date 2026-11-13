import { formatGregorianToJalali } from './jalali';
import { safeTrim, safeNumber } from './exam-math';

export type ActivityLogCategory =
  | 'students'
  | 'appointments'
  | 'attendance'
  | 'tutoring'
  | 'exams'
  | 'courses'
  | 'instructors'
  | 'supporters'
  | 'blog'
  | 'files'
  | 'auth'
  | 'system';

export type ActivityActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'send_sms'
  | 'status_change'
  | 'auth'
  | 'other';

export interface ActivityLogItem {
  id: string;
  actor_name: string;
  actor_role: string;
  action_type: ActivityActionType;
  category: ActivityLogCategory;
  category_label: string;
  title: string;
  description: string;
  method?: string;
  endpoint?: string;
  created_at: string;
  jalali_datetime: string;
  source: 'server' | 'client';
}

export const CATEGORY_LABELS: Record<ActivityLogCategory, string> = {
  students: 'دانش‌آموزان',
  appointments: 'نوبت‌دهی هفتگی',
  attendance: 'حضور و غیاب',
  tutoring: 'کلاس‌های رفع اشکال',
  exams: 'آزمون و کارنامه',
  courses: 'دوره‌های آموزشی',
  instructors: 'اساتید',
  supporters: 'پشتیبان‌ها',
  blog: 'وبلاگ',
  files: 'فایل‌های آزمون',
  auth: 'حساب کاربری',
  system: 'سیستم',
};

export const ACTION_TYPE_LABELS: Record<ActivityActionType, string> = {
  create: 'ایجاد / ثبت',
  update: 'ویرایش',
  delete: 'حذف',
  send_sms: 'ارسال پیامک',
  status_change: 'تغییر وضعیت',
  auth: 'ورود / خروج',
  other: 'سایر عملیات',
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
  if (cleanPath.startsWith('/bot/ping') || cleanPath.startsWith('/activity-logs')) {
    return null;
  }

  // 1. Auth
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
    const weekStart = safeTrim(body.week_start);
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
        description: `دانش‌آموز مهمان «${safeTrim(body.full_name || body.student_name)}» به ماتریس روزانه اضافه شد`,
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
        action_type: 'status_change',
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
        action_type: 'status_change',
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
 * Normalizes a server-side activity log record (from `/api/v1/activity-logs` or `/api/v1/audit-logs`).
 */
export function normalizeServerActivityLog(raw: Record<string, unknown>): ActivityLogItem {
  const categoryRaw = safeTrim(raw.category || raw.module || 'system') as ActivityLogCategory;
  const category: ActivityLogCategory =
    categoryRaw in CATEGORY_LABELS ? categoryRaw : 'system';
  const actionRaw = safeTrim(raw.action_type || raw.action || 'other') as ActivityActionType;
  const action_type: ActivityActionType =
    actionRaw in ACTION_TYPE_LABELS ? actionRaw : 'other';
  const createdAt = safeTrim(raw.created_at || raw.timestamp || new Date().toISOString());

  return {
    id: `srv-${safeTrim(raw.id || Math.random().toString(36).slice(2, 9))}`,
    actor_name: safeTrim(raw.actor_name || raw.username || raw.user_name || 'کاربر سیستم'),
    actor_role: safeTrim(raw.actor_role || raw.role || 'admin'),
    action_type,
    category,
    category_label: CATEGORY_LABELS[category],
    title: safeTrim(raw.title || raw.summary || ACTION_TYPE_LABELS[action_type]),
    description: safeTrim(raw.description || raw.details || ''),
    method: safeTrim(raw.method) || undefined,
    endpoint: safeTrim(raw.endpoint || raw.path) || undefined,
    created_at: createdAt,
    jalali_datetime: formatActivityJalaliDateTime(createdAt),
    source: 'server',
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
  method: string;
  path: string;
  bodyObj?: Record<string, unknown> | null;
}): ActivityLogItem | null {
  const described = describeApiMutation(params.method, params.path, params.bodyObj);
  if (!described) return null;

  const nowIso = new Date().toISOString();
  const entry: ActivityLogItem = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  category?: string;
  actionType?: string;
  actor?: string;
}

export function filterActivityLogs(
  logs: ActivityLogItem[],
  criteria: ActivityLogFilterCriteria
): ActivityLogItem[] {
  const q = safeTrim(criteria.search).toLowerCase();
  const cat = safeTrim(criteria.category);
  const act = safeTrim(criteria.actionType);
  const actor = safeTrim(criteria.actor).toLowerCase();

  return logs.filter((item) => {
    if (cat && item.category !== cat) return false;
    if (act && item.action_type !== act) return false;
    if (actor && !item.actor_name.toLowerCase().includes(actor)) return false;
    if (q) {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchActor = item.actor_name.toLowerCase().includes(q);
      const matchCat = item.category_label.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchActor && !matchCat) return false;
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
