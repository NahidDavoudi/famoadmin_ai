export type PageId =
  | 'overview'
  | 'students'
  | 'courses'
  | 'instructors'
  | 'exams'
  | 'exam_entry'
  | 'files'
  | 'supporters'
  | 'appointments'
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
  full_description?: string | null;
  target_grades?: string | null;
  format?: string | null;
  badge_label?: string | null;
  features?: string[];
  price: number | string;
  display_order: number;
  created_at?: string;
}

export interface InstructorSocialLink {
  platform: string;
  url: string;
}

export interface Instructor {
  id: number;
  name: string;
  title?: string | null;
  description?: string | null;
  full_bio?: string | null;
  initial_letter?: string | null;
  image_url?: string | null;
  social_links?: InstructorSocialLink[];
  display_order: number;
  created_at?: string;
}

export interface Supporter {
  id: number;
  name: string;
  phone?: string | number | null;
  grade: number;
  field: AcademicField;
  is_active?: boolean | number;
  chat_id: string | number | null;
  username?: string;
  avatar?: string | null;
  avatar_url?: string | null;
  replied_count?: number;
  pending_count?: number;
  avg_response_hours?: number | null;
}

export interface PublicSupporter {
  id: number;
  name: string;
  grade: number;
  field: AcademicField;
  avatar?: string | null;
  avatar_url?: string | null;
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  description?: string | null;
  sort_order?: number;
  post_count?: number;
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

// ============================================================================
// Weekly Appointment SMS Reminders & Related Endpoints (/api/v1/appointments*)
// ============================================================================

export type UserRole = 'admin' | 'supporter' | 'student' | 'teacher';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'AUTH_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONCURRENT_SEND_LOCKED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | (string & {});

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, string>;
}

export interface ApiPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ApiSuccessEnvelope<TData, TPagination = ApiPagination | null> {
  success: true;
  data: TData;
  pagination: TPagination;
  error: null;
}

export interface ApiErrorEnvelope {
  success: false;
  data: null;
  pagination: null;
  error: ApiErrorDetail;
  /** Returned at top-level on HTTP 429 RATE_LIMITED responses */
  retry_after?: number;
}

export type ApiResponse<TData, TPagination = ApiPagination | null> =
  | ApiSuccessEnvelope<TData, TPagination>
  | ApiErrorEnvelope;

/**
 * Per-student SMS status in `GET /api/v1/appointments/sms/preview`
 * Evaluation priority:
 * 1. no_appointment -> 2. no_phone -> 3. already_sent / changed_since_sent -> 4. failed -> 5. will_send
 */
export type AppointmentSmsPreviewStatus =
  | 'will_send'
  | 'already_sent'
  | 'changed_since_sent'
  | 'failed'
  | 'no_phone'
  | 'no_appointment';

/**
 * Dispatch mode in `POST /api/v1/appointments/sms/send`
 * - `unsent`: targets `will_send` (students with no log or `skipped_no_phone`)
 * - `failed`: targets `failed` (retries failed SMS dispatches for the week)
 * - `changed`: targets `changed_since_sent` (sends updated time when `appointment_at` changed after `sent`)
 */
export type AppointmentSmsSendMode = 'unsent' | 'failed' | 'changed';

/**
 * Stored status in `appointment_sms_log` table and `GET /api/v1/appointments/sms/log`
 */
export type AppointmentSmsLogStatus = 'sent' | 'failed' | 'skipped_no_phone';

/**
 * Per-student result status returned by `POST /api/v1/appointments/sms/send`
 */
export type AppointmentSmsSendItemStatus =
  | 'sent'
  | 'failed'
  | 'skipped_no_phone'
  | 'already_sent'
  | 'changed_since_sent'
  | 'no_appointment'
  | 'skipped';

/**
 * Action code returned in `dev-server.mjs` `details[i].action`
 */
export type AppointmentSmsSendAction =
  | 'sent'
  | 'failed'
  | 'skipped_no_phone'
  | 'skipped_already_sent'
  | 'skipped_no_appointment'
  | 'skipped_mode_mismatch'
  | 'skipped_changed_requires_changed_mode'
  | 'skipped_failed_requires_failed_mode';

/**
 * All appointment statuses accepted by `PUT /api/v1/appointments/{id}/status`
 */
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'canceled'
  | 'absent'
  | 'done';

/**
 * Subset of `AppointmentStatus` treated as "active" for weekly SMS reminders
 */
export type ActiveAppointmentStatus = 'pending' | 'confirmed' | 'scheduled';

/**
 * Parent/guardian relationship values in `parent_contacts`
 */
export type ParentRelationship = 'father' | 'mother' | 'guardian' | 'other';

export interface GetAppointmentSmsPreviewQuery {
  /** Any Gregorian date inside the target Saturday–Friday week (`YYYY-MM-DD`) */
  week_date: string;
}

export interface AppointmentSmsPreviewSummary {
  /** Total students evaluated (PHP backend & OpenAPI key) */
  total?: number;
  /** Total students evaluated (`dev-server.mjs` key) */
  total_students?: number;
  will_send: number;
  already_sent: number;
  changed_since_sent: number;
  failed: number;
  no_phone: number;
  no_appointment: number;
  multiple_appointments: number;
}

export interface AppointmentSmsPreviewItem {
  student_id: number;
  student_name: string;
  grade: number | null;
  field: string | null;
  status: AppointmentSmsPreviewStatus;
  recipient_type: 'parent';
  parent_name: string | null;

  /** Masked primary parent phone in PHP backend (e.g. `"0912***22"`) */
  mobile_mask?: string | null;
  /** Normalized primary parent phone in `dev-server.mjs` (e.g. `"09120001122"`) */
  mobile?: string | null;
  /** Present in `dev-server.mjs` (`true` when `mobile !== null`) */
  has_valid_phone?: boolean;

  appointment_id: number | null;
  /** Gregorian date (`YYYY-MM-DD`) of nearest active appointment in the week */
  appointment_date: string | null;

  /** Jalali date (`YYYY/MM/DD`) in PHP backend (e.g. `"1405/08/02"`) */
  appointment_jalali?: string | null;
  /** Persian weekday name in PHP backend (e.g. `"شنبه"`) */
  weekday?: string | null;
  /** Combined Persian weekday + Jalali date in `dev-server.mjs` (e.g. `"شنبه 1405/08/02"`) */
  day_and_date_fa?: string | null;

  /** `HH:MM` in PHP backend, `HH:MM:SS` in `dev-server.mjs` */
  start_time: string | null;
  /** `HH:MM` in PHP backend, `HH:MM:SS` in `dev-server.mjs` */
  end_time: string | null;
  /** Formatted time (`HH:MM`) in `dev-server.mjs` */
  time_fa?: string | null;

  /** Combined `YYYY-MM-DD HH:MM:SS` of current appointment */
  appointment_at: string | null;

  /** Number of active appointments in the week */
  active_appointments_count: number;
  /** `true` when `active_appointments_count > 1` */
  multiple_appointments: boolean;

  /** Stored log status if a log entry exists for `(student_id, week_start)` */
  last_log_status?: AppointmentSmsLogStatus | null;
  /** Snapshot `appointment_at` at the time of last SMS dispatch (PHP backend) */
  last_appointment_at?: string | null;
  /** Snapshot `appointment_at` at the time of last SMS dispatch (`dev-server.mjs`) */
  last_sent_appointment_at?: string | null;

  /** Last failure message if status is `failed` */
  last_error: string | null;
  /** Timestamp of last successful send (`YYYY-MM-DD HH:MM:SS` or ISO) */
  last_sent_at: string | null;
  /** Number of dispatch attempts recorded for this week */
  attempts: number;

  /** Optional operational times & supporter metadata for admin UI */
  supporter_name?: string | null;
  appointment_status?: AppointmentStatus;
  arrival_time?: string | null;
  exam_start_time?: string | null;
  exam_end_time?: string | null;
  description?: string | null;
}

export interface AppointmentSmsPreviewData {
  week_start: string;
  week_end: string;
  week_start_jalali?: string;
  week_end_jalali?: string;
  summary: AppointmentSmsPreviewSummary;
  /** Present in PHP backend & OpenAPI */
  items?: AppointmentSmsPreviewItem[];
  /** Present in `dev-server.mjs` */
  students?: AppointmentSmsPreviewItem[];
}

export interface PostAppointmentSmsSendRequest {
  /** Any Gregorian date inside the target Saturday–Friday week (`YYYY-MM-DD`) */
  week_date: string;
  /** Dispatch mode (`unsent` default) */
  mode?: AppointmentSmsSendMode;
  /**
   * Optional subset of student IDs to target.
   * IMPORTANT: Omit or pass `null` to target all eligible students for `mode`.
   * Do NOT pass an empty array `[]` (rejected with 422 VALIDATION_ERROR in PHP).
   */
  student_ids?: number[] | null;
  /** Optional client-generated idempotency/correlation key */
  operation_id?: string | null;
}

export interface AppointmentSmsSendSummary {
  total_targeted?: number;
  targeted?: number;
  sent: number;
  failed: number;
  skipped_no_phone: number;
  skipped_already_sent?: number;
  skipped_no_appointment?: number;
  skipped_other?: number;
  skipped?: number;
}

export interface AppointmentSmsSendResultItem {
  student_id: number;
  student_name?: string;
  appointment_id?: number | null;
  status?: AppointmentSmsSendItemStatus;
  action?: AppointmentSmsSendAction;
  mobile_mask?: string | null;
  mobile?: string | null;
  provider_message_id?: string | null;
  error?: string | null;
  attempts?: number;
}

export interface AppointmentSmsSendData {
  operation_id?: string;
  week_start: string;
  week_end: string;
  mode: AppointmentSmsSendMode;
  summary: AppointmentSmsSendSummary;
  /** Present in PHP backend */
  items?: AppointmentSmsSendResultItem[];
  /** Present in `dev-server.mjs` */
  details?: AppointmentSmsSendResultItem[];
}

export interface GetAppointmentSmsLogQuery {
  week_date?: string;
  student_id?: number;
  status?: AppointmentSmsLogStatus;
  page?: number;
  per_page?: number;
}

export interface AppointmentSmsLogItem {
  id: number;
  student_id: number;
  student_name?: string;
  field?: AcademicField | string | null;
  appointment_id: number | null;
  week_start: string;
  recipient_type: 'parent';
  mobile_mask?: string | null;
  mobile?: string | null;
  appointment_at: string | null;
  appointment_jalali?: string | null;
  status: AppointmentSmsLogStatus;
  provider_message_id: string | null;
  last_error: string | null;
  attempts: number;
  sent_at: string | null;
  sent_by: number | null;
  sent_by_name?: string | null;
  operation_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AppointmentSmsLogData {
  items?: AppointmentSmsLogItem[];
  logs?: AppointmentSmsLogItem[];
}

export interface GetAppointmentsListQuery {
  student_id?: number;
  status?: AppointmentStatus;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
  perPage?: number;
}

export interface AppointmentRecord {
  id: number;
  student_id: number;
  student_name?: string;
  supporter_id?: number | null;
  supporter_name?: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  type?: string | null;
  status: AppointmentStatus;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertAppointmentRequest {
  id?: number | null;
  student_id: number;
  appointment_date: string;
  start_time: string;
  end_time: string;
  type?: string | null;
  description?: string | null;
  status?: AppointmentStatus;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
}

export interface ParentContactRecord {
  id: number;
  student_id: number;
  parent_name: string;
  relationship: ParentRelationship;
  phone: string;
  is_primary: boolean | number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateParentContactRequest {
  parent_name: string;
  relationship: ParentRelationship;
  phone: string;
  is_primary?: boolean;
}

export interface UpdateParentContactRequest {
  parent_name?: string;
  relationship?: ParentRelationship;
  phone?: string;
  is_primary?: boolean;
}

export interface RemedialClassColumn {
  id: number;
  field: AcademicField;
  class_name: string;
  teacher_name?: string;
  attendees: number[]; // student_ids
}

export interface WeeklySessionInfo {
  id: number;
  title: string;
  week_date: string; // Gregorian ISO start of week (Saturday)
  start_date_jalali: string;
  end_date_jalali: string;
}

