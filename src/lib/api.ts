import type {
  Student,
  Course,
  Instructor,
  Supporter,
  PublicSupporter,
  BlogCategory,
  ExamDateSummary,
  ExamStudentSummary,
  ExamDetailsResponse,
  ExamListItem,
  GetExamsListQuery,
  UpdateExamResultRequest,
  ExamFile,
  BlogPost,
  ReportDayStat,
  DashboardStats,
  AcademicField,
  SubjectResult,
  AppointmentSmsPreviewData,
  AppointmentSmsPreviewItem,
  AppointmentSmsPreviewSummary,
  PostAppointmentSmsSendRequest,
  AppointmentSmsSendData,
  AppointmentSmsSendResultItem,
  GetAppointmentSmsLogQuery,
  AppointmentSmsLogItem,
  GetAppointmentsListQuery,
  AppointmentRecord,
  UpsertAppointmentRequest,
  AppointmentStatus,
  ParentContactRecord,
  CreateParentContactRequest,
  UpdateParentContactRequest,
  AttendanceDay,
  AttendanceEntry,
  UpsertAttendanceEntryRequest,
  PatchAttendanceTimeRequest,
  CreateAttendanceGuestRequest,
  TutoringClassroom,
  TutoringStatus,
  TutoringSession,
  TutoringBoardClass,
  TeacherTutoringStatus,
  Subscription,
  SubscriptionListQuery,
  SubscriptionCreateRequest,
  SubscriptionUpdateRequest,
  SubscriptionStatusUpdateRequest,
  SupportAssignment,
  AssignmentStudentRow,
  AssignmentStudentsQuery,
  AssignStudentRequest,
  AssignmentHistoryEntry,
  AssignmentInitialFillRequest,
  AssignmentInitialFillReport,
} from '../types';
import { normalizeSubscription } from './subscriptions';
import {
  normalizeAssignmentStudentRow,
  normalizeSupportAssignment,
  normalizeAssignmentHistoryEntry,
  normalizeInitialFillReport,
} from './assignments';
import {
  safeTrim,
  safeNumber,
  normalizeExamDetails,
  normalizeExamListItem,
  buildStudentExamTrend,
  type RawStudentExamHistoryRow,
  type StudentExamTrendPoint,
} from './exam-math';
import {
  recordClientActivityLog,
  getLocalActivityLogs,
  normalizeServerActivityLog,
  normalizeActivityLogsStats,
  filterActivityLogs,
  mergeActivityLogs,
  formatActivityJalaliDateTime,
  CATEGORY_LABELS,
  type ActivityLogItem,
  type ActivityLogQueryParams,
  type ActivityLogsStats,
} from './activity-log';
import {
  getAllLocalSupporterAvatars,
  saveLocalSupporterAvatar,
  removeLocalSupporterAvatar,
  getAllLocalSupporterDescriptions,
  saveLocalSupporterDescription,
  removeLocalSupporterDescription,
} from './image-upload';

export interface ApiErrorObject {
  code?: string;
  message?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  } | null;
  error?: string | ApiErrorObject | null;
}

const DEFAULT_API_BASE = 'https://api.famoacademy.ir/api/v1';
const DEFAULT_MAIN_SITE_URL = 'https://famoacademy.ir';
const DEFAULT_AUTH_URL = 'https://auth.famoacademy.ir';
const TOKEN_STORAGE_KEY = 'famo_jwt';

export function extractErrorMessage(
  error: string | ApiErrorObject | null | undefined,
  fallback = 'خطا در ارتباط با سرور'
): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error.message) return error.message;
  return fallback;
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

class FamoApiClient {
  readonly base: string;
  readonly mainSiteUrl: string;
  readonly authUrl: string;
  currentActorName = 'مدیر سیستم (فامو)';
  currentActorRole = 'admin';

  constructor() {
    const winEnv =
      (typeof window !== 'undefined' &&
        (window as unknown as { FAMO_ENV?: Record<string, string> }).FAMO_ENV) ||
      {};
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};

    this.base = (winEnv.API_BASE || metaEnv.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
    this.mainSiteUrl = (
      winEnv.MAIN_SITE_URL ||
      metaEnv.VITE_MAIN_SITE_URL ||
      DEFAULT_MAIN_SITE_URL
    ).replace(/\/+$/, '');
    this.authUrl = (
      winEnv.AUTH_URL ||
      metaEnv.VITE_AUTH_URL ||
      DEFAULT_AUTH_URL
    ).replace(/\/+$/, '');
  }

  get token(): string | null {
    try {
      const fromStorage = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (fromStorage) return fromStorage;
    } catch {
      // ignore storage errors
    }
    return (
      getCookieValue('famo_jwt') ||
      getCookieValue('token') ||
      getCookieValue('access_token') ||
      null
    );
  }

  setToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }

  getLoginRedirectUrl(): string {
    if (typeof window === 'undefined') return this.authUrl;
    const currentUrl = encodeURIComponent(window.location.href);
    return `${this.authUrl}/?redirect=${currentUrl}`;
  }

  consumeUrlToken(): void {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      this.setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  headers(isJson = true): Record<string, string> {
    const h: Record<string, string> = {};
    if (isJson) {
      h['Content-Type'] = 'application/json';
    }
    const t = this.token;
    if (t) {
      h['Authorization'] = `Bearer ${t}`;
    }
    return h;
  }

  async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const defaultHeaders = this.headers(!isFormData);
    return window.fetch(`${this.base}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...defaultHeaders,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
  }

  private async requestJson<T>(
    endpoint: string,
    options: RequestInit = {},
    defaultErrorMsg = 'خطا در دریافت اطلاعات از سرور'
  ): Promise<ApiEnvelope<T>> {
    const res = await this.fetch(endpoint, options);
    let json: ApiEnvelope<T>;
    try {
      json = (await res.json()) as ApiEnvelope<T>;
    } catch {
      throw new Error(defaultErrorMsg);
    }

    if (!res.ok || json.success === false) {
      throw new Error(extractErrorMessage(json.error, defaultErrorMsg));
    }

    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      let bodyObj: Record<string, unknown> | null = null;
      if (typeof options.body === 'string') {
        try {
          bodyObj = JSON.parse(options.body) as Record<string, unknown>;
        } catch {
          bodyObj = null;
        }
      }
      recordClientActivityLog({
        actorName: this.currentActorName,
        actorRole: this.currentActorRole,
        method,
        path: endpoint,
        bodyObj,
      });
    }

    return json;
  }

  // System (/api/v1/health)
  async healthCheck(): Promise<
    ApiEnvelope<{ status: string; version: string; timestamp: string }>
  > {
    return this.requestJson<{ status: string; version: string; timestamp: string }>(
      '/health',
      {},
      'خطا در بررسی وضعیت سرور'
    );
  }

  // Auth (/api/v1/auth/*)
  async getMe(): Promise<{
    id: number;
    username: string;
    full_name?: string | null;
    role: string;
    student_id?: number | null;
  } | null> {
    this.consumeUrlToken();
    const res = await this.fetch('/auth/me');
    if (!res.ok) return null;
    const json = (await res.json()) as ApiEnvelope<{
      id: number;
      username: string;
      full_name?: string | null;
      role: string;
      student_id?: number | null;
    }>;
    if (!json.success || !json.data) return null;
    if (json.data.full_name || json.data.username) {
      this.currentActorName = safeTrim(json.data.full_name || json.data.username);
    }
    if (json.data.role) {
      this.currentActorRole = safeTrim(json.data.role);
    }
    return json.data;
  }

  async updateProfile(payload: {
    full_name?: string;
    name?: string;
    phone?: string;
    current_password?: string;
  }): Promise<ApiEnvelope<Record<string, unknown>>> {
    return this.requestJson<Record<string, unknown>>(
      '/auth/profile',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'خطا در به‌روزرسانی پروفایل'
    );
  }

  async changePassword(payload: {
    current_password: string;
    new_password: string;
  }): Promise<ApiEnvelope<Record<string, unknown>>> {
    return this.requestJson<Record<string, unknown>>(
      '/auth/change-password',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'خطا در تغییر رمز عبور'
    );
  }

  /**
   * GET /api/v1/admin/activity-logs (and fallback /api/v1/admin/stats/activity-logs)
   * Supports filtering by: role, actor_user_id, actor_linked_id, module, action, q, from, to, page, per_page
   */
  async getAdminActivityLogs(params: ActivityLogQueryParams = {}): Promise<{
    items: ActivityLogItem[];
    pagination: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
  }> {
    const page = Math.max(1, safeNumber(params.page, 1));
    const perPage = Math.max(1, safeNumber(params.per_page, 50));
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (safeTrim(params.role)) query.set('role', safeTrim(params.role));
    if (
      params.actor_user_id !== undefined &&
      params.actor_user_id !== null &&
      safeTrim(params.actor_user_id) !== ''
    ) {
      query.set('actor_user_id', safeTrim(params.actor_user_id));
    }
    if (
      params.actor_linked_id !== undefined &&
      params.actor_linked_id !== null &&
      safeTrim(params.actor_linked_id) !== ''
    ) {
      query.set('actor_linked_id', safeTrim(params.actor_linked_id));
    }
    if (safeTrim(params.module)) query.set('module', safeTrim(params.module));
    if (safeTrim(params.action)) query.set('action', safeTrim(params.action));
    if (safeTrim(params.q)) query.set('q', safeTrim(params.q));
    if (safeTrim(params.from)) query.set('from', safeTrim(params.from));
    if (safeTrim(params.to)) query.set('to', safeTrim(params.to));

    const qs = query.toString();
    const serverLogs: ActivityLogItem[] = [];
    let serverPagination: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    } | null = null;
    let fetchedFromServer = false;

    const candidateEndpoints = [
      `/admin/activity-logs?${qs}`,
      `/admin/stats/activity-logs?${qs}`,
    ];

    for (const ep of candidateEndpoints) {
      try {
        const res = await this.fetch(ep);
        if (res.ok) {
          const json = (await res.json()) as ApiEnvelope<
            | {
                items?: Record<string, unknown>[];
                logs?: Record<string, unknown>[];
                rows?: Record<string, unknown>[];
                pagination?: {
                  page?: number;
                  per_page?: number;
                  total?: number;
                  total_pages?: number;
                };
                total?: number;
                page?: number;
                per_page?: number;
                total_pages?: number;
              }
            | Record<string, unknown>[]
          >;
          if (json.success !== false && json.data) {
            fetchedFromServer = true;
            const rows = Array.isArray(json.data)
              ? json.data
              : json.data.items || json.data.logs || json.data.rows || [];
            for (const r of rows) {
              serverLogs.push(normalizeServerActivityLog(r));
            }
            const rawPag =
              json.pagination ||
              (!Array.isArray(json.data) ? json.data.pagination : undefined) ||
              (!Array.isArray(json.data) && json.data.total !== undefined
                ? {
                    page: json.data.page,
                    per_page: json.data.per_page,
                    total: json.data.total,
                    total_pages: json.data.total_pages,
                  }
                : undefined);
            if (rawPag) {
              const totalCount = safeNumber(rawPag.total, serverLogs.length);
              const perPageVal = Math.max(1, safeNumber(rawPag.per_page, perPage));
              serverPagination = {
                page: Math.max(1, safeNumber(rawPag.page, page)),
                per_page: perPageVal,
                total: totalCount,
                total_pages: Math.max(
                  1,
                  safeNumber(rawPag.total_pages, Math.ceil(totalCount / perPageVal))
                ),
              };
            }
            break;
          }
        }
      } catch {
        // Try next candidate endpoint or fallback
      }
    }

    if (fetchedFromServer) {
      return {
        items: serverLogs,
        pagination: serverPagination || {
          page,
          per_page: perPage,
          total: serverLogs.length,
          total_pages: 1,
        },
      };
    }

    // Fallback: merge local client logs + SMS dispatch logs when server is unreachable
    const smsActivityLogs: ActivityLogItem[] = [];
    try {
      const smsRes = await this.getAppointmentsSmsLog({ per_page: 25 });
      const items = smsRes.data?.items || [];
      for (const item of items) {
        const createdAt = safeTrim(item.sent_at || item.updated_at || item.created_at);
        if (!createdAt) continue;
        smsActivityLogs.push({
          id: `sms-log-${item.id || `${item.student_id}-${createdAt}`}`,
          actor_name: safeTrim(
            (item as unknown as { sent_by_name?: string }).sent_by_name || 'سیستم پیامک / ادمین'
          ),
          actor_role: 'admin',
          action_type: 'send_sms',
          category: 'appointments',
          category_label: CATEGORY_LABELS.appointments,
          title:
            item.status === 'sent'
              ? 'ارسال موفق پیامک نوبت هفتگی'
              : 'تلاش ارسال پیامک نوبت هفتگی',
          description: `پیامک یادآوری برای دانش‌آموز «${safeTrim(item.student_name)}» (${safeTrim(item.mobile_mask || item.mobile)})`,
          method: 'POST',
          endpoint: '/appointments/sms/send',
          created_at: createdAt,
          jalali_datetime: formatActivityJalaliDateTime(createdAt),
          source: 'server',
        });
      }
    } catch {
      // Ignore if SMS log is empty or inaccessible
    }

    const clientLogs = getLocalActivityLogs();
    const merged = mergeActivityLogs(serverLogs, smsActivityLogs, clientLogs);
    const filtered = filterActivityLogs(merged, {
      search: params.q,
      role: params.role,
      category: params.module,
      actionType: params.action,
      actorUserId: params.actor_user_id,
      actorLinkedId: params.actor_linked_id,
      from: params.from,
      to: params.to,
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const startIdx = (page - 1) * perPage;
    const pagedItems = filtered.slice(startIdx, startIdx + perPage);

    return {
      items: pagedItems,
      pagination: serverPagination || {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
      },
    };
  }

  /**
   * GET /api/v1/admin/activity-logs/stats (and fallback /api/v1/admin/stats/activity-logs/stats)
   * Returns total_logs, today_logs, by_role, by_module, and active_actors.
   */
  async getAdminActivityLogsStats(
    params: {
      from?: string;
      to?: string;
      role?: string;
      module?: string;
    } = {},
    fallbackItems: ActivityLogItem[] = []
  ): Promise<ActivityLogsStats> {
    const query = new URLSearchParams();
    if (safeTrim(params.from)) query.set('from', safeTrim(params.from));
    if (safeTrim(params.to)) query.set('to', safeTrim(params.to));
    if (safeTrim(params.role)) query.set('role', safeTrim(params.role));
    if (safeTrim(params.module)) query.set('module', safeTrim(params.module));
    const qs = query.toString();

    const candidateEndpoints = [
      `/admin/activity-logs/stats${qs ? `?${qs}` : ''}`,
      `/admin/stats/activity-logs/stats${qs ? `?${qs}` : ''}`,
    ];

    for (const ep of candidateEndpoints) {
      try {
        const res = await this.fetch(ep);
        if (res.ok) {
          const json = (await res.json()) as ApiEnvelope<Record<string, unknown>> &
            Record<string, unknown>;
          if (json.success !== false) {
            const payload =
              json.data && typeof json.data === 'object' ? json.data : json;
            return normalizeActivityLogsStats(payload, fallbackItems);
          }
        }
      } catch {
        // Fallback to next endpoint or computed stats
      }
    }

    return normalizeActivityLogsStats(null, fallbackItems);
  }

  async getActivityLogs(params: ActivityLogQueryParams = {}): Promise<ActivityLogItem[]> {
    const res = await this.getAdminActivityLogs(params);
    return res.items;
  }

  async login(
    username: string,
    password: string
  ): Promise<{
    token?: string;
    requires_2fa?: boolean;
    user_id?: number;
    email_mask?: string | null;
    user?: {
      id: number;
      username: string;
      full_name?: string | null;
      role: string;
      student_id?: number | null;
    };
  }> {
    const json = await this.requestJson<{
      token?: string;
      requires_2fa?: boolean;
      user_id?: number;
      email_mask?: string | null;
      user?: {
        id: number;
        username: string;
        full_name?: string | null;
        role: string;
        student_id?: number | null;
      };
    }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          username: safeTrim(username),
          password,
        }),
      },
      'نام کاربری یا رمز عبور نادرست است'
    );
    if (json.data?.token) {
      this.setToken(json.data.token);
    }
    return json.data;
  }

  async verify2fa(
    userId: number,
    code: string
  ): Promise<{
    token: string;
    user: {
      id: number;
      username: string;
      full_name?: string | null;
      role: string;
      student_id?: number | null;
    };
  }> {
    const json = await this.requestJson<{
      token: string;
      user: {
        id: number;
        username: string;
        full_name?: string | null;
        role: string;
        student_id?: number | null;
      };
    }>(
      '/auth/verify-2fa',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(userId),
          code: safeTrim(code),
        }),
      },
      'کد تایید نامعتبر یا منقضی شده است'
    );
    if (json.data?.token) {
      this.setToken(json.data.token);
    }
    return json.data;
  }

  async registerStudent(payload: {
    name: string;
    phone: string;
    nationalId: string;
    grade: number;
    field: AcademicField;
    password: string;
  }): Promise<{
    token: string;
    user: {
      id: number;
      username: string;
      full_name?: string | null;
      role: string;
      student_id?: number | null;
    };
  }> {
    const json = await this.requestJson<{
      token: string;
      user: {
        id: number;
        username: string;
        full_name?: string | null;
        role: string;
        student_id?: number | null;
      };
    }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: safeTrim(payload.name),
          phone: safeTrim(payload.phone),
          nationalId: safeTrim(payload.nationalId),
          grade: Number(payload.grade),
          field: payload.field,
          password: payload.password,
        }),
      },
      'خطا در ثبت‌نام دانش‌آموز'
    );
    if (json.data?.token) {
      this.setToken(json.data.token);
    }
    return json.data;
  }

  async logout(): Promise<void> {
    try {
      await this.fetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    this.setToken(null);
  }

  // Public Catalog & Blog (/api/v1/public/*)
  async getPublicCourses(page = 1, perPage = 20): Promise<ApiEnvelope<Course[]>> {
    return this.requestJson<Course[]>(
      `/public/courses?page=${page}&per_page=${perPage}`,
      {},
      'خطا در بارگذاری دوره‌های عمومی'
    );
  }

  async getPublicInstructors(page = 1, perPage = 20): Promise<ApiEnvelope<Instructor[]>> {
    return this.requestJson<Instructor[]>(
      `/public/instructors?page=${page}&per_page=${perPage}`,
      {},
      'خطا در بارگذاری اساتید عمومی'
    );
  }

  async getPublicSupporters(page = 1, perPage = 20): Promise<ApiEnvelope<PublicSupporter[]>> {
    return this.requestJson<PublicSupporter[]>(
      `/public/supporters?page=${page}&per_page=${perPage}`,
      {},
      'خطا در بارگذاری پشتیبان‌های عمومی'
    );
  }

  async getPublicBlogCategories(): Promise<ApiEnvelope<{ categories: BlogCategory[] }>> {
    return this.requestJson<{ categories: BlogCategory[] }>(
      '/public/blog/categories',
      {},
      'خطا در بارگذاری دسته‌بندی‌های وبلاگ'
    );
  }

  async getPublicBlogPosts(params?: {
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<ApiEnvelope<{ posts: BlogPost[] }>> {
    const query = new URLSearchParams({
      page: String(params?.page || 1),
      per_page: String(params?.perPage || 12),
    });
    if (safeTrim(params?.search)) query.set('search', safeTrim(params?.search));
    return this.requestJson<{ posts: BlogPost[] }>(
      `/public/blog/posts?${query.toString()}`,
      {},
      'خطا در بارگذاری پست‌های عمومی وبلاگ'
    );
  }

  async getPublicBlogPostBySlug(
    slug: string
  ): Promise<ApiEnvelope<{ post: BlogPost; related: BlogPost[] }>> {
    return this.requestJson<{ post: BlogPost; related: BlogPost[] }>(
      `/public/blog/posts/${encodeURIComponent(safeTrim(slug))}`,
      {},
      'مقاله مورد نظر یافت نشد'
    );
  }

  async getPublicBlogPostsByCategory(
    categorySlug: string,
    page = 1,
    perPage = 12
  ): Promise<ApiEnvelope<{ posts: BlogPost[]; category_info: BlogCategory }>> {
    return this.requestJson<{ posts: BlogPost[]; category_info: BlogCategory }>(
      `/public/blog/categories/${encodeURIComponent(safeTrim(categorySlug))}/posts?page=${page}&per_page=${perPage}`,
      {},
      'خطا در بارگذاری مقالات دسته‌بندی'
    );
  }

  // Dashboard (/api/v1/dashboard/stats)
  async getDashboardStats(): Promise<ApiEnvelope<DashboardStats>> {
    const res = await this.requestJson<DashboardStats>(
      '/dashboard/stats',
      {},
      'خطا در بارگذاری آمار داشبورد'
    );
    const raw = res.data;
    const avgByField = Array.isArray(raw?.avg_by_field)
      ? raw.avg_by_field.map((item) => ({
          ...item,
          student_count: safeNumber(item.student_count),
          avg_percentage: safeNumber(item.avg_percentage),
        }))
      : [];
    return {
      ...res,
      data: {
        students_count: safeNumber(raw?.students_count),
        exams_this_week: safeNumber(raw?.exams_this_week),
        students_no_exam: safeNumber(raw?.students_no_exam),
        pending_reports: safeNumber(raw?.pending_reports),
        avg_by_field: avgByField,
      },
    };
  }

  // Students (/api/v1/students*)
  async getStudents(params: {
    search?: string;
    field?: string;
    grade?: string;
    status?: '' | 'active' | 'inactive' | '1' | '0';
    page?: number;
    perPage?: number;
  }): Promise<ApiEnvelope<Student[]>> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      per_page: String(params.perPage || 20),
    });
    const search = safeTrim(params.search);
    if (search) query.set('search', search);
    if (params.field) query.set('field', params.field);
    if (params.grade) query.set('grade', params.grade);
    if (params.status === 'active' || params.status === '1') {
      query.set('status', '1');
    } else if (params.status === 'inactive' || params.status === '0') {
      query.set('status', '0');
    }

    return this.requestJson<Student[]>(
      `/students?${query.toString()}`,
      {},
      'خطا در بارگذاری دانش‌آموزان'
    );
  }

  async getStudentsList(): Promise<ApiEnvelope<Student[]>> {
    const res = await this.requestJson<Student[] | { students: Student[] }>(
      '/students/list',
      {},
      'خطا در بارگذاری لیست دانش‌آموزان'
    );
    const list = Array.isArray(res.data) ? res.data : res.data?.students || [];
    return { ...res, data: list };
  }

  async addStudent(payload: {
    name: string;
    phone: string | number;
    nationalId: string | number;
    grade: number;
    field: AcademicField;
  }): Promise<ApiEnvelope<Student>> {
    const nationalId = safeTrim(payload.nationalId);
    return this.requestJson<Student>(
      '/students',
      {
        method: 'POST',
        body: JSON.stringify({
          name: safeTrim(payload.name),
          phone: safeTrim(payload.phone),
          nationalId,
          national_id: nationalId,
          grade: Number(payload.grade),
          field: payload.field,
        }),
      },
      'خطا در افزودن دانش‌آموز'
    );
  }

  async updateStudent(
    id: number,
    payload: {
      name: string;
      phone: string | number;
      nationalId: string | number;
      grade: number;
      field: AcademicField;
    }
  ): Promise<ApiEnvelope<Student>> {
    const nationalId = safeTrim(payload.nationalId);
    return this.requestJson<Student>(
      `/students/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: safeTrim(payload.name),
          phone: safeTrim(payload.phone),
          nationalId,
          national_id: nationalId,
          grade: Number(payload.grade),
          field: payload.field,
        }),
      },
      'خطا در ویرایش دانش‌آموز'
    );
  }

  async deleteStudent(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/students/${id}`,
      { method: 'DELETE' },
      'خطا در حذف دانش‌آموز'
    );
  }

  async toggleStudentStatus(id: number): Promise<ApiEnvelope<{ id: number; status: number }>> {
    return this.requestJson<{ id: number; status: number }>(
      `/students/${id}/toggle-status`,
      { method: 'POST' },
      'خطا در تغییر وضعیت دانش‌آموز'
    );
  }

  async createStudentAccount(
    id: number
  ): Promise<ApiEnvelope<{ username: string; password: string }>> {
    return this.requestJson<{ username: string; password: string }>(
      `/students/${id}/create-account`,
      { method: 'POST' },
      'خطا در ایجاد حساب کاربری'
    );
  }

  async resetStudentPassword(id: number): Promise<ApiEnvelope<{ new_password: string }>> {
    return this.requestJson<{ new_password: string }>(
      `/students/${id}/reset-password`,
      { method: 'POST' },
      'خطا در بازنشانی رمز عبور'
    );
  }

  // Courses (/api/v1/courses*)
  async getCourses(): Promise<ApiEnvelope<Course[]>> {
    return this.requestJson<Course[]>('/courses?per_page=100', {}, 'خطا در بارگذاری دوره‌ها');
  }

  async addCourse(
    payload: Omit<Course, 'id'> & { background_image_file?: File | null }
  ): Promise<ApiEnvelope<Course>> {
    const formData = new FormData();
    formData.append('name', safeTrim(payload.name));
    if (payload.icon) formData.append('icon', String(payload.icon));
    if (payload.gradient_color_from)
      formData.append('gradient_color_from', String(payload.gradient_color_from));
    if (payload.gradient_color_to)
      formData.append('gradient_color_to', String(payload.gradient_color_to));
    if (payload.description) formData.append('description', String(payload.description));
    const numericPrice = Number(String(payload.price ?? '').replace(/[^\d]/g, '')) || 0;
    formData.append('price', String(numericPrice));
    formData.append('display_order', String(payload.display_order || 0));
    if (payload.background_image_file) {
      formData.append('background_image', payload.background_image_file);
    }

    return this.requestJson<Course>(
      '/courses',
      {
        method: 'POST',
        body: formData,
      },
      'خطا در افزودن دوره'
    );
  }

  async updateCourse(
    id: number,
    payload: Partial<Omit<Course, 'id'>> & { background_image_file?: File | null }
  ): Promise<ApiEnvelope<Course>> {
    const formData = new FormData();
    if (payload.name !== undefined) formData.append('name', safeTrim(payload.name));
    if (payload.icon) formData.append('icon', String(payload.icon));
    if (payload.gradient_color_from)
      formData.append('gradient_color_from', String(payload.gradient_color_from));
    if (payload.gradient_color_to)
      formData.append('gradient_color_to', String(payload.gradient_color_to));
    if (payload.description !== undefined && payload.description !== null) {
      formData.append('description', String(payload.description));
    }
    if (payload.price !== undefined) {
      const numericPrice = Number(String(payload.price ?? '').replace(/[^\d]/g, '')) || 0;
      formData.append('price', String(numericPrice));
    }
    if (payload.display_order !== undefined) {
      formData.append('display_order', String(payload.display_order));
    }
    if (payload.background_image_file) {
      formData.append('background_image_url', payload.background_image_file);
    }

    return this.requestJson<Course>(
      `/courses/${id}`,
      {
        method: 'PUT',
        body: formData,
      },
      'خطا در ویرایش دوره'
    );
  }

  async deleteCourse(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/courses/${id}`, { method: 'DELETE' }, 'خطا در حذف دوره');
  }

  // Subscriptions (/api/v1/subscriptions* & /api/v1/students/{id}/subscriptions)
  async getSubscriptions(
    params?: SubscriptionListQuery
  ): Promise<ApiEnvelope<Subscription[]>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    query.set('per_page', String(params?.per_page || 50));
    if (params?.student_id !== undefined && params.student_id !== '') {
      query.set('student_id', String(params.student_id));
    }
    if (params?.course_id !== undefined && params.course_id !== '') {
      query.set('course_id', String(params.course_id));
    }
    if (safeTrim(params?.status)) {
      query.set('status', safeTrim(params?.status));
    }
    if (params?.is_active === 0 || params?.is_active === 1) {
      query.set('is_active', String(params.is_active));
    }
    if (safeTrim(params?.search)) {
      query.set('search', safeTrim(params?.search));
    }

    const qs = query.toString();
    const res = await this.requestJson<unknown>(
      `/subscriptions${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری لیست اشتراک‌های دوره'
    );

    const rawData = res.data;
    const rawList: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? (rawData as Array<Record<string, unknown>>)
      : rawData &&
          typeof rawData === 'object' &&
          Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : rawData &&
            typeof rawData === 'object' &&
            Array.isArray((rawData as Record<string, unknown>).subscriptions)
          ? ((rawData as Record<string, unknown>).subscriptions as Array<Record<string, unknown>>)
          : [];

    return {
      ...res,
      data: rawList.map((item) => normalizeSubscription(item)),
    };
  }

  async getStudentSubscriptions(
    studentId: number,
    onlyActive?: boolean
  ): Promise<ApiEnvelope<Subscription[]>> {
    const query = new URLSearchParams();
    if (onlyActive) {
      query.set('only_active', '1');
    }
    const qs = query.toString();
    const res = await this.requestJson<unknown>(
      `/students/${studentId}/subscriptions${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری دوره‌های دانش‌آموز'
    );

    const rawData = res.data;
    const rawList: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? (rawData as Array<Record<string, unknown>>)
      : rawData &&
          typeof rawData === 'object' &&
          Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : rawData &&
            typeof rawData === 'object' &&
            Array.isArray((rawData as Record<string, unknown>).subscriptions)
          ? ((rawData as Record<string, unknown>).subscriptions as Array<Record<string, unknown>>)
          : [];

    return {
      ...res,
      data: rawList.map((item) => normalizeSubscription(item)),
    };
  }

  async getSubscriptionById(id: number): Promise<ApiEnvelope<Subscription>> {
    const res = await this.requestJson<Record<string, unknown>>(
      `/subscriptions/${id}`,
      {},
      'خطا در دریافت اطلاعات اشتراک'
    );
    return {
      ...res,
      data: normalizeSubscription(res.data || {}),
    };
  }

  async createSubscription(
    payload: SubscriptionCreateRequest
  ): Promise<ApiEnvelope<Subscription>> {
    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
      course_id: Number(payload.course_id),
    };
    if (payload.status) body.status = payload.status;
    if (payload.is_active === 0 || payload.is_active === 1) {
      body.is_active = payload.is_active;
    }
    if (payload.note !== undefined) {
      body.note = safeTrim(payload.note) || null;
    }
    if (payload.started_at !== undefined) {
      body.started_at = safeTrim(payload.started_at) || null;
    }
    if (payload.end_at !== undefined) {
      body.end_at = safeTrim(payload.end_at) || null;
    }

    const res = await this.requestJson<Record<string, unknown>>(
      '/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ثبت اشتراک دوره برای دانش‌آموز'
    );

    return {
      ...res,
      data: normalizeSubscription(res.data || body),
    };
  }

  async updateSubscription(
    id: number,
    payload: SubscriptionUpdateRequest
  ): Promise<ApiEnvelope<Subscription>> {
    const body: Record<string, unknown> = {};
    if (payload.student_id !== undefined) body.student_id = Number(payload.student_id);
    if (payload.course_id !== undefined) body.course_id = Number(payload.course_id);
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.is_active === 0 || payload.is_active === 1) {
      body.is_active = payload.is_active;
    }
    if (payload.note !== undefined) {
      body.note = safeTrim(payload.note) || null;
    }
    if (payload.started_at !== undefined) {
      body.started_at = safeTrim(payload.started_at) || null;
    }
    if (payload.end_at !== undefined) {
      body.end_at = safeTrim(payload.end_at) || null;
    }

    const res = await this.requestJson<Record<string, unknown>>(
      `/subscriptions/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      'خطا در ویرایش اطلاعات اشتراک دوره'
    );

    return {
      ...res,
      data: normalizeSubscription(res.data || { id, ...body }),
    };
  }

  async updateSubscriptionStatus(
    id: number,
    payload: SubscriptionStatusUpdateRequest
  ): Promise<ApiEnvelope<Subscription>> {
    const body: Record<string, unknown> = {
      status: payload.status,
    };
    if (payload.note !== undefined) {
      body.note = safeTrim(payload.note) || null;
    }

    try {
      const res = await this.requestJson<Record<string, unknown>>(
        `/subscriptions/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
        'خطا در تغییر وضعیت اشتراک دوره'
      );
      return {
        ...res,
        data: normalizeSubscription(res.data || { id, ...body }),
      };
    } catch {
      const res = await this.requestJson<Record<string, unknown>>(
        `/subscriptions/${id}/status`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
        'خطا در تغییر وضعیت اشتراک دوره'
      );
      return {
        ...res,
        data: normalizeSubscription(res.data || { id, ...body }),
      };
    }
  }

  async deleteSubscription(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/subscriptions/${id}`,
      { method: 'DELETE' },
      'خطا در حذف اشتراک دوره'
    );
  }

  // Instructors (/api/v1/instructors*)
  async getInstructors(): Promise<ApiEnvelope<Instructor[]>> {
    return this.requestJson<Instructor[]>(
      '/instructors?per_page=100',
      {},
      'خطا در بارگذاری اساتید'
    );
  }

  /**
   * POST /api/v1/instructors (multipart/form-data)
   * OpenAPI schema: { name (required), title, description, display_order, image (binary) }
   */
  async addInstructor(payload: {
    name: string;
    title?: string | null;
    description?: string | null;
    display_order?: number;
    image?: File | null;
  }): Promise<ApiEnvelope<Instructor>> {
    const formData = new FormData();
    formData.append('name', safeTrim(payload.name));
    if (payload.title !== undefined && payload.title !== null && safeTrim(payload.title) !== '') {
      formData.append('title', safeTrim(payload.title));
    }
    if (
      payload.description !== undefined &&
      payload.description !== null &&
      safeTrim(payload.description) !== ''
    ) {
      formData.append('description', safeTrim(payload.description));
    }
    formData.append('display_order', String(Number(payload.display_order) || 0));
    if (payload.image instanceof File) {
      formData.append('image', payload.image);
    }

    return this.requestJson<Instructor>(
      '/instructors',
      {
        method: 'POST',
        body: formData,
      },
      'خطا در افزودن استاد'
    );
  }

  /**
   * PUT /api/v1/instructors/{id} (multipart/form-data)
   * OpenAPI schema: { name, title, description, display_order, image (binary) }
   */
  async updateInstructor(
    id: number,
    payload: {
      name?: string;
      title?: string | null;
      description?: string | null;
      display_order?: number;
      image?: File | null;
    }
  ): Promise<ApiEnvelope<Instructor>> {
    const formData = new FormData();
    if (payload.name !== undefined) {
      formData.append('name', safeTrim(payload.name));
    }
    if (payload.title !== undefined && payload.title !== null) {
      formData.append('title', safeTrim(payload.title));
    }
    if (payload.description !== undefined && payload.description !== null) {
      formData.append('description', safeTrim(payload.description));
    }
    if (payload.display_order !== undefined) {
      formData.append('display_order', String(Number(payload.display_order) || 0));
    }
    if (payload.image instanceof File) {
      formData.append('image', payload.image);
    }

    return this.requestJson<Instructor>(
      `/instructors/${id}`,
      {
        method: 'PUT',
        body: formData,
      },
      'خطا در ویرایش استاد'
    );
  }

  async deleteInstructor(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/instructors/${id}`,
      { method: 'DELETE' },
      'خطا در حذف استاد'
    );
  }

  // Supporters (/api/v1/supporters*)
  async getSupporters(): Promise<ApiEnvelope<Supporter[]>> {
    const [supportersRes, publicRes, perfRes] = await Promise.allSettled([
      this.requestJson<Supporter[]>('/supporters?per_page=100', {}, 'خطا در بارگذاری پشتیبان‌ها'),
      this.requestJson<PublicSupporter[]>('/public/supporters', {}, ''),
      this.requestJson<{
        items?: Array<{
          supporter_id: number;
          assigned_students?: number;
          threads_with_reply?: number;
          unanswered_threads?: number;
          avg_first_reply_seconds?: number | null;
        }>;
      }>('/admin/stats/supporters/performance', {}, ''),
    ]);

    if (supportersRes.status === 'rejected') {
      throw supportersRes.reason;
    }

    const baseList = supportersRes.value.data || [];
    const publicById = new Map<number, PublicSupporter>();
    if (publicRes.status === 'fulfilled' && Array.isArray(publicRes.value.data)) {
      for (const pub of publicRes.value.data) {
        publicById.set(Number(pub.id), pub);
      }
    }

    const perfById = new Map<
      number,
      {
        assigned_students?: number;
        threads_with_reply?: number;
        unanswered_threads?: number;
        avg_first_reply_seconds?: number | null;
      }
    >();
    if (perfRes.status === 'fulfilled' && Array.isArray(perfRes.value.data?.items)) {
      for (const p of perfRes.value.data.items) {
        perfById.set(Number(p.supporter_id), p);
      }
    }

    const localDescMap = getAllLocalSupporterDescriptions();
    const localAvatarMap = getAllLocalSupporterAvatars();

    const enriched: Supporter[] = baseList.map((sup) => {
      const pub = publicById.get(Number(sup.id));
      const perf = perfById.get(Number(sup.id));
      const avgHours =
        perf?.avg_first_reply_seconds !== undefined && perf?.avg_first_reply_seconds !== null
          ? Number(perf.avg_first_reply_seconds) / 3600
          : sup.avg_response_hours ?? null;
      const avatarVal = sup.avatar ?? pub?.avatar ?? localAvatarMap[String(sup.id)] ?? null;
      const avatarUrlVal =
        sup.avatar_url ?? pub?.avatar_url ?? localAvatarMap[String(sup.id)] ?? null;
      return {
        ...sup,
        description: sup.description ?? localDescMap[String(sup.id)] ?? null,
        avatar: avatarVal,
        avatar_url: avatarUrlVal,
        assigned_students: perf?.assigned_students ?? sup.assigned_students,
        replied_count: perf?.threads_with_reply ?? sup.replied_count ?? 0,
        pending_count: perf?.unanswered_threads ?? sup.pending_count ?? 0,
        avg_response_hours: avgHours,
      };
    });

    return {
      ...supportersRes.value,
      data: enriched,
    };
  }

  /**
   * POST /api/v1/supporters (multipart/form-data or application/json)
   * Supports image/avatar upload alongside name, grade, field, phone, description, and chat_id.
   */
  async addSupporter(payload: {
    name: string;
    phone: string | number;
    grade: number;
    field: AcademicField;
    description?: string | null;
    chat_id?: string | number | null;
    image?: File | null;
    image_url?: string | null;
    avatar?: File | string | null;
    avatar_url?: string | null;
  }): Promise<ApiEnvelope<Supporter>> {
    const nameStr = safeTrim(payload.name);
    const phoneStr = safeTrim(payload.phone);
    const gradeNum = Number(payload.grade);
    const fieldVal = payload.field;
    const descStr = safeTrim(payload.description);
    const chatIdStr = safeTrim(payload.chat_id);
    const imageFile =
      payload.image instanceof File
        ? payload.image
        : payload.avatar instanceof File
          ? payload.avatar
          : null;
    const imageUrl =
      safeTrim(payload.image_url) ||
      (typeof payload.avatar === 'string' ? safeTrim(payload.avatar) : '') ||
      safeTrim(payload.avatar_url);

    let res: ApiEnvelope<Supporter>;

    if (imageFile) {
      const formData = new FormData();
      formData.append('name', nameStr);
      formData.append('phone', phoneStr);
      formData.append('grade', String(gradeNum));
      formData.append('field', fieldVal);
      if (descStr) formData.append('description', descStr);
      if (chatIdStr) formData.append('chat_id', chatIdStr);
      formData.append('avatar', imageFile);
      formData.append('image', imageFile);

      try {
        res = await this.requestJson<Supporter>(
          '/supporters',
          {
            method: 'POST',
            body: formData,
          },
          'خطا در افزودن پشتیبان'
        );
      } catch {
        const jsonBody: Record<string, unknown> = {
          name: nameStr,
          phone: phoneStr,
          grade: gradeNum,
          field: fieldVal,
        };
        if (descStr) jsonBody.description = descStr;
        if (chatIdStr) jsonBody.chat_id = chatIdStr;
        if (imageUrl) {
          jsonBody.avatar = imageUrl;
          jsonBody.avatar_url = imageUrl;
          jsonBody.image = imageUrl;
        }
        res = await this.requestJson<Supporter>(
          '/supporters',
          {
            method: 'POST',
            body: JSON.stringify(jsonBody),
          },
          'خطا در افزودن پشتیبان'
        );
      }
    } else {
      const jsonBody: Record<string, unknown> = {
        name: nameStr,
        phone: phoneStr,
        grade: gradeNum,
        field: fieldVal,
      };
      if (descStr) jsonBody.description = descStr;
      if (chatIdStr) jsonBody.chat_id = chatIdStr;
      if (imageUrl) {
        jsonBody.avatar = imageUrl;
        jsonBody.avatar_url = imageUrl;
        jsonBody.image = imageUrl;
      }
      res = await this.requestJson<Supporter>(
        '/supporters',
        {
          method: 'POST',
          body: JSON.stringify(jsonBody),
        },
        'خطا در افزودن پشتیبان'
      );
    }

    if (res.data?.id) {
      const idKey = String(res.data.id);
      if (descStr) saveLocalSupporterDescription(idKey, descStr);
      if (imageUrl) saveLocalSupporterAvatar(idKey, imageUrl);
    }

    return res;
  }

  /**
   * PUT /api/v1/supporters/{id} (multipart/form-data or application/json)
   * Supports image/avatar upload alongside name, grade, field, phone, description, chat_id, is_active, and password.
   */
  async updateSupporter(
    id: number,
    payload: {
      name: string;
      grade: number;
      field: AcademicField;
      description?: string | null;
      phone?: string | number | null;
      is_active?: number | boolean;
      chat_id?: string | number | null;
      password?: string;
      image?: File | null;
      image_url?: string | null;
      avatar?: File | string | null;
      avatar_url?: string | null;
    }
  ): Promise<ApiEnvelope<Supporter>> {
    const nameStr = safeTrim(payload.name);
    const gradeNum = Number(payload.grade);
    const fieldVal = payload.field;
    const descStr = payload.description !== undefined ? safeTrim(payload.description) : undefined;
    const phoneStr = payload.phone !== undefined ? safeTrim(payload.phone) : undefined;
    const isActiveVal = payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : undefined;
    const chatIdStr = payload.chat_id !== undefined ? safeTrim(payload.chat_id) : undefined;
    const imageFile =
      payload.image instanceof File
        ? payload.image
        : payload.avatar instanceof File
          ? payload.avatar
          : null;
    const imageUrl =
      safeTrim(payload.image_url) ||
      (typeof payload.avatar === 'string' ? safeTrim(payload.avatar) : '') ||
      safeTrim(payload.avatar_url);

    let res: ApiEnvelope<Supporter>;

    if (imageFile) {
      const formData = new FormData();
      formData.append('_method', 'PUT');
      formData.append('name', nameStr);
      formData.append('grade', String(gradeNum));
      formData.append('field', fieldVal);
      if (descStr !== undefined) formData.append('description', descStr);
      if (phoneStr !== undefined) formData.append('phone', phoneStr);
      if (isActiveVal !== undefined) formData.append('is_active', String(isActiveVal));
      if (chatIdStr !== undefined) formData.append('chat_id', chatIdStr);
      if (payload.password) formData.append('password', payload.password);
      formData.append('avatar', imageFile);
      formData.append('image', imageFile);

      try {
        res = await this.requestJson<Supporter>(
          `/supporters/${id}`,
          {
            method: 'POST',
            headers: { 'X-HTTP-Method-Override': 'PUT' },
            body: formData,
          },
          'خطا در ویرایش پشتیبان'
        );
      } catch {
        const jsonBody: Record<string, unknown> = {
          name: nameStr,
          grade: gradeNum,
          field: fieldVal,
        };
        if (descStr !== undefined) jsonBody.description = descStr;
        if (phoneStr !== undefined) jsonBody.phone = phoneStr || null;
        if (isActiveVal !== undefined) jsonBody.is_active = isActiveVal;
        if (chatIdStr !== undefined) jsonBody.chat_id = chatIdStr;
        if (payload.password) jsonBody.password = payload.password;
        if (imageUrl) {
          jsonBody.avatar = imageUrl;
          jsonBody.avatar_url = imageUrl;
          jsonBody.image = imageUrl;
        }

        res = await this.requestJson<Supporter>(
          `/supporters/${id}`,
          {
            method: 'PUT',
            body: JSON.stringify(jsonBody),
          },
          'خطا در ویرایش پشتیبان'
        );
      }
    } else {
      const jsonBody: Record<string, unknown> = {
        name: nameStr,
        grade: gradeNum,
        field: fieldVal,
      };
      if (descStr !== undefined) jsonBody.description = descStr;
      if (phoneStr !== undefined) jsonBody.phone = phoneStr || null;
      if (isActiveVal !== undefined) jsonBody.is_active = isActiveVal;
      if (chatIdStr !== undefined) jsonBody.chat_id = chatIdStr;
      if (payload.password) jsonBody.password = payload.password;
      if (
        payload.image_url !== undefined ||
        payload.avatar !== undefined ||
        payload.avatar_url !== undefined
      ) {
        jsonBody.avatar = imageUrl || null;
        jsonBody.avatar_url = imageUrl || null;
        jsonBody.image = imageUrl || null;
      }

      res = await this.requestJson<Supporter>(
        `/supporters/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(jsonBody),
        },
        'خطا در ویرایش پشتیبان'
      );
    }

    const idKey = String(id);
    if (descStr !== undefined) {
      if (descStr) saveLocalSupporterDescription(idKey, descStr);
      else removeLocalSupporterDescription(idKey);
    }
    if (
      payload.image_url !== undefined ||
      payload.avatar !== undefined ||
      payload.avatar_url !== undefined ||
      imageFile
    ) {
      if (imageUrl) saveLocalSupporterAvatar(idKey, imageUrl);
      else removeLocalSupporterAvatar(idKey);
    }

    return res;
  }

  async deleteSupporter(id: number): Promise<ApiEnvelope<null>> {
    removeLocalSupporterDescription(String(id));
    removeLocalSupporterAvatar(String(id));
    return this.requestJson<null>(
      `/supporters/${id}`,
      { method: 'DELETE' },
      'خطا در حذف پشتیبان'
    );
  }

  // Student → Supporter Assignments (/api/v1/assignments*)
  async getAssignmentStudents(
    params?: AssignmentStudentsQuery
  ): Promise<ApiEnvelope<AssignmentStudentRow[]>> {
    const query = new URLSearchParams();
    query.set('status', params?.status || 'all');
    if (params?.page) query.set('page', String(params.page));
    query.set('per_page', String(params?.per_page || 100));
    if (safeTrim(params?.search)) query.set('search', safeTrim(params?.search));
    if (safeTrim(params?.field)) query.set('field', safeTrim(params?.field));
    if (params?.grade !== undefined && params.grade !== '') {
      query.set('grade', String(params.grade));
    }
    if (params?.supporter_id !== undefined && params.supporter_id !== '') {
      query.set('supporter_id', String(params.supporter_id));
    }
    if (params?.include_inactive) {
      query.set('include_inactive', 'true');
    }

    const qs = query.toString();
    const res = await this.requestJson<unknown>(
      `/assignments/students${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری لیست وضعیت پشتیبان دانش‌آموزان'
    );

    const rawData = res.data;
    const rawList: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? (rawData as Array<Record<string, unknown>>)
      : rawData &&
          typeof rawData === 'object' &&
          Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : rawData &&
            typeof rawData === 'object' &&
            Array.isArray((rawData as Record<string, unknown>).students)
          ? ((rawData as Record<string, unknown>).students as Array<Record<string, unknown>>)
          : [];

    return {
      ...res,
      data: rawList.map((item) => normalizeAssignmentStudentRow(item)),
    };
  }

  async assignStudentToSupporter(
    payload: AssignStudentRequest
  ): Promise<ApiEnvelope<SupportAssignment>> {
    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
      supporter_id: Number(payload.supporter_id),
    };
    if (payload.note !== undefined) {
      body.note = safeTrim(payload.note) || null;
    }

    const res = await this.requestJson<Record<string, unknown>>(
      '/assignments',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در تخصیص دانش‌آموز به پشتیبان'
    );

    return {
      ...res,
      data: normalizeSupportAssignment(res.data || body),
    };
  }

  async unassignStudentSupporter(
    studentId: number
  ): Promise<ApiEnvelope<SupportAssignment>> {
    const res = await this.requestJson<Record<string, unknown>>(
      `/assignments/${studentId}`,
      { method: 'DELETE' },
      'خطا در لغو تخصیص پشتیبان دانش‌آموز'
    );
    return {
      ...res,
      data: normalizeSupportAssignment(res.data || { student_id: studentId, supporter_id: null }),
    };
  }

  async getSupporterAssignedStudents(
    supporterId: number
  ): Promise<ApiEnvelope<AssignmentStudentRow[]>> {
    const res = await this.requestJson<unknown>(
      `/assignments/supporters/${supporterId}/students`,
      {},
      'خطا در بارگذاری لیست دانش‌آموزان پشتیبان'
    );

    const rawData = res.data;
    const rawList: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? (rawData as Array<Record<string, unknown>>)
      : rawData &&
          typeof rawData === 'object' &&
          Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : rawData &&
            typeof rawData === 'object' &&
            Array.isArray((rawData as Record<string, unknown>).students)
          ? ((rawData as Record<string, unknown>).students as Array<Record<string, unknown>>)
          : [];

    return {
      ...res,
      data: rawList.map((item) => normalizeAssignmentStudentRow(item)),
    };
  }

  async getStudentAssignmentHistory(
    studentId: number
  ): Promise<ApiEnvelope<AssignmentHistoryEntry[]>> {
    const res = await this.requestJson<unknown>(
      `/assignments/history/${studentId}`,
      {},
      'خطا در بارگذاری تاریخچه پشتیبان دانش‌آموز'
    );

    const rawData = res.data;
    const rawList: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? (rawData as Array<Record<string, unknown>>)
      : rawData &&
          typeof rawData === 'object' &&
          Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : rawData &&
            typeof rawData === 'object' &&
            Array.isArray((rawData as Record<string, unknown>).history)
          ? ((rawData as Record<string, unknown>).history as Array<Record<string, unknown>>)
          : [];

    return {
      ...res,
      data: rawList.map((item, idx) => normalizeAssignmentHistoryEntry(item, idx)),
    };
  }

  async runAssignmentInitialFill(
    payload?: AssignmentInitialFillRequest
  ): Promise<ApiEnvelope<AssignmentInitialFillReport>> {
    const dryRun = payload?.dry_run ?? true;
    const body: Record<string, unknown> = {
      dry_run: dryRun,
      only_unassigned: payload?.only_unassigned ?? true,
    };
    if (Array.isArray(payload?.student_ids) && payload.student_ids.length > 0) {
      body.student_ids = payload.student_ids.map((id) => Number(id));
    }

    const res = await this.requestJson<Record<string, unknown>>(
      '/assignments/initial-fill',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در اجرای تخصیص خودکار اولیه پشتیبان'
    );

    return {
      ...res,
      data: normalizeInitialFillReport(res.data || {}, dryRun),
    };
  }

  // Exams (/api/v1/exams*)
  async getExamDates(monthFilter?: string): Promise<ApiEnvelope<{ dates: ExamDateSummary[] }>> {
    const query = new URLSearchParams({ per_page: '100' });
    if (monthFilter) query.set('month', monthFilter);
    const res = await this.requestJson<{ dates: ExamDateSummary[] } | ExamDateSummary[]>(
      `/exams/dates?${query.toString()}`,
      {},
      'خطا در بارگذاری آزمون‌ها'
    );
    const rawDates = Array.isArray(res.data) ? res.data : res.data?.dates || [];
    let dates: ExamDateSummary[] = rawDates.map((d) => ({
      ...d,
      exam_date: safeTrim(d.exam_date),
      student_count: safeNumber(d.student_count),
      subject_count: safeNumber(d.subject_count),
      avg_percentage: safeNumber(d.avg_percentage),
    }));
    if (monthFilter) {
      dates = dates.filter((d) => d.exam_date?.startsWith(monthFilter));
    }
    return { ...res, data: { dates } };
  }

  async getExamStudents(examDate: string): Promise<ApiEnvelope<{ students: ExamStudentSummary[] }>> {
    const query = new URLSearchParams({ exam_date: examDate, per_page: '100' });
    const res = await this.requestJson<{ students: ExamStudentSummary[] } | ExamStudentSummary[]>(
      `/exams/students?${query.toString()}`,
      {},
      'خطا در بارگذاری لیست شرکت‌کنندگان'
    );
    const rawStudents = Array.isArray(res.data) ? res.data : res.data?.students || [];
    const students: ExamStudentSummary[] = rawStudents.map((s) => ({
      ...s,
      student_id: safeNumber(s.student_id),
      name: safeTrim(s.name),
      grade: safeNumber(s.grade, 12),
      subject_count: safeNumber(s.subject_count),
      avg_percentage: safeNumber(s.avg_percentage),
    }));
    return { ...res, data: { students } };
  }

  async getExamDetails(
    examDate: string,
    studentId: number
  ): Promise<ApiEnvelope<ExamDetailsResponse>> {
    const query = new URLSearchParams({
      exam_date: examDate,
      student_id: String(studentId),
    });
    const res = await this.requestJson<ExamDetailsResponse>(
      `/exams/details?${query.toString()}`,
      {},
      'خطا در بارگذاری جزئیات کارنامه'
    );
    return {
      ...res,
      data: {
        ...normalizeExamDetails(res.data),
        comments: Array.isArray(res.data?.comments) ? res.data.comments : [],
      },
    };
  }

  /**
   * GET /api/v1/exams?student_id={id}&date_from={YYYY-MM-DD}&date_to={YYYY-MM-DD}&page=1&per_page=20
   * Accessible by `admin`, `teacher`, `supporter` (returns exam rows with `id` and `student_name`).
   */
  async getExamsList(
    params: GetExamsListQuery = {}
  ): Promise<ApiEnvelope<{ exams: ExamListItem[] }>> {
    const query = new URLSearchParams({
      page: String(Math.max(1, safeNumber(params.page, 1))),
      per_page: String(Math.max(1, safeNumber(params.per_page, 20))),
    });
    if (
      params.student_id !== undefined &&
      params.student_id !== null &&
      safeTrim(params.student_id) !== ''
    ) {
      query.set('student_id', safeTrim(params.student_id));
    }
    if (safeTrim(params.date_from)) {
      query.set('date_from', safeTrim(params.date_from));
    }
    if (safeTrim(params.date_to)) {
      query.set('date_to', safeTrim(params.date_to));
    }

    const res = await this.requestJson<
      { exams?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
    >(
      `/exams?${query.toString()}`,
      {},
      'خطا در بارگذاری لیست نتایج آزمون'
    );

    const rawExams = Array.isArray(res.data) ? res.data : res.data?.exams || [];
    return {
      ...res,
      data: {
        exams: rawExams.map((row) => normalizeExamListItem(row)),
      },
    };
  }

  /**
   * PATCH /api/v1/exams/{id} (with 405 fallback to PUT /api/v1/exams/{id})
   * Permitted for `admin` and `teacher` roles only.
   * Never sends `percentage` (computed server-side: ROUND((correct / total_q) * 100, 2)).
   */
  async updateExamResult(
    id: number,
    payload: UpdateExamResultRequest
  ): Promise<ApiEnvelope<{ exam: ExamListItem }>> {
    const body: Record<string, unknown> = {};
    if (payload.exam_date !== undefined) {
      body.exam_date = safeTrim(payload.exam_date);
    }
    if (payload.subject !== undefined) {
      body.subject = safeTrim(payload.subject);
    }
    if (payload.chapter !== undefined) {
      const cleanChapter = safeTrim(payload.chapter);
      body.chapter = cleanChapter !== '' ? cleanChapter : null;
    }
    if (payload.total_q !== undefined) {
      body.total_q = Number(payload.total_q);
    }
    if (payload.correct !== undefined) {
      body.correct = Number(payload.correct);
    }
    if (payload.wrong !== undefined) {
      body.wrong = Number(payload.wrong);
    }
    if (payload.skipped !== undefined) {
      body.skipped = Number(payload.skipped);
    }
    if (payload.student_id !== undefined && Number(payload.student_id) >= 1) {
      body.student_id = Number(payload.student_id);
    }

    const endpoint = `/exams/${Number(id)}`;
    const bodyStr = JSON.stringify(body);

    let usedMethod: 'PATCH' | 'PUT' = 'PATCH';
    let res = await this.fetch(endpoint, {
      method: 'PATCH',
      body: bodyStr,
    });

    if (res.status === 405) {
      usedMethod = 'PUT';
      res = await this.fetch(endpoint, {
        method: 'PUT',
        body: bodyStr,
      });
    }

    let json: ApiEnvelope<{ exam?: Record<string, unknown> } | Record<string, unknown>>;
    try {
      json = (await res.json()) as ApiEnvelope<
        { exam?: Record<string, unknown> } | Record<string, unknown>
      >;
    } catch {
      const fallbackByStatus =
        res.status === 401
          ? 'نشست منقضی شده یا توکن نامعتبر است'
          : res.status === 403
            ? 'فقط مدرس و مدیر امکان ویرایش نتایج آزمون را دارند'
            : res.status === 404
              ? 'نتیجه آزمون مورد نظر یافت نشد'
              : 'خطا در ویرایش نتیجه آزمون';
      const err = new Error(fallbackByStatus) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    if (!res.ok || json.success === false) {
      const fallbackByStatus =
        res.status === 401
          ? 'نشست منقضی شده یا توکن نامعتبر است'
          : res.status === 403
            ? 'فقط مدرس و مدیر امکان ویرایش نتایج آزمون را دارند'
            : res.status === 404
              ? 'نتیجه آزمون مورد نظر یافت نشد'
              : 'خطا در ویرایش نتیجه آزمون';
      const msg = extractErrorMessage(json.error, fallbackByStatus);
      const err = new Error(msg) as Error & { status?: number; code?: string };
      err.status = res.status;
      if (json.error && typeof json.error === 'object' && json.error.code) {
        err.code = json.error.code;
      }
      throw err;
    }

    recordClientActivityLog({
      actorName: this.currentActorName,
      actorRole: this.currentActorRole,
      method: usedMethod,
      path: endpoint,
      bodyObj: body,
    });

    const rawData = json.data as { exam?: Record<string, unknown> } | Record<string, unknown> | null;
    const rawExamObj: Record<string, unknown> =
      rawData &&
      typeof rawData === 'object' &&
      'exam' in rawData &&
      rawData.exam &&
      typeof rawData.exam === 'object'
        ? (rawData.exam as Record<string, unknown>)
        : rawData && typeof rawData === 'object'
          ? (rawData as Record<string, unknown>)
          : {};

    return {
      success: true,
      data: {
        exam: normalizeExamListItem({ id, ...body, ...rawExamObj }),
      },
      pagination: json.pagination ?? null,
      error: null,
    };
  }

  /**
   * PUT /api/v1/exams/comments
   * OpenAPI schema: ExamCommentUpsertRequest { student_id, exam_date, body }
   */
  async upsertExamComment(payload: {
    student_id: number;
    exam_date: string;
    body: string;
  }): Promise<
    ApiEnvelope<{
      comment: import('../types').ExamComment;
      comments: import('../types').ExamComment[];
    }>
  > {
    return this.requestJson(
      '/exams/comments',
      {
        method: 'PUT',
        body: JSON.stringify({
          student_id: Number(payload.student_id),
          exam_date: safeTrim(payload.exam_date),
          body: safeTrim(payload.body),
        }),
      },
      'خطا در ثبت نظر روی کارنامه'
    );
  }

  /**
   * GET /api/v1/exams/share-links?student_id=...&exam_date=...
   * OpenAPI operationId: examListShareLinks
   */
  async getExamShareLinks(params?: {
    student_id?: number;
    exam_date?: string;
  }): Promise<ApiEnvelope<{ links: import('../types').ExamShareLinkItem[] }>> {
    const query = new URLSearchParams();
    if (params?.student_id && Number(params.student_id) > 0) {
      query.set('student_id', String(params.student_id));
    }
    if (params?.exam_date && safeTrim(params.exam_date)) {
      query.set('exam_date', safeTrim(params.exam_date));
    }
    const qs = query.toString();
    const res = await this.requestJson<
      { links?: import('../types').ExamShareLinkItem[] } | import('../types').ExamShareLinkItem[]
    >(
      `/exams/share-links${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری لینک‌های اشتراک کارنامه'
    );
    const rawLinks = Array.isArray(res.data) ? res.data : res.data?.links || [];
    const { normalizeExamShareLinkItem } = await import('./exam-math');
    const links = rawLinks.map((item) => normalizeExamShareLinkItem(item));
    return {
      ...res,
      data: { links },
    };
  }

  /**
   * POST /api/v1/exams/share-links
   * OpenAPI operationId: examCreateShareLink
   */
  async createExamShareLink(
    payload: import('../types').ExamShareLinkCreateRequest
  ): Promise<ApiEnvelope<import('../types').ExamShareLinkResponse>> {
    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
      exam_date: safeTrim(payload.exam_date),
      send_sms: Boolean(payload.send_sms),
    };
    if (payload.parent_contact_id !== undefined && payload.parent_contact_id !== null) {
      body.parent_contact_id = Number(payload.parent_contact_id);
    }
    if (payload.phone && safeTrim(payload.phone)) {
      body.phone = safeTrim(payload.phone);
    }

    return this.requestJson<import('../types').ExamShareLinkResponse>(
      '/exams/share-links',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ساخت لینک اشتراک کارنامه'
    );
  }

  /**
   * POST /api/v1/exams/share-links/send-sms
   * OpenAPI operationId: examSendShareLinkSms
   */
  async sendExamShareLinkSms(
    payload: import('../types').ExamShareLinkCreateRequest
  ): Promise<ApiEnvelope<import('../types').ExamShareLinkResponse>> {
    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
      exam_date: safeTrim(payload.exam_date),
      send_sms: true,
    };
    if (payload.parent_contact_id !== undefined && payload.parent_contact_id !== null) {
      body.parent_contact_id = Number(payload.parent_contact_id);
    }
    if (payload.phone && safeTrim(payload.phone)) {
      body.phone = safeTrim(payload.phone);
    }

    return this.requestJson<import('../types').ExamShareLinkResponse>(
      '/exams/share-links/send-sms',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ارسال پیامک لینک کارنامه به والد'
    );
  }

  /**
   * DELETE /api/v1/exams/share-links/{id} (with fallback to POST /api/v1/exams/share-links/{id}/revoke)
   * OpenAPI operationIds: examRevokeShareLink, examRevokeShareLinkPost
   */
  async revokeExamShareLink(
    id: number
  ): Promise<ApiEnvelope<{ link: import('../types').ExamShareLinkItem }>> {
    try {
      return await this.requestJson<{ link: import('../types').ExamShareLinkItem }>(
        `/exams/share-links/${Number(id)}`,
        { method: 'DELETE' },
        'خطا در ابطال لینک اشتراک کارنامه'
      );
    } catch {
      return this.requestJson<{ link: import('../types').ExamShareLinkItem }>(
        `/exams/share-links/${Number(id)}/revoke`,
        { method: 'POST' },
        'خطا در ابطال لینک اشتراک کارنامه'
      );
    }
  }

  /**
   * GET /api/v1/public/exam-results/{token}
   * OpenAPI operationId: publicGetSharedExamResult
   */
  async getPublicSharedExamResult(
    token: string
  ): Promise<ApiEnvelope<import('../types').PublicSharedExamResult>> {
    const res = await this.requestJson<import('../types').PublicSharedExamResult>(
      `/public/exam-results/${encodeURIComponent(safeTrim(token))}`,
      {},
      'لینک نتیجه آزمون معتبر نیست یا منقضی شده است'
    );
    const { normalizeExamSubject } = await import('./exam-math');
    const subjects = Array.isArray(res.data?.subjects)
      ? res.data.subjects.map((s) => normalizeExamSubject(s))
      : [];
    const avg_percentage =
      subjects.length > 0
        ? Math.round((subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length) * 10) /
          10
        : safeNumber(res.data?.avg_percentage);

    return {
      ...res,
      data: {
        ...res.data,
        student_name: safeTrim(res.data?.student_name || res.data?.student?.name),
        student: {
          name: safeTrim(res.data?.student?.name || res.data?.student_name),
          grade: res.data?.student?.grade ?? null,
          field: res.data?.student?.field ?? null,
        },
        exam_date: safeTrim(res.data?.exam_date),
        subjects,
        avg_percentage,
        comments: Array.isArray(res.data?.comments) ? res.data.comments : [],
      },
    };
  }

  async getStudentExamTrend(
    studentId: number,
    currentExamDate?: string | null,
    currentDetails?: ExamDetailsResponse | null
  ): Promise<StudentExamTrendPoint[]> {
    const collectedRows: RawStudentExamHistoryRow[] = [];

    try {
      const query = new URLSearchParams({
        student_id: String(studentId),
        per_page: '200',
      });
      const res = await this.requestJson<
        { exams?: RawStudentExamHistoryRow[] } | RawStudentExamHistoryRow[]
      >(`/exams?${query.toString()}`, {}, 'خطا در بارگذاری روند آزمون‌های دانش‌آموز');
      const exams = Array.isArray(res.data) ? res.data : res.data?.exams || [];
      if (exams.length > 0) {
        collectedRows.push(...exams);
      }
    } catch {
      // Fallback to /exams/dates or /students/{id}/analytics/exam-trend below
    }

    if (collectedRows.length === 0) {
      try {
        const res = await this.requestJson<
          { dates?: RawStudentExamHistoryRow[] } | RawStudentExamHistoryRow[]
        >(
          `/exams/dates?student_id=${encodeURIComponent(String(studentId))}&per_page=50`,
          {},
          'خطا در بارگذاری تاریخ‌های آزمون دانش‌آموز'
        );
        const dates = Array.isArray(res.data) ? res.data : res.data?.dates || [];
        if (dates.length > 0) {
          collectedRows.push(...dates);
        }
      } catch {
        // Fallback to analytics/exam-trend
      }
    }

    if (collectedRows.length === 0) {
      try {
        const res = await this.requestJson<
          | { trend?: RawStudentExamHistoryRow[]; exams?: RawStudentExamHistoryRow[] }
          | RawStudentExamHistoryRow[]
        >(
          `/students/${encodeURIComponent(String(studentId))}/analytics/exam-trend`,
          {},
          'خطا در بارگذاری روند آزمون'
        );
        const trend = Array.isArray(res.data)
          ? res.data
          : res.data?.trend || res.data?.exams || [];
        if (trend.length > 0) {
          collectedRows.push(...trend);
        }
      } catch {
        // Use currentDetails if available
      }
    }

    return buildStudentExamTrend(collectedRows, {
      currentExamDate,
      currentDetails,
      limit: 5,
    });
  }

  async submitExamEntry(payload: {
    student_id: number;
    exam_date: string;
    subjects: SubjectResult[];
  }): Promise<ApiEnvelope<{ inserted: number }>> {
    return this.requestJson<{ inserted: number }>(
      '/exams',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'خطا در ثبت نتایج آزمون'
    );
  }

  // Files (/api/v1/files*)
  async getFiles(): Promise<ApiEnvelope<ExamFile[]>> {
    return this.requestJson<ExamFile[]>('/files?per_page=100', {}, 'خطا در بارگذاری فایل‌ها');
  }

  async uploadFile(payload: {
    file: File;
    student_id: number;
    description: string;
  }): Promise<ApiEnvelope<ExamFile>> {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('student_id', String(payload.student_id));
    const desc = safeTrim(payload.description);
    if (desc) {
      formData.append('description', desc);
    }

    return this.requestJson<ExamFile>(
      '/files/upload',
      {
        method: 'POST',
        body: formData,
      },
      'خطا در آپلود فایل'
    );
  }

  getFileDownloadUrl(file: ExamFile): string {
    if (file.path && file.path.startsWith('http')) {
      return file.path;
    }
    return `${this.base}/files/${file.id}/download`;
  }

  async deleteFile(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/files/${id}`, { method: 'DELETE' }, 'خطا در حذف فایل');
  }

  // Blog (/api/v1/blog/posts*)
  async getBlogPosts(): Promise<ApiEnvelope<{ posts: BlogPost[] }>> {
    const res = await this.requestJson<{ posts: BlogPost[] } | BlogPost[]>(
      '/blog/posts?per_page=100',
      {},
      'خطا در بارگذاری پست‌های وبلاگ'
    );
    const posts = Array.isArray(res.data) ? res.data : res.data?.posts || [];
    return { ...res, data: { posts } };
  }

  async getBlogPost(id: number): Promise<ApiEnvelope<{ post: BlogPost }>> {
    const res = await this.requestJson<{ post: BlogPost } | BlogPost>(
      `/blog/posts/${id}`,
      {},
      'خطا در دریافت اطلاعات پست'
    );
    const post =
      res.data && typeof res.data === 'object' && 'post' in res.data
        ? (res.data as { post: BlogPost }).post
        : (res.data as BlogPost);
    return { ...res, data: { post } };
  }

  async saveBlogPost(
    payload: {
      title: string;
      slug: string;
      category?: string;
      category_id?: number;
      cover_image?: string | null;
      excerpt?: string;
      content: string;
      meta_description?: string;
      published: boolean;
    },
    id?: number | null
  ): Promise<ApiEnvelope<BlogPost>> {
    const endpoint = id ? `/blog/posts/${id}` : '/blog/posts';
    const method = id ? 'PUT' : 'POST';
    return this.requestJson<BlogPost>(
      endpoint,
      {
        method,
        body: JSON.stringify({
          ...payload,
          is_published: payload.published ? 1 : 0,
        }),
      },
      'خطا در ذخیره پست وبلاگ'
    );
  }

  async deleteBlogPost(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/blog/posts/${id}`, { method: 'DELETE' }, 'خطا در حذف پست وبلاگ');
  }

  // Reports (/api/v1/reports*)
  async getReportsStats(
    dateFrom?: string,
    dateTo?: string
  ): Promise<ApiEnvelope<{ stats: ReportDayStat[] }>> {
    const query = new URLSearchParams();
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);
    const qs = query.toString();
    const res = await this.requestJson<{ stats: ReportDayStat[] } | ReportDayStat[]>(
      `/reports/stats${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری آمار گزارش‌ها'
    );
    const rawStats = Array.isArray(res.data) ? res.data : res.data?.stats || [];
    const stats: ReportDayStat[] = rawStats.map((r) => ({
      date: safeTrim(r.date),
      replied: safeNumber(r.replied),
      pending: safeNumber(r.pending),
    }));
    return { ...res, data: { stats } };
  }

  // ============================================================================
  // Weekly Appointments & SMS Reminders (/api/v1/appointments*)
  // ============================================================================

  /**
   * GET /api/v1/appointments/sms/preview?week_date=YYYY-MM-DD
   * Normalizes both PHP production backend (`items`, `summary.total`)
   * and `dev-server.mjs` (`students`, `summary.total_students`).
   */
  async getAppointmentsSmsPreview(
    weekDate: string
  ): Promise<
    ApiEnvelope<
      AppointmentSmsPreviewData & {
        items: AppointmentSmsPreviewItem[];
        summary: AppointmentSmsPreviewSummary & { total: number };
      }
    >
  > {
    const query = new URLSearchParams({ week_date: safeTrim(weekDate) });
    const res = await this.requestJson<
      AppointmentSmsPreviewData | AppointmentSmsPreviewItem[]
    >(
      `/appointments/sms/preview?${query.toString()}`,
      {},
      'خطا در دریافت لیست نوبت‌های هفتگی'
    );

    const rawData = res.data;
    const rawItems: AppointmentSmsPreviewItem[] = Array.isArray(rawData)
      ? rawData
      : rawData?.items || rawData?.students || [];

    const normalizedItems: AppointmentSmsPreviewItem[] = rawItems.map((item) => {
      const startTime = item.start_time ? String(item.start_time).slice(0, 5) : null;
      const endTime = item.end_time ? String(item.end_time).slice(0, 5) : null;
      return {
        ...item,
        start_time: startTime,
        end_time: endTime,
        mobile_mask: item.mobile_mask ?? item.mobile ?? null,
        mobile: item.mobile ?? item.mobile_mask ?? null,
        last_appointment_at:
          item.last_appointment_at ?? item.last_sent_appointment_at ?? null,
        active_appointments_count: Number(item.active_appointments_count ?? (item.appointment_id ? 1 : 0)),
        multiple_appointments: Boolean(
          item.multiple_appointments ?? Number(item.active_appointments_count ?? 0) > 1
        ),
        attempts: Number(item.attempts ?? 0),
      };
    });

    const rawSummary = !Array.isArray(rawData) ? rawData?.summary : undefined;
    const computedSummary: AppointmentSmsPreviewSummary & { total: number } = {
      total:
        rawSummary?.total ??
        rawSummary?.total_students ??
        normalizedItems.length,
      total_students:
        rawSummary?.total_students ??
        rawSummary?.total ??
        normalizedItems.length,
      will_send:
        rawSummary?.will_send ??
        normalizedItems.filter((i) => i.status === 'will_send').length,
      already_sent:
        rawSummary?.already_sent ??
        normalizedItems.filter((i) => i.status === 'already_sent').length,
      changed_since_sent:
        rawSummary?.changed_since_sent ??
        normalizedItems.filter((i) => i.status === 'changed_since_sent').length,
      failed:
        rawSummary?.failed ??
        normalizedItems.filter((i) => i.status === 'failed').length,
      no_phone:
        rawSummary?.no_phone ??
        normalizedItems.filter((i) => i.status === 'no_phone').length,
      no_appointment:
        rawSummary?.no_appointment ??
        normalizedItems.filter((i) => i.status === 'no_appointment').length,
      multiple_appointments:
        rawSummary?.multiple_appointments ??
        normalizedItems.filter((i) => i.multiple_appointments).length,
    };

    const weekStart =
      (!Array.isArray(rawData) && rawData?.week_start) || safeTrim(weekDate);
    const weekEnd =
      (!Array.isArray(rawData) && rawData?.week_end) || safeTrim(weekDate);

    return {
      ...res,
      data: {
        ...(Array.isArray(rawData) ? {} : rawData),
        week_start: weekStart,
        week_end: weekEnd,
        summary: computedSummary,
        items: normalizedItems,
      },
    };
  }

  /**
   * POST /api/v1/appointments/sms/send
   * Never sends an empty `student_ids: []` array (omits `student_ids` when empty/null).
   */
  async sendAppointmentsSms(
    payload: PostAppointmentSmsSendRequest
  ): Promise<
    ApiEnvelope<
      AppointmentSmsSendData & { items: AppointmentSmsSendResultItem[] }
    >
  > {
    const body: Record<string, unknown> = {
      week_date: safeTrim(payload.week_date),
      mode: payload.mode || 'unsent',
    };

    if (Array.isArray(payload.student_ids) && payload.student_ids.length > 0) {
      body.student_ids = payload.student_ids.map((id) => Number(id));
    }

    const opId = safeTrim(payload.operation_id);
    if (opId) {
      body.operation_id = opId;
    }

    const res = await this.requestJson<AppointmentSmsSendData>(
      '/appointments/sms/send',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ارسال پیامک نوبت‌ها'
    );

    const rawItems = res.data?.items || res.data?.details || [];
    return {
      ...res,
      data: {
        ...res.data,
        items: rawItems,
      },
    };
  }

  /**
   * GET /api/v1/appointments/sms/log
   * Normalizes `items` (PHP) and `logs` (`dev-server.mjs`).
   */
  async getAppointmentsSmsLog(
    params?: GetAppointmentSmsLogQuery | string
  ): Promise<ApiEnvelope<{ items: AppointmentSmsLogItem[] }>> {
    const query = new URLSearchParams();
    if (typeof params === 'string') {
      if (safeTrim(params)) query.set('week_date', safeTrim(params));
    } else if (params) {
      if (safeTrim(params.week_date)) query.set('week_date', safeTrim(params.week_date));
      if (params.student_id) query.set('student_id', String(params.student_id));
      if (params.status) query.set('status', params.status);
      if (params.page) query.set('page', String(params.page));
      if (params.per_page) {
        query.set('per_page', String(params.per_page));
        query.set('perPage', String(params.per_page));
      }
    }
    const qs = query.toString();
    const res = await this.requestJson<
      | { items?: AppointmentSmsLogItem[]; logs?: AppointmentSmsLogItem[] }
      | AppointmentSmsLogItem[]
    >(
      `/appointments/sms/log${qs ? `?${qs}` : ''}`,
      {},
      'خطا در دریافت تاریخچه پیامک‌ها'
    );

    const rawList = Array.isArray(res.data)
      ? res.data
      : res.data?.items || res.data?.logs || [];

    return {
      ...res,
      data: { items: rawList },
    };
  }

  /**
   * GET /api/v1/appointments
   * Sends both `per_page` and `perPage` for PHP and dev-server compatibility.
   */
  async getAppointmentsList(
    params?: GetAppointmentsListQuery
  ): Promise<ApiEnvelope<AppointmentRecord[]>> {
    const query = new URLSearchParams();
    const perPageVal = params?.per_page ?? params?.perPage ?? 50;
    query.set('page', String(params?.page || 1));
    query.set('per_page', String(perPageVal));
    query.set('perPage', String(perPageVal));
    if (params?.student_id) query.set('student_id', String(params.student_id));
    if (params?.status) query.set('status', params.status);
    if (safeTrim(params?.from_date)) query.set('from_date', safeTrim(params?.from_date));
    if (safeTrim(params?.to_date)) query.set('to_date', safeTrim(params?.to_date));

    const res = await this.requestJson<
      AppointmentRecord[] | { appointments?: AppointmentRecord[]; items?: AppointmentRecord[] }
    >(
      `/appointments?${query.toString()}`,
      {},
      'خطا در بارگذاری لیست نوبت‌ها'
    );

    const list = Array.isArray(res.data)
      ? res.data
      : res.data?.appointments || res.data?.items || [];

    return { ...res, data: list };
  }

  /**
   * POST /api/v1/appointments or PUT /api/v1/appointments/{id}
   */
  async upsertAppointment(
    payload: UpsertAppointmentRequest
  ): Promise<ApiEnvelope<AppointmentRecord>> {
    const endpoint = payload.id ? `/appointments/${payload.id}` : '/appointments';
    const method = payload.id ? 'PUT' : 'POST';
    const startTime = safeTrim(payload.start_time).slice(0, 5);
    const endTime = safeTrim(payload.end_time).slice(0, 5);

    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
      appointment_date: safeTrim(payload.appointment_date),
      start_time: startTime,
      type: safeTrim(payload.type) || 'weekly_session',
      description: safeTrim(payload.description) || undefined,
      status: payload.status || 'scheduled',
    };

    if (endTime) {
      body.end_time = endTime;
    }

    return this.requestJson<AppointmentRecord>(
      endpoint,
      {
        method,
        body: JSON.stringify(body),
      },
      'خطا در ذخیره نوبت'
    );
  }

  /**
   * PUT /api/v1/appointments/{id}/status
   */
  async updateAppointmentStatus(
    id: number,
    status: AppointmentStatus
  ): Promise<ApiEnvelope<AppointmentRecord>> {
    return this.requestJson<AppointmentRecord>(
      `/appointments/${id}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status }),
      },
      'خطا در تغییر وضعیت نوبت'
    );
  }

  /**
   * DELETE /api/v1/appointments/{id}
   */
  async deleteAppointment(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/appointments/${id}`,
      { method: 'DELETE' },
      'خطا در لغو و حذف نوبت'
    );
  }

  // ============================================================================
  // Parent Contacts (/api/v1/students/{studentId}/parent-contacts*)
  // ============================================================================

  async getParentContacts(
    studentId: number
  ): Promise<ApiEnvelope<ParentContactRecord[]>> {
    const res = await this.requestJson<
      ParentContactRecord[] | { contacts?: ParentContactRecord[]; items?: ParentContactRecord[] }
    >(
      `/students/${studentId}/parent-contacts`,
      {},
      'خطا در دریافت شماره‌های والدین'
    );
    const list = Array.isArray(res.data)
      ? res.data
      : res.data?.contacts || res.data?.items || [];
    return { ...res, data: list };
  }

  async createParentContact(
    studentId: number,
    payload: CreateParentContactRequest
  ): Promise<ApiEnvelope<ParentContactRecord>> {
    return this.requestJson<ParentContactRecord>(
      `/students/${studentId}/parent-contacts`,
      {
        method: 'POST',
        body: JSON.stringify({
          parent_name: safeTrim(payload.parent_name),
          relationship: payload.relationship,
          phone: safeTrim(payload.phone),
          is_primary: Boolean(payload.is_primary ?? true),
        }),
      },
      'خطا در ثبت شماره ولی'
    );
  }

  async updateParentContact(
    studentId: number,
    contactId: number,
    payload: UpdateParentContactRequest
  ): Promise<ApiEnvelope<ParentContactRecord>> {
    return this.requestJson<ParentContactRecord>(
      `/students/${studentId}/parent-contacts/${contactId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          parent_name: payload.parent_name !== undefined ? safeTrim(payload.parent_name) : undefined,
          relationship: payload.relationship,
          phone: payload.phone !== undefined ? safeTrim(payload.phone) : undefined,
          is_primary: payload.is_primary,
        }),
      },
      'خطا در ویرایش شماره ولی'
    );
  }

  async deleteParentContact(
    studentId: number,
    contactId: number
  ): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/students/${studentId}/parent-contacts/${contactId}`,
      { method: 'DELETE' },
      'خطا در حذف شماره ولی'
    );
  }

  // ============================================================================
  // Daily Attendance (/api/v1/attendance*)
  // ============================================================================

  /**
   * GET /api/v1/attendance?date=YYYY-MM-DD&field=...
   */
  async getAttendanceBoard(params?: {
    date?: string;
    field?: string;
  }): Promise<ApiEnvelope<AttendanceDay>> {
    const query = new URLSearchParams();
    if (safeTrim(params?.date)) query.set('date', safeTrim(params?.date));
    if (safeTrim(params?.field) && params?.field !== 'all') {
      query.set('field', safeTrim(params?.field));
    }
    const qs = query.toString();
    const res = await this.requestJson<AttendanceDay | AttendanceEntry[]>(
      `/attendance${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری بورد حضور و غیاب روزانه'
    );
    const raw = res.data;
    const entries: AttendanceEntry[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.entries)
      ? raw.entries
      : [];
    return {
      ...res,
      data: {
        date: (!Array.isArray(raw) && raw?.date) || safeTrim(params?.date),
        date_jalali: (!Array.isArray(raw) && raw?.date_jalali) || '',
        field: (!Array.isArray(raw) && raw?.field) || params?.field || null,
        entries,
      },
    };
  }

  /**
   * PUT /api/v1/attendance/entries
   */
  async upsertAttendanceEntry(
    payload: UpsertAttendanceEntryRequest
  ): Promise<ApiEnvelope<AttendanceEntry>> {
    const body: Record<string, unknown> = {
      date: safeTrim(payload.date),
      student_id: Number(payload.student_id),
    };
    if (payload.status) body.status = payload.status;
    if (payload.removed !== undefined) body.removed = Boolean(payload.removed);
    if (safeTrim(payload.client_uuid)) body.client_uuid = safeTrim(payload.client_uuid);

    return this.requestJson<AttendanceEntry>(
      '/attendance/entries',
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      'خطا در ثبت حضور و غیاب دانش‌آموز'
    );
  }

  /**
   * PATCH /api/v1/attendance/{id}/times
   */
  async patchAttendanceTime(
    id: number,
    payload: PatchAttendanceTimeRequest
  ): Promise<ApiEnvelope<AttendanceEntry>> {
    return this.requestJson<AttendanceEntry>(
      `/attendance/${id}/times`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          field: payload.field,
          value: payload.value ?? null,
        }),
      },
      'خطا در ثبت ساعت حضور یا آزمون'
    );
  }

  /**
   * POST /api/v1/attendance/guests
   */
  async addAttendanceGuest(
    payload: CreateAttendanceGuestRequest
  ): Promise<ApiEnvelope<AttendanceEntry>> {
    return this.requestJson<AttendanceEntry>(
      '/attendance/guests',
      {
        method: 'POST',
        body: JSON.stringify({
          date: safeTrim(payload.date),
          guest_name: safeTrim(payload.guest_name),
          field: safeTrim(payload.field),
        }),
      },
      'خطا در ثبت دانش‌آموز مهمان'
    );
  }

  /**
   * GET /api/v1/attendance/print
   */
  async getAttendancePrint(params?: {
    date?: string;
    field?: string;
  }): Promise<ApiEnvelope<AttendanceDay>> {
    const query = new URLSearchParams();
    if (safeTrim(params?.date)) query.set('date', safeTrim(params?.date));
    if (safeTrim(params?.field) && params?.field !== 'all') {
      query.set('field', safeTrim(params?.field));
    }
    const qs = query.toString();
    return this.requestJson<AttendanceDay>(
      `/attendance/print${qs ? `?${qs}` : ''}`,
      {},
      'خطا در دریافت لیست چاپی حضور و غیاب'
    );
  }

  // ============================================================================
  // Tutoring & Remedial Classrooms (/api/v1/tutoring*)
  // ============================================================================

  /**
   * GET /api/v1/tutoring/board
   */
  async getTutoringBoard(since?: string): Promise<ApiEnvelope<TutoringBoardClass[]>> {
    const query = new URLSearchParams();
    if (safeTrim(since)) query.set('since', safeTrim(since));
    const qs = query.toString();
    const res = await this.requestJson<
      | TutoringBoardClass[]
      | {
          items?: TutoringBoardClass[];
          classrooms?: TutoringBoardClass[];
          classes?: TutoringBoardClass[];
        }
    >(
      `/tutoring/board${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری وضعیت کلاس‌های رفع اشکال'
    );
    const list = Array.isArray(res.data)
      ? res.data
      : res.data?.items || res.data?.classrooms || res.data?.classes || [];
    return { ...res, data: list };
  }

  /**
   * GET /api/v1/tutoring/me
   */
  async getTutoringMe(): Promise<
    ApiEnvelope<{
      classroom: TutoringClassroom;
      status: {
        status: TeacherTutoringStatus;
        started_at: string;
        status_date: string;
      } | null;
      open_session: TutoringSession | null;
    }>
  > {
    return this.requestJson(
      '/tutoring/me',
      {},
      'خطا در دریافت وضعیت کلاس رفع اشکال مدرس'
    );
  }

  /**
   * PUT /api/v1/tutoring/status
   */
  async setTutoringStatus(
    status: TeacherTutoringStatus
  ): Promise<ApiEnvelope<TutoringStatus>> {
    return this.requestJson<TutoringStatus>(
      '/tutoring/status',
      {
        method: 'PUT',
        body: JSON.stringify({ status }),
      },
      'خطا در تغییر وضعیت حضور استاد'
    );
  }

  /**
   * GET /api/v1/tutoring/students?q=...
   */
  async searchTutoringStudents(q?: string): Promise<
    ApiEnvelope<
      Array<{
        id: number;
        name: string;
        grade: number | null;
        field: string;
      }>
    >
  > {
    const query = new URLSearchParams();
    if (safeTrim(q)) query.set('q', safeTrim(q));
    const qs = query.toString();
    return this.requestJson(
      `/tutoring/students${qs ? `?${qs}` : ''}`,
      {},
      'خطا در جستجوی دانش‌آموزان کلاس رفع اشکال'
    );
  }

  /**
   * POST /api/v1/tutoring/sessions
   */
  async startTutoringSession(payload: {
    student_id: number;
    classroom_id?: number;
    client_uuid?: string | null;
    entered_at?: string | null;
  }): Promise<ApiEnvelope<TutoringSession>> {
    const body: Record<string, unknown> = {
      student_id: Number(payload.student_id),
    };
    if (payload.classroom_id) body.classroom_id = Number(payload.classroom_id);
    if (safeTrim(payload.client_uuid)) body.client_uuid = safeTrim(payload.client_uuid);
    if (safeTrim(payload.entered_at)) body.entered_at = safeTrim(payload.entered_at);

    return this.requestJson<TutoringSession>(
      '/tutoring/sessions',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ثبت ورود دانش‌آموز به کلاس رفع اشکال'
    );
  }

  /**
   * POST /api/v1/tutoring/sessions/{id}/end
   */
  async endTutoringSession(
    sessionId: number,
    endedAt?: string | null
  ): Promise<ApiEnvelope<TutoringSession>> {
    const body: Record<string, unknown> = {};
    if (safeTrim(endedAt)) body.ended_at = safeTrim(endedAt);

    return this.requestJson<TutoringSession>(
      `/tutoring/sessions/${sessionId}/end`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ثبت خروج دانش‌آموز از کلاس رفع اشکال'
    );
  }

  /**
   * POST /api/v1/tutoring/classrooms
   */
  async createTutoringClassroom(payload: {
    name: string;
    class_name?: string;
    field?: string;
    teacher_name?: string;
    instructor_id?: number;
    sort_order?: number;
  }): Promise<ApiEnvelope<TutoringClassroom>> {
    const name = safeTrim(payload.name || payload.class_name);
    const body: Record<string, unknown> = {
      name,
      class_name: name,
    };
    if (safeTrim(payload.field)) body.field = safeTrim(payload.field);
    if (safeTrim(payload.teacher_name)) body.teacher_name = safeTrim(payload.teacher_name);
    if (payload.instructor_id) body.instructor_id = Number(payload.instructor_id);
    if (payload.sort_order !== undefined) body.sort_order = Number(payload.sort_order);

    return this.requestJson<TutoringClassroom>(
      '/tutoring/classrooms',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      'خطا در ایجاد ستون کلاس رفع اشکال در سرور'
    );
  }

  /**
   * DELETE /api/v1/tutoring/classrooms/{id}
   */
  async deleteTutoringClassroom(id: number): Promise<ApiEnvelope<unknown>> {
    return this.requestJson(
      `/tutoring/classrooms/${id}`,
      {
        method: 'DELETE',
      },
      'خطا در حذف ستون کلاس رفع اشکال از سرور'
    );
  }
}

export const API = new FamoApiClient();
export default API;


