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
import { filterStudentsList } from './exam-math';

const STORAGE_KEY = 'famo_admin_store_v1';

interface LocalStore {
  students: Student[];
  courses: Course[];
  instructors: Instructor[];
  supporters: Supporter[];
  exams: ExamRecord[];
  files: ExamFile[];
  blogPosts: BlogPost[];
  reportStats: ReportDayStat[];
}

const INITIAL_STORE: LocalStore = {
  students: [
    {
      id: 1,
      name: 'آرین محمدی',
      phone: '09123456781',
      national_id: '0012345671',
      grade: 12,
      field: 'تجربی',
      is_active: 1,
      user_id: 101,
    },
    {
      id: 2,
      name: 'سارا احمدی‌نژاد',
      phone: '09123456782',
      national_id: '0012345672',
      grade: 12,
      field: 'ریاضی',
      is_active: 1,
      user_id: 102,
    },
    {
      id: 3,
      name: 'کیانوش رضایی',
      phone: '09123456783',
      national_id: '0012345673',
      grade: 11,
      field: 'تجربی',
      is_active: 1,
      user_id: 103,
    },
    {
      id: 4,
      name: 'نگار کریمی',
      phone: '09123456784',
      national_id: '0012345674',
      grade: 11,
      field: 'انسانی',
      is_active: 1,
      user_id: 104,
    },
    {
      id: 5,
      name: 'امیرحسین صادقی',
      phone: '09123456785',
      national_id: '0012345675',
      grade: 10,
      field: 'ریاضی',
      is_active: 1,
      user_id: null,
    },
    {
      id: 6,
      name: 'مهسا حسینی',
      phone: '09123456786',
      national_id: '0012345676',
      grade: 9,
      field: 'راهنمایی',
      is_active: 0,
      user_id: null,
    },
    {
      id: 7,
      name: 'پارسا علوی',
      phone: '09123456787',
      national_id: '0012345677',
      grade: 12,
      field: 'تجربی',
      is_active: 1,
      user_id: 107,
    },
  ],
  courses: [
    {
      id: 1,
      name: 'جمع‌بندی جامع زیست‌شناسی کنکور',
      icon: 'fa-book',
      gradient_color_from: '#445D84',
      gradient_color_to: '#5a779e',
      description: 'دوره جامع تست‌زنی و تحلیل شکل‌های زیست‌شناسی دهم تا دوازدهم',
      price: '4,500,000 تومان',
      display_order: 1,
    },
    {
      id: 2,
      name: 'حسابان و ریاضیات تجربی پیشرفته',
      icon: 'fa-chart-bar',
      gradient_color_from: '#3a5170',
      gradient_color_to: '#6D8B9E',
      description: 'آموزش مفهومی و تکنیک‌های حل سریع تست‌های ریاضی کنکور',
      price: '3,800,000 تومان',
      display_order: 2,
    },
    {
      id: 3,
      name: 'فیزیک پایه و کنکور (تست و تشریحی)',
      icon: 'fa-school',
      gradient_color_from: '#445D84',
      gradient_color_to: '#8B786D',
      description: 'آمادگی کامل برای امتحانات نهایی و کنکور سراسری',
      price: '3,200,000 تومان',
      display_order: 3,
    },
    {
      id: 4,
      name: 'کارگاه مشاوره و برنامه‌ریزی فردی فامو',
      icon: 'fa-clipboard',
      gradient_color_from: '#5a779e',
      gradient_color_to: '#E2D9C6',
      description: 'برنامه‌ریزی هفتگی، پایش ساعت مطالعه و تحلیل کارنامه آزمون‌ها',
      price: '1,900,000 تومان',
      display_order: 4,
    },
  ],
  instructors: [
    {
      id: 1,
      name: 'دکتر سهند فرهادی',
      title: 'مدرس زیست‌شناسی و مشاور ارشد کنکور',
      description: 'رتبه برتر کنکور سراسری با ۱۲ سال سابقه تدریس در مدارس برتر تهران',
      initial_letter: 'س',
      display_order: 1,
    },
    {
      id: 2,
      name: 'مهندس بهرام کاظمی',
      title: 'مدرس ریاضیات و حسابان',
      description: 'مولف کتب کمک‌آموزشی و طراح سوالات آزمون‌های آزمایشی کشوری',
      initial_letter: 'ب',
      display_order: 2,
    },
    {
      id: 3,
      name: 'استاد الهام نادری',
      title: 'مشاور تخصصی تحصیلی و برنامه‌ریزی',
      description: 'کارشناس ارشد روانشناسی تربیتی و متخصص کوچینگ دانش‌آموزان کنکوری',
      initial_letter: 'ا',
      display_order: 3,
    },
    {
      id: 4,
      name: 'مهندس نیما شریفی',
      title: 'مدرس فیزیک و شیمی کنکور',
      description: 'فارغ‌التحصیل دانشگاه صنعتی شریف با سابقه تدریس المپیاد و کنکور',
      initial_letter: 'ن',
      display_order: 4,
    },
  ],
  supporters: [
    {
      id: 1,
      name: 'زهرا مرادی',
      phone: '09121112233',
      grade: 12,
      field: 'تجربی',
      chat_id: '48291034',
      username: 'z_moradi',
      replied_count: 142,
      pending_count: 3,
      avg_response_hours: 1.4,
    },
    {
      id: 2,
      name: 'محمدجواد طاهری',
      phone: '09122223344',
      grade: 12,
      field: 'ریاضی',
      chat_id: '93847120',
      username: 'mj_taheri',
      replied_count: 98,
      pending_count: 2,
      avg_response_hours: 2.1,
    },
    {
      id: 3,
      name: 'فاطمه بخشی',
      phone: '09123334455',
      grade: 11,
      field: 'انسانی',
      chat_id: null,
      username: 'f_bakhshi',
      replied_count: 76,
      pending_count: 5,
      avg_response_hours: 3.2,
    },
  ],
  exams: [
    {
      id: 1,
      student_id: 1,
      exam_date: '2025-02-06',
      subjects: [
        { subject: 'زیست‌شناسی', chapter: 'فصل ۱ تا ۴ دوازدهم', total_q: 45, correct: 35, wrong: 3, skipped: 7, percentage: 75.6 },
        { subject: 'شیمی', chapter: 'اسید و باز', total_q: 35, correct: 24, wrong: 3, skipped: 8, percentage: 65.7 },
        { subject: 'فیزیک', chapter: 'حرکت‌شناسی و دینامیک', total_q: 30, correct: 21, wrong: 3, skipped: 6, percentage: 66.7 },
        { subject: 'ریاضی تجربی', chapter: 'تابع و مثلثات', total_q: 30, correct: 18, wrong: 3, skipped: 9, percentage: 56.7 },
      ],
    },
    {
      id: 2,
      student_id: 3,
      exam_date: '2025-02-06',
      subjects: [
        { subject: 'زیست‌شناسی', chapter: 'فصل ۱ تا ۳ یازدهم', total_q: 45, correct: 29, wrong: 6, skipped: 10, percentage: 60.0 },
        { subject: 'شیمی', chapter: 'قدر هدایای زمینی', total_q: 35, correct: 20, wrong: 6, skipped: 9, percentage: 51.4 },
        { subject: 'فیزیک', chapter: 'الکتریسیته ساکن', total_q: 30, correct: 14, wrong: 6, skipped: 10, percentage: 40.0 },
      ],
    },
    {
      id: 3,
      student_id: 2,
      exam_date: '2025-02-06',
      subjects: [
        { subject: 'حسابان', chapter: 'مشتق و کاربرد مشتق', total_q: 40, correct: 32, wrong: 3, skipped: 5, percentage: 77.5 },
        { subject: 'هندسه و گسسته', chapter: 'ماتریس و گراف', total_q: 30, correct: 23, wrong: 2, skipped: 5, percentage: 74.4 },
        { subject: 'فیزیک', chapter: 'نوسان و موج', total_q: 35, correct: 27, wrong: 3, skipped: 5, percentage: 74.3 },
      ],
    },
    {
      id: 4,
      student_id: 4,
      exam_date: '2025-01-23',
      subjects: [
        { subject: 'علوم و فنون ادبی', chapter: 'آرایه‌های ادبی', total_q: 30, correct: 23, wrong: 3, skipped: 4, percentage: 73.3 },
        { subject: 'فلسفه و منطق', chapter: 'منطق صوری', total_q: 25, correct: 16, wrong: 3, skipped: 6, percentage: 60.0 },
        { subject: 'ریاضی و آمار', chapter: 'آمار توصیفی', total_q: 20, correct: 11, wrong: 3, skipped: 6, percentage: 50.0 },
      ],
    },
    {
      id: 5,
      student_id: 7,
      exam_date: '2025-01-23',
      subjects: [
        { subject: 'زیست‌شناسی', chapter: 'ژنتیک', total_q: 45, correct: 31, wrong: 3, skipped: 11, percentage: 66.7 },
        { subject: 'شیمی', chapter: 'الکتروشیمی', total_q: 35, correct: 25, wrong: 4, skipped: 6, percentage: 67.6 },
      ],
    },
  ],
  files: [
    {
      id: 1,
      student_id: null,
      student_name: null,
      exam_date: '2025-02-06',
      description: 'دفترچه سوالات و پاسخنامه تشریحی آزمون جامع بهمن',
      file_path: 'azmoon-bahman-1403.pdf',
      file_size: 2458624,
      created_at: '2025-02-06T10:30:00Z',
    },
    {
      id: 2,
      student_id: 1,
      student_name: 'آرین محمدی',
      exam_date: '2025-02-06',
      description: 'تحلیل فردی کارنامه زیست و شیمی - آرین محمدی',
      file_path: 'tahlil-arian-mohammadi.pdf',
      file_size: 864200,
      created_at: '2025-02-06T15:15:00Z',
    },
    {
      id: 3,
      student_id: 2,
      student_name: 'سارا احمدی‌نژاد',
      exam_date: '2025-01-23',
      description: 'برگه پاسخنامه تشریحی حسابان',
      file_path: 'hesaban-sara.pdf',
      file_size: 1320960,
      created_at: '2025-01-24T09:00:00Z',
    },
  ],
  blogPosts: [
    {
      id: 1,
      title: 'روش صحیح تحلیل آزمون‌های آزمایشی برای کنکوری‌ها',
      slug: 'how-to-analyze-mock-exams',
      category: 'روش مطالعه',
      cover_image: null,
      excerpt: 'چگونه در کمتر از ۳ ساعت، نقاط ضعف خود را در آزمون‌های آزمایشی شناسایی و برطرف کنیم؟',
      content: '<h2>اهمیت تحلیل آزمون</h2><p>بسیاری از دانش‌آموزان تصور می‌کنند با پایان جلسه آزمون، کار تمام شده است؛ در حالی که <strong>تحلیل دقیق سوالات</strong> مهم‌ترین گام برای پیشرفت تراز در آزمون بعدی است.</p><h3>گام اول: تفکیک سوالات</h3><ul><li>سوالات غلط (مهم‌ترین منبع یادگیری)</li><li>سوالات نزده</li><li>سوالات شک‌دار یا زمان‌بر</li></ul>',
      meta_description: 'راهنمای گام‌به‌گام تحلیل کارنامه و سوالات آزمون‌های آزمایشی کنکور در آموزشگاه فامو',
      is_published: 1,
      views: 428,
      published_at: '2025-02-01T12:00:00Z',
    },
    {
      id: 2,
      title: 'برنامه‌ریزی دوران جمع‌بندی بهمن و اسفند',
      slug: 'winter-revision-schedule',
      category: 'مشاوره تحصیلی',
      cover_image: null,
      excerpt: 'توازن میان مطالعه دروس پایه و نیم‌سال دوم دوازدهم با تکنیک بازه‌های مرور هرم‌وار.',
      content: '<h2>مدیریت زمان در نیم‌سال دوم</h2><p>در ماه‌های بهمن و اسفند، حفظ تعادل بین پیشروی دروس جدید و مرور مباحث نیم‌سال اول اهمیت حیاتی دارد.</p>',
      meta_description: 'بهترین برنامه مطالعاتی دوران جمع‌بندی زمستان برای داوطلبان کنکور',
      is_published: 1,
      views: 315,
      published_at: '2025-01-25T16:30:00Z',
    },
    {
      id: 3,
      title: 'اطلاعیه زمان‌بندی آزمون‌های جامع اسفندماه فامو',
      slug: 'esfand-exams-schedule',
      category: 'اخبار',
      cover_image: null,
      excerpt: 'برنامه زمانی و بودجه‌بندی آزمون‌های حضوری و آنلاین اسفندماه آموزشگاه فامو اعلام شد.',
      content: '<p>به اطلاع کلیه دانش‌آموزان عزیز می‌رساند آزمون‌های جامع اسفندماه طبق تقویم آموزشی برگزار خواهد شد.</p>',
      meta_description: 'تقویم و بودجه‌بندی آزمون‌های اسفند آموزشگاه فامو',
      is_published: 0,
      views: 64,
      published_at: '2025-02-05T08:45:00Z',
    },
  ],
  reportStats: [
    { date: '1403/11/12', replied: 38, pending: 4 },
    { date: '1403/11/13', replied: 44, pending: 3 },
    { date: '1403/11/14', replied: 41, pending: 5 },
    { date: '1403/11/15', replied: 52, pending: 2 },
    { date: '1403/11/16', replied: 49, pending: 4 },
    { date: '1403/11/17', replied: 56, pending: 1 },
    { date: '1403/11/18', replied: 61, pending: 3 },
  ],
};

function loadStore(): LocalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.students)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  saveStore(INITIAL_STORE);
  return JSON.parse(JSON.stringify(INITIAL_STORE));
}

function saveStore(store: LocalStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  error?: string;
}

class FamoApiClient {
  base = 'http://localhost:8080/api/v1';

  async getMe(): Promise<{ username: string; role: 'admin' | 'supporter' }> {
    return { username: 'مدیر سیستم (فامو)', role: 'admin' };
  }

  async logout(): Promise<void> {
    localStorage.removeItem('famo_jwt');
  }

  async getDashboardStats(): Promise<ApiEnvelope<DashboardStats>> {
    const store = loadStore();
    const studentsCount = store.students.length;
    const examDates = new Set(store.exams.map((e) => e.exam_date));
    const studentsWithExams = new Set(store.exams.map((e) => e.student_id));
    const studentsNoExam = Math.max(0, studentsCount - studentsWithExams.size);
    const pendingReports = store.supporters.reduce((sum, s) => sum + Number(s.pending_count || 0), 0);

    const fields: AcademicField[] = ['تجربی', 'ریاضی', 'انسانی', 'راهنمایی'];
    const avgByField = fields.map((field) => {
      const fieldStudents = store.students.filter((s) => s.field === field);
      const studentIds = new Set(fieldStudents.map((s) => s.id));
      const fieldExams = store.exams.filter((e) => studentIds.has(e.student_id));
      const allPercentages: number[] = [];
      fieldExams.forEach((e) => {
        e.subjects.forEach((sub) => {
          allPercentages.push(Number(sub.percentage) || 0);
        });
      });
      const avg =
        allPercentages.length > 0
          ? Math.round((allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length) * 10) / 10
          : field === 'راهنمایی'
            ? 62.5
            : 0;
      return {
        field,
        student_count: fieldStudents.length,
        avg_percentage: avg,
      };
    });

    return {
      success: true,
      data: {
        students_count: studentsCount,
        exams_this_week: examDates.size,
        students_no_exam: studentsNoExam,
        pending_reports: pendingReports,
        avg_by_field: avgByField,
      },
    };
  }

  async getStudents(params: {
    search?: string;
    field?: string;
    grade?: string;
    status?: '' | 'active' | 'inactive';
    page?: number;
    perPage?: number;
  }): Promise<ApiEnvelope<Student[]>> {
    const store = loadStore();
    const filtered = filterStudentsList(store.students, params);
    const page = params.page || 1;
    const perPage = params.perPage || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const paged = filtered.slice(start, start + perPage);

    return {
      success: true,
      data: paged,
      pagination: {
        total,
        page,
        per_page: perPage,
        total_pages: totalPages,
      },
    };
  }

  async getStudentsList(): Promise<ApiEnvelope<Student[]>> {
    const store = loadStore();
    return {
      success: true,
      data: store.students,
    };
  }

  async addStudent(payload: {
    name: string;
    phone: string;
    nationalId: string;
    grade: number;
    field: AcademicField;
  }): Promise<ApiEnvelope<Student>> {
    const store = loadStore();
    const nextId = store.students.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const newStudent: Student = {
      id: nextId,
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      national_id: payload.nationalId.trim(),
      grade: Number(payload.grade),
      field: payload.field,
      is_active: 1,
      user_id: 100 + nextId,
    };
    store.students.unshift(newStudent);
    saveStore(store);
    return { success: true, data: newStudent };
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
    const store = loadStore();
    const idx = store.students.findIndex((s) => s.id === Number(id));
    if (idx === -1) throw new Error('دانش‌آموز یافت نشد');
    store.students[idx] = {
      ...store.students[idx],
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      national_id: payload.nationalId.trim(),
      grade: Number(payload.grade),
      field: payload.field,
    };
    saveStore(store);
    return { success: true, data: store.students[idx] };
  }

  async deleteStudent(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.students = store.students.filter((s) => s.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  async toggleStudentStatus(id: number): Promise<ApiEnvelope<Student>> {
    const store = loadStore();
    const idx = store.students.findIndex((s) => s.id === Number(id));
    if (idx === -1) throw new Error('دانش‌آموز یافت نشد');
    store.students[idx].is_active = store.students[idx].is_active === 1 ? 0 : 1;
    saveStore(store);
    return { success: true, data: store.students[idx] };
  }

  async createStudentAccount(id: number): Promise<ApiEnvelope<Student>> {
    const store = loadStore();
    const idx = store.students.findIndex((s) => s.id === Number(id));
    if (idx === -1) throw new Error('دانش‌آموز یافت نشد');
    store.students[idx].user_id = 100 + store.students[idx].id;
    saveStore(store);
    return { success: true, data: store.students[idx] };
  }

  async resetStudentPassword(_id: number): Promise<ApiEnvelope<null>> {
    return { success: true, data: null };
  }

  // Courses
  async getCourses(): Promise<ApiEnvelope<Course[]>> {
    const store = loadStore();
    const sorted = [...store.courses].sort((a, b) => a.display_order - b.display_order);
    return { success: true, data: sorted };
  }

  async addCourse(payload: Omit<Course, 'id'>): Promise<ApiEnvelope<Course>> {
    const store = loadStore();
    const nextId = store.courses.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const course: Course = { ...payload, id: nextId };
    store.courses.push(course);
    saveStore(store);
    return { success: true, data: course };
  }

  async updateCourse(id: number, payload: Partial<Omit<Course, 'id'>>): Promise<ApiEnvelope<Course>> {
    const store = loadStore();
    const idx = store.courses.findIndex((c) => c.id === Number(id));
    if (idx === -1) throw new Error('دوره یافت نشد');
    store.courses[idx] = { ...store.courses[idx], ...payload };
    saveStore(store);
    return { success: true, data: store.courses[idx] };
  }

  async deleteCourse(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.courses = store.courses.filter((c) => c.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  // Instructors
  async getInstructors(): Promise<ApiEnvelope<Instructor[]>> {
    const store = loadStore();
    const sorted = [...store.instructors].sort((a, b) => a.display_order - b.display_order);
    return { success: true, data: sorted };
  }

  async addInstructor(payload: Omit<Instructor, 'id'>): Promise<ApiEnvelope<Instructor>> {
    const store = loadStore();
    const nextId = store.instructors.reduce((max, i) => Math.max(max, i.id), 0) + 1;
    const instructor: Instructor = { ...payload, id: nextId };
    store.instructors.push(instructor);
    saveStore(store);
    return { success: true, data: instructor };
  }

  async updateInstructor(id: number, payload: Partial<Omit<Instructor, 'id'>>): Promise<ApiEnvelope<Instructor>> {
    const store = loadStore();
    const idx = store.instructors.findIndex((i) => i.id === Number(id));
    if (idx === -1) throw new Error('استاد یافت نشد');
    store.instructors[idx] = { ...store.instructors[idx], ...payload };
    saveStore(store);
    return { success: true, data: store.instructors[idx] };
  }

  async deleteInstructor(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.instructors = store.instructors.filter((i) => i.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  // Supporters
  async getSupporters(): Promise<ApiEnvelope<Supporter[]>> {
    const store = loadStore();
    return {
      success: true,
      data: store.supporters,
      pagination: {
        total: store.supporters.length,
        page: 1,
        per_page: 100,
        total_pages: 1,
      },
    };
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
    const store = loadStore();
    const nextId = store.supporters.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const supporter: Supporter = {
      id: nextId,
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      grade: Number(payload.grade),
      field: payload.field,
      chat_id: payload.chat_id ? payload.chat_id.trim() : null,
      username: payload.username,
      replied_count: 0,
      pending_count: 0,
      avg_response_hours: null,
    };
    store.supporters.push(supporter);
    saveStore(store);
    return { success: true, data: supporter };
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
    const store = loadStore();
    const idx = store.supporters.findIndex((s) => s.id === Number(id));
    if (idx === -1) throw new Error('پشتیبان یافت نشد');
    store.supporters[idx] = {
      ...store.supporters[idx],
      name: payload.name.trim(),
      grade: Number(payload.grade),
      field: payload.field,
      chat_id: payload.chat_id ? payload.chat_id.trim() : null,
    };
    saveStore(store);
    return { success: true, data: store.supporters[idx] };
  }

  async deleteSupporter(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.supporters = store.supporters.filter((s) => s.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  // Exams
  async getExamDates(monthFilter?: string): Promise<ApiEnvelope<{ dates: ExamDateSummary[] }>> {
    const store = loadStore();
    const byDate = new Map<string, ExamRecord[]>();
    store.exams.forEach((exam) => {
      if (monthFilter && !exam.exam_date.startsWith(monthFilter)) return;
      const list = byDate.get(exam.exam_date) || [];
      list.push(exam);
      byDate.set(exam.exam_date, list);
    });

    const dates: ExamDateSummary[] = Array.from(byDate.entries())
      .map(([exam_date, records]) => {
        const studentIds = new Set(records.map((r) => r.student_id));
        let totalSubjects = 0;
        let sumPercent = 0;
        records.forEach((r) => {
          r.subjects.forEach((sub) => {
            totalSubjects++;
            sumPercent += Number(sub.percentage) || 0;
          });
        });
        return {
          exam_date,
          student_count: studentIds.size,
          subject_count: totalSubjects,
          avg_percentage: totalSubjects > 0 ? Math.round((sumPercent / totalSubjects) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.exam_date.localeCompare(a.exam_date));

    return { success: true, data: { dates } };
  }

  async getExamStudents(examDate: string): Promise<ApiEnvelope<{ students: ExamStudentSummary[] }>> {
    const store = loadStore();
    const records = store.exams.filter((e) => e.exam_date === examDate);
    const students: ExamStudentSummary[] = records.map((rec) => {
      const student = store.students.find((s) => s.id === rec.student_id);
      const count = rec.subjects.length;
      const sum = rec.subjects.reduce((acc, sub) => acc + (Number(sub.percentage) || 0), 0);
      return {
        student_id: rec.student_id,
        name: student?.name || `دانش‌آموز #${rec.student_id}`,
        grade: student?.grade || 12,
        field: student?.field || 'تجربی',
        subject_count: count,
        avg_percentage: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      };
    });
    return { success: true, data: { students } };
  }

  async getExamDetails(examDate: string, studentId: number): Promise<ApiEnvelope<ExamDetailsResponse>> {
    const store = loadStore();
    const rec = store.exams.find(
      (e) => e.exam_date === examDate && Number(e.student_id) === Number(studentId)
    );
    const student = store.students.find((s) => s.id === Number(studentId));
    if (!rec || !student) {
      throw new Error('اطلاعات آزمون یافت نشد');
    }
    const count = rec.subjects.length;
    const sum = rec.subjects.reduce((acc, sub) => acc + (Number(sub.percentage) || 0), 0);
    return {
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.name,
          grade: student.grade,
          field: student.field,
        },
        exam_date: examDate,
        avg_percentage: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
        subjects: rec.subjects,
      },
    };
  }

  async submitExamEntry(payload: {
    student_id: number;
    exam_date: string;
    subjects: SubjectResult[];
  }): Promise<ApiEnvelope<ExamRecord>> {
    const store = loadStore();
    const existingIdx = store.exams.findIndex(
      (e) => e.exam_date === payload.exam_date && Number(e.student_id) === Number(payload.student_id)
    );
    if (existingIdx !== -1) {
      store.exams[existingIdx].subjects = payload.subjects;
      saveStore(store);
      return { success: true, data: store.exams[existingIdx] };
    }
    const nextId = store.exams.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const record: ExamRecord = {
      id: nextId,
      student_id: Number(payload.student_id),
      exam_date: payload.exam_date,
      subjects: payload.subjects,
    };
    store.exams.unshift(record);
    saveStore(store);
    return { success: true, data: record };
  }

  // Files
  async getFiles(): Promise<ApiEnvelope<ExamFile[]>> {
    const store = loadStore();
    return { success: true, data: store.files };
  }

  async uploadFile(payload: {
    student_id: number | null;
    exam_date: string;
    description: string;
    file_name: string;
    file_size: number;
  }): Promise<ApiEnvelope<ExamFile>> {
    const store = loadStore();
    const nextId = store.files.reduce((max, f) => Math.max(max, f.id), 0) + 1;
    const student = payload.student_id
      ? store.students.find((s) => s.id === Number(payload.student_id))
      : null;
    const newFile: ExamFile = {
      id: nextId,
      student_id: payload.student_id,
      student_name: student?.name || null,
      exam_date: payload.exam_date || new Date().toISOString().split('T')[0],
      description: payload.description.trim() || payload.file_name,
      file_path: payload.file_name,
      file_size: payload.file_size || 512000,
      created_at: new Date().toISOString(),
    };
    store.files.unshift(newFile);
    saveStore(store);
    return { success: true, data: newFile };
  }

  async deleteFile(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.files = store.files.filter((f) => f.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  // Blog
  async getBlogPosts(): Promise<ApiEnvelope<{ posts: BlogPost[] }>> {
    const store = loadStore();
    return { success: true, data: { posts: store.blogPosts } };
  }

  async getBlogPost(id: number): Promise<ApiEnvelope<{ post: BlogPost }>> {
    const store = loadStore();
    const post = store.blogPosts.find((p) => p.id === Number(id));
    if (!post) throw new Error('پست یافت نشد');
    return { success: true, data: { post } };
  }

  async saveBlogPost(
    payload: Omit<BlogPost, 'id' | 'views' | 'published_at'>,
    id?: number | null
  ): Promise<ApiEnvelope<BlogPost>> {
    const store = loadStore();
    if (id) {
      const idx = store.blogPosts.findIndex((p) => p.id === Number(id));
      if (idx === -1) throw new Error('پست یافت نشد');
      store.blogPosts[idx] = {
        ...store.blogPosts[idx],
        ...payload,
      };
      saveStore(store);
      return { success: true, data: store.blogPosts[idx] };
    }
    const nextId = store.blogPosts.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    const newPost: BlogPost = {
      ...payload,
      id: nextId,
      views: 0,
      published_at: new Date().toISOString(),
    };
    store.blogPosts.unshift(newPost);
    saveStore(store);
    return { success: true, data: newPost };
  }

  async deleteBlogPost(id: number): Promise<ApiEnvelope<null>> {
    const store = loadStore();
    store.blogPosts = store.blogPosts.filter((p) => p.id !== Number(id));
    saveStore(store);
    return { success: true, data: null };
  }

  // Reports
  async getReportsStats(_dateFrom?: string, _dateTo?: string): Promise<ApiEnvelope<{ stats: ReportDayStat[] }>> {
    const store = loadStore();
    return { success: true, data: { stats: store.reportStats } };
  }
}

export const API = new FamoApiClient();
export default API;
