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

export type AcademicField = 'ریاضی' | 'تجربی' | 'انسانی' | 'راهنمایی';

export interface Student {
  id: number;
  name: string;
  phone: string;
  national_id: string;
  grade: number;
  field: AcademicField;
  is_active: number; // 1 or 0
  user_id?: number | null;
}

export interface Course {
  id: number;
  name: string;
  icon?: string;
  gradient_color_from: string;
  gradient_color_to: string;
  description: string;
  price: string;
  display_order: number;
  background_image?: string | null;
}

export interface Instructor {
  id: number;
  name: string;
  title: string;
  description: string;
  initial_letter: string;
  display_order: number;
  image?: string | null;
}

export interface Supporter {
  id: number;
  name: string;
  phone?: string;
  grade: number;
  field: AcademicField;
  chat_id: string | null;
  username?: string;
  replied_count: number;
  pending_count: number;
  avg_response_hours: number | null;
}

export interface SubjectResult {
  subject: string;
  chapter?: string;
  total_q: number;
  correct: number;
  wrong: number;
  skipped: number;
  percentage: number;
}

export interface ExamRecord {
  id: number;
  student_id: number;
  exam_date: string; // YYYY-MM-DD
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
  exam_date: string;
  avg_percentage: number;
  subjects: SubjectResult[];
}

export interface ExamFile {
  id: number;
  student_id: number | null;
  student_name: string | null;
  exam_date: string;
  description: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  category: string;
  cover_image: string | null;
  excerpt: string;
  content: string;
  meta_description: string;
  is_published: number; // 1 or 0
  views: number;
  published_at: string;
}

export interface ReportDayStat {
  date: string;
  replied: number;
  pending: number;
}

export interface FieldAvgStat {
  field: string;
  student_count: number;
  avg_percentage: number;
}

export interface DashboardStats {
  students_count: number;
  exams_this_week: number;
  students_no_exam: number;
  pending_reports: number;
  avg_by_field: FieldAvgStat[];
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}
