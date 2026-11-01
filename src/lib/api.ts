import type {
  Student,
  Course,
  Instructor,
  Supporter,
  ExamRecord,
  ExamDateSummary,
  ExamStudentSummary,
  ExamDetailsResponse,
  ExamFile,
  BlogPost,
  ReportDayStat,
  DashboardStats,
  AcademicField,
  SubjectResult,
} from '../types';

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

    return json;
  }

  // Auth
  async getMe(): Promise<{ username: string; role: string } | null> {
    this.consumeUrlToken();
    const res = await this.fetch('/auth/me');
    if (!res.ok) return null;
    const json = (await res.json()) as ApiEnvelope<{ username: string; role: string }>;
    if (!json.success || !json.data) return null;
    return json.data;
  }

  async login(
    username: string,
    password: string
  ): Promise<{ username: string; role: string; token?: string }> {
    const json = await this.requestJson<{ username: string; role: string; token?: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      'نام کاربری یا رمز عبور نادرست است'
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

  // Dashboard
  async getDashboardStats(): Promise<ApiEnvelope<DashboardStats>> {
    return this.requestJson<DashboardStats>(
      '/dashboard/stats',
      {},
      'خطا در بارگذاری آمار داشبورد'
    );
  }

  // Students
  async getStudents(params: {
    search?: string;
    field?: string;
    grade?: string;
    status?: '' | 'active' | 'inactive';
    page?: number;
    perPage?: number;
  }): Promise<ApiEnvelope<Student[]>> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      per_page: String(params.perPage || 20),
    });
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.field) query.set('field', params.field);
    if (params.grade) query.set('grade', params.grade);
    if (params.status) query.set('status', params.status);

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
    phone: string;
    nationalId: string;
    grade: number;
    field: AcademicField;
  }): Promise<ApiEnvelope<Student>> {
    return this.requestJson<Student>(
      '/students',
      {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name.trim(),
          phone: payload.phone.trim(),
          national_id: payload.nationalId.trim(),
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
      phone: string;
      nationalId: string;
      grade: number;
      field: AcademicField;
    }
  ): Promise<ApiEnvelope<Student>> {
    return this.requestJson<Student>(
      `/students/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: payload.name.trim(),
          phone: payload.phone.trim(),
          national_id: payload.nationalId.trim(),
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

  async toggleStudentStatus(id: number): Promise<ApiEnvelope<Student>> {
    return this.requestJson<Student>(
      `/students/${id}/toggle-status`,
      { method: 'POST' },
      'خطا در تغییر وضعیت دانش‌آموز'
    );
  }

  async createStudentAccount(id: number): Promise<ApiEnvelope<Student>> {
    return this.requestJson<Student>(
      `/students/${id}/create-account`,
      { method: 'POST' },
      'خطا در ایجاد حساب کاربری'
    );
  }

  async resetStudentPassword(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/students/${id}/reset-password`,
      { method: 'POST' },
      'خطا در بازنشانی رمز عبور'
    );
  }

  // Courses
  async getCourses(): Promise<ApiEnvelope<Course[]>> {
    return this.requestJson<Course[]>('/courses', {}, 'خطا در بارگذاری دوره‌ها');
  }

  async addCourse(payload: Omit<Course, 'id'>): Promise<ApiEnvelope<Course>> {
    return this.requestJson<Course>(
      '/courses',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'خطا در افزودن دوره'
    );
  }

  async updateCourse(id: number, payload: Partial<Omit<Course, 'id'>>): Promise<ApiEnvelope<Course>> {
    return this.requestJson<Course>(
      `/courses/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'خطا در ویرایش دوره'
    );
  }

  async deleteCourse(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/courses/${id}`, { method: 'DELETE' }, 'خطا در حذف دوره');
  }

  // Instructors
  async getInstructors(): Promise<ApiEnvelope<Instructor[]>> {
    return this.requestJson<Instructor[]>('/instructors', {}, 'خطا در بارگذاری اساتید');
  }

  async addInstructor(payload: Omit<Instructor, 'id'>): Promise<ApiEnvelope<Instructor>> {
    return this.requestJson<Instructor>(
      '/instructors',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'خطا در افزودن استاد'
    );
  }

  async updateInstructor(
    id: number,
    payload: Partial<Omit<Instructor, 'id'>>
  ): Promise<ApiEnvelope<Instructor>> {
    return this.requestJson<Instructor>(
      `/instructors/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
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

  // Supporters
  async getSupporters(): Promise<ApiEnvelope<Supporter[]>> {
    return this.requestJson<Supporter[]>(
      '/supporters?per_page=100',
      {},
      'خطا در بارگذاری پشتیبان‌ها'
    );
  }

  async addSupporter(payload: {
    name: string;
    phone: string;
    grade: number;
    field: AcademicField;
    chat_id: string | null;
    username?: string;
    password?: string;
  }): Promise<ApiEnvelope<Supporter>> {
    return this.requestJson<Supporter>(
      '/supporters',
      {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name.trim(),
          phone: payload.phone.trim(),
          grade: Number(payload.grade),
          field: payload.field,
          chat_id: payload.chat_id ? payload.chat_id.trim() : null,
          username: payload.username?.trim(),
          password: payload.password,
        }),
      },
      'خطا در افزودن پشتیبان'
    );
  }

  async updateSupporter(
    id: number,
    payload: {
      name: string;
      grade: number;
      field: AcademicField;
      chat_id: string | null;
      password?: string;
    }
  ): Promise<ApiEnvelope<Supporter>> {
    const body: Record<string, unknown> = {
      name: payload.name.trim(),
      grade: Number(payload.grade),
      field: payload.field,
      chat_id: payload.chat_id ? payload.chat_id.trim() : null,
    };
    if (payload.password) {
      body.password = payload.password;
    }
    return this.requestJson<Supporter>(
      `/supporters/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      'خطا در ویرایش پشتیبان'
    );
  }

  async deleteSupporter(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(
      `/supporters/${id}`,
      { method: 'DELETE' },
      'خطا در حذف پشتیبان'
    );
  }

  // Exams
  async getExamDates(monthFilter?: string): Promise<ApiEnvelope<{ dates: ExamDateSummary[] }>> {
    const query = new URLSearchParams();
    if (monthFilter) query.set('month', monthFilter);
    const qs = query.toString();
    const res = await this.requestJson<{ dates: ExamDateSummary[] } | ExamDateSummary[]>(
      `/exams/dates${qs ? `?${qs}` : ''}`,
      {},
      'خطا در بارگذاری آزمون‌ها'
    );
    const dates = Array.isArray(res.data) ? res.data : res.data?.dates || [];
    return { ...res, data: { dates } };
  }

  async getExamStudents(examDate: string): Promise<ApiEnvelope<{ students: ExamStudentSummary[] }>> {
    const query = new URLSearchParams({ date: examDate });
    const res = await this.requestJson<{ students: ExamStudentSummary[] } | ExamStudentSummary[]>(
      `/exams/students?${query.toString()}`,
      {},
      'خطا در بارگذاری لیست شرکت‌کنندگان'
    );
    const students = Array.isArray(res.data) ? res.data : res.data?.students || [];
    return { ...res, data: { students } };
  }

  async getExamDetails(
    examDate: string,
    studentId: number
  ): Promise<ApiEnvelope<ExamDetailsResponse>> {
    const query = new URLSearchParams({
      date: examDate,
      student_id: String(studentId),
    });
    return this.requestJson<ExamDetailsResponse>(
      `/exams/details?${query.toString()}`,
      {},
      'خطا در بارگذاری جزئیات کارنامه'
    );
  }

  async submitExamEntry(payload: {
    student_id: number;
    exam_date: string;
    subjects: SubjectResult[];
  }): Promise<ApiEnvelope<ExamRecord>> {
    return this.requestJson<ExamRecord>(
      '/exams',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'خطا در ثبت نتایج آزمون'
    );
  }

  // Files
  async getFiles(): Promise<ApiEnvelope<ExamFile[]>> {
    return this.requestJson<ExamFile[]>('/files', {}, 'خطا در بارگذاری فایل‌ها');
  }

  async uploadFile(payload: {
    file: File;
    student_id: number | null;
    exam_date: string;
    description: string;
  }): Promise<ApiEnvelope<ExamFile>> {
    const formData = new FormData();
    formData.append('file', payload.file);
    if (payload.student_id) {
      formData.append('student_id', String(payload.student_id));
    }
    if (payload.exam_date) {
      formData.append('exam_date', payload.exam_date);
    }
    if (payload.description.trim()) {
      formData.append('description', payload.description.trim());
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

  getFileDownloadUrl(id: number): string {
    return `${this.base}/files/${id}/download`;
  }

  async deleteFile(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/files/${id}`, { method: 'DELETE' }, 'خطا در حذف فایل');
  }

  // Blog
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
    const post = 'post' in (res.data || {}) ? (res.data as { post: BlogPost }).post : (res.data as BlogPost);
    return { ...res, data: { post } };
  }

  async saveBlogPost(
    payload: Omit<BlogPost, 'id' | 'views' | 'published_at'>,
    id?: number | null
  ): Promise<ApiEnvelope<BlogPost>> {
    const endpoint = id ? `/blog/posts/${id}` : '/blog/posts';
    const method = id ? 'PUT' : 'POST';
    return this.requestJson<BlogPost>(
      endpoint,
      {
        method,
        body: JSON.stringify(payload),
      },
      'خطا در ذخیره پست وبلاگ'
    );
  }

  async deleteBlogPost(id: number): Promise<ApiEnvelope<null>> {
    return this.requestJson<null>(`/blog/posts/${id}`, { method: 'DELETE' }, 'خطا در حذف پست وبلاگ');
  }

  // Reports
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
    const stats = Array.isArray(res.data) ? res.data : res.data?.stats || [];
    return { ...res, data: { stats } };
  }
}

export const API = new FamoApiClient();
export default API;
