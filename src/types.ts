export type PageId =
  | 'overview'
  | 'students'
  | 'courses'
  | 'instructors'
  | 'exams'
  | 'exam_entry'
  | 'files'
  | 'supporters'
  | 'blog'
  | 'blog-editor'
  | 'reports';

export type AcademicField =
  | 'ریاضی'
  | 'تجربی'
  | 'انسانی'
  | 'زبان'
  | 'هنر'
  | 'عمومی'
  | 'راهنمایی';

export interface Student {
  id: number;
  name: string;
  phone: string;
  national_id: string;
  grade: number;
  field: AcademicField;
  status?: number; // 1 = active, 0 = inactive (per openapi.yaml)
  is_active?: number; // legacy alias
  user_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Course {
  id: number;
  name: string;
  icon?: string | null;
  gradient_color_from?: string | null;
  gradient_color_to?: string | null;
  background_image_url?: string | null;
  description?: string | null;
  price: number | string;
  display_order: number;
}

export interface Instructor {
  id: number;
  name: string;
  title?: string | null;
  description?: string | null;
  initial_letter?: string | null;
  image_url?: string | null;
  display_order: number;
}

export interface Supporter {
  id: number;
  name: string;
  phone?: string | null;
  grade: number;
  field: AcademicField;
  is_active?: boolean | number;
  chat_id: string | null;
  username?: string;
  replied_count?: number;
  pending_count?: number;
  avg_response_hours?: number | null;
}

export interface SubjectResult {
  subject: string;
  chapter?: string | null;
  total_q: number;
  correct: number;
  wrong: number;
  skipped: number;
  percentage: number;
}

export interface ExamRecord {
  id: number;
  student_id: number;
  exam_date: string; // YYYY-MM-DD (Gregorian ISO)
  subjects: SubjectResult[];
}

export interface ExamDateSummary {
  exam_date: string;
  student_count: number;
  subject_count: number;
  avg_percentage: number;
}

export interface ExamStudentSummary {
  student_id: number;
  name: string;
  grade: number;
  field: AcademicField;
  subject_count: number;
  avg_percentage: number;
}

export interface ExamDetailsResponse {
  student: {
    id: number;
    name: string;
    grade: number;
    field: AcademicField;
  };
  exam_date?: string;
  avg_percentage: number;
  subjects: SubjectResult[];
}

export interface ExamFile {
  id: number;
  student_id: number | null;
  student_name?: string | null;
  original_name?: string;
  stored_name?: string;
  path?: string;
  file_path?: string;
  mime_type?: string;
  size?: number;
  file_size?: number;
  exam_date?: string;
  description?: string | null;
  uploaded_at?: string;
  created_at?: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  category?: string | null;
  category_id?: number | null;
  cover_image?: string | null;
  excerpt?: string | null;
  content: string;
  meta_description?: string | null;
  published?: boolean;
  is_published?: number | boolean;
  views: number;
  published_at?: string | null;
}

export interface ReportDayStat {
  date: string;
  replied: number;
  pending: number;
}

export interface DashboardFieldAvg {
  field: AcademicField;
  student_count: number;
  avg_percentage: number;
}

export type FieldAvgStat = DashboardFieldAvg;

export interface DashboardStats {
  students_count: number;
  exams_this_week: number;
  students_no_exam: number;
  pending_reports: number;
  avg_by_field: DashboardFieldAvg[];
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}
