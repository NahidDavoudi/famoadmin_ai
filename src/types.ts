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
  | 'reports'
  | 'public_api';

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
  is_active: number; // 1 or 0
  user_id?: number | null;
}

export interface Course {
  id: number;
  name: string;
  icon: string | null;
  gradient_color_from: string | null;
  gradient_color_to: string | null;
  background_image_url?: string | null;
  description: string | null;
  full_description?: string | null;
  target_grades?: string | null;
  format?: string | null;
  badge_label?: string | null;
  price: number;
  display_order: number;
  features: string[];
  created_at: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Instructor {
  id: number;
  name: string;
  title: string | null;
  description: string | null;
  full_bio?: string | null;
  image_url?: string | null;
  initial_letter: string | null;
  display_order: number;
  social_links: SocialLink[];
  created_at: string;
}

export interface Supporter {
  id: number;
  name: string;
  phone?: string;
  grade: number | null;
  field: AcademicField | null;
  chat_id: string | null;
  username?: string;
  avatar?: string | null;
  avatar_url?: string | null;
  replied_count: number;
  pending_count: number;
  avg_response_hours: number | null;
}

export interface PublicSupporter {
  id: number;
  name: string;
  grade: number | null;
  field: string | null;
  avatar: string | null;
  avatar_url: string | null;
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  sort_order: number;
  post_count: number;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  category: string | null;
  category_id: number | null;
  published: boolean;
  is_published: number; // 1 or 0 for admin compatibility
  published_at: string | null;
  views: number;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
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

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface OpenApiErrorObject {
  code: string;
  message: string;
}

export interface OpenApiEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  pagination: PaginationMeta | null;
  error: OpenApiErrorObject | null;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}
