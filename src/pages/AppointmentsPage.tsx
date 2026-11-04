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
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
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
  LogIn,
  LogOut,
  RotateCcw,
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
  RemedialAttendanceState,
  RemedialClassColumn,
  RemedialStudentAttendance,
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

function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return getTodayGregorianIso();
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getSaturdayOfWeek(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return getTodayGregorianIso();
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  // JS getUTCDay(): 0 = Sun, 6 = Sat -> offset since Saturday is (day + 1) % 7
  const diffFromSaturday = (d.getUTCDay() + 1) % 7;
  d.setUTCDate(d.getUTCDate() - diffFromSaturday);
  return d.toISOString().slice(0, 10);
}

function buildWeekSession(weekStartIso: string, id: number, customTitle?: string): WeeklySessionInfo {
  const satIso = getSaturdayOfWeek(weekStartIso);
  const friIso = addDaysIso(satIso, 6);
  const startJalali = formatGregorianToJalali(satIso);
  const endJalali = formatGregorianToJalali(friIso);
  return {
    id,
    title: customTitle || `هفته ${toPersianDigits(startJalali)} تا ${toPersianDigits(endJalali)}`,
    week_date: satIso,
    start_date_jalali: startJalali,
    end_date_jalali: endJalali,
  };
}

export const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ showToast }) => {
  const initialSatIso = useMemo(() => getSaturdayOfWeek(getTodayGregorianIso()), []);

  // Navigation & Week Selection (computed dynamically from current date, zero fake data)
  const [activeTab, setActiveTab] = useState<MainTab>('appointments');
  const [weeks, setWeeks] = useState<WeeklySessionInfo[]>(() => [
    buildWeekSession(initialSatIso, 1, 'هفته جاری'),
  ]);
  const [selectedWeekId, setSelectedWeekId] = useState<number>(1);

  // Backend Data State (starts empty, populated strictly from API)
  const [items, setItems] = useState<AppointmentSmsPreviewItem[]>([]);
  const [serverSummary, setServerSummary] = useState<AppointmentSmsPreviewSummary | null>(null);
  const [smsLogs, setSmsLogs] = useState<AppointmentSmsLogItem[]>([]);
  const [parentContactsMap, setParentContactsMap] = useState<
    Record<number, ParentContactRecord[]>
  >({});
  const [remedialClasses, setRemedialClasses] = useState<RemedialClassColumn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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

  // Edit / Create Appointment Modal State (no end_time)
  const [editingItem, setEditingItem] = useState<AppointmentSmsPreviewItem | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    appointment_date: '',
    start_time: '',
    arrival_time: '',
    exam_start_time: '',
    exam_end_time: '',
    appointment_status: 'scheduled' as AppointmentStatus,
    description: '',
  });
  const [appointmentErrors, setAppointmentErrors] = useState<
    FieldErrors<'appointment_date' | 'start_time'>
  >({});
  const [isSavingAppointment, setIsSavingAppointment] = useState<boolean>(false);

  // Cancel Appointment Confirm State
  const [cancelingItem, setCancelingItem] = useState<AppointmentSmsPreviewItem | null>(null);

  // Parent Contacts Modal State (/api/v1/students/{studentId}/parent-contacts)
  const [contactModalStudent, setContactModalStudent] =
    useState<AppointmentSmsPreviewItem | null>(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(false);
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
    week_date: initialSatIso,
    start_date_jalali: formatGregorianToJalali(initialSatIso),
    end_date_jalali: formatGregorianToJalali(addDaysIso(initialSatIso, 6)),
  });
  const [newWeekErrors, setNewWeekErrors] = useState<
    FieldErrors<'title' | 'start_date_jalali' | 'end_date_jalali'>
  >({});

  // Remedial Matrix State
  const [remedialFieldTab, setRemedialFieldTab] = useState<AcademicField>('تجربی');
  const [remedialStatusFilter, setRemedialStatusFilter] = useState<
    'all' | RemedialAttendanceState
  >('all');
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

  // Fetch preview & logs strictly from backend API
  const fetchWeekData = useCallback(
    async (weekDate: string, showRefreshToast = false) => {
      setIsLoading(true);
      setErrorState(null);
      try {
        const [previewRes, logRes] = await Promise.allSettled([
          API.getAppointmentsSmsPreview(weekDate),
          API.getAppointmentsSmsLog({ week_date: weekDate, per_page: 50 }),
        ]);

        if (previewRes.status === 'fulfilled') {
          const data = previewRes.value.data;
          setItems(data?.items || []);
          setServerSummary(data?.summary || null);

          if (data?.week_start) {
            const startJalali =
              data.week_start_jalali || formatGregorianToJalali(data.week_start);
            const endJalali =
              data.week_end_jalali ||
              formatGregorianToJalali(data.week_end || addDaysIso(data.week_start, 6));
            setWeeks((prev) =>
              prev.map((w) =>
                w.week_date === weekDate
                  ? {
                      ...w,
                      start_date_jalali: startJalali,
                      end_date_jalali: endJalali,
                    }
                  : w
              )
            );
          }
        } else {
          setItems([]);
          setServerSummary(null);
          const errMsg =
            (previewRes.reason as Error)?.message ||
            'خطا در دریافت لیست نوبت‌های هفتگی از سرور';
          setErrorState(errMsg);
          showToast(errMsg, 'error');
        }

        if (logRes.status === 'fulfilled') {
          setSmsLogs(logRes.value.data?.items || []);
        } else {
          setSmsLogs([]);
        }

        if (showRefreshToast && previewRes.status === 'fulfilled') {
          showToast('اطلاعات نوبت‌ها و وضعیت پیامک‌ها از سرور بروزرسانی شد', 'info');
        }
      } catch (err) {
        const errMsg =
          (err as Error)?.message || 'خطا در برقراری ارتباط با سرور';
        setItems([]);
        setServerSummary(null);
        setSmsLogs([]);
        setErrorState(errMsg);
        showToast(errMsg, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchWeekData(currentWeek.week_date, false);
  }, [currentWeek.week_date, fetchWeekData]);

  // Navigate to previous / next week dynamically
  const handleShiftWeek = (deltaDays: number) => {
    const targetSat = getSaturdayOfWeek(addDaysIso(currentWeek.week_date, deltaDays));
    const existing = weeks.find((w) => w.week_date === targetSat);
    if (existing) {
      setSelectedWeekId(existing.id);
      return;
    }
    const newId = Date.now();
    const created = buildWeekSession(targetSat, newId);
    setWeeks((prev) => [created, ...prev]);
    setSelectedWeekId(newId);
  };

  // Summary counts matching AppointmentSmsPreviewSummary
  const summary: AppointmentSmsPreviewSummary & { total: number } = useMemo(() => {
    if (serverSummary && items.length === 0) {
      const totalVal = serverSummary.total ?? serverSummary.total_students ?? 0;
      return {
        total: totalVal,
        total_students: totalVal,
        will_send: serverSummary.will_send ?? 0,
        already_sent: serverSummary.already_sent ?? 0,
        changed_since_sent: serverSummary.changed_since_sent ?? 0,
        failed: serverSummary.failed ?? 0,
        no_phone: serverSummary.no_phone ?? 0,
        no_appointment: serverSummary.no_appointment ?? 0,
        multiple_appointments: serverSummary.multiple_appointments ?? 0,
      };
    }

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
  }, [items, serverSummary]);

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
      return `${dayName} ${toPersianDigits(jalali)}`;
    }
    return '—';
  };

  const formatAppointmentStartTime = (item: AppointmentSmsPreviewItem) => {
    const start = (item.time_fa || item.start_time || '').slice(0, 5);
    if (!start) return '—';
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
      const res = await API.sendAppointmentsSms({
        week_date: currentWeek.week_date,
        mode,
        student_ids: subsetIds,
        operation_id: operationId,
      });

      const sentCount = res.data?.summary?.sent ?? 0;
      const failedCount = res.data?.summary?.failed ?? 0;
      setSelectedStudentIds([]);
      setSmsConfirmModal((prev) => ({ ...prev, isOpen: false }));
      await fetchWeekData(currentWeek.week_date, false);

      if (failedCount > 0 && sentCount === 0) {
        showToast(
          `ارسال پیامک برای ${toPersianDigits(failedCount)} نفر با خطا مواجه شد`,
          'error'
        );
      } else {
        showToast(
          `پیامک یادآوری نوبت برای ${toPersianDigits(sentCount)} ولی ارسال شد`,
          'success'
        );
      }
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ارسال پیامک نوبت‌ها', 'error');
    } finally {
      setIsSendingSms(false);
    }
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
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`پیامک نوبت برای ولی «${item.student_name}» ارسال شد`, 'success');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ارسال پیامک به ولی دانش‌آموز', 'error');
    }
  };

  // Edit / Create Appointment Modal (no end_time)
  const openEditAppointment = (item: AppointmentSmsPreviewItem) => {
    setEditingItem(item);
    const defaultStart = (item.start_time || '10:00').slice(0, 5);
    setAppointmentForm({
      appointment_date: item.appointment_date || currentWeek.week_date,
      start_time: defaultStart,
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
    });
    setAppointmentErrors(errors);
    if (hasErrors(errors)) return;

    setIsSavingAppointment(true);
    try {
      await API.upsertAppointment({
        id: editingItem.appointment_id,
        student_id: editingItem.student_id,
        appointment_date: appointmentForm.appointment_date,
        start_time: appointmentForm.start_time.trim().slice(0, 5),
        status: appointmentForm.appointment_status,
        description: appointmentForm.description.trim() || null,
      });

      setEditingItem(null);
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`نوبت «${editingItem.student_name}» با موفقیت در سرور ذخیره شد`, 'success');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ذخیره نوبت در سرور', 'error');
    } finally {
      setIsSavingAppointment(false);
    }
  };

  // Change Appointment Status (PUT /api/v1/appointments/{id}/status)
  const handleStatusChange = async (
    item: AppointmentSmsPreviewItem,
    newStatus: AppointmentStatus
  ) => {
    if (!item.appointment_id) return;
    try {
      await API.updateAppointmentStatus(item.appointment_id, newStatus);
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`وضعیت نوبت «${item.student_name}» بروزرسانی شد`, 'info');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در تغییر وضعیت نوبت', 'error');
    }
  };

  // Cancel / Delete Appointment (DELETE /api/v1/appointments/{id})
  const handleConfirmCancelAppointment = async () => {
    if (!cancelingItem || !cancelingItem.appointment_id) {
      setCancelingItem(null);
      return;
    }
    try {
      await API.deleteAppointment(cancelingItem.appointment_id);
      const studentName = cancelingItem.student_name;
      setCancelingItem(null);
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`نوبت «${studentName}» لغو و حذف شد`, 'info');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در لغو نوبت', 'error');
    }
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
    setIsLoadingContacts(true);

    try {
      const res = await API.getParentContacts(item.student_id);
      setParentContactsMap((prev) => ({
        ...prev,
        [item.student_id]: res.data || [],
      }));
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در دریافت شماره‌های والدین از سرور', 'error');
    } finally {
      setIsLoadingContacts(false);
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

    try {
      await API.createParentContact(studentId, {
        parent_name: contactForm.parent_name.trim(),
        relationship: contactForm.relationship,
        phone: contactForm.phone.trim(),
        is_primary: contactForm.is_primary,
      });

      const updatedContactsRes = await API.getParentContacts(studentId);
      setParentContactsMap((prev) => ({
        ...prev,
        [studentId]: updatedContactsRes.data || [],
      }));

      setContactForm({
        parent_name: '',
        relationship: 'father',
        phone: '',
        is_primary: false,
      });

      await fetchWeekData(currentWeek.week_date, false);
      showToast(
        `شماره تماس ولی برای «${contactModalStudent.student_name}» در سرور ثبت شد`,
        'success'
      );
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ثبت شماره تماس ولی', 'error');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleDeleteParentContact = async (contactId: number) => {
    if (!contactModalStudent) return;
    const studentId = contactModalStudent.student_id;

    try {
      await API.deleteParentContact(studentId, contactId);
      const updatedContactsRes = await API.getParentContacts(studentId);
      setParentContactsMap((prev) => ({
        ...prev,
        [studentId]: updatedContactsRes.data || [],
      }));
      await fetchWeekData(currentWeek.week_date, false);
      showToast('شماره تماس ولی حذف شد', 'info');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در حذف شماره تماس ولی', 'error');
    }
  };

  const handleCreateNewWeek = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateWeekSessionForm(newWeekForm);
    setNewWeekErrors(errors);
    if (hasErrors(errors)) return;

    const satIso = getSaturdayOfWeek(newWeekForm.week_date || getTodayGregorianIso());
    const newId = Date.now();
    const created: WeeklySessionInfo = {
      id: newId,
      title: newWeekForm.title.trim(),
      week_date: satIso,
      start_date_jalali: newWeekForm.start_date_jalali.trim(),
      end_date_jalali: newWeekForm.end_date_jalali.trim(),
    };
    setWeeks((prev) => [created, ...prev]);
    setSelectedWeekId(newId);
    setIsNewWeekModalOpen(false);
    showToast(`«${created.title}» انتخاب شد`, 'success');
  };

  // Remedial Matrix Handlers (3-state: 'none' -> 'in_class' -> 'left_class')
  const getStudentClassAttendance = useCallback(
    (col: RemedialClassColumn, studentId: number): RemedialStudentAttendance => {
      if (col.student_states && col.student_states[studentId]) {
        return col.student_states[studentId];
      }
      if (col.attendees.includes(studentId)) {
        return { status: 'in_class' };
      }
      return { status: 'none' };
    },
    []
  );

  const getCurrentTimeHm = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const updateRemedialAttendance = (
    classId: number,
    studentId: number,
    nextStatus: RemedialAttendanceState
  ) => {
    const nowHm = getCurrentTimeHm();
    const targetClass = remedialClasses.find((c) => c.id === classId);
    const targetStudent = items.find((s) => s.student_id === studentId);

    setRemedialClasses((prev) =>
      prev.map((col) => {
        if (col.id !== classId) return col;
        const prevStates = { ...(col.student_states || {}) };
        const current = getStudentClassAttendance(col, studentId);

        if (nextStatus === 'none') {
          delete prevStates[studentId];
          return {
            ...col,
            attendees: col.attendees.filter((id) => id !== studentId),
            student_states: prevStates,
          };
        }

        if (nextStatus === 'in_class') {
          prevStates[studentId] = {
            status: 'in_class',
            entered_at: current.entered_at || nowHm,
          };
          const attendees = col.attendees.includes(studentId)
            ? col.attendees
            : [...col.attendees, studentId];
          return {
            ...col,
            attendees,
            student_states: prevStates,
          };
        }

        // nextStatus === 'left_class'
        prevStates[studentId] = {
          status: 'left_class',
          entered_at: current.entered_at || nowHm,
          exited_at: nowHm,
        };
        const attendees = col.attendees.includes(studentId)
          ? col.attendees
          : [...col.attendees, studentId];
        return {
          ...col,
          attendees,
          student_states: prevStates,
        };
      })
    );

    if (targetStudent && targetClass) {
      if (nextStatus === 'in_class') {
        showToast(
          `ورود «${targetStudent.student_name}» به کلاس «${targetClass.class_name}» ثبت شد (${toPersianDigits(nowHm)})`,
          'success'
        );
      } else if (nextStatus === 'left_class') {
        showToast(
          `خروج «${targetStudent.student_name}» از کلاس «${targetClass.class_name}» ثبت شد (${toPersianDigits(nowHm)})`,
          'info'
        );
      } else {
        showToast(
          `وضعیت حضور «${targetStudent.student_name}» در «${targetClass.class_name}» بازنشانی شد`,
          'warning'
        );
      }
    }
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
      student_states: {},
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

  const allFieldStudents = useMemo(
    () => items.filter((s) => s.field === remedialFieldTab),
    [items, remedialFieldTab]
  );

  const remedialFieldStats = useMemo(() => {
    let inClassStudentsCount = 0;
    let leftClassStudentsCount = 0;
    let notEnteredStudentsCount = 0;
    let totalInClassSessions = 0;
    let totalLeftClassSessions = 0;

    for (const st of allFieldStudents) {
      const states = currentFieldRemedialClasses.map(
        (col) => getStudentClassAttendance(col, st.student_id).status
      );
      const hasInClass = states.includes('in_class');
      const hasLeftClass = states.includes('left_class');
      if (hasInClass) inClassStudentsCount += 1;
      if (hasLeftClass) leftClassStudentsCount += 1;
      if (!hasInClass && !hasLeftClass) notEnteredStudentsCount += 1;

      totalInClassSessions += states.filter((s) => s === 'in_class').length;
      totalLeftClassSessions += states.filter((s) => s === 'left_class').length;
    }

    return {
      totalStudents: allFieldStudents.length,
      inClassStudentsCount,
      leftClassStudentsCount,
      notEnteredStudentsCount,
      totalInClassSessions,
      totalLeftClassSessions,
    };
  }, [allFieldStudents, currentFieldRemedialClasses, getStudentClassAttendance]);

  const currentFieldStudents = useMemo(() => {
    if (remedialStatusFilter === 'all') return allFieldStudents;
    return allFieldStudents.filter((st) => {
      const states = currentFieldRemedialClasses.map(
        (col) => getStudentClassAttendance(col, st.student_id).status
      );
      if (remedialStatusFilter === 'in_class') {
        return states.includes('in_class');
      }
      if (remedialStatusFilter === 'left_class') {
        return states.includes('left_class');
      }
      return states.every((s) => s === 'none');
    });
  }, [
    allFieldStudents,
    remedialStatusFilter,
    currentFieldRemedialClasses,
    getStudentClassAttendance,
  ]);

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
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => handleShiftWeek(-7)}
              icon={<ChevronRight className="w-4 h-4" />}
              title="هفته قبل"
            >
              هفته قبل
            </ActionButton>

            <div className="relative min-w-[230px]">
              <select
                value={selectedWeekId}
                onChange={(e) => setSelectedWeekId(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#445D84]/25 focus:border-[#445D84]"
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
              size="sm"
              onClick={() => handleShiftWeek(7)}
              icon={<ChevronLeft className="w-4 h-4" />}
              title="هفته بعد"
            >
              هفته بعد
            </ActionButton>

            <ActionButton
              variant="secondary"
              size="md"
              onClick={() => {
                const nextSat = addDaysIso(currentWeek.week_date, 7);
                setNewWeekForm({
                  title: '',
                  week_date: nextSat,
                  start_date_jalali: formatGregorianToJalali(nextSat),
                  end_date_jalali: formatGregorianToJalali(addDaysIso(nextSat, 6)),
                });
                setNewWeekErrors({});
                setIsNewWeekModalOpen(true);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              انتخاب هفته دلخواه
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
              بروزرسانی از سرور
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
                <div className="flex items-center gap-2">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchWeekData(currentWeek.week_date, true)}
                  >
                    تلاش مجدد
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    size="sm"
                    onClick={() => setErrorState(null)}
                  >
                    بستن
                  </ActionButton>
                </div>
              </div>
            )}

            {/* Appointments Table */}
            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-[#445D84]" />
                <p className="text-sm font-bold">در حال دریافت پیش‌نمایش نوبت‌ها و وضعیت پیامک از سرور...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">
                  {items.length === 0
                    ? 'هیچ رکوردی برای این هفته در سرور ثبت نشده است'
                    : 'هیچ دانش‌آموزی با فیلترهای انتخابی یافت نشد'}
                </p>
                <p className="text-xs text-slate-500">
                  {items.length === 0
                    ? 'می‌توانید هفته دیگری را انتخاب کنید یا دکمه بروزرسانی از سرور را بزنید.'
                    : 'فیلترهای بالا را تغییر دهید یا عبارت جستجو را پاک کنید.'}
                </p>
                {items.length > 0 && (
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
                )}
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

                          {/* Appointment Date & Start Time */}
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
                                    ساعت {formatAppointmentStartTime(item)}
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
        /* Remedial Classes Matrix View (with 3-state attendance lifecycle) */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#445D84]" />
                ماتریس حضور و خروج در کلاس‌های رفع اشکال هفتگی
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                برای هر کلاس ۳ وضعیت تفکیک شده است: «ثبت ورود به کلاس»، «حاضر در کلاس (مشغول)» و «خارج شده از کلاس (پایان حضور)» همراه با ثبت خودکار ساعت ورود و خروج.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                {(['تجربی', 'ریاضی', 'انسانی'] as AcademicField[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setRemedialFieldTab(f);
                      setRemedialStatusFilter('all');
                    }}
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

          {/* 3-State Filter Chips & Lifecycle Legend */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/70">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRemedialStatusFilter('all')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'all'
                    ? 'bg-[#445D84] text-white border-[#445D84] shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>همه دانش‌آموزان ({remedialFieldTab})</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    remedialStatusFilter === 'all'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {toPersianDigits(remedialFieldStats.totalStudents)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRemedialStatusFilter('in_class')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'in_class'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50/60'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>هم‌اکنون داخل کلاس (حاضر)</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    remedialStatusFilter === 'in_class'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {toPersianDigits(remedialFieldStats.inClassStudentsCount)} نفر
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRemedialStatusFilter('left_class')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'left_class'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50/60'
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خارج شده از کلاس (پایان حضور)</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    remedialStatusFilter === 'left_class'
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-50 text-indigo-700'
                  }`}
                >
                  {toPersianDigits(remedialFieldStats.leftClassStudentsCount)} نفر
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRemedialStatusFilter('none')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'none'
                    ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>وارد نشده به کلاس</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    remedialStatusFilter === 'none'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {toPersianDigits(remedialFieldStats.notEnteredStudentsCount)} نفر
                </span>
              </button>
            </div>

            {/* Visual 3-Step Guide */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-bold text-slate-700">چرخه وضعیت:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-600 font-medium">
                ۱. ثبت ورود
              </span>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                ۲. حاضر در کلاس
              </span>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                ۳. خارج شده از کلاس
              </span>
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
          ) : currentFieldStudents.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <p className="text-sm font-bold text-slate-700">
                دانش‌آموزی با این وضعیت در رشته {remedialFieldTab} یافت نشد
              </p>
              {remedialStatusFilter !== 'all' && (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setRemedialStatusFilter('all')}
                >
                  نمایش همه دانش‌آموزان رشته {remedialFieldTab}
                </ActionButton>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#344868] text-white text-xs">
                    <th className="py-3.5 px-4 font-bold min-w-[190px]">
                      نام دانش‌آموز ({remedialFieldTab})
                    </th>
                    <th className="py-3.5 px-3 font-bold min-w-[155px]">
                      نوبت و ساعت حضور
                    </th>
                    {currentFieldRemedialClasses.map((col) => {
                      const inClassCount = allFieldStudents.filter(
                        (s) =>
                          getStudentClassAttendance(col, s.student_id).status === 'in_class'
                      ).length;
                      const leftClassCount = allFieldStudents.filter(
                        (s) =>
                          getStudentClassAttendance(col, s.student_id).status === 'left_class'
                      ).length;
                      return (
                        <th
                          key={col.id}
                          className="py-3.5 px-4 font-bold text-center min-w-[210px] border-r border-white/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{col.class_name}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteRemedialClass(col.id)}
                              className="text-white/60 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
                              title="حذف ستون کلاس"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {col.teacher_name && (
                            <div className="text-[10px] text-white/75 font-normal mt-0.5 text-right">
                              {col.teacher_name}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-100 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                              حاضر: {toPersianDigits(inClassCount)}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-400/25 text-indigo-100 text-[10px] font-bold">
                              خارج‌شده: {toPersianDigits(leftClassCount)}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {currentFieldStudents.map((student) => {
                    const studentStates = currentFieldRemedialClasses.map((c) =>
                      getStudentClassAttendance(c, student.student_id)
                    );
                    const studentInCount = studentStates.filter(
                      (s) => s.status === 'in_class'
                    ).length;
                    const studentLeftCount = studentStates.filter(
                      (s) => s.status === 'left_class'
                    ).length;

                    return (
                      <tr key={student.student_id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800">
                            {student.student_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[11px] text-slate-400">
                              پایه {toPersianDigits(student.grade || 12)}
                            </span>
                            {studentInCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                {toPersianDigits(studentInCount)} کلاس در حال حضور
                              </span>
                            )}
                            {studentLeftCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                {toPersianDigits(studentLeftCount)} کلاس خارج شده
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-600">
                          {student.appointment_date ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-700">
                                {formatAppointmentDisplayDate(student)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                ساعت نوبت: {formatAppointmentStartTime(student)}
                              </div>
                              {student.arrival_time && (
                                <div className="text-[10px] text-emerald-700 font-medium">
                                  ورود به آموزشگاه: {toPersianDigits(student.arrival_time)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">بدون نوبت</span>
                          )}
                        </td>
                        {currentFieldRemedialClasses.map((col) => {
                          const att = getStudentClassAttendance(col, student.student_id);
                          return (
                            <td
                              key={col.id}
                              className="py-3 px-3 text-center border-r border-slate-100 align-middle"
                            >
                              {att.status === 'none' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateRemedialAttendance(
                                      col.id,
                                      student.student_id,
                                      'in_class'
                                    )
                                  }
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700 font-bold text-xs transition-all cursor-pointer w-full max-w-[185px]"
                                >
                                  <LogIn className="w-3.5 h-3.5" />
                                  <span>ثبت ورود به کلاس</span>
                                </button>
                              )}

                              {att.status === 'in_class' && (
                                <div className="inline-flex flex-col items-stretch gap-1.5 p-2 rounded-xl bg-emerald-50/90 border border-emerald-200 shadow-2xs w-full max-w-[195px]">
                                  <div className="flex items-center justify-between gap-1 px-1">
                                    <span className="inline-flex items-center gap-1.5 text-emerald-800 font-black text-[11px]">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                      حاضر در کلاس
                                    </span>
                                    {att.entered_at && (
                                      <span className="text-[10px] font-bold text-emerald-700 bg-white/80 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                                        ورود {toPersianDigits(att.entered_at)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'left_class'
                                        )
                                      }
                                      className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                                      title="وقتی دانش‌آموز از کلاس خارج شد کلیک کنید تا ساعت خروج ثبت شود"
                                    >
                                      <LogOut className="w-3 h-3" />
                                      ثبت خروج از کلاس
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'none'
                                        )
                                      }
                                      className="p-1.5 rounded-lg bg-white/80 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-emerald-200/70 transition-colors cursor-pointer"
                                      title="لغو ورود / بازنشانی وضعیت"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {att.status === 'left_class' && (
                                <div className="inline-flex flex-col items-stretch gap-1.5 p-2 rounded-xl bg-indigo-50/80 border border-indigo-200 shadow-2xs w-full max-w-[195px]">
                                  <div className="flex items-center justify-between gap-1 px-1">
                                    <span className="inline-flex items-center gap-1 text-indigo-800 font-black text-[11px]">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                      خارج شده از کلاس
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'none'
                                        )
                                      }
                                      className="p-1 rounded-md hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                      title="پاک کردن وضعیت حضور"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-center gap-1.5 bg-white/90 px-2 py-1 rounded-lg border border-indigo-100 text-[10px] font-bold text-indigo-900">
                                    <span>
                                      ورود: {toPersianDigits(att.entered_at || '—')}
                                    </span>
                                    <span className="text-indigo-300">•</span>
                                    <span className="text-indigo-700">
                                      خروج: {toPersianDigits(att.exited_at || '—')}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRemedialAttendance(
                                        col.id,
                                        student.student_id,
                                        'in_class'
                                      )
                                    }
                                    className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-indigo-200/80 text-[10px] font-bold transition-colors cursor-pointer"
                                    title="برگرداندن وضعیت به حاضر در کلاس"
                                  >
                                    <UserCheck className="w-3 h-3" />
                                    برگشت به کلاس
                                  </button>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Appointment Modal (without end_time) */}
      <Modal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={
          editingItem
            ? `تنظیم نوبت و ساعات حضور: ${editingItem.student_name}`
            : 'ثبت / ویرایش نوبت'
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  معادل شمسی: {toPersianDigits(formatGregorianToJalali(appointmentForm.appointment_date))}
                </p>
              )}
              <FieldError message={appointmentErrors.appointment_date} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ساعت شروع نوبت (HH:MM) *
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
            {isLoadingContacts ? (
              <div className="p-5 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#445D84]" />
                <span>در حال دریافت شماره‌های والدین از سرور...</span>
              </div>
            ) : contactModalStudent &&
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
                هیچ شماره تماسی برای والدین این دانش‌آموز در سرور ثبت نشده است.
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

      {/* Select / Add Week Session Modal */}
      <Modal
        isOpen={isNewWeekModalOpen}
        onClose={() => setIsNewWeekModalOpen(false)}
        title="انتخاب یا معرفی هفته مشاوره"
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
              placeholder="مثال: هفته اول خرداد - جلسه مشاوره"
              className={getFieldClass(Boolean(newWeekErrors.title))}
            />
            <FieldError message={newWeekErrors.title} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              انتخاب تاریخ در هفته مورد نظر (میلادی)
            </label>
            <input
              type="date"
              value={newWeekForm.week_date}
              onChange={(e) => {
                const picked = e.target.value;
                const sat = getSaturdayOfWeek(picked);
                const fri = addDaysIso(sat, 6);
                setNewWeekForm((prev) => ({
                  ...prev,
                  week_date: sat,
                  start_date_jalali: formatGregorianToJalali(sat),
                  end_date_jalali: formatGregorianToJalali(fri),
                }));
              }}
              className={getFieldClass(false)}
            />
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
              مشاهده و بارگذاری هفته
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
                  هیچ رکوردی در تاریخچه پیامک این هفته یافت نشد
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
