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
  ExamFile,
  BlogPost,
  ReportDayStat,
  DashboardStats,
  AcademicField,
  SubjectResult,
} from '../types';
import { safeTrim } from './exam-math';

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
    return json.data;
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
    return this.requestJson<DashboardStats>(
      '/dashboard/stats',
      {},
      'خطا در بارگذاری آمار داشبورد'
    );
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

  async addCourse(payload: Omit<Course, 'id'>): Promise<ApiEnvelope<Course>> {
    const formData = new FormData();
    formData.append('name', safeTrim(payload.name));
    if (payload.icon) formData.append('icon', String(payload.icon));
    if (payload.gradient_color_from) formData.append('gradient_color_from', String(payload.gradient_color_from));
    if (payload.gradient_color_to) formData.append('gradient_color_to', String(payload.gradient_color_to));
    if (payload.description) formData.append('description', String(payload.description));
    const numericPrice = Number(String(payload.price ?? '').replace(/[^\d]/g, '')) || 0;
    formData.append('price', String(numericPrice));
    formData.append('display_order', String(payload.display_order || 0));

    return this.requestJson<Course>(
      '/courses',
      {
        method: 'POST',
        body: formData,
      },
      'خطا در افزودن دوره'
    );
  }

  async updateCourse(id: number, payload: Partial<Omit<Course, 'id'>>): Promise<ApiEnvelope<Course>> {
    const formData = new FormData();
    if (payload.name !== undefined) formData.append('name', safeTrim(payload.name));
    if (payload.icon) formData.append('icon', String(payload.icon));
    if (payload.gradient_color_from) formData.append('gradient_color_from', String(payload.gradient_color_from));
    if (payload.gradient_color_to) formData.append('gradient_color_to', String(payload.gradient_color_to));
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

  // Instructors (/api/v1/instructors*)
  async getInstructors(): Promise<ApiEnvelope<Instructor[]>> {
    return this.requestJson<Instructor[]>('/instructors?per_page=100', {}, 'خطا در بارگذاری اساتید');
  }

  async addInstructor(payload: Omit<Instructor, 'id'>): Promise<ApiEnvelope<Instructor>> {
    const formData = new FormData();
    formData.append('name', safeTrim(payload.name));
    if (payload.title) formData.append('title', String(payload.title));
    if (payload.description) formData.append('description', String(payload.description));
    if (payload.initial_letter) formData.append('initial_letter', String(payload.initial_letter));
    formData.append('display_order', String(payload.display_order || 0));

    return this.requestJson<Instructor>(
      '/instructors',
      {
        method: 'POST',
        body: formData,
      },
      'خطا در افزودن استاد'
    );
  }

  async updateInstructor(
    id: number,
    payload: Partial<Omit<Instructor, 'id'>>
  ): Promise<ApiEnvelope<Instructor>> {
    const formData = new FormData();
    if (payload.name !== undefined) formData.append('name', safeTrim(payload.name));
    if (payload.title !== undefined && payload.title !== null) formData.append('title', String(payload.title));
    if (payload.description !== undefined && payload.description !== null) {
      formData.append('description', String(payload.description));
    }
    if (payload.initial_letter) formData.append('initial_letter', String(payload.initial_letter));
    if (payload.display_order !== undefined) {
      formData.append('display_order', String(payload.display_order));
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
    return this.requestJson<Supporter[]>(
      '/supporters?per_page=100',
      {},
      'خطا در بارگذاری پشتیبان‌ها'
    );
  }

  async addSupporter(payload: {
    name: string;
    phone: string | number;
    grade: number;
    field: AcademicField;
    chat_id: string | number | null;
    username?: string;
    password?: string;
  }): Promise<ApiEnvelope<Supporter>> {
    const chatIdStr = safeTrim(payload.chat_id);
    const usernameStr = safeTrim(payload.username);
    return this.requestJson<Supporter>(
      '/supporters',
      {
        method: 'POST',
        body: JSON.stringify({
          name: safeTrim(payload.name),
          phone: safeTrim(payload.phone),
          grade: Number(payload.grade),
          field: payload.field,
          chat_id: chatIdStr || undefined,
          username: usernameStr || undefined,
          password: payload.password || undefined,
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
      chat_id: string | number | null;
      password?: string;
    }
  ): Promise<ApiEnvelope<Supporter>> {
    const chatIdStr = safeTrim(payload.chat_id);
    const body: Record<string, unknown> = {
      name: safeTrim(payload.name),
      grade: Number(payload.grade),
      field: payload.field,
      chat_id: chatIdStr || undefined,
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

  // Exams (/api/v1/exams*)
  async getExamDates(monthFilter?: string): Promise<ApiEnvelope<{ dates: ExamDateSummary[] }>> {
    const query = new URLSearchParams({ per_page: '100' });
    if (monthFilter) query.set('month', monthFilter);
    const res = await this.requestJson<{ dates: ExamDateSummary[] } | ExamDateSummary[]>(
      `/exams/dates?${query.toString()}`,
      {},
      'خطا در بارگذاری آزمون‌ها'
    );
    let dates = Array.isArray(res.data) ? res.data : res.data?.dates || [];
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
    const students = Array.isArray(res.data) ? res.data : res.data?.students || [];
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
    const stats = Array.isArray(res.data) ? res.data : res.data?.stats || [];
    return { ...res, data: { stats } };
  }
}

export const API = new FamoApiClient();
export default API;
