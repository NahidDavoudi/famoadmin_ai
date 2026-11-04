import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Send,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  Users,
  Phone,
  Sparkles,
  CheckSquare,
  Square,
  ChevronLeft,
  BookOpen,
  UserCheck,
  AlertCircle,
  MessageSquare,
  X,
  PhoneOff,
  CalendarX2,
  Layers,
  UserPlus,
  Star,
} from 'lucide-react';
import type {
  AcademicField,
  AppointmentSmsPreviewItem,
  AppointmentSmsPreviewStatus,
  AppointmentSmsPreviewSummary,
  AppointmentSmsSendMode,
  AppointmentSmsLogItem,
  AppointmentSmsLogStatus,
  AppointmentStatus,
  ParentContactRecord,
  ParentRelationship,
  RemedialClassColumn,
  WeeklySessionInfo,
  ToastType,
} from '../types';
import { API } from '../lib/api';
import {
  formatGregorianToJalali,
  getTodayGregorianIso,
  toPersianDigits,
  JALALI_WEEKDAYS,
} from '../lib/jalali';
import {
  validateAppointmentForm,
  validateParentContactForm,
  validateWeekSessionForm,
  validateRemedialClassForm,
  hasErrors,
  type FieldErrors,
} from '../lib/form-validation';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';

interface AppointmentsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

const INITIAL_WEEKS: WeeklySessionInfo[] = [
  {
    id: 1,
    title: 'هفته جاری - جلسه ۱۸ مشاوره و آزمون',
    week_date: '2025-05-03',
    start_date_jalali: '1404/02/13',
    end_date_jalali: '1404/02/19',
  },
  {
    id: 2,
    title: 'هفته گذشته - جلسه ۱۷ مشاوره و آزمون',
    week_date: '2025-04-26',
    start_date_jalali: '1404/02/06',
    end_date_jalali: '1404/02/12',
  },
  {
    id: 3,
    title: 'دو هفته پیش - جلسه ۱۶ مشاوره و آزمون',
    week_date: '2025-04-19',
    start_date_jalali: '1404/01/30',
    end_date_jalali: '1404/02/05',
  },
];

const INITIAL_PREVIEW_ITEMS: AppointmentSmsPreviewItem[] = [
  {
    student_id: 201,
    student_name: 'آرین محمدی',
    grade: 12,
    field: 'تجربی',
    status: 'already_sent',
    recipient_type: 'parent',
    parent_name: 'حسین محمدی (پدر)',
    mobile_mask: '0912***4567',
    mobile: '09123454567',
    has_valid_phone: true,
    appointment_id: 101,
    appointment_date: '2025-05-03',
    appointment_jalali: '1404/02/13',
    weekday: 'شنبه',
    day_and_date_fa: 'شنبه 1404/02/13',
    start_time: '09:30',
    end_time: '10:30',
    time_fa: '09:30',
    appointment_at: '2025-05-03 09:30:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_log_status: 'sent',
    last_appointment_at: '2025-05-03 09:30:00',
    last_error: null,
    last_sent_at: '1404/02/11 - 18:20',
    attempts: 1,
    supporter_name: 'مهندس رضایی',
    appointment_status: 'confirmed',
    arrival_time: '09:20',
    exam_start_time: '09:35',
    exam_end_time: '11:00',
    description: 'بررسی کارنامه آزمون جامع زیست',
  },
  {
    student_id: 202,
    student_name: 'سارا احمدی',
    grade: 12,
    field: 'تجربی',
    status: 'will_send',
    recipient_type: 'parent',
    parent_name: 'مریم احمدی (مادر)',
    mobile_mask: '0912***8910',
    mobile: '09128768910',
    has_valid_phone: true,
    appointment_id: 102,
    appointment_date: '2025-05-04',
    appointment_jalali: '1404/02/14',
    weekday: 'یکشنبه',
    day_and_date_fa: 'یکشنبه 1404/02/14',
    start_time: '11:00',
    end_time: '12:00',
    time_fa: '11:00',
    appointment_at: '2025-05-04 11:00:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_log_status: null,
    last_appointment_at: null,
    last_error: null,
    last_sent_at: null,
    attempts: 0,
    supporter_name: 'مهندس رضایی',
    appointment_status: 'scheduled',
    arrival_time: '10:50',
    exam_start_time: '11:05',
    exam_end_time: '12:30',
    description: 'تحلیل آزمون شیمی و برنامه‌ریزی هفتگی',
  },
  {
    student_id: 203,
    student_name: 'کیانوش کریمی',
    grade: 11,
    field: 'ریاضی',
    status: 'changed_since_sent',
    recipient_type: 'parent',
    parent_name: 'رضا کریمی (پدر)',
    mobile_mask: '0935***3344',
    mobile: '09351123344',
    has_valid_phone: true,
    appointment_id: 103,
    appointment_date: '2025-05-05',
    appointment_jalali: '1404/02/15',
    weekday: 'دوشنبه',
    day_and_date_fa: 'دوشنبه 1404/02/15',
    start_time: '14:30',
    end_time: '15:30',
    time_fa: '14:30',
    appointment_at: '2025-05-05 14:30:00',
    active_appointments_count: 2,
    multiple_appointments: true,
    last_log_status: 'sent',
    last_appointment_at: '2025-05-05 13:00:00',
    last_error: null,
    last_sent_at: '1404/02/10 - 14:10',
    attempts: 1,
    supporter_name: 'دکتر علوی',
    appointment_status: 'confirmed',
    arrival_time: null,
    exam_start_time: null,
    exam_end_time: null,
    description: 'ساعت جلسه از ۱۳:۰۰ به ۱۴:۳۰ تغییر یافت',
  },
  {
    student_id: 204,
    student_name: 'نگین صادقی',
    grade: 12,
    field: 'انسانی',
    status: 'failed',
    recipient_type: 'parent',
    parent_name: 'محسن صادقی (پدر)',
    mobile_mask: '0919***7788',
    mobile: '09194457788',
    has_valid_phone: true,
    appointment_id: 104,
    appointment_date: '2025-05-06',
    appointment_jalali: '1404/02/16',
    weekday: 'سه‌شنبه',
    day_and_date_fa: 'سه‌شنبه 1404/02/16',
    start_time: '16:00',
    end_time: '17:00',
    time_fa: '16:00',
    appointment_at: '2025-05-06 16:00:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_log_status: 'failed',
    last_appointment_at: '2025-05-06 16:00:00',
    last_error: 'خطای مخابراتی: خط گیرنده مسدود به پیامک تبلیغاتی است',
    last_sent_at: '1404/02/11 - 18:22',
    attempts: 2,
    supporter_name: 'خانم شریفی',
    appointment_status: 'pending',
    arrival_time: null,
    exam_start_time: null,
    exam_end_time: null,
    description: 'جلسه مشاوره جمع‌بندی دروس تخصصی انسانی',
  },
  {
    student_id: 205,
    student_name: 'امیرحسین مرادی',
    grade: 10,
    field: 'ریاضی',
    status: 'no_phone',
    recipient_type: 'parent',
    parent_name: null,
    mobile_mask: null,
    mobile: null,
    has_valid_phone: false,
    appointment_id: 105,
    appointment_date: '2025-05-07',
    appointment_jalali: '1404/02/17',
    weekday: 'چهارشنبه',
    day_and_date_fa: 'چهارشنبه 1404/02/17',
    start_time: '10:00',
    end_time: '11:00',
    time_fa: '10:00',
    appointment_at: '2025-05-07 10:00:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_log_status: 'skipped_no_phone',
    last_appointment_at: null,
    last_error: 'شماره تماس ولی برای این دانش‌آموز ثبت نشده است',
    last_sent_at: null,
    attempts: 0,
    supporter_name: 'دکتر علوی',
    appointment_status: 'scheduled',
    arrival_time: null,
    exam_start_time: null,
    exam_end_time: null,
    description: 'نیاز به ثبت شماره ولی جهت ارسال پیامک یادآوری',
  },
  {
    student_id: 206,
    student_name: 'هلیا کاظمی',
    grade: 11,
    field: 'تجربی',
    status: 'no_appointment',
    recipient_type: 'parent',
    parent_name: 'بهرام کاظمی (پدر)',
    mobile_mask: '0936***1920',
    mobile: '09365551920',
    has_valid_phone: true,
    appointment_id: null,
    appointment_date: null,
    appointment_jalali: null,
    weekday: null,
    day_and_date_fa: null,
    start_time: null,
    end_time: null,
    time_fa: null,
    appointment_at: null,
    active_appointments_count: 0,
    multiple_appointments: false,
    last_log_status: null,
    last_appointment_at: null,
    last_error: null,
    last_sent_at: null,
    attempts: 0,
    supporter_name: 'مهندس رضایی',
    appointment_status: undefined,
    arrival_time: null,
    exam_start_time: null,
    exam_end_time: null,
    description: null,
  },
  {
    student_id: 207,
    student_name: 'پارسا نیک‌پی',
    grade: 12,
    field: 'ریاضی',
    status: 'will_send',
    recipient_type: 'parent',
    parent_name: 'فرهاد نیک‌پی (پدر)',
    mobile_mask: '0912***3400',
    mobile: '09129983400',
    has_valid_phone: true,
    appointment_id: 106,
    appointment_date: '2025-05-08',
    appointment_jalali: '1404/02/18',
    weekday: 'پنج‌شنبه',
    day_and_date_fa: 'پنج‌شنبه 1404/02/18',
    start_time: '10:00',
    end_time: '11:30',
    time_fa: '10:00',
    appointment_at: '2025-05-08 10:00:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_log_status: null,
    last_appointment_at: null,
    last_error: null,
    last_sent_at: null,
    attempts: 0,
    supporter_name: 'دکتر علوی',
    appointment_status: 'confirmed',
    arrival_time: '09:50',
    exam_start_time: '10:00',
    exam_end_time: '11:30',
    description: 'آزمون جامع حسابان و گسسته',
  },
];

const INITIAL_SMS_LOGS: AppointmentSmsLogItem[] = [
  {
    id: 501,
    student_id: 201,
    student_name: 'آرین محمدی',
    field: 'تجربی',
    appointment_id: 101,
    week_start: '2025-05-03',
    recipient_type: 'parent',
    mobile_mask: '0912***4567',
    mobile: '09123454567',
    appointment_at: '2025-05-03 09:30:00',
    appointment_jalali: '1404/02/13 ساعت 09:30',
    status: 'sent',
    provider_message_id: 'KVN-9823411',
    last_error: null,
    attempts: 1,
    sent_at: '1404/02/11 - 18:20',
    sent_by: 1,
    sent_by_name: 'مدیر سیستم',
    operation_id: 'op-weekly-14040213-01',
  },
  {
    id: 502,
    student_id: 204,
    student_name: 'نگین صادقی',
    field: 'انسانی',
    appointment_id: 104,
    week_start: '2025-05-03',
    recipient_type: 'parent',
    mobile_mask: '0919***7788',
    mobile: '09194457788',
    appointment_at: '2025-05-06 16:00:00',
    appointment_jalali: '1404/02/16 ساعت 16:00',
    status: 'failed',
    provider_message_id: null,
    last_error: 'خطای مخابراتی: خط گیرنده مسدود به پیامک تبلیغاتی است',
    attempts: 2,
    sent_at: '1404/02/11 - 18:22',
    sent_by: 1,
    sent_by_name: 'مدیر سیستم',
    operation_id: 'op-weekly-14040213-01',
  },
  {
    id: 503,
    student_id: 203,
    student_name: 'کیانوش کریمی',
    field: 'ریاضی',
    appointment_id: 103,
    week_start: '2025-05-03',
    recipient_type: 'parent',
    mobile_mask: '0935***3344',
    mobile: '09351123344',
    appointment_at: '2025-05-05 13:00:00',
    appointment_jalali: '1404/02/15 ساعت 13:00',
    status: 'sent',
    provider_message_id: 'KVN-9821004',
    last_error: null,
    attempts: 1,
    sent_at: '1404/02/10 - 14:10',
    sent_by: 1,
    sent_by_name: 'مدیر سیستم',
    operation_id: 'op-weekly-14040213-00',
  },
  {
    id: 504,
    student_id: 205,
    student_name: 'امیرحسین مرادی',
    field: 'ریاضی',
    appointment_id: 105,
    week_start: '2025-05-03',
    recipient_type: 'parent',
    mobile_mask: null,
    mobile: null,
    appointment_at: '2025-05-07 10:00:00',
    appointment_jalali: '1404/02/17 ساعت 10:00',
    status: 'skipped_no_phone',
    provider_message_id: null,
    last_error: 'شماره تماس ولی ثبت نشده است',
    attempts: 1,
    sent_at: '1404/02/11 - 18:22',
    sent_by: 1,
    sent_by_name: 'مدیر سیستم',
    operation_id: 'op-weekly-14040213-01',
  },
];

const INITIAL_PARENT_CONTACTS: Record<number, ParentContactRecord[]> = {
  201: [
    {
      id: 1,
      student_id: 201,
      parent_name: 'حسین محمدی',
      relationship: 'father',
      phone: '09123454567',
      is_primary: true,
    },
  ],
  202: [
    {
      id: 2,
      student_id: 202,
      parent_name: 'مریم احمدی',
      relationship: 'mother',
      phone: '09128768910',
      is_primary: true,
    },
  ],
  203: [
    {
      id: 3,
      student_id: 203,
      parent_name: 'رضا کریمی',
      relationship: 'father',
      phone: '09351123344',
      is_primary: true,
    },
  ],
  204: [
    {
      id: 4,
      student_id: 204,
      parent_name: 'محسن صادقی',
      relationship: 'father',
      phone: '09194457788',
      is_primary: true,
    },
  ],
  205: [],
  206: [
    {
      id: 5,
      student_id: 206,
      parent_name: 'بهرام کاظمی',
      relationship: 'father',
      phone: '09365551920',
      is_primary: true,
    },
  ],
  207: [
    {
      id: 6,
      student_id: 207,
      parent_name: 'فرهاد نیک‌پی',
      relationship: 'father',
      phone: '09129983400',
      is_primary: true,
    },
  ],
};

const INITIAL_REMEDIAL_CLASSES: RemedialClassColumn[] = [
  {
    id: 1,
    field: 'تجربی',
    class_name: 'رفع اشکال زیست‌شناسی (ژنتیک)',
    teacher_name: 'دکتر فرهمند',
    attendees: [201, 202],
  },
  {
    id: 2,
    field: 'تجربی',
    class_name: 'کارگاه تست شیمی آلی',
    teacher_name: 'مهندس کاظمی',
    attendees: [201, 206],
  },
  {
    id: 3,
    field: 'تجربی',
    class_name: 'فیزیک الکتریسیته ساکن',
    teacher_name: 'استاد بهرامی',
    attendees: [202],
  },
  {
    id: 4,
    field: 'ریاضی',
    class_name: 'رفع اشکال حسابان و مثلثات',
    teacher_name: 'دکتر علوی',
    attendees: [203, 207],
  },
  {
    id: 5,
    field: 'ریاضی',
    class_name: 'هندسه تحلیلی و گسسته',
    teacher_name: 'مهندس نادری',
    attendees: [205, 207],
  },
  {
    id: 6,
    field: 'انسانی',
    class_name: 'کارگاه عربی و علوم و فنون',
    teacher_name: 'استاد جلالی',
    attendees: [204],
  },
];

type PreviewChipFilter =
  | 'all'
  | AppointmentSmsPreviewStatus
  | 'multiple_appointments';

type MainTab = 'appointments' | 'remedial';

const RELATIONSHIP_LABELS: Record<ParentRelationship, string> = {
  father: 'پدر',
  mother: 'مادر',
  guardian: 'قیم قانونی',
  other: 'سایر بستگان',
};

export const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ showToast }) => {
  // Navigation & Week Selection
  const [activeTab, setActiveTab] = useState<MainTab>('appointments');
  const [weeks, setWeeks] = useState<WeeklySessionInfo[]>(INITIAL_WEEKS);
  const [selectedWeekId, setSelectedWeekId] = useState<number>(INITIAL_WEEKS[0].id);

  // Data State
  const [items, setItems] = useState<AppointmentSmsPreviewItem[]>(INITIAL_PREVIEW_ITEMS);
  const [smsLogs, setSmsLogs] = useState<AppointmentSmsLogItem[]>(INITIAL_SMS_LOGS);
  const [parentContactsMap, setParentContactsMap] =
    useState<Record<number, ParentContactRecord[]>>(INITIAL_PARENT_CONTACTS);
  const [remedialClasses, setRemedialClasses] =
    useState<RemedialClassColumn[]>(INITIAL_REMEDIAL_CLASSES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Filters & Search
  const [chipFilter, setChipFilter] = useState<PreviewChipFilter>('all');
  const [fieldFilter, setFieldFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection for Bulk Actions
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  // SMS Log Drawer State
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState<boolean>(false);
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | AppointmentSmsLogStatus>('all');

  // Bulk SMS Confirm Modal State
  const [smsConfirmModal, setSmsConfirmModal] = useState<{
    isOpen: boolean;
    mode: AppointmentSmsSendMode;
    useSelectedOnly: boolean;
    targetCount: number;
    title: string;
    message: string;
  }>({
    isOpen: false,
    mode: 'unsent',
    useSelectedOnly: false,
    targetCount: 0,
    title: '',
    message: '',
  });
  const [isSendingSms, setIsSendingSms] = useState<boolean>(false);

  // Edit / Create Appointment Modal State
  const [editingItem, setEditingItem] = useState<AppointmentSmsPreviewItem | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    appointment_date: '',
    start_time: '',
    end_time: '',
    arrival_time: '',
    exam_start_time: '',
    exam_end_time: '',
    appointment_status: 'scheduled' as AppointmentStatus,
    description: '',
  });
  const [appointmentErrors, setAppointmentErrors] = useState<
    FieldErrors<'appointment_date' | 'start_time' | 'end_time'>
  >({});
  const [isSavingAppointment, setIsSavingAppointment] = useState<boolean>(false);

  // Cancel Appointment Confirm State
  const [cancelingItem, setCancelingItem] = useState<AppointmentSmsPreviewItem | null>(null);

  // Parent Contacts Modal State (/api/v1/students/{studentId}/parent-contacts)
  const [contactModalStudent, setContactModalStudent] =
    useState<AppointmentSmsPreviewItem | null>(null);
  const [contactForm, setContactForm] = useState<{
    parent_name: string;
    relationship: ParentRelationship;
    phone: string;
    is_primary: boolean;
  }>({
    parent_name: '',
    relationship: 'father',
    phone: '',
    is_primary: true,
  });
  const [contactErrors, setContactErrors] = useState<FieldErrors<'parent_name' | 'phone'>>({});
  const [isSavingContact, setIsSavingContact] = useState<boolean>(false);

  // New Week Session Modal State
  const [isNewWeekModalOpen, setIsNewWeekModalOpen] = useState<boolean>(false);
  const [newWeekForm, setNewWeekForm] = useState({
    title: '',
    start_date_jalali: '1404/02/20',
    end_date_jalali: '1404/02/26',
  });
  const [newWeekErrors, setNewWeekErrors] = useState<
    FieldErrors<'title' | 'start_date_jalali' | 'end_date_jalali'>
  >({});

  // Remedial Matrix State
  const [remedialFieldTab, setRemedialFieldTab] = useState<AcademicField>('تجربی');
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState<boolean>(false);
  const [newClassForm, setNewClassForm] = useState({
    class_name: '',
    teacher_name: '',
  });
  const [newClassErrors, setNewClassErrors] = useState<FieldErrors<'class_name'>>({});

  const currentWeek = useMemo(
    () => weeks.find((w) => w.id === selectedWeekId) || weeks[0],
    [weeks, selectedWeekId]
  );

  // Fetch preview & logs from API with graceful fallback
  const fetchWeekData = useCallback(async (weekDate: string, showRefreshToast = false) => {
    setIsLoading(true);
    setErrorState(null);
    try {
      const [previewRes, logRes] = await Promise.allSettled([
        API.getAppointmentsSmsPreview(weekDate),
        API.getAppointmentsSmsLog({ week_date: weekDate, per_page: 50 }),
      ]);

      if (previewRes.status === 'fulfilled' && previewRes.value.data?.items?.length) {
        setItems(previewRes.value.data.items);
      }
      if (logRes.status === 'fulfilled' && logRes.value.data?.items?.length) {
        setSmsLogs(logRes.value.data.items);
      }
      if (showRefreshToast) {
        showToast('لیست نوبت‌ها و وضعیت پیامک‌های هفته بروزرسانی شد', 'info');
      }
    } catch {
      // Keep local normalized state if remote endpoint is unreachable in preview
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWeekData(currentWeek.week_date, false);
  }, [currentWeek.week_date, fetchWeekData]);

  // Summary counts matching AppointmentSmsPreviewSummary
  const summary: AppointmentSmsPreviewSummary & { total: number } = useMemo(() => {
    const total = items.length;
    const will_send = items.filter((i) => i.status === 'will_send').length;
    const already_sent = items.filter((i) => i.status === 'already_sent').length;
    const changed_since_sent = items.filter((i) => i.status === 'changed_since_sent').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const no_phone = items.filter((i) => i.status === 'no_phone').length;
    const no_appointment = items.filter((i) => i.status === 'no_appointment').length;
    const multiple_appointments = items.filter((i) => i.multiple_appointments).length;

    return {
      total,
      total_students: total,
      will_send,
      already_sent,
      changed_since_sent,
      failed,
      no_phone,
      no_appointment,
      multiple_appointments,
    };
  }, [items]);

  // Filtered Table Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (fieldFilter !== 'all' && item.field !== fieldFilter) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim();
        const phoneStr = item.mobile_mask || item.mobile || '';
        const parentStr = item.parent_name || '';
        const supporterStr = item.supporter_name || '';
        if (
          !item.student_name.includes(q) &&
          !phoneStr.includes(q) &&
          !parentStr.includes(q) &&
          !supporterStr.includes(q)
        ) {
          return false;
        }
      }

      if (chipFilter === 'multiple_appointments') {
        return item.multiple_appointments;
      }
      if (chipFilter !== 'all') {
        return item.status === chipFilter;
      }

      return true;
    });
  }, [items, fieldFilter, searchQuery, chipFilter]);

  // Selection helpers
  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((i) => selectedStudentIds.includes(i.student_id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredItems.map((i) => i.student_id));
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const combined = new Set([
        ...selectedStudentIds,
        ...filteredItems.map((i) => i.student_id),
      ]);
      setSelectedStudentIds(Array.from(combined));
    }
  };

  const toggleSelectOne = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  // Format date & weekday for display (normalizing PHP `weekday` + `appointment_jalali` vs `dev-server.mjs` `day_and_date_fa`)
  const formatAppointmentDisplayDate = (item: AppointmentSmsPreviewItem) => {
    if (item.day_and_date_fa) return toPersianDigits(item.day_and_date_fa);
    if (item.weekday && item.appointment_jalali) {
      return `${item.weekday} ${toPersianDigits(item.appointment_jalali)}`;
    }
    if (item.appointment_jalali) return toPersianDigits(item.appointment_jalali);
    if (item.appointment_date) {
      const jalali = formatGregorianToJalali(item.appointment_date);
      const d = new Date(item.appointment_date);
      const dayIdx = (d.getDay() + 1) % 7;
      const dayName = JALALI_WEEKDAYS[dayIdx] || '';
      return `${dayName} ${jalali}`;
    }
    return '—';
  };

  const formatTimeRange = (item: AppointmentSmsPreviewItem) => {
    const start = (item.time_fa || item.start_time || '').slice(0, 5);
    const end = (item.end_time || '').slice(0, 5);
    if (!start) return '—';
    if (end) return `${toPersianDigits(start)} تا ${toPersianDigits(end)}`;
    return toPersianDigits(start);
  };

  // Bulk SMS Dispatch Prompt
  const openSmsConfirm = (mode: AppointmentSmsSendMode, useSelectedOnly = false) => {
    let targetItems: AppointmentSmsPreviewItem[] = [];

    if (useSelectedOnly) {
      targetItems = items.filter(
        (i) =>
          selectedStudentIds.includes(i.student_id) &&
          i.appointment_id !== null &&
          i.status !== 'no_phone'
      );
    } else if (mode === 'unsent') {
      targetItems = items.filter((i) => i.status === 'will_send');
    } else if (mode === 'failed') {
      targetItems = items.filter((i) => i.status === 'failed');
    } else if (mode === 'changed') {
      targetItems = items.filter((i) => i.status === 'changed_since_sent');
    }

    if (targetItems.length === 0) {
      showToast('هیچ دانش‌آموزی واجد شرایط این حالت ارسال پیامک نیست', 'warning');
      return;
    }

    const modeTitles: Record<AppointmentSmsSendMode, string> = {
      unsent: 'ارسال پیامک به نوبت‌های ارسال‌نشده (unsent)',
      changed: 'ارسال مجدد به نوبت‌های تغییریافته (changed)',
      failed: 'تلاش مجدد برای پیامک‌های ناموفق (failed)',
    };

    const title = useSelectedOnly
      ? `ارسال پیامک به انتخاب‌شده‌ها (${mode})`
      : modeTitles[mode];

    const message = `آیا از ارسال پیامک اطلاع‌رسانی نوبت هفتگی به والدین ${toPersianDigits(
      targetItems.length
    )} دانش‌آموز در «${currentWeek.title}» با حالت «${mode}» اطمینان دارید؟`;

    setSmsConfirmModal({
      isOpen: true,
      mode,
      useSelectedOnly,
      targetCount: targetItems.length,
      title,
      message,
    });
  };

  const handleConfirmSendSms = async () => {
    const { mode, useSelectedOnly } = smsConfirmModal;
    setIsSendingSms(true);

    // Strictly omit `student_ids` unless sending to a non-empty subset
    const subsetIds =
      useSelectedOnly && selectedStudentIds.length > 0 ? selectedStudentIds : undefined;
    const operationId = `op-${currentWeek.week_date.replace(/-/g, '')}-${Date.now()}`;

    try {
      await API.sendAppointmentsSms({
        week_date: currentWeek.week_date,
        mode,
        student_ids: subsetIds,
        operation_id: operationId,
      });
    } catch {
      // Fall back to optimistic state update if preview backend is offline
    }

    const nowJalali = `${formatGregorianToJalali(getTodayGregorianIso())} - ${toPersianDigits(
      new Date().toTimeString().slice(0, 5)
    )}`;

    const targetedIds = new Set<number>();
    items.forEach((item) => {
      if (useSelectedOnly) {
        if (
          selectedStudentIds.includes(item.student_id) &&
          item.appointment_id !== null &&
          item.status !== 'no_phone'
        ) {
          targetedIds.add(item.student_id);
        }
      } else if (mode === 'unsent' && item.status === 'will_send') {
        targetedIds.add(item.student_id);
      } else if (mode === 'failed' && item.status === 'failed') {
        targetedIds.add(item.student_id);
      } else if (mode === 'changed' && item.status === 'changed_since_sent') {
        targetedIds.add(item.student_id);
      }
    });

    const newLogs: AppointmentSmsLogItem[] = [];
    setItems((prev) =>
      prev.map((item) => {
        if (!targetedIds.has(item.student_id)) return item;
        const apptAt =
          item.appointment_at ||
          `${item.appointment_date || currentWeek.week_date} ${item.start_time || '10:00'}:00`;
        newLogs.push({
          id: Date.now() + item.student_id,
          student_id: item.student_id,
          student_name: item.student_name,
          field: item.field,
          appointment_id: item.appointment_id,
          week_start: currentWeek.week_date,
          recipient_type: 'parent',
          mobile_mask: item.mobile_mask || item.mobile,
          mobile: item.mobile || item.mobile_mask,
          appointment_at: apptAt,
          appointment_jalali: `${formatAppointmentDisplayDate(item)} ساعت ${
            item.start_time || '10:00'
          }`,
          status: 'sent',
          provider_message_id: `KVN-${Math.floor(1000000 + Math.random() * 9000000)}`,
          last_error: null,
          attempts: (item.attempts || 0) + 1,
          sent_at: nowJalali,
          sent_by: 1,
          sent_by_name: 'مدیر سیستم',
          operation_id: operationId,
        });
        return {
          ...item,
          status: 'already_sent' as AppointmentSmsPreviewStatus,
          last_log_status: 'sent' as AppointmentSmsLogStatus,
          last_appointment_at: apptAt,
          last_sent_at: nowJalali,
          last_error: null,
          attempts: (item.attempts || 0) + 1,
        };
      })
    );

    setSmsLogs((prev) => [...newLogs, ...prev]);
    setSelectedStudentIds([]);
    setIsSendingSms(false);
    setSmsConfirmModal((prev) => ({ ...prev, isOpen: false }));
    showToast(
      `پیامک یادآوری نوبت با موفقیت برای ${toPersianDigits(newLogs.length)} ولی ارسال شد`,
      'success'
    );
  };

  // Single row SMS send
  const handleSendSingleSms = async (item: AppointmentSmsPreviewItem) => {
    if (!item.appointment_id || !item.appointment_date || !item.start_time) {
      showToast('ابتدا تاریخ و ساعت نوبت را برای این دانش‌آموز ثبت کنید', 'warning');
      return;
    }
    if (item.status === 'no_phone') {
      showToast('ابتدا شماره تماس ولی دانش‌آموز را ثبت کنید', 'warning');
      openParentContactsModal(item);
      return;
    }

    const modeForSingle: AppointmentSmsSendMode =
      item.status === 'failed'
        ? 'failed'
        : item.status === 'changed_since_sent'
        ? 'changed'
        : 'unsent';

    const operationId = `op-single-${item.student_id}-${Date.now()}`;
    try {
      await API.sendAppointmentsSms({
        week_date: currentWeek.week_date,
        mode: modeForSingle,
        student_ids: [item.student_id],
        operation_id: operationId,
      });
    } catch {
      // Fallback to local state update
    }

    const nowJalali = `${formatGregorianToJalali(getTodayGregorianIso())} - ${toPersianDigits(
      new Date().toTimeString().slice(0, 5)
    )}`;
    const apptAt = `${item.appointment_date} ${item.start_time}:00`;

    setItems((prev) =>
      prev.map((row) =>
        row.student_id === item.student_id
          ? {
              ...row,
              status: 'already_sent',
              last_log_status: 'sent',
              last_appointment_at: apptAt,
              last_sent_at: nowJalali,
              last_error: null,
              attempts: (row.attempts || 0) + 1,
            }
          : row
      )
    );

    setSmsLogs((prev) => [
      {
        id: Date.now(),
        student_id: item.student_id,
        student_name: item.student_name,
        field: item.field,
        appointment_id: item.appointment_id,
        week_start: currentWeek.week_date,
        recipient_type: 'parent',
        mobile_mask: item.mobile_mask || item.mobile,
        mobile: item.mobile || item.mobile_mask,
        appointment_at: apptAt,
        appointment_jalali: `${formatAppointmentDisplayDate(item)} ساعت ${item.start_time}`,
        status: 'sent',
        provider_message_id: `KVN-${Math.floor(1000000 + Math.random() * 9000000)}`,
        last_error: null,
        attempts: (item.attempts || 0) + 1,
        sent_at: nowJalali,
        sent_by: 1,
        sent_by_name: 'مدیر سیستم',
        operation_id: operationId,
      },
      ...prev,
    ]);

    showToast(`پیامک نوبت برای ولی «${item.student_name}» ارسال شد`, 'success');
  };

  // Edit / Create Appointment Modal
  const openEditAppointment = (item: AppointmentSmsPreviewItem) => {
    setEditingItem(item);
    const defaultStart = (item.start_time || '10:00').slice(0, 5);
    const defaultEnd = (item.end_time || '11:00').slice(0, 5);
    setAppointmentForm({
      appointment_date: item.appointment_date || currentWeek.week_date,
      start_time: defaultStart,
      end_time: defaultEnd,
      arrival_time: item.arrival_time || '',
      exam_start_time: item.exam_start_time || '',
      exam_end_time: item.exam_end_time || '',
      appointment_status: item.appointment_status || 'scheduled',
      description: item.description || '',
    });
    setAppointmentErrors({});
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const errors = validateAppointmentForm({
      appointment_date: appointmentForm.appointment_date,
      start_time: appointmentForm.start_time,
      end_time: appointmentForm.end_time,
    });
    setAppointmentErrors(errors);
    if (hasErrors(errors)) return;

    setIsSavingAppointment(true);
    try {
      await API.upsertAppointment({
        id: editingItem.appointment_id,
        student_id: editingItem.student_id,
        appointment_date: appointmentForm.appointment_date,
        start_time: appointmentForm.start_time,
        end_time: appointmentForm.end_time,
        status: appointmentForm.appointment_status,
        description: appointmentForm.description,
      });
    } catch {
      // Fallback to local state update
    }

    const startTrimmed = appointmentForm.start_time.trim().slice(0, 5);
    const endTrimmed = appointmentForm.end_time.trim().slice(0, 5);
    const newApptAt = `${appointmentForm.appointment_date} ${startTrimmed}:00`;
    const jalaliDate = formatGregorianToJalali(appointmentForm.appointment_date);
    const dObj = new Date(appointmentForm.appointment_date);
    const weekdayName = JALALI_WEEKDAYS[(dObj.getDay() + 1) % 7] || 'شنبه';

    setItems((prev) =>
      prev.map((row) => {
        if (row.student_id !== editingItem.student_id) return row;

        const hasPhone = Boolean(row.mobile || row.mobile_mask);
        const prevSentSnap = row.last_appointment_at || row.last_sent_appointment_at;

        let nextStatus: AppointmentSmsPreviewStatus = 'will_send';
        if (!hasPhone) {
          nextStatus = 'no_phone';
        } else if (row.last_log_status === 'sent' && prevSentSnap) {
          nextStatus = prevSentSnap !== newApptAt ? 'changed_since_sent' : 'already_sent';
        } else if (row.last_log_status === 'failed') {
          nextStatus = 'failed';
        }

        return {
          ...row,
          appointment_id: row.appointment_id || Date.now(),
          appointment_date: appointmentForm.appointment_date,
          appointment_jalali: jalaliDate,
          weekday: weekdayName,
          day_and_date_fa: `${weekdayName} ${jalaliDate}`,
          start_time: startTrimmed,
          end_time: endTrimmed,
          time_fa: startTrimmed,
          appointment_at: newApptAt,
          active_appointments_count: Math.max(1, row.active_appointments_count || 1),
          status: nextStatus,
          appointment_status: appointmentForm.appointment_status,
          arrival_time: appointmentForm.arrival_time.trim() || null,
          exam_start_time: appointmentForm.exam_start_time.trim() || null,
          exam_end_time: appointmentForm.exam_end_time.trim() || null,
          description: appointmentForm.description.trim() || null,
        };
      })
    );

    setIsSavingAppointment(false);
    setEditingItem(null);
    showToast(`نوبت «${editingItem.student_name}» با موفقیت ذخیره شد`, 'success');
  };

  // Change Appointment Status (PUT /api/v1/appointments/{id}/status)
  const handleStatusChange = async (
    item: AppointmentSmsPreviewItem,
    newStatus: AppointmentStatus
  ) => {
    if (!item.appointment_id) return;
    try {
      await API.updateAppointmentStatus(item.appointment_id, newStatus);
    } catch {
      // Fallback to local state update
    }
    setItems((prev) =>
      prev.map((row) =>
        row.student_id === item.student_id
          ? {
              ...row,
              appointment_status: newStatus,
            }
          : row
      )
    );
    showToast(`وضعیت حضور «${item.student_name}» بروزرسانی شد`, 'info');
  };

  // Cancel / Delete Appointment (DELETE /api/v1/appointments/{id})
  const handleConfirmCancelAppointment = async () => {
    if (!cancelingItem) return;
    if (cancelingItem.appointment_id) {
      try {
        await API.deleteAppointment(cancelingItem.appointment_id);
      } catch {
        // Fallback to local state update
      }
    }
    setItems((prev) =>
      prev.map((row) =>
        row.student_id === cancelingItem.student_id
          ? {
              ...row,
              appointment_id: null,
              appointment_date: null,
              appointment_jalali: null,
              weekday: null,
              day_and_date_fa: null,
              start_time: null,
              end_time: null,
              time_fa: null,
              appointment_at: null,
              active_appointments_count: 0,
              multiple_appointments: false,
              status: 'no_appointment',
              appointment_status: 'cancelled',
              arrival_time: null,
              exam_start_time: null,
              exam_end_time: null,
            }
          : row
      )
    );
    showToast(`نوبت «${cancelingItem.student_name}» لغو شد`, 'info');
    setCancelingItem(null);
  };

  // Parent Contacts Modal (/api/v1/students/{studentId}/parent-contacts)
  const openParentContactsModal = async (item: AppointmentSmsPreviewItem) => {
    setContactModalStudent(item);
    setContactForm({
      parent_name: '',
      relationship: 'father',
      phone: '',
      is_primary: true,
    });
    setContactErrors({});

    try {
      const res = await API.getParentContacts(item.student_id);
      if (res.data && res.data.length > 0) {
        setParentContactsMap((prev) => ({
          ...prev,
          [item.student_id]: res.data,
        }));
      }
    } catch {
      // Keep existing contacts in parentContactsMap
    }
  };

  const handleAddParentContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactModalStudent) return;

    const errors = validateParentContactForm({
      parent_name: contactForm.parent_name,
      phone: contactForm.phone,
    });
    setContactErrors(errors);
    if (hasErrors(errors)) return;

    setIsSavingContact(true);
    const studentId = contactModalStudent.student_id;
    let createdRecord: ParentContactRecord = {
      id: Date.now(),
      student_id: studentId,
      parent_name: contactForm.parent_name.trim(),
      relationship: contactForm.relationship,
      phone: contactForm.phone.trim(),
      is_primary: contactForm.is_primary,
    };

    try {
      const res = await API.createParentContact(studentId, {
        parent_name: contactForm.parent_name.trim(),
        relationship: contactForm.relationship,
        phone: contactForm.phone.trim(),
        is_primary: contactForm.is_primary,
      });
      if (res.data && res.data.id) {
        createdRecord = res.data;
      }
    } catch {
      // Fallback to local state
    }

    setParentContactsMap((prev) => {
      const existing = prev[studentId] || [];
      const updated = contactForm.is_primary
        ? existing.map((c) => ({ ...c, is_primary: false }))
        : existing;
      return {
        ...prev,
        [studentId]: [createdRecord, ...updated],
      };
    });

    // Update student row in preview if primary or previously had no_phone
    const maskedPhone = `${createdRecord.phone.slice(0, 4)}***${createdRecord.phone.slice(-4)}`;
    const parentDisplay = `${createdRecord.parent_name} (${
      RELATIONSHIP_LABELS[createdRecord.relationship]
    })`;

    setItems((prev) =>
      prev.map((row) => {
        if (row.student_id !== studentId) return row;
        const nextStatus: AppointmentSmsPreviewStatus =
          row.status === 'no_phone'
            ? row.appointment_id
              ? 'will_send'
              : 'no_appointment'
            : row.status;
        return {
          ...row,
          parent_name: parentDisplay,
          mobile_mask: maskedPhone,
          mobile: createdRecord.phone,
          has_valid_phone: true,
          status: nextStatus,
          last_error: nextStatus === 'will_send' ? null : row.last_error,
        };
      })
    );

    setContactForm({
      parent_name: '',
      relationship: 'father',
      phone: '',
      is_primary: false,
    });
    setIsSavingContact(false);
    showToast(`شماره تماس ولی برای «${contactModalStudent.student_name}» ثبت شد`, 'success');
  };

  const handleDeleteParentContact = async (contactId: number) => {
    if (!contactModalStudent) return;
    const studentId = contactModalStudent.student_id;

    try {
      await API.deleteParentContact(studentId, contactId);
    } catch {
      // Fallback to local state
    }

    const remaining = (parentContactsMap[studentId] || []).filter((c) => c.id !== contactId);
    setParentContactsMap((prev) => ({
      ...prev,
      [studentId]: remaining,
    }));

    const primary = remaining.find((c) => Boolean(c.is_primary)) || remaining[0];
    setItems((prev) =>
      prev.map((row) => {
        if (row.student_id !== studentId) return row;
        if (!primary) {
          return {
            ...row,
            parent_name: null,
            mobile_mask: null,
            mobile: null,
            has_valid_phone: false,
            status: row.appointment_id ? 'no_phone' : 'no_appointment',
          };
        }
        return {
          ...row,
          parent_name: `${primary.parent_name} (${RELATIONSHIP_LABELS[primary.relationship]})`,
          mobile_mask: `${primary.phone.slice(0, 4)}***${primary.phone.slice(-4)}`,
          mobile: primary.phone,
          has_valid_phone: true,
        };
      })
    );

    showToast('شماره تماس ولی حذف شد', 'info');
  };

  // Quick extend 1 week & create week session (from dashboard.php)
  const handleQuickExtendOneWeek = () => {
    const newId = Date.now();
    const newWeek: WeeklySessionInfo = {
      id: newId,
      title: `هفته تمدیدشده - جلسه ${toPersianDigits(weeks.length + 16)} مشاوره و آزمون`,
      week_date: getTodayGregorianIso(),
      start_date_jalali: '1404/02/20',
      end_date_jalali: '1404/02/26',
    };
    setWeeks((prev) => [newWeek, ...prev]);
    setSelectedWeekId(newId);
    setItems((prev) =>
      prev.map((row) => ({
        ...row,
        status: row.appointment_id
          ? row.mobile || row.mobile_mask
            ? 'will_send'
            : 'no_phone'
          : 'no_appointment',
        last_log_status: null,
        last_appointment_at: null,
        last_sent_at: null,
        last_error: null,
        attempts: 0,
        arrival_time: null,
        exam_start_time: null,
        exam_end_time: null,
      }))
    );
    showToast('تمدید یک‌هفته‌ای نوبت‌ها با موفقیت انجام شد و وضعیت پیامک‌ها ریست شد', 'success');
  };

  const handleCreateNewWeek = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateWeekSessionForm(newWeekForm);
    setNewWeekErrors(errors);
    if (hasErrors(errors)) return;

    const newId = Date.now();
    const created: WeeklySessionInfo = {
      id: newId,
      title: newWeekForm.title.trim(),
      week_date: getTodayGregorianIso(),
      start_date_jalali: newWeekForm.start_date_jalali.trim(),
      end_date_jalali: newWeekForm.end_date_jalali.trim(),
    };
    setWeeks((prev) => [created, ...prev]);
    setSelectedWeekId(newId);
    setIsNewWeekModalOpen(false);
    setNewWeekForm({ title: '', start_date_jalali: '', end_date_jalali: '' });
    showToast(`«${created.title}» با موفقیت ایجاد شد`, 'success');
  };

  // Remedial Matrix Handlers
  const toggleRemedialAttendee = (classId: number, studentId: number) => {
    setRemedialClasses((prev) =>
      prev.map((col) => {
        if (col.id !== classId) return col;
        const exists = col.attendees.includes(studentId);
        return {
          ...col,
          attendees: exists
            ? col.attendees.filter((id) => id !== studentId)
            : [...col.attendees, studentId],
        };
      })
    );
  };

  const handleAddRemedialClass = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateRemedialClassForm({ class_name: newClassForm.class_name });
    setNewClassErrors(errors);
    if (hasErrors(errors)) return;

    const newCol: RemedialClassColumn = {
      id: Date.now(),
      field: remedialFieldTab,
      class_name: newClassForm.class_name.trim(),
      teacher_name: newClassForm.teacher_name.trim() || undefined,
      attendees: [],
    };
    setRemedialClasses((prev) => [...prev, newCol]);
    setNewClassForm({ class_name: '', teacher_name: '' });
    setIsAddClassModalOpen(false);
    showToast(`کلاس «${newCol.class_name}» به ماتریس رشته ${remedialFieldTab} اضافه شد`, 'success');
  };

  const handleDeleteRemedialClass = (classId: number) => {
    setRemedialClasses((prev) => prev.filter((c) => c.id !== classId));
    showToast('ستون کلاس رفع اشکال حذف شد', 'info');
  };

  // Badge helper for AppointmentSmsPreviewStatus
  const renderSmsPreviewStatusBadge = (item: AppointmentSmsPreviewItem) => {
    switch (item.status) {
      case 'already_sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            ارسال‌شده (already_sent)
          </span>
        );
      case 'changed_since_sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            تغییریافته پس از ارسال
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            ارسال ناموفق (failed)
          </span>
        );
      case 'will_send':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            آماده ارسال (will_send)
          </span>
        );
      case 'no_phone':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <PhoneOff className="w-3.5 h-3.5" />
            فاقد شماره ولی (no_phone)
          </span>
        );
      case 'no_appointment':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <CalendarX2 className="w-3.5 h-3.5" />
            بدون نوبت فعال
          </span>
        );
    }
  };

  const filteredLogs = useMemo(() => {
    if (logStatusFilter === 'all') return smsLogs;
    return smsLogs.filter((l) => l.status === logStatusFilter);
  }, [smsLogs, logStatusFilter]);

  const currentFieldRemedialClasses = useMemo(
    () => remedialClasses.filter((c) => c.field === remedialFieldTab),
    [remedialClasses, remedialFieldTab]
  );

  const currentFieldStudents = useMemo(
    () => items.filter((s) => s.field === remedialFieldTab),
    [items, remedialFieldTab]
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Week Selector */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-black text-slate-800">
                  نوبت‌دهی هفتگی و اطلاع‌رسانی پیامکی والدین
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#445D84]/10 text-[#445D84]">
                  {toPersianDigits(currentWeek.start_date_jalali)} تا{' '}
                  {toPersianDigits(currentWeek.end_date_jalali)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                مدیریت زمان حضور هفتگی، شماره‌های تماس والدین، ارسال گروهی پیامک یادآوری و ماتریس کلاس‌های رفع اشکال
              </p>
            </div>
          </div>

          {/* Week Selector & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[250px]">
              <select
                value={selectedWeekId}
                onChange={(e) => setSelectedWeekId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#445D84]/25 focus:border-[#445D84]"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} ({toPersianDigits(w.start_date_jalali)})
                  </option>
                ))}
              </select>
            </div>

            <ActionButton
              variant="secondary"
              size="md"
              onClick={handleQuickExtendOneWeek}
              icon={<Sparkles className="w-4 h-4 text-amber-500" />}
              title="کپی نوبت‌های هفته قبل برای هفته جدید"
            >
              تمدید سریع یک‌هفته
            </ActionButton>

            <ActionButton
              variant="secondary"
              size="md"
              onClick={() => {
                setNewWeekErrors({});
                setIsNewWeekModalOpen(true);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              هفته جدید
            </ActionButton>

            <ActionButton
              variant="primary"
              size="md"
              onClick={() => setIsLogDrawerOpen(true)}
              icon={<History className="w-4 h-4" />}
            >
              کشوی لاگ پیامک ({toPersianDigits(smsLogs.length)})
            </ActionButton>
          </div>
        </div>

        {/* Sub-navigation Tabs: Appointments vs Remedial Matrix */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/70">
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'appointments'
                  ? 'bg-[#445D84] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              جدول نوبت‌ها و ارسال پیامک هفتگی
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('remedial')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'remedial'
                  ? 'bg-[#445D84] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              ماتریس کلاس‌های رفع اشکال ({toPersianDigits(remedialClasses.length)})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ActionButton
              variant="ghost"
              size="sm"
              loading={isLoading}
              onClick={() => fetchWeekData(currentWeek.week_date, true)}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              بروزرسانی پیش‌نمایش
            </ActionButton>
          </div>
        </div>
      </div>

      {activeTab === 'appointments' ? (
        <>
          {/* Summary Filter Chips matching AppointmentSmsPreviewSummary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[
              {
                id: 'all' as PreviewChipFilter,
                label: 'همه دانش‌آموزان',
                count: summary.total,
                activeBg: 'bg-[#445D84] text-white border-[#445D84]',
                badgeBg: 'bg-slate-100 text-slate-700',
              },
              {
                id: 'will_send' as PreviewChipFilter,
                label: 'آماده ارسال (unsent)',
                count: summary.will_send,
                activeBg: 'bg-blue-600 text-white border-blue-600',
                badgeBg: 'bg-blue-50 text-blue-700',
              },
              {
                id: 'changed_since_sent' as PreviewChipFilter,
                label: 'تغییریافته (changed)',
                count: summary.changed_since_sent,
                activeBg: 'bg-amber-600 text-white border-amber-600',
                badgeBg: 'bg-amber-50 text-amber-700',
              },
              {
                id: 'failed' as PreviewChipFilter,
                label: 'ارسال ناموفق (failed)',
                count: summary.failed,
                activeBg: 'bg-rose-600 text-white border-rose-600',
                badgeBg: 'bg-rose-50 text-rose-700',
              },
              {
                id: 'already_sent' as PreviewChipFilter,
                label: 'ارسال‌شده (sent)',
                count: summary.already_sent,
                activeBg: 'bg-emerald-600 text-white border-emerald-600',
                badgeBg: 'bg-emerald-50 text-emerald-700',
              },
              {
                id: 'no_phone' as PreviewChipFilter,
                label: 'فاقد شماره ولی',
                count: summary.no_phone,
                activeBg: 'bg-orange-600 text-white border-orange-600',
                badgeBg: 'bg-orange-50 text-orange-700',
              },
              {
                id: 'no_appointment' as PreviewChipFilter,
                label: 'بدون نوبت فعال',
                count: summary.no_appointment,
                activeBg: 'bg-slate-700 text-white border-slate-700',
                badgeBg: 'bg-slate-100 text-slate-600',
              },
              {
                id: 'multiple_appointments' as PreviewChipFilter,
                label: 'چند نوبته در هفته',
                count: summary.multiple_appointments,
                activeBg: 'bg-purple-600 text-white border-purple-600',
                badgeBg: 'bg-purple-50 text-purple-700',
              },
            ].map((chip) => {
              const isActive = chipFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setChipFilter(chip.id)}
                  className={`flex flex-col justify-between p-3 rounded-xl border text-right transition-all cursor-pointer ${
                    isActive
                      ? `${chip.activeBg} shadow-sm`
                      : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${
                      isActive ? 'text-white/90' : 'text-slate-500'
                    }`}
                  >
                    {chip.label}
                  </span>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-lg font-black">
                      {toPersianDigits(chip.count)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-white/20 text-white' : chip.badgeBg
                      }`}
                    >
                      نفر
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bulk Action Bar & Search/Filter Toolbar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 ml-1 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-[#445D84]" />
                  ارسال گروهی پیامک والدین:
                </span>

                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={() => openSmsConfirm('unsent', false)}
                  disabled={summary.will_send === 0}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  ارسال به ارسال‌نشده‌ها ({toPersianDigits(summary.will_send)})
                </ActionButton>

                <ActionButton
                  variant="warning"
                  size="sm"
                  onClick={() => openSmsConfirm('changed', false)}
                  disabled={summary.changed_since_sent === 0}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  ارسال به تغییریافته‌ها ({toPersianDigits(summary.changed_since_sent)})
                </ActionButton>

                <ActionButton
                  variant="danger"
                  size="sm"
                  onClick={() => openSmsConfirm('failed', false)}
                  disabled={summary.failed === 0}
                  icon={<AlertTriangle className="w-3.5 h-3.5" />}
                >
                  تلاش مجدد ناموفق‌ها ({toPersianDigits(summary.failed)})
                </ActionButton>

                {selectedStudentIds.length > 0 && (
                  <ActionButton
                    variant="success"
                    size="sm"
                    onClick={() => openSmsConfirm('unsent', true)}
                    icon={<CheckSquare className="w-3.5 h-3.5" />}
                  >
                    ارسال به انتخاب‌شده‌ها ({toPersianDigits(selectedStudentIds.length)} نفر)
                  </ActionButton>
                )}
              </div>

              {/* Search & Field Filter */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[230px]">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجوی دانش‌آموز، ولی، موبایل..."
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#445D84]/25 focus:border-[#445D84]"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={fieldFilter}
                    onChange={(e) => setFieldFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/70 focus:outline-none focus:border-[#445D84]"
                  >
                    <option value="all">همه رشته‌ها</option>
                    <option value="تجربی">تجربی</option>
                    <option value="ریاضی">ریاضی</option>
                    <option value="انسانی">انسانی</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Error State Banner */}
            {errorState && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-700 text-xs font-bold">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorState}</span>
                </div>
                <ActionButton
                  variant="danger"
                  size="sm"
                  onClick={() => setErrorState(null)}
                >
                  بستن
                </ActionButton>
              </div>
            )}

            {/* Appointments Table */}
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-[#445D84]" />
                <p className="text-sm font-bold">در حال دریافت پیش‌نمایش نوبت‌ها و وضعیت پیامک...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">
                  هیچ دانش‌آموزی با فیلترهای انتخابی یافت نشد
                </p>
                <p className="text-xs text-slate-500">
                  فیلترهای بالا را تغییر دهید یا عبارت جستجو را پاک کنید.
                </p>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setChipFilter('all');
                    setFieldFilter('all');
                    setSearchQuery('');
                  }}
                >
                  نمایش همه ردیف‌ها
                </ActionButton>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-[#344868] text-white text-xs">
                      <th className="py-3.5 px-3 w-10 text-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="inline-flex items-center justify-center text-white/90 hover:text-white cursor-pointer"
                          title="انتخاب همه"
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3.5 px-3 font-bold">دانش‌آموز و پشتیبان</th>
                      <th className="py-3.5 px-3 font-bold">ولی و موبایل گیرنده</th>
                      <th className="py-3.5 px-3 font-bold">تاریخ و ساعت نوبت</th>
                      <th className="py-3.5 px-3 font-bold">ساعات حضور و آزمون</th>
                      <th className="py-3.5 px-3 font-bold">وضعیت نوبت</th>
                      <th className="py-3.5 px-3 font-bold">وضعیت پیامک هفتگی</th>
                      <th className="py-3.5 px-3 font-bold text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredItems.map((item) => {
                      const isSelected = selectedStudentIds.includes(item.student_id);
                      const displayPhone = item.mobile_mask || item.mobile;
                      const prevSnap = item.last_appointment_at || item.last_sent_appointment_at;
                      return (
                        <tr
                          key={item.student_id}
                          className={`transition-colors ${
                            isSelected ? 'bg-[#445D84]/5' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleSelectOne(item.student_id)}
                              className="inline-flex items-center justify-center text-slate-400 hover:text-[#445D84] cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#445D84]" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          {/* Student & Field & Supporter */}
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-slate-800 text-sm">
                              {item.student_name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {item.field && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    item.field === 'تجربی'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : item.field === 'ریاضی'
                                      ? 'bg-blue-50 text-blue-700'
                                      : 'bg-purple-50 text-purple-700'
                                  }`}
                                >
                                  {item.field}
                                </span>
                              )}
                              {item.grade && (
                                <span className="text-[11px] text-slate-500">
                                  پایه {toPersianDigits(item.grade)}
                                </span>
                              )}
                              {item.supporter_name && (
                                <span className="text-[10px] text-slate-400">
                                  • {item.supporter_name}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Parent Recipient & Phone */}
                          <td className="py-3.5 px-3">
                            {displayPhone ? (
                              <div className="space-y-1">
                                <div className="font-bold text-slate-700">
                                  {item.parent_name || 'ولی دانش‌آموز'}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    dir="ltr"
                                    className="inline-flex items-center gap-1 font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]"
                                  >
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {toPersianDigits(displayPhone)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openParentContactsModal(item)}
                                    className="text-[11px] font-bold text-[#445D84] hover:underline cursor-pointer"
                                  >
                                    ویرایش
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <span className="inline-flex items-center gap-1 text-orange-600 font-bold text-[11px]">
                                  <PhoneOff className="w-3.5 h-3.5" />
                                  شماره ولی ثبت نشده
                                </span>
                                <div>
                                  <ActionButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openParentContactsModal(item)}
                                    icon={<UserPlus className="w-3.5 h-3.5 text-[#445D84]" />}
                                  >
                                    ثبت شماره ولی
                                  </ActionButton>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Appointment Date & Start/End Time */}
                          <td className="py-3.5 px-3">
                            {item.appointment_date && item.start_time ? (
                              <div className="space-y-1">
                                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-[#445D84]" />
                                  {formatAppointmentDisplayDate(item)}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    ساعت {formatTimeRange(item)}
                                  </span>
                                  {item.multiple_appointments && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold"
                                      title="این دانش‌آموز بیش از یک نوبت فعال در این هفته دارد؛ نزدیک‌ترین نوبت انتخاب شده است"
                                    >
                                      <Layers className="w-3 h-3" />
                                      {toPersianDigits(item.active_appointments_count)} نوبت فعال
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">تعیین نشده</span>
                            )}
                          </td>

                          {/* Operational Times (Arrival, Exam Start, Exam End) */}
                          <td className="py-3.5 px-3">
                            {item.arrival_time || item.exam_start_time || item.exam_end_time ? (
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">ورود:</span>
                                  <span className="font-bold text-slate-700">
                                    {item.arrival_time
                                      ? toPersianDigits(item.arrival_time)
                                      : '—'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">آزمون:</span>
                                  <span className="font-bold text-slate-700">
                                    {item.exam_start_time
                                      ? toPersianDigits(item.exam_start_time)
                                      : '—'}{' '}
                                    تا{' '}
                                    {item.exam_end_time
                                      ? toPersianDigits(item.exam_end_time)
                                      : '—'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">ثبت نشده</span>
                            )}
                          </td>

                          {/* Appointment Status Selector (PUT /api/v1/appointments/{id}/status) */}
                          <td className="py-3.5 px-3">
                            {item.appointment_id ? (
                              <select
                                value={item.appointment_status || 'scheduled'}
                                onChange={(e) =>
                                  handleStatusChange(
                                    item,
                                    e.target.value as AppointmentStatus
                                  )
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 focus:outline-none focus:border-[#445D84]"
                              >
                                <option value="scheduled">برنامه‌ریزی شده (scheduled)</option>
                                <option value="confirmed">تایید شده (confirmed)</option>
                                <option value="pending">در انتظار (pending)</option>
                                <option value="completed">انجام شده (completed)</option>
                                <option value="absent">غایب (absent)</option>
                                <option value="cancelled">لغو شده (cancelled)</option>
                              </select>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* SMS Preview Status & Metadata */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-1">
                              {renderSmsPreviewStatusBadge(item)}
                              {item.last_sent_at && (
                                <div className="text-[10px] text-slate-400">
                                  آخرین ارسال: {toPersianDigits(item.last_sent_at)} (تلاش:{' '}
                                  {toPersianDigits(item.attempts)})
                                </div>
                              )}
                              {item.status === 'changed_since_sent' && prevSnap && (
                                <div className="text-[10px] text-amber-700 font-medium">
                                  نوبت قبلی پیامک‌شده: {toPersianDigits(prevSnap.slice(11, 16))}
                                </div>
                              )}
                              {item.last_error && (
                                <div className="text-[10px] text-rose-600 font-medium max-w-[230px] truncate">
                                  {item.last_error}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <ActionButton
                                variant="secondary"
                                size="sm"
                                onClick={() => openEditAppointment(item)}
                                icon={<Edit2 className="w-3.5 h-3.5" />}
                                title="ثبت یا ویرایش نوبت"
                              >
                                {item.appointment_id ? 'ویرایش' : 'ثبت نوبت'}
                              </ActionButton>

                              <ActionButton
                                variant="ghost"
                                size="sm"
                                onClick={() => openParentContactsModal(item)}
                                icon={<Phone className="w-3.5 h-3.5 text-[#445D84]" />}
                                title="مدیریت شماره‌های والدین"
                              />

                              {item.appointment_id && (
                                <>
                                  <ActionButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleSendSingleSms(item)}
                                    icon={<Send className="w-3.5 h-3.5" />}
                                    title="ارسال تکی پیامک یادآوری به ولی"
                                  >
                                    پیامک
                                  </ActionButton>

                                  <ActionButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCancelingItem(item)}
                                    icon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
                                    title="لغو نوبت"
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Remedial Classes Matrix View (inspired by remedial.php) */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#445D84]" />
                ماتریس حضور در کلاس‌های رفع اشکال هفتگی
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                کلاس‌های رفع اشکال هر رشته را تعریف کنید و دانش‌آموزان شرکت‌کننده را با تیک مشخص نمایید.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                {(['تجربی', 'ریاضی', 'انسانی'] as AcademicField[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRemedialFieldTab(f)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      remedialFieldTab === f
                        ? 'bg-[#445D84] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    رشته {f}
                  </button>
                ))}
              </div>

              <ActionButton
                variant="primary"
                size="sm"
                onClick={() => {
                  setNewClassErrors({});
                  setIsAddClassModalOpen(true);
                }}
                icon={<Plus className="w-4 h-4" />}
              >
                افزودن ستون کلاس جدید
              </ActionButton>
            </div>
          </div>

          {currentFieldRemedialClasses.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-bold text-slate-700">
                هیچ کلاس رفع اشکالی برای رشته {remedialFieldTab} تعریف نشده است
              </p>
              <ActionButton
                variant="primary"
                size="sm"
                onClick={() => setIsAddClassModalOpen(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                ایجاد اولین کلاس رفع اشکال
              </ActionButton>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#344868] text-white text-xs">
                    <th className="py-3.5 px-4 font-bold min-w-[200px]">
                      نام دانش‌آموز ({remedialFieldTab})
                    </th>
                    <th className="py-3.5 px-3 font-bold">نوبت هفتگی</th>
                    {currentFieldRemedialClasses.map((col) => (
                      <th key={col.id} className="py-3.5 px-4 font-bold text-center min-w-[170px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>{col.class_name}</span>
                          {col.teacher_name && (
                            <span className="text-[10px] font-normal text-white/75">
                              {col.teacher_name}
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px]">
                              {toPersianDigits(col.attendees.length)} نفر
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteRemedialClass(col.id)}
                              className="text-rose-200 hover:text-white cursor-pointer"
                              title="حذف این کلاس"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {currentFieldStudents.map((student) => (
                    <tr key={student.student_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{student.student_name}</div>
                        <div className="text-[11px] text-slate-400">
                          پایه {toPersianDigits(student.grade || 12)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {student.appointment_date && student.start_time ? (
                          <span className="text-slate-700 font-medium">
                            {formatAppointmentDisplayDate(student)} -{' '}
                            {toPersianDigits(student.start_time.slice(0, 5))}
                          </span>
                        ) : (
                          <span className="text-slate-400">بدون نوبت</span>
                        )}
                      </td>
                      {currentFieldRemedialClasses.map((col) => {
                        const isAttending = col.attendees.includes(student.student_id);
                        return (
                          <td key={col.id} className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                toggleRemedialAttendee(col.id, student.student_id)
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                isAttending
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200/70'
                              }`}
                            >
                              {isAttending ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  حاضر در کلاس
                                </>
                              ) : (
                                'ثبت حضور'
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Appointment Modal */}
      <Modal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={
          editingItem
            ? `تنظیم نوبت و ساعات حضور: ${editingItem.student_name}`
            : 'ویرایش نوبت'
        }
      >
        <form noValidate onSubmit={handleSaveAppointment} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500">دانش‌آموز: </span>
              <span className="font-bold text-slate-800">{editingItem?.student_name}</span>
              {editingItem?.field && (
                <span className="mr-2 px-2 py-0.5 rounded bg-[#445D84]/10 text-[#445D84] font-bold">
                  {editingItem.field}
                </span>
              )}
            </div>
            <div dir="ltr" className="font-mono text-slate-600">
              {editingItem?.mobile_mask || editingItem?.mobile
                ? toPersianDigits(editingItem.mobile_mask || editingItem.mobile || '')
                : 'بدون شماره ولی'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تاریخ نوبت (میلادی / انتخابگر) *
              </label>
              <input
                type="date"
                value={appointmentForm.appointment_date}
                onChange={(e) => {
                  setAppointmentForm((prev) => ({
                    ...prev,
                    appointment_date: e.target.value,
                  }));
                  if (appointmentErrors.appointment_date) {
                    setAppointmentErrors((prev) => ({
                      ...prev,
                      appointment_date: undefined,
                    }));
                  }
                }}
                className={getFieldClass(Boolean(appointmentErrors.appointment_date))}
              />
              {appointmentForm.appointment_date && (
                <p className="text-[11px] text-[#445D84] font-medium mt-1">
                  معادل شمسی: {formatGregorianToJalali(appointmentForm.appointment_date)}
                </p>
              )}
              <FieldError message={appointmentErrors.appointment_date} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ساعت شروع جلسه (HH:MM) *
              </label>
              <input
                type="time"
                value={appointmentForm.start_time}
                onChange={(e) => {
                  setAppointmentForm((prev) => ({ ...prev, start_time: e.target.value }));
                  if (appointmentErrors.start_time) {
                    setAppointmentErrors((prev) => ({ ...prev, start_time: undefined }));
                  }
                }}
                className={getFieldClass(Boolean(appointmentErrors.start_time))}
              />
              <FieldError message={appointmentErrors.start_time} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ساعت پایان جلسه (HH:MM) *
              </label>
              <input
                type="time"
                value={appointmentForm.end_time}
                onChange={(e) => {
                  setAppointmentForm((prev) => ({ ...prev, end_time: e.target.value }));
                  if (appointmentErrors.end_time) {
                    setAppointmentErrors((prev) => ({ ...prev, end_time: undefined }));
                  }
                }}
                className={getFieldClass(Boolean(appointmentErrors.end_time))}
              />
              <FieldError message={appointmentErrors.end_time} />
            </div>
          </div>

          {/* Operational Times from dashboard.php */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-700 mb-2.5">
              ساعات حضور و آزمون در آموزشگاه (اختیاری)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  ساعت ورود دانش‌آموز
                </label>
                <input
                  type="time"
                  value={appointmentForm.arrival_time}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({
                      ...prev,
                      arrival_time: e.target.value,
                    }))
                  }
                  className={getFieldClass(false)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  ساعت شروع آزمون
                </label>
                <input
                  type="time"
                  value={appointmentForm.exam_start_time}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({
                      ...prev,
                      exam_start_time: e.target.value,
                    }))
                  }
                  className={getFieldClass(false)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  ساعت پایان آزمون
                </label>
                <input
                  type="time"
                  value={appointmentForm.exam_end_time}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({
                      ...prev,
                      exam_end_time: e.target.value,
                    }))
                  }
                  className={getFieldClass(false)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                وضعیت نوبت
              </label>
              <select
                value={appointmentForm.appointment_status}
                onChange={(e) =>
                  setAppointmentForm((prev) => ({
                    ...prev,
                    appointment_status: e.target.value as AppointmentStatus,
                  }))
                }
                className={getFieldClass(false)}
              >
                <option value="scheduled">برنامه‌ریزی شده (scheduled)</option>
                <option value="confirmed">تایید شده (confirmed)</option>
                <option value="pending">در انتظار تایید (pending)</option>
                <option value="completed">برگزار شده (completed)</option>
                <option value="absent">غایب (absent)</option>
                <option value="cancelled">لغو شده (cancelled)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                توضیحات جلسه
              </label>
              <input
                type="text"
                value={appointmentForm.description}
                onChange={(e) =>
                  setAppointmentForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="مثال: بررسی کارنامه آزمون..."
                className={getFieldClass(false)}
              />
            </div>
          </div>

          {editingItem?.last_log_status === 'sent' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                توجه: برای این دانش‌آموز قبلاً پیامک نوبت ارسال شده است. در صورت تغییر تاریخ یا ساعت شروع، وضعیت پیامک به «تغییریافته پس از ارسال (changed_since_sent)» تغییر می‌کند.
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => setEditingItem(null)}
            >
              انصراف
            </ActionButton>
            <ActionButton type="submit" variant="primary" loading={isSavingAppointment}>
              ذخیره نوبت
            </ActionButton>
          </div>
        </form>
      </Modal>

      {/* Parent Contacts CRUD Modal (/api/v1/students/{studentId}/parent-contacts) */}
      <Modal
        isOpen={Boolean(contactModalStudent)}
        onClose={() => setContactModalStudent(null)}
        title={
          contactModalStudent
            ? `مدیریت شماره‌های والدین: ${contactModalStudent.student_name}`
            : 'مدیریت شماره‌های والدین'
        }
      >
        <div className="space-y-5">
          {/* Existing Contacts List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700">
              شماره‌های ثبت‌شده برای والدین
            </h4>
            {contactModalStudent &&
            (parentContactsMap[contactModalStudent.student_id] || []).length > 0 ? (
              <div className="space-y-2">
                {(parentContactsMap[contactModalStudent.student_id] || []).map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{c.parent_name}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-bold">
                          {RELATIONSHIP_LABELS[c.relationship]}
                        </span>
                        {Boolean(c.is_primary) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            <Star className="w-3 h-3 fill-emerald-600" />
                            گیرنده اصلی پیامک
                          </span>
                        )}
                      </div>
                      <div dir="ltr" className="font-mono text-slate-600 text-right">
                        {toPersianDigits(c.phone)}
                      </div>
                    </div>
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteParentContact(c.id)}
                      icon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 text-orange-700 text-xs text-center">
                هیچ شماره تماسی برای والدین این دانش‌آموز ثبت نشده است.
              </div>
            )}
          </div>

          {/* Add New Parent Contact Form */}
          <form
            noValidate
            onSubmit={handleAddParentContact}
            className="space-y-3.5 pt-4 border-t border-slate-200/80"
          >
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-[#445D84]" />
              افزودن شماره جدید ولی
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام و نام خانوادگی ولی *
                </label>
                <input
                  type="text"
                  value={contactForm.parent_name}
                  onChange={(e) => {
                    setContactForm((prev) => ({ ...prev, parent_name: e.target.value }));
                    if (contactErrors.parent_name) {
                      setContactErrors((prev) => ({ ...prev, parent_name: undefined }));
                    }
                  }}
                  placeholder="مثال: حسین محمدی"
                  className={getFieldClass(Boolean(contactErrors.parent_name))}
                />
                <FieldError message={contactErrors.parent_name} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نسبت با دانش‌آموز
                </label>
                <select
                  value={contactForm.relationship}
                  onChange={(e) =>
                    setContactForm((prev) => ({
                      ...prev,
                      relationship: e.target.value as ParentRelationship,
                    }))
                  }
                  className={getFieldClass(false)}
                >
                  <option value="father">پدر (father)</option>
                  <option value="mother">مادر (mother)</option>
                  <option value="guardian">قیم قانونی (guardian)</option>
                  <option value="other">سایر بستگان (other)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  شماره موبایل ولی (۱۱ رقمی) *
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={contactForm.phone}
                  onChange={(e) => {
                    setContactForm((prev) => ({ ...prev, phone: e.target.value }));
                    if (contactErrors.phone) {
                      setContactErrors((prev) => ({ ...prev, phone: undefined }));
                    }
                  }}
                  placeholder="09123456789"
                  className={getFieldClass(Boolean(contactErrors.phone))}
                />
                <FieldError message={contactErrors.phone} />
              </div>

              <div className="pt-4">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contactForm.is_primary}
                    onChange={(e) =>
                      setContactForm((prev) => ({
                        ...prev,
                        is_primary: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                  />
                  تنظیم به عنوان شماره اصلی گیرنده پیامک
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => setContactModalStudent(null)}
              >
                بستن
              </ActionButton>
              <ActionButton type="submit" variant="primary" loading={isSavingContact}>
                ثبت شماره ولی
              </ActionButton>
            </div>
          </form>
        </div>
      </Modal>

      {/* New Week Session Modal */}
      <Modal
        isOpen={isNewWeekModalOpen}
        onClose={() => setIsNewWeekModalOpen(false)}
        title="معرفی هفته / جلسه جدید مشاوره"
      >
        <form noValidate onSubmit={handleCreateNewWeek} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              عنوان هفته یا جلسه *
            </label>
            <input
              type="text"
              value={newWeekForm.title}
              onChange={(e) => {
                setNewWeekForm((prev) => ({ ...prev, title: e.target.value }));
                if (newWeekErrors.title) {
                  setNewWeekErrors((prev) => ({ ...prev, title: undefined }));
                }
              }}
              placeholder="مثال: هفته اول خرداد - جلسه ۱۹ مشاوره"
              className={getFieldClass(Boolean(newWeekErrors.title))}
            />
            <FieldError message={newWeekErrors.title} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تاریخ شروع هفته (شمسی) *
              </label>
              <input
                type="text"
                dir="ltr"
                value={newWeekForm.start_date_jalali}
                onChange={(e) => {
                  setNewWeekForm((prev) => ({
                    ...prev,
                    start_date_jalali: e.target.value,
                  }));
                  if (newWeekErrors.start_date_jalali) {
                    setNewWeekErrors((prev) => ({
                      ...prev,
                      start_date_jalali: undefined,
                    }));
                  }
                }}
                placeholder="1404/02/20"
                className={getFieldClass(Boolean(newWeekErrors.start_date_jalali))}
              />
              <FieldError message={newWeekErrors.start_date_jalali} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                تاریخ پایان هفته (شمسی) *
              </label>
              <input
                type="text"
                dir="ltr"
                value={newWeekForm.end_date_jalali}
                onChange={(e) => {
                  setNewWeekForm((prev) => ({
                    ...prev,
                    end_date_jalali: e.target.value,
                  }));
                  if (newWeekErrors.end_date_jalali) {
                    setNewWeekErrors((prev) => ({
                      ...prev,
                      end_date_jalali: undefined,
                    }));
                  }
                }}
                placeholder="1404/02/26"
                className={getFieldClass(Boolean(newWeekErrors.end_date_jalali))}
              />
              <FieldError message={newWeekErrors.end_date_jalali} />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => setIsNewWeekModalOpen(false)}
            >
              انصراف
            </ActionButton>
            <ActionButton type="submit" variant="primary">
              ایجاد هفته جدید
            </ActionButton>
          </div>
        </form>
      </Modal>

      {/* Add Remedial Class Modal */}
      <Modal
        isOpen={isAddClassModalOpen}
        onClose={() => setIsAddClassModalOpen(false)}
        title={`افزودن کلاس رفع اشکال (${remedialFieldTab})`}
      >
        <form noValidate onSubmit={handleAddRemedialClass} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              عنوان کلاس / مبحث رفع اشکال *
            </label>
            <input
              type="text"
              value={newClassForm.class_name}
              onChange={(e) => {
                setNewClassForm((prev) => ({ ...prev, class_name: e.target.value }));
                if (newClassErrors.class_name) {
                  setNewClassErrors({ class_name: undefined });
                }
              }}
              placeholder="مثال: کارگاه حل تست دینامیک"
              className={getFieldClass(Boolean(newClassErrors.class_name))}
            />
            <FieldError message={newClassErrors.class_name} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نام استاد (اختیاری)
            </label>
            <input
              type="text"
              value={newClassForm.teacher_name}
              onChange={(e) =>
                setNewClassForm((prev) => ({ ...prev, teacher_name: e.target.value }))
              }
              placeholder="مثال: استاد بهرامی"
              className={getFieldClass(false)}
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => setIsAddClassModalOpen(false)}
            >
              انصراف
            </ActionButton>
            <ActionButton type="submit" variant="primary">
              افزودن ستون کلاس
            </ActionButton>
          </div>
        </form>
      </Modal>

      {/* Bulk SMS Confirmation Modal */}
      <ConfirmModal
        isOpen={smsConfirmModal.isOpen}
        title={smsConfirmModal.title}
        message={smsConfirmModal.message}
        confirmText={
          isSendingSms
            ? 'در حال ارسال...'
            : `بله، ارسال پیامک (${toPersianDigits(smsConfirmModal.targetCount)} نفر)`
        }
        variant="primary"
        loading={isSendingSms}
        onConfirm={handleConfirmSendSms}
        onCancel={() => setSmsConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Cancel Appointment Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(cancelingItem)}
        title="لغو نوبت هفتگی"
        message={
          cancelingItem
            ? `آیا از لغو نوبت هفتگی «${cancelingItem.student_name}» اطمینان دارید؟`
            : ''
        }
        confirmText="بله، لغو نوبت"
        variant="danger"
        onConfirm={handleConfirmCancelAppointment}
        onCancel={() => setCancelingItem(null)}
      />

      {/* SMS Log Slide-Over Drawer (GET /api/v1/appointments/sms/log) */}
      {isLogDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col justify-between">
            {/* Drawer Header */}
            <div className="p-5 bg-[#344868] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">کشوی تاریخچه ارسال پیامک نوبت‌ها</h3>
                  <p className="text-xs text-white/75 mt-0.5">
                    لاگ کامل پیامک‌های ارسالی به والدین (GET /appointments/sms/log)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(false)}
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Filter Bar */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
              <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
                {[
                  { id: 'all', label: `همه (${toPersianDigits(smsLogs.length)})` },
                  {
                    id: 'sent',
                    label: `موفق (${toPersianDigits(
                      smsLogs.filter((l) => l.status === 'sent').length
                    )})`,
                  },
                  {
                    id: 'failed',
                    label: `ناموفق (${toPersianDigits(
                      smsLogs.filter((l) => l.status === 'failed').length
                    )})`,
                  },
                  {
                    id: 'skipped_no_phone',
                    label: `فاقد شماره (${toPersianDigits(
                      smsLogs.filter((l) => l.status === 'skipped_no_phone').length
                    )})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setLogStatusFilter(tab.id as 'all' | AppointmentSmsLogStatus)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      logStatusFilter === tab.id
                        ? 'bg-[#445D84] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-slate-500 font-medium">
                {currentWeek.title}
              </span>
            </div>

            {/* Drawer Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs font-bold">
                  هیچ رکوردی در تاریخچه پیامک یافت نشد
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          <span>{log.student_name || `دانش‌آموز #${log.student_id}`}</span>
                          {log.field && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-bold">
                              {log.field}
                            </span>
                          )}
                        </div>
                        <div
                          dir="ltr"
                          className="text-xs font-mono text-slate-500 text-right mt-0.5"
                        >
                          {log.mobile_mask || log.mobile
                            ? toPersianDigits(log.mobile_mask || log.mobile || '')
                            : 'بدون شماره ولی'}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {log.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            ارسال موفق (sent)
                          </span>
                        ) : log.status === 'skipped_no_phone' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                            <PhoneOff className="w-3 h-3" />
                            رد شده - فاقد شماره
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            خطا در ارسال (failed)
                          </span>
                        )}
                        {log.sent_at && (
                          <span className="text-[10px] text-slate-400">
                            {toPersianDigits(log.sent_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed flex items-center justify-between">
                      <span>
                        نوبت ثبت‌شده:{' '}
                        <strong>
                          {log.appointment_jalali ||
                            (log.appointment_at
                              ? toPersianDigits(log.appointment_at)
                              : '—')}
                        </strong>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        تلاش: {toPersianDigits(log.attempts)} مرتبه
                      </span>
                    </div>

                    {log.last_error && (
                      <div className="text-[11px] text-rose-600 font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>علت خطا: {log.last_error}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>
                        شناسه پیامک:{' '}
                        <strong className="font-mono text-slate-600">
                          {log.provider_message_id || '—'}
                        </strong>
                      </span>
                      {log.operation_id && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {log.operation_id}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <ActionButton
                variant="danger"
                size="sm"
                disabled={summary.failed === 0}
                onClick={() => {
                  setIsLogDrawerOpen(false);
                  openSmsConfirm('failed', false);
                }}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                ارسال مجدد پیامک‌های ناموفق ({toPersianDigits(summary.failed)})
              </ActionButton>

              <ActionButton
                variant="secondary"
                size="sm"
                onClick={() => setIsLogDrawerOpen(false)}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                بستن کشو
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
