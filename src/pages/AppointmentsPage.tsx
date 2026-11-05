import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Trash2,
  Search,
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
  UserPlus,
  Star,
  LogIn,
  LogOut,
  RotateCcw,
  Check,
  ClipboardList,
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
  AttendanceEntry,
  AttendanceTimestampField,
  TutoringBoardClass,
  TeacherTutoringStatus,
} from '../types';
import { API } from '../lib/api';
import {
  formatGregorianToJalali,
  getTodayGregorianIso,
  toPersianDigits,
} from '../lib/jalali';
import {
  validateAppointmentForm,
  validateParentContactForm,
  validateWeekSessionForm,
  validateRemedialClassForm,
  hasErrors,
  type FieldErrors,
} from '../lib/form-validation';
import {
  resolveCardAppointmentStatus,
  formatCardDateLabel,
  formatCardStartTime,
  categorizeBulkSmsSelection,
  buildSmsMessagePreview,
} from '../lib/appointments-logic';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError } from '../components/FormControls';

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

const MOBILE_INPUT_CLASS = (hasError: boolean) =>
  `w-full min-h-[48px] h-12 px-3.5 py-2.5 rounded-xl border-2 text-base transition-colors focus:outline-none ${
    hasError
      ? 'border-rose-500 bg-rose-50/40 text-slate-900 focus:border-rose-600'
      : 'border-slate-200 bg-white text-slate-800 focus:border-[#445D84]'
  }`;

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
  const diffFromSaturday = (d.getUTCDay() + 1) % 7;
  d.setUTCDate(d.getUTCDate() - diffFromSaturday);
  return d.toISOString().slice(0, 10);
}

function buildWeekSession(
  weekStartIso: string,
  id: number,
  customTitle?: string
): WeeklySessionInfo {
  const satIso = getSaturdayOfWeek(weekStartIso);
  const friIso = addDaysIso(satIso, 6);
  const startJalali = formatGregorianToJalali(satIso);
  const endJalali = formatGregorianToJalali(friIso);
  return {
    id,
    title:
      customTitle ||
      `${toPersianDigits(startJalali)} تا ${toPersianDigits(endJalali)}`,
    week_date: satIso,
    start_date_jalali: startJalali,
    end_date_jalali: endJalali,
  };
}

export const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ showToast }) => {
  const initialSatIso = useMemo(() => getSaturdayOfWeek(getTodayGregorianIso()), []);

  // Navigation & Compact Week Selection
  const [activeTab, setActiveTab] = useState<MainTab>('appointments');
  const [weeks, setWeeks] = useState<WeeklySessionInfo[]>(() => [
    buildWeekSession(initialSatIso, 1, 'هفته جاری'),
  ]);
  const [selectedWeekId, setSelectedWeekId] = useState<number>(1);

  // Backend Data State
  const [items, setItems] = useState<AppointmentSmsPreviewItem[]>([]);
  const [serverSummary, setServerSummary] =
    useState<AppointmentSmsPreviewSummary | null>(null);
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

  // Multi-Select State & Long-Press Refs
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef<boolean>(false);

  // SMS Log Drawer State
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState<boolean>(false);
  const [logStatusFilter, setLogStatusFilter] = useState<
    'all' | AppointmentSmsLogStatus
  >('all');

  // Bulk SMS Bottom Sheet State
  const [isSmsSheetOpen, setIsSmsSheetOpen] = useState<boolean>(false);
  const [smsSheetMode, setSmsSheetMode] = useState<AppointmentSmsSendMode>('unsent');
  const [smsSheetCandidateIds, setSmsSheetCandidateIds] = useState<number[]>([]);
  const [smsSheetCheckedIds, setSmsSheetCheckedIds] = useState<number[]>([]);
  const [isSendingSms, setIsSendingSms] = useState<boolean>(false);
  const [lastSendBreakdown, setLastSendBreakdown] = useState<{
    sent: number;
    failed: number;
    skipped: number;
  } | null>(null);

  // Edit / Create Appointment Bottom-Sheet Modal State
  const [editingItem, setEditingItem] = useState<AppointmentSmsPreviewItem | null>(
    null
  );
  const [appointmentForm, setAppointmentForm] = useState({
    appointment_date: '',
    start_time: '',
    arrival_time: '',
    exam_start_time: '',
    exam_end_time: '',
    appointment_status: 'confirmed' as AppointmentStatus,
    description: '',
  });
  const [appointmentErrors, setAppointmentErrors] = useState<
    FieldErrors<'appointment_date' | 'start_time'>
  >({});
  const [isSavingAppointment, setIsSavingAppointment] = useState<boolean>(false);

  // Cancel Appointment Confirm State
  const [cancelingItem, setCancelingItem] = useState<AppointmentSmsPreviewItem | null>(
    null
  );

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
  const [contactErrors, setContactErrors] = useState<
    FieldErrors<'parent_name' | 'phone'>
  >({});
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

  // Remedial Matrix & Daily Attendance State (/api/v1/tutoring* & /api/v1/attendance*)
  const [remedialFieldTab, setRemedialFieldTab] = useState<AcademicField>('تجربی');
  const [remedialStatusFilter, setRemedialStatusFilter] = useState<
    'all' | RemedialAttendanceState
  >('all');
  const [remedialDate, setRemedialDate] = useState<string>(() => getTodayGregorianIso());
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [updatingCellKey, setUpdatingCellKey] = useState<string | null>(null);
  const [updatingTimeKey, setUpdatingTimeKey] = useState<string | null>(null);
  const [teacherStatus, setTeacherStatus] = useState<TeacherTutoringStatus>('ready');
  const [isUpdatingTeacherStatus, setIsUpdatingTeacherStatus] = useState<boolean>(false);
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState<boolean>(false);
  const [newClassForm, setNewClassForm] = useState({
    class_name: '',
    teacher_name: '',
  });
  const [newClassErrors, setNewClassErrors] = useState<FieldErrors<'class_name'>>({});

  // Add Guest Student Modal State (POST /api/v1/attendance/guests)
  const [isAddGuestModalOpen, setIsAddGuestModalOpen] = useState<boolean>(false);
  const [guestForm, setGuestForm] = useState<{
    guest_name: string;
    field: AcademicField;
  }>({
    guest_name: '',
    field: 'تجربی',
  });
  const [guestError, setGuestError] = useState<string | undefined>(undefined);
  const [isSavingGuest, setIsSavingGuest] = useState<boolean>(false);

  const currentWeek = useMemo(
    () => weeks.find((w) => w.id === selectedWeekId) || weeks[0],
    [weeks, selectedWeekId]
  );

  const extractHmFromTimestamp = (ts?: string | null): string | undefined => {
    if (!ts) return undefined;
    const match = String(ts).match(/(\d{2}:\d{2})/);
    return match ? match[1] : undefined;
  };

  // Sync live tutoring board (/api/v1/tutoring/board) & daily attendance (/api/v1/attendance)
  const fetchRemedialAndAttendanceData = useCallback(
    async (targetDate: string) => {
      const [boardRes, attRes] = await Promise.allSettled([
        API.getTutoringBoard(),
        API.getAttendanceBoard({ date: targetDate }),
      ]);

      if (boardRes.status === 'fulfilled') {
        const boardClasses: TutoringBoardClass[] = boardRes.value.data || [];
        setRemedialClasses((prev) => {
          const nextMap = new Map<number, RemedialClassColumn>();
          for (const existing of prev) {
            nextMap.set(existing.id, existing);
          }

          for (const b of boardClasses) {
            const classId = Number(b.classroom_id);
            const prevCol = nextMap.get(classId);
            const prevStates = { ...(prevCol?.student_states || {}) };
            const prevAttendees = new Set<number>(prevCol?.attendees || []);

            if (b.student && b.student.id) {
              const sid = Number(b.student.id);
              prevAttendees.add(sid);
              prevStates[sid] = {
                status: 'in_class',
                entered_at:
                  extractHmFromTimestamp(b.entered_at) ||
                  prevStates[sid]?.entered_at,
                session_id:
                  b.open_session_id ?? prevStates[sid]?.session_id ?? null,
              };
            }

            const resolvedField: AcademicField =
              (b.student?.field as AcademicField) ||
              prevCol?.field ||
              'تجربی';

            nextMap.set(classId, {
              id: classId,
              field: resolvedField,
              class_name: b.classroom_name || prevCol?.class_name || `کلاس #${classId}`,
              teacher_name: b.teacher_name || prevCol?.teacher_name,
              instructor_id: b.instructor_id,
              teacher_status: b.status,
              attendees: Array.from(prevAttendees),
              student_states: prevStates,
            });
          }

          return Array.from(nextMap.values());
        });
      }

      if (attRes.status === 'fulfilled') {
        const entries = attRes.value.data?.entries || [];
        setAttendanceEntries(entries);
        if (entries.length > 0) {
          setItems((prevItems) =>
            prevItems.map((item) => {
              const entry = entries.find((e) => e.student_id === item.student_id);
              if (!entry) return item;
              return {
                ...item,
                arrival_time:
                  extractHmFromTimestamp(entry.arrived_at) ||
                  item.arrival_time ||
                  null,
                exam_start_time:
                  extractHmFromTimestamp(entry.exam_started_at) ||
                  item.exam_start_time ||
                  null,
                exam_end_time:
                  extractHmFromTimestamp(entry.exam_ended_at) ||
                  item.exam_end_time ||
                  null,
              };
            })
          );
        }
      }
    },
    []
  );

  // Fetch preview, logs, tutoring board & daily attendance from backend API
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
              formatGregorianToJalali(
                data.week_end || addDaysIso(data.week_start, 6)
              );
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

        await fetchRemedialAndAttendanceData(remedialDate);

        if (showRefreshToast && previewRes.status === 'fulfilled') {
          showToast('اطلاعات نوبت‌ها و کلاس‌های رفع اشکال از سرور بروزرسانی شد', 'info');
        }
      } catch (err) {
        const errMsg = (err as Error)?.message || 'خطا در برقراری ارتباط با سرور';
        setItems([]);
        setServerSummary(null);
        setSmsLogs([]);
        setErrorState(errMsg);
        showToast(errMsg, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast, fetchRemedialAndAttendanceData, remedialDate]
  );

  useEffect(() => {
    fetchWeekData(currentWeek.week_date, false);
  }, [currentWeek.week_date, fetchWeekData]);

  useEffect(() => {
    if (activeTab === 'remedial') {
      fetchRemedialAndAttendanceData(remedialDate);
    }
  }, [activeTab, remedialDate, fetchRemedialAndAttendanceData]);

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

  // Summary counts
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
    const changed_since_sent = items.filter(
      (i) => i.status === 'changed_since_sent'
    ).length;
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

  // Filtered Card Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (fieldFilter !== 'all' && item.field !== fieldFilter) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim();
        const phoneStr = item.mobile_mask || item.mobile || '';
        const parentStr = item.parent_name || '';
        const supporterStr = item.supporter_name || '';
        if (
          !String(item.student_name ?? '').includes(q) &&
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

  // Selection Helpers & Auto-exit when 0 selected
  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((i) => selectedStudentIds.includes(i.student_id));

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedStudentIds([]);
  }, []);

  const toggleSelectOne = useCallback((studentId: number) => {
    setSelectedStudentIds((prev) => {
      const exists = prev.includes(studentId);
      const next = exists
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId];
      if (next.length === 0) {
        setIsSelectionMode(false);
      } else {
        setIsSelectionMode(true);
      }
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredItems.map((i) => i.student_id));
      const remaining = selectedStudentIds.filter((id) => !filteredSet.has(id));
      setSelectedStudentIds(remaining);
      if (remaining.length === 0) {
        setIsSelectionMode(false);
      }
    } else {
      const combined = Array.from(
        new Set([
          ...selectedStudentIds,
          ...filteredItems.map((i) => i.student_id),
        ])
      );
      setSelectedStudentIds(combined);
      if (combined.length > 0) {
        setIsSelectionMode(true);
      }
    }
  };

  // Long-press (~450ms) gesture handlers on cards
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    studentId: number
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressedRef.current = false;
    clearLongPressTimer();

    longPressTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(20);
        } catch {
          // ignore vibration permission error
        }
      }
      setIsSelectionMode(true);
      setSelectedStudentIds((prev) =>
        prev.includes(studentId) ? prev : [...prev, studentId]
      );
    }, 450);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!touchStartPosRef.current || longPressTimerRef.current === null) return;
    const dx = e.clientX - touchStartPosRef.current.x;
    const dy = e.clientY - touchStartPosRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      clearLongPressTimer();
    }
  };

  const handleCardPointerUpOrCancel = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
  };

  const handleCardClick = (item: AppointmentSmsPreviewItem) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (isSelectionMode) {
      toggleSelectOne(item.student_id);
      return;
    }
    openEditAppointment(item);
  };

  // Bulk SMS Bottom Sheet categorization
  const bulkSmsCandidateItems = useMemo(
    () => items.filter((i) => smsSheetCandidateIds.includes(i.student_id)),
    [items, smsSheetCandidateIds]
  );

  const bulkCategorization = useMemo(
    () => categorizeBulkSmsSelection(bulkSmsCandidateItems),
    [bulkSmsCandidateItems]
  );

  const openBulkSmsSheet = (
    mode: AppointmentSmsSendMode,
    useSelectedOnly = false
  ) => {
    setLastSendBreakdown(null);
    let candidateList: AppointmentSmsPreviewItem[] = [];

    if (useSelectedOnly) {
      candidateList = items.filter((i) =>
        selectedStudentIds.includes(i.student_id)
      );
    } else if (mode === 'unsent') {
      candidateList = items.filter((i) => i.status === 'will_send');
    } else if (mode === 'failed') {
      candidateList = items.filter((i) => i.status === 'failed');
    } else if (mode === 'changed') {
      candidateList = items.filter((i) => i.status === 'changed_since_sent');
    }

    if (candidateList.length === 0) {
      showToast('هیچ دانش‌آموزی واجد شرایط این حالت ارسال پیامک نیست', 'warning');
      return;
    }

    const cat = categorizeBulkSmsSelection(candidateList);
    setSmsSheetMode(mode);
    setSmsSheetCandidateIds(candidateList.map((i) => i.student_id));
    setSmsSheetCheckedIds(cat.defaultCheckedStudentIds);
    setIsSmsSheetOpen(true);
  };

  const toggleSmsRecipientGroup = (groupStudentIds: number[]) => {
    const allChecked = groupStudentIds.every((id) =>
      smsSheetCheckedIds.includes(id)
    );
    if (allChecked) {
      setSmsSheetCheckedIds((prev) =>
        prev.filter((id) => !groupStudentIds.includes(id))
      );
    } else {
      setSmsSheetCheckedIds((prev) =>
        Array.from(new Set([...prev, ...groupStudentIds]))
      );
    }
  };

  // Unique phone count among currently checked student IDs
  const checkedUniquePhoneCount = useMemo(() => {
    const phones = new Set<string>();
    for (const group of bulkCategorization.recipientGroups) {
      const hasChecked = group.students.some((s) =>
        smsSheetCheckedIds.includes(s.student_id)
      );
      if (hasChecked) {
        phones.add(group.phoneKey);
      }
    }
    return phones.size;
  }, [bulkCategorization.recipientGroups, smsSheetCheckedIds]);

  const handleConfirmSendSms = async () => {
    if (smsSheetCheckedIds.length === 0) {
      showToast('حداقل یک گیرنده معتبر برای ارسال پیامک انتخاب کنید', 'warning');
      return;
    }

    setIsSendingSms(true);
    const operationId = `op-${currentWeek.week_date.replace(/-/g, '')}-${Date.now()}`;

    try {
      const res = await API.sendAppointmentsSms({
        week_date: currentWeek.week_date,
        mode: smsSheetMode,
        student_ids: smsSheetCheckedIds,
        operation_id: operationId,
      });

      const sentCount = res.data?.summary?.sent ?? 0;
      const failedCount = res.data?.summary?.failed ?? 0;
      const skippedCount =
        (res.data?.summary?.skipped_no_phone ?? 0) +
        (res.data?.summary?.skipped ?? 0);

      await fetchWeekData(currentWeek.week_date, false);
      exitSelectionMode();

      if (failedCount > 0) {
        setLastSendBreakdown({
          sent: sentCount,
          failed: failedCount,
          skipped: skippedCount,
        });
        showToast(
          `ارسال پیامک: ${toPersianDigits(sentCount)} موفق، ${toPersianDigits(failedCount)} ناموفق`,
          sentCount > 0 ? 'warning' : 'error'
        );
      } else {
        setIsSmsSheetOpen(false);
        showToast(
          `پیامک یادآوری برای ${toPersianDigits(sentCount)} گیرنده ارسال شد`,
          'success'
        );
      }
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ارسال پیامک نوبت‌ها', 'error');
    } finally {
      setIsSendingSms(false);
    }
  };

  // Single Tap -> Open Edit / Create Appointment Bottom-Sheet Modal
  const openEditAppointment = (item: AppointmentSmsPreviewItem) => {
    setEditingItem(item);
    const defaultStart = String(item.start_time || '10:00').slice(0, 5);
    setAppointmentForm({
      appointment_date: item.appointment_date || currentWeek.week_date,
      start_time: defaultStart,
      arrival_time: item.arrival_time || '',
      exam_start_time: item.exam_start_time || '',
      exam_end_time: item.exam_end_time || '',
      appointment_status: item.appointment_status || 'confirmed',
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

      // Sync arrival & exam times with /api/v1/attendance/entries and /api/v1/attendance/{id}/times
      const hasAnyAttendanceTime = Boolean(
        appointmentForm.arrival_time.trim() ||
          appointmentForm.exam_start_time.trim() ||
          appointmentForm.exam_end_time.trim()
      );
      if (hasAnyAttendanceTime || appointmentForm.appointment_status === 'absent') {
        try {
          const attDate = appointmentForm.appointment_date || currentWeek.week_date;
          const upserted = await API.upsertAttendanceEntry({
            date: attDate,
            student_id: editingItem.student_id,
            status:
              appointmentForm.appointment_status === 'absent' ? 'absent' : 'present',
          });
          const entryId = upserted.data?.id;
          if (entryId) {
            const timePatches: Array<{
              field: AttendanceTimestampField;
              val: string;
            }> = [
              { field: 'arrived_at', val: appointmentForm.arrival_time.trim() },
              {
                field: 'exam_started_at',
                val: appointmentForm.exam_start_time.trim(),
              },
              { field: 'exam_ended_at', val: appointmentForm.exam_end_time.trim() },
            ];
            for (const tp of timePatches) {
              if (tp.val) {
                await API.patchAttendanceTime(entryId, {
                  field: tp.field,
                  value: `${attDate} ${tp.val.slice(0, 5)}:00`,
                });
              }
            }
          }
        } catch {
          // Non-blocking if attendance endpoint is separate from appointment save
        }
      }

      setEditingItem(null);
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`نوبت «${editingItem.student_name}» ذخیره شد`, 'success');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ذخیره نوبت در سرور', 'error');
    } finally {
      setIsSavingAppointment(false);
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
      setEditingItem(null);
      await fetchWeekData(currentWeek.week_date, false);
      showToast(`نوبت «${studentName}» لغو شد`, 'info');
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
      showToast(
        (err as Error)?.message || 'خطا در دریافت شماره‌های والدین از سرور',
        'error'
      );
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
        `شماره تماس ولی برای «${contactModalStudent.student_name}» ثبت شد`,
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

    const satIso = getSaturdayOfWeek(
      newWeekForm.week_date || getTodayGregorianIso()
    );
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
  // Connected directly to /api/v1/tutoring/sessions, /api/v1/tutoring/sessions/{id}/end & /api/v1/attendance*
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

  const updateRemedialAttendance = async (
    classId: number,
    studentId: number,
    nextStatus: RemedialAttendanceState
  ) => {
    const cellKey = `${classId}-${studentId}`;
    if (updatingCellKey === cellKey) return;

    const nowHm = getCurrentTimeHm();
    const nowIso = `${remedialDate} ${nowHm}:00`;
    const targetClass = remedialClasses.find((c) => c.id === classId);
    const targetStudent = items.find((s) => s.student_id === studentId);
    const current = targetClass
      ? getStudentClassAttendance(targetClass, studentId)
      : { status: 'none' as RemedialAttendanceState };

    setUpdatingCellKey(cellKey);
    try {
      let resolvedSessionId: number | null = current.session_id ?? null;
      let resolvedAttendanceId: number | null = current.attendance_id ?? null;
      let serverEnteredHm: string | undefined = current.entered_at;
      let serverExitedHm: string | undefined = current.exited_at;

      if (nextStatus === 'in_class') {
        // 1. Start tutoring session on backend: POST /api/v1/tutoring/sessions
        const clientUuid = `tut-${remedialDate}-${classId}-${studentId}`;
        const sessionRes = await API.startTutoringSession({
          student_id: studentId,
          classroom_id: classId,
          client_uuid: clientUuid,
          entered_at: nowIso,
        });
        resolvedSessionId = sessionRes.data?.id ?? resolvedSessionId;
        resolvedAttendanceId =
          sessionRes.data?.attendance_id ?? resolvedAttendanceId;
        serverEnteredHm =
          extractHmFromTimestamp(sessionRes.data?.entered_at) ||
          current.entered_at ||
          nowHm;

        // 2. Ensure student is marked present in Daily Attendance: PUT /api/v1/attendance/entries
        try {
          const attRes = await API.upsertAttendanceEntry({
            date: remedialDate,
            student_id: studentId,
            status: 'present',
          });
          if (attRes.data?.id) {
            resolvedAttendanceId = attRes.data.id;
            if (!attRes.data.arrived_at) {
              await API.patchAttendanceTime(attRes.data.id, {
                field: 'arrived_at',
                value: 'now',
              });
            }
          }
        } catch {
          // Tutoring session already recorded
        }
      } else if (nextStatus === 'left_class') {
        // 1. End open tutoring session on backend: POST /api/v1/tutoring/sessions/{id}/end
        if (!resolvedSessionId) {
          // Resolve open session via idempotent startTutoringSession first if session_id wasn't cached
          try {
            const clientUuid = `tut-${remedialDate}-${classId}-${studentId}`;
            const openRes = await API.startTutoringSession({
              student_id: studentId,
              classroom_id: classId,
              client_uuid: clientUuid,
            });
            resolvedSessionId = openRes.data?.id ?? null;
          } catch {
            // Proceed to end if session id resolved
          }
        }

        if (resolvedSessionId) {
          const endedRes = await API.endTutoringSession(resolvedSessionId, nowIso);
          serverExitedHm =
            extractHmFromTimestamp(endedRes.data?.ended_at) || nowHm;
        } else {
          // If classroom is managed via daily attendance timestamps, record departure time
          const existingEntry = attendanceEntries.find(
            (e) => e.student_id === studentId
          );
          const entryId = resolvedAttendanceId || existingEntry?.id;
          if (entryId) {
            await API.patchAttendanceTime(entryId, {
              field: 'departed_at',
              value: 'now',
            });
          } else {
            const created = await API.upsertAttendanceEntry({
              date: remedialDate,
              student_id: studentId,
              status: 'present',
            });
            if (created.data?.id) {
              resolvedAttendanceId = created.data.id;
              await API.patchAttendanceTime(created.data.id, {
                field: 'departed_at',
                value: 'now',
              });
            }
          }
          serverExitedHm = nowHm;
        }
      } else if (nextStatus === 'none') {
        // Reset state: end open session if active
        if (resolvedSessionId && current.status === 'in_class') {
          try {
            await API.endTutoringSession(resolvedSessionId, nowIso);
          } catch {
            // Ignore if already ended
          }
        }
        await API.upsertAttendanceEntry({
          date: remedialDate,
          student_id: studentId,
          removed: true,
        });
      }

      setRemedialClasses((prev) =>
        prev.map((col) => {
          if (col.id !== classId) return col;
          const prevStates = { ...(col.student_states || {}) };

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
              entered_at: serverEnteredHm || nowHm,
              session_id: resolvedSessionId,
              attendance_id: resolvedAttendanceId,
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

          prevStates[studentId] = {
            status: 'left_class',
            entered_at: serverEnteredHm || current.entered_at || nowHm,
            exited_at: serverExitedHm || nowHm,
            session_id: resolvedSessionId,
            attendance_id: resolvedAttendanceId,
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

      await fetchRemedialAndAttendanceData(remedialDate);

      if (targetStudent && targetClass) {
        if (nextStatus === 'in_class') {
          showToast(
            `ورود «${targetStudent.student_name}» به کلاس «${targetClass.class_name}» در سرور ثبت شد (${toPersianDigits(serverEnteredHm || nowHm)})`,
            'success'
          );
        } else if (nextStatus === 'left_class') {
          showToast(
            `خروج «${targetStudent.student_name}» از کلاس «${targetClass.class_name}» در سرور ثبت شد (${toPersianDigits(serverExitedHm || nowHm)})`,
            'info'
          );
        } else {
          showToast(
            `وضعیت حضور «${targetStudent.student_name}» در «${targetClass.class_name}» بازنشانی شد`,
            'warning'
          );
        }
      }
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در ثبت وضعیت حضور کلاس رفع اشکال در سرور',
        'error'
      );
    } finally {
      setUpdatingCellKey(null);
    }
  };

  // Record or clear daily attendance timestamp (arrived_at, exam_started_at, exam_ended_at, departed_at)
  // via PUT /api/v1/attendance/entries + PATCH /api/v1/attendance/{id}/times
  const handleStampStudentAttendanceTime = async (
    studentId: number,
    studentName: string,
    field: AttendanceTimestampField,
    clear = false
  ) => {
    const key = `${studentId}-${field}`;
    if (updatingTimeKey === key) return;
    setUpdatingTimeKey(key);

    try {
      let entry = attendanceEntries.find((e) => e.student_id === studentId);
      let entryId = entry?.id ?? null;

      if (!entryId) {
        const upserted = await API.upsertAttendanceEntry({
          date: remedialDate,
          student_id: studentId,
          status: 'present',
        });
        entryId = upserted.data?.id ?? null;
      }

      if (!entryId) {
        throw new Error('شناسه رکورد حضور از سرور دریافت نشد');
      }

      await API.patchAttendanceTime(entryId, {
        field,
        value: clear ? null : 'now',
      });

      await fetchRemedialAndAttendanceData(remedialDate);

      const fieldLabels: Record<AttendanceTimestampField, string> = {
        arrived_at: 'ساعت ورود به آموزشگاه',
        exam_started_at: 'ساعت شروع آزمون',
        exam_ended_at: 'ساعت پایان آزمون',
        departed_at: 'ساعت خروج از آموزشگاه',
      };
      showToast(
        clear
          ? `${fieldLabels[field]} برای «${studentName}» پاک شد`
          : `${fieldLabels[field]} برای «${studentName}» ثبت شد`,
        clear ? 'info' : 'success'
      );
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در ثبت ساعت حضور و غیاب در سرور',
        'error'
      );
    } finally {
      setUpdatingTimeKey(null);
    }
  };

  // Change Teacher Tutoring Status (PUT /api/v1/tutoring/status)
  const handleChangeTeacherStatus = async (next: TeacherTutoringStatus) => {
    if (isUpdatingTeacherStatus) return;
    setIsUpdatingTeacherStatus(true);
    try {
      await API.setTutoringStatus(next);
      setTeacherStatus(next);
      await fetchRemedialAndAttendanceData(remedialDate);
      const labels: Record<TeacherTutoringStatus, string> = {
        ready: 'آماده پذیرش',
        break: 'در حال استراحت',
        absent: 'غایب',
      };
      showToast(`وضعیت مدرس به «${labels[next]}» تغییر یافت`, 'success');
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در تغییر وضعیت حضور استاد',
        'error'
      );
    } finally {
      setIsUpdatingTeacherStatus(false);
    }
  };

  // Add Guest Student to Daily Attendance (POST /api/v1/attendance/guests)
  const handleAddAttendanceGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestForm.guest_name.trim()) {
      setGuestError('نام دانش‌آموز مهمان الزامی است');
      return;
    }
    setGuestError(undefined);
    setIsSavingGuest(true);
    try {
      await API.addAttendanceGuest({
        date: remedialDate,
        guest_name: guestForm.guest_name.trim(),
        field: guestForm.field,
      });
      setGuestForm({ guest_name: '', field: remedialFieldTab });
      setIsAddGuestModalOpen(false);
      await fetchRemedialAndAttendanceData(remedialDate);
      showToast('دانش‌آموز مهمان در لیست حضور امروز ثبت شد', 'success');
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در ثبت دانش‌آموز مهمان', 'error');
    } finally {
      setIsSavingGuest(false);
    }
  };

  const handleAddRemedialClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateRemedialClassForm({
      class_name: newClassForm.class_name,
    });
    setNewClassErrors(errors);
    if (hasErrors(errors)) return;

    const className = newClassForm.class_name.trim();
    const teacherName = newClassForm.teacher_name.trim() || undefined;

    try {
      const res = await API.createTutoringClassroom({
        name: className,
        class_name: className,
        field: remedialFieldTab,
        teacher_name: teacherName,
      });

      const createdId = Number(res.data?.id || Date.now());
      const newCol: RemedialClassColumn = {
        id: createdId,
        field: remedialFieldTab,
        class_name: res.data?.name || className,
        teacher_name: teacherName,
        attendees: [],
        student_states: {},
      };
      setRemedialClasses((prev) => [...prev, newCol]);
      setNewClassForm({ class_name: '', teacher_name: '' });
      setIsAddClassModalOpen(false);
      await fetchRemedialAndAttendanceData(remedialDate);
      showToast(
        `کلاس «${newCol.class_name}» در سرور ثبت و به ماتریس اضافه شد`,
        'success'
      );
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در ثبت کلاس رفع اشکال در سرور',
        'error'
      );
    }
  };

  const handleDeleteRemedialClass = async (classId: number) => {
    try {
      await API.deleteTutoringClassroom(classId);
      setRemedialClasses((prev) => prev.filter((c) => c.id !== classId));
      await fetchRemedialAndAttendanceData(remedialDate);
      showToast('ستون کلاس رفع اشکال از سرور حذف شد', 'info');
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در حذف ستون کلاس رفع اشکال از سرور',
        'error'
      );
    }
  };

  const filteredLogs = useMemo(() => {
    if (logStatusFilter === 'all') return smsLogs;
    return smsLogs.filter((l) => l.status === logStatusFilter);
  }, [smsLogs, logStatusFilter]);

  const currentFieldRemedialClasses = useMemo(
    () => remedialClasses,
    [remedialClasses]
  );

  const allFieldStudents = useMemo(() => {
    const baseList = items.filter((s) => s.field === remedialFieldTab);
    const knownIds = new Set(baseList.map((s) => s.student_id));
    const extraFromAttendance: AppointmentSmsPreviewItem[] = attendanceEntries
      .filter(
        (e) =>
          (e.field === remedialFieldTab || !e.field) &&
          (e.student_id ? !knownIds.has(e.student_id) : Boolean(e.id))
      )
      .map((e, idx) => ({
        student_id: e.student_id ?? -(e.id ?? idx + 1),
        student_name: e.name || e.guest_name || 'مهمان',
        grade: null,
        field: e.field || remedialFieldTab,
        status: 'no_appointment',
        recipient_type: 'parent',
        parent_name: null,
        appointment_id: null,
        appointment_date: remedialDate,
        start_time: null,
        end_time: null,
        appointment_at: null,
        active_appointments_count: 0,
        multiple_appointments: false,
        last_error: null,
        last_sent_at: null,
        attempts: 0,
        arrival_time: extractHmFromTimestamp(e.arrived_at) || null,
        exam_start_time: extractHmFromTimestamp(e.exam_started_at) || null,
        exam_end_time: extractHmFromTimestamp(e.exam_ended_at) || null,
      }));
    return [...baseList, ...extraFromAttendance];
  }, [items, attendanceEntries, remedialFieldTab, remedialDate]);

  const remedialFieldStats = useMemo(() => {
    let inClassStudentsCount = 0;
    let leftClassStudentsCount = 0;
    let notEnteredStudentsCount = 0;

    for (const st of allFieldStudents) {
      const states = currentFieldRemedialClasses.map(
        (col) => getStudentClassAttendance(col, st.student_id).status
      );
      const hasInClass = states.includes('in_class');
      const hasLeftClass = states.includes('left_class');
      if (hasInClass) inClassStudentsCount += 1;
      if (hasLeftClass) leftClassStudentsCount += 1;
      if (!hasInClass && !hasLeftClass) notEnteredStudentsCount += 1;
    }

    return {
      totalStudents: allFieldStudents.length,
      inClassStudentsCount,
      leftClassStudentsCount,
      notEnteredStudentsCount,
    };
  }, [allFieldStudents, currentFieldRemedialClasses, getStudentClassAttendance]);

  const currentFieldStudents = useMemo(() => {
    if (remedialStatusFilter === 'all') return allFieldStudents;
    return allFieldStudents.filter((st) => {
      const states = currentFieldRemedialClasses.map(
        (col) => getStudentClassAttendance(col, st.student_id).status
      );
      if (remedialStatusFilter === 'in_class') return states.includes('in_class');
      if (remedialStatusFilter === 'left_class')
        return states.includes('left_class');
      return states.every((s) => s === 'none');
    });
  }, [
    allFieldStudents,
    remedialStatusFilter,
    currentFieldRemedialClasses,
    getStudentClassAttendance,
  ]);

  const renderCardStatusIcon = (key: string) => {
    switch (key) {
      case 'pending':
        return <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'confirmed':
        return <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      case 'absent':
        return <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
      default:
        return <CalendarX2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
  };

  const samplePreviewStudent = useMemo(() => {
    const firstChecked = items.find((i) =>
      smsSheetCheckedIds.includes(i.student_id)
    );
    return firstChecked || bulkSmsCandidateItems[0] || items[0] || null;
  }, [items, smsSheetCheckedIds, bulkSmsCandidateItems]);

  return (
    <div id="page-appointments" className="space-y-4 pb-24 max-w-full overflow-x-hidden">
      {/* Compact Header Bar OR Multi-Select Action Header */}
      {isSelectionMode ? (
        <div
          role="region"
          aria-label="نوار انتخاب چندتایی"
          className="sticky top-2 z-30 bg-[#344868] text-white rounded-2xl shadow-md px-3.5 py-2.5 flex items-center justify-between gap-2 transition-all"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelectionMode}
              aria-label="خروج از حالت انتخاب"
              className="min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold tabular-nums">
              {toPersianDigits(selectedStudentIds.length)} مورد
            </span>
          </div>

          <button
            type="button"
            onClick={toggleSelectAllFiltered}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {allFilteredSelected ? (
              <>
                <CheckSquare className="w-4 h-4" />
                <span>لغو انتخاب همه</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>انتخاب همه</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-2.5 sm:p-3.5 space-y-2.5">
          {/* Compact Week Navigation + Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Compact Week Bar: Prev Arrow + Week Date Range + Next Arrow */}
            <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/70 rounded-xl p-1 flex-1 sm:flex-initial justify-between sm:justify-start min-w-0">
              <button
                type="button"
                onClick={() => handleShiftWeek(-7)}
                aria-label="هفته قبل"
                title="هفته قبل"
                className="min-w-[44px] min-h-[44px] rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#445D84] transition-colors cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewWeekForm({
                    title: currentWeek.title,
                    week_date: currentWeek.week_date,
                    start_date_jalali: currentWeek.start_date_jalali,
                    end_date_jalali: currentWeek.end_date_jalali,
                  });
                  setNewWeekErrors({});
                  setIsNewWeekModalOpen(true);
                }}
                className="min-h-[44px] px-2.5 py-1 rounded-lg hover:bg-white transition-colors text-center cursor-pointer truncate"
                title="تغییر تاریخ هفته"
              >
                <span className="text-xs sm:text-sm font-bold text-slate-800 tabular-nums">
                  {toPersianDigits(currentWeek.start_date_jalali)} تا{' '}
                  {toPersianDigits(currentWeek.end_date_jalali)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleShiftWeek(7)}
                aria-label="هفته بعد"
                title="هفته بعد"
                className="min-w-[44px] min-h-[44px] rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#445D84] transition-colors cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Right Controls: Select Mode, SMS Log Drawer, Refresh */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeTab === 'appointments' && (
                <button
                  type="button"
                  onClick={() => setIsSelectionMode(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-[#445D84]" />
                  <span>انتخاب</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                aria-label="لاگ پیامک"
              >
                <History className="w-4 h-4 text-[#445D84]" />
                <span>لاگ ({toPersianDigits(smsLogs.length)})</span>
              </button>

              <button
                type="button"
                onClick={() => fetchWeekData(currentWeek.week_date, true)}
                disabled={isLoading}
                aria-label="بروزرسانی از سرور"
                title="بروزرسانی از سرور"
                className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#445D84]' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Sub-navigation Tabs: Appointments Cards vs Remedial Matrix */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/70 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('appointments')}
                className={`flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'appointments'
                    ? 'bg-[#445D84] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>نوبت‌ها ({toPersianDigits(summary.total)})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('remedial')}
                className={`flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'remedial'
                    ? 'bg-[#445D84] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>رفع اشکال ({toPersianDigits(remedialClasses.length)})</span>
              </button>
            </div>

            {activeTab === 'appointments' && (
              <div className="hidden md:flex items-center gap-1.5">
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={() => openBulkSmsSheet('unsent', false)}
                  disabled={summary.will_send === 0}
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  ارسال به ارسال‌نشده‌ها ({toPersianDigits(summary.will_send)})
                </ActionButton>
                {summary.changed_since_sent > 0 && (
                  <ActionButton
                    variant="warning"
                    size="sm"
                    onClick={() => openBulkSmsSheet('changed', false)}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    تغییریافته‌ها ({toPersianDigits(summary.changed_since_sent)})
                  </ActionButton>
                )}
                {summary.failed > 0 && (
                  <ActionButton
                    variant="danger"
                    size="sm"
                    onClick={() => openBulkSmsSheet('failed', false)}
                    icon={<AlertTriangle className="w-3.5 h-3.5" />}
                  >
                    ناموفق‌ها ({toPersianDigits(summary.failed)})
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'appointments' ? (
        <>
          {/* Compact Search, Field Filter & Scrollable Status Filter Chips */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجوی نام دانش‌آموز..."
                  className="w-full min-h-[44px] pr-10 pl-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#445D84]"
                />
              </div>

              <select
                value={fieldFilter}
                aria-label="فیلتر رشته"
                onChange={(e) => setFieldFilter(e.target.value)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/70 focus:outline-none focus:border-[#445D84]"
              >
                <option value="all">همه رشته‌ها</option>
                <option value="تجربی">تجربی</option>
                <option value="ریاضی">ریاضی</option>
                <option value="انسانی">انسانی</option>
              </select>
            </div>

            {/* Horizontal Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: 'all' as PreviewChipFilter, label: 'همه', count: summary.total },
                {
                  id: 'will_send' as PreviewChipFilter,
                  label: 'آماده ارسال',
                  count: summary.will_send,
                },
                {
                  id: 'already_sent' as PreviewChipFilter,
                  label: 'پیامک شده',
                  count: summary.already_sent,
                },
                {
                  id: 'changed_since_sent' as PreviewChipFilter,
                  label: 'تغییریافته',
                  count: summary.changed_since_sent,
                },
                {
                  id: 'failed' as PreviewChipFilter,
                  label: 'خطای پیامک',
                  count: summary.failed,
                },
                {
                  id: 'no_phone' as PreviewChipFilter,
                  label: 'بدون شماره',
                  count: summary.no_phone,
                },
                {
                  id: 'no_appointment' as PreviewChipFilter,
                  label: 'بدون نوبت',
                  count: summary.no_appointment,
                },
              ].map((chip) => {
                const isActive = chipFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setChipFilter(chip.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 border transition-colors cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-[#445D84] text-white border-[#445D84]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-slate-600 border border-slate-200/70'
                      }`}
                    >
                      {toPersianDigits(chip.count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error State Banner */}
          {errorState && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-rose-700 text-xs font-bold">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorState}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchWeekData(currentWeek.week_date, true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  تلاش مجدد
                </button>
                <button
                  type="button"
                  onClick={() => setErrorState(null)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          )}

          {/* Responsive Card Grid (1 col mobile, 2 tablet, 3-4 desktop) */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-28 rounded-2xl bg-slate-200/80 animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 py-14 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                {items.length === 0
                  ? 'هیچ رکوردی برای این هفته در سرور ثبت نشده است'
                  : 'هیچ دانش‌آموزی با فیلترهای انتخابی یافت نشد'}
              </p>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setChipFilter('all');
                    setFieldFilter('all');
                    setSearchQuery('');
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  نمایش همه کارت‌ها
                </button>
              )}
            </div>
          ) : (
            <div
              role="listbox"
              aria-multiselectable={isSelectionMode}
              aria-label="لیست کارت‌های نوبت هفتگی دانش‌آموزان"
              className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5"
            >
              {filteredItems.map((item) => {
                const isSelected = selectedStudentIds.includes(item.student_id);
                const statusMeta = resolveCardAppointmentStatus(item);
                const timeStr = formatCardStartTime(item);
                const dateStr = formatCardDateLabel(item);
                const hasExam = Boolean(item.exam_start_time || item.exam_end_time);
                const hasArrival = Boolean(item.arrival_time);

                return (
                  <div
                    key={item.student_id}
                    role="option"
                    tabIndex={0}
                    aria-selected={isSelected}
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => handleCardPointerDown(e, item.student_id)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={handleCardPointerUpOrCancel}
                    onPointerCancel={handleCardPointerUpOrCancel}
                    onClick={() => handleCardClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(item);
                      }
                    }}
                    className={`group relative overflow-hidden rounded-2xl bg-white p-4 pr-5 transition-all cursor-pointer select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] border-2 ${
                      isSelected
                        ? 'border-[#445D84] bg-[#445D84]/[0.04] shadow-md ring-2 ring-[#445D84]/15'
                        : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Right-side narrow status bar (in RTL) */}
                    <span
                      aria-hidden="true"
                      className={`absolute right-0 top-0 bottom-0 w-1.5 ${statusMeta.barColorClass}`}
                    />

                    {/* Selection Checkbox (visible in selection mode or on desktop hover) */}
                    <button
                      type="button"
                      aria-label={`انتخاب ${item.student_name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectOne(item.student_id);
                      }}
                      className={`absolute left-2.5 top-2.5 min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center transition-opacity cursor-pointer z-10 ${
                        isSelectionMode || isSelected
                          ? 'opacity-100'
                          : 'opacity-0 sm:group-hover:opacity-100'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full border-2 inline-flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#445D84] border-[#445D84] text-white'
                            : 'bg-white/90 border-slate-300 text-transparent hover:border-[#445D84]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    </button>

                    {/* Line 1: Student Name (Bold) + Appointment Time */}
                    <div className="flex items-baseline justify-between gap-2 pl-9">
                      <h3 className="text-base font-bold text-slate-800 truncate">
                        {item.student_name}
                      </h3>
                      <span className="text-xs font-bold text-slate-700 tabular-nums shrink-0">
                        {timeStr ? `ساعت ${timeStr}` : '—'}
                      </span>
                    </div>

                    {/* Line 2: Grade & Field as plain gray text (NOT a chip) */}
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {item.grade ? `پایه ${toPersianDigits(item.grade)}` : 'پایه نامشخص'}
                        {item.field ? ` • ${item.field}` : ''}
                      </span>
                      {dateStr && (
                        <span className="text-[11px] text-slate-400 truncate">
                          {dateStr}
                        </span>
                      )}
                    </div>

                    {/* Line 3: Small Appointment Status Chip + Subtle Neutral Secondary Icons */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.chipClass}`}
                      >
                        {renderCardStatusIcon(statusMeta.key)}
                        <span>{statusMeta.label}</span>
                      </span>

                      {/* Subtle neutral icons for secondary info (SMS, arrival, exam) */}
                      <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                        {item.status === 'already_sent' && (
                          <span
                            className="inline-flex items-center gap-1"
                            title="پیامک یادآوری این هفته ارسال شده است"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>پیامک شد</span>
                          </span>
                        )}
                        {item.status === 'changed_since_sent' && (
                          <span
                            className="inline-flex items-center gap-1"
                            title="ساعت نوبت پس از ارسال پیامک تغییر کرده است"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>تغییر نوبت</span>
                          </span>
                        )}
                        {item.status === 'no_phone' && (
                          <span
                            className="inline-flex items-center gap-1"
                            title="شماره تماس ولی ثبت نشده است"
                          >
                            <PhoneOff className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {hasArrival && (
                          <span
                            className="inline-flex items-center gap-0.5 tabular-nums"
                            title={`ورود: ${toPersianDigits(item.arrival_time)}`}
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>{toPersianDigits(item.arrival_time)}</span>
                          </span>
                        )}
                        {hasExam && (
                          <span
                            className="inline-flex items-center gap-0.5"
                            title="ساعت آزمون ثبت شده است"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Remedial Classes & Daily Attendance Matrix View (/api/v1/tutoring* & /api/v1/attendance*) */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                {(['تجربی', 'ریاضی', 'انسانی'] as AcademicField[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setRemedialFieldTab(f);
                      setRemedialStatusFilter('all');
                    }}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      remedialFieldTab === f
                        ? 'bg-[#445D84] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    رشته {f}
                  </button>
                ))}
              </div>

              {/* Date Selector for Daily Attendance (/api/v1/attendance?date=...) */}
              <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-[#445D84]" />
                <input
                  type="date"
                  aria-label="تاریخ حضور و رفع اشکال"
                  value={remedialDate}
                  onChange={(e) => setRemedialDate(e.target.value)}
                  className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none min-h-[34px]"
                />
                <span className="text-[11px] text-slate-500">
                  ({toPersianDigits(formatGregorianToJalali(remedialDate))})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Teacher Tutoring Status (PUT /api/v1/tutoring/status) */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px]">
                {(
                  [
                    { id: 'ready', label: 'آماده پذیرش' },
                    { id: 'break', label: 'استراحت' },
                    { id: 'absent', label: 'غایب' },
                  ] as Array<{ id: TeacherTutoringStatus; label: string }>
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    disabled={isUpdatingTeacherStatus}
                    onClick={() => handleChangeTeacherStatus(st.id)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                      teacherStatus === st.id
                        ? 'bg-[#445D84] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Add Guest Student (POST /api/v1/attendance/guests) */}
              <ActionButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setGuestForm({ guest_name: '', field: remedialFieldTab });
                  setGuestError(undefined);
                  setIsAddGuestModalOpen(true);
                }}
                icon={<UserPlus className="w-4 h-4" />}
              >
                ثبت مهمان
              </ActionButton>

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

          {/* 3-State Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 rounded-xl p-3 border border-slate-200/70">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRemedialStatusFilter('all')}
                className={`min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'all'
                    ? 'bg-[#445D84] text-white border-[#445D84]'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <span>همه ({toPersianDigits(remedialFieldStats.totalStudents)})</span>
              </button>

              <button
                type="button"
                onClick={() => setRemedialStatusFilter('in_class')}
                className={`min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'in_class'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-200'
                }`}
              >
                <span>
                  حاضر در کلاس ({toPersianDigits(remedialFieldStats.inClassStudentsCount)})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRemedialStatusFilter('left_class')}
                className={`min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  remedialStatusFilter === 'left_class'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200'
                }`}
              >
                <span>
                  خارج شده ({toPersianDigits(remedialFieldStats.leftClassStudentsCount)})
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchRemedialAndAttendanceData(remedialDate)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#445D84]" />
              <span>بروزرسانی بورد کلاس‌ها</span>
            </button>
          </div>

          {currentFieldStudents.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <p className="text-sm font-bold text-slate-700">
                دانش‌آموزی با این وضعیت در رشته {remedialFieldTab} یافت نشد
              </p>
              {currentFieldRemedialClasses.length === 0 && (
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAddClassModalOpen(true)}
                  icon={<Plus className="w-4 h-4" />}
                >
                  افزودن ستون کلاس رفع اشکال
                </ActionButton>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#344868] text-white text-xs">
                    <th className="py-3.5 px-4 font-bold min-w-[170px]">
                      نام دانش‌آموز ({remedialFieldTab})
                    </th>
                    <th className="py-3.5 px-4 font-bold text-center min-w-[230px] border-r border-white/10">
                      حضور و آزمون روزانه
                    </th>
                    {currentFieldRemedialClasses.map((col) => {
                      const inClassCount = allFieldStudents.filter(
                        (s) =>
                          getStudentClassAttendance(col, s.student_id).status ===
                          'in_class'
                      ).length;
                      const leftClassCount = allFieldStudents.filter(
                        (s) =>
                          getStudentClassAttendance(col, s.student_id).status ===
                          'left_class'
                      ).length;
                      return (
                        <th
                          key={col.id}
                          className="py-3.5 px-4 font-bold text-center min-w-[200px] border-r border-white/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 text-right">
                              <div className="truncate">{col.class_name}</div>
                              {col.teacher_name && (
                                <div className="text-[10px] font-normal text-white/75 truncate">
                                  {col.teacher_name}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteRemedialClass(col.id)}
                              className="text-white/60 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
                              title="حذف ستون کلاس"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-100">
                              حاضر: {toPersianDigits(inClassCount)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-400/25 text-indigo-100">
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
                    const attEntry = attendanceEntries.find(
                      (e) => e.student_id === student.student_id
                    );
                    const arrivedHm =
                      extractHmFromTimestamp(attEntry?.arrived_at) ||
                      student.arrival_time;
                    const examStartHm =
                      extractHmFromTimestamp(attEntry?.exam_started_at) ||
                      student.exam_start_time;
                    const examEndHm =
                      extractHmFromTimestamp(attEntry?.exam_ended_at) ||
                      student.exam_end_time;
                    const departedHm = extractHmFromTimestamp(
                      attEntry?.departed_at
                    );

                    return (
                      <tr key={student.student_id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          <div>{student.student_name}</div>
                          {student.grade && (
                            <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                              پایه {toPersianDigits(student.grade)}
                            </div>
                          )}
                        </td>

                        {/* Daily Attendance Timestamps (/api/v1/attendance/entries & /api/v1/attendance/{id}/times) */}
                        <td className="py-3 px-3 text-center border-r border-slate-100 align-middle">
                          <div className="grid grid-cols-2 gap-1.5 max-w-[220px] mx-auto">
                            <button
                              type="button"
                              disabled={
                                updatingTimeKey === `${student.student_id}-arrived_at`
                              }
                              onClick={() =>
                                handleStampStudentAttendanceTime(
                                  student.student_id,
                                  student.student_name,
                                  'arrived_at',
                                  Boolean(arrivedHm)
                                )
                              }
                              className={`min-h-[36px] px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                                arrivedHm
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300'
                              }`}
                            >
                              <LogIn className="w-3 h-3 shrink-0" />
                              <span>
                                {arrivedHm
                                  ? `ورود: ${toPersianDigits(arrivedHm)}`
                                  : 'ثبت ورود'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                updatingTimeKey === `${student.student_id}-departed_at`
                              }
                              onClick={() =>
                                handleStampStudentAttendanceTime(
                                  student.student_id,
                                  student.student_name,
                                  'departed_at',
                                  Boolean(departedHm)
                                )
                              }
                              className={`min-h-[36px] px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                                departedHm
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300'
                              }`}
                            >
                              <LogOut className="w-3 h-3 shrink-0" />
                              <span>
                                {departedHm
                                  ? `خروج: ${toPersianDigits(departedHm)}`
                                  : 'ثبت خروج'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                updatingTimeKey ===
                                `${student.student_id}-exam_started_at`
                              }
                              onClick={() =>
                                handleStampStudentAttendanceTime(
                                  student.student_id,
                                  student.student_name,
                                  'exam_started_at',
                                  Boolean(examStartHm)
                                )
                              }
                              className={`min-h-[36px] px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                                examStartHm
                                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                              }`}
                            >
                              <ClipboardList className="w-3 h-3 shrink-0" />
                              <span>
                                {examStartHm
                                  ? `شروع: ${toPersianDigits(examStartHm)}`
                                  : 'شروع آزمون'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                updatingTimeKey ===
                                `${student.student_id}-exam_ended_at`
                              }
                              onClick={() =>
                                handleStampStudentAttendanceTime(
                                  student.student_id,
                                  student.student_name,
                                  'exam_ended_at',
                                  Boolean(examEndHm)
                                )
                              }
                              className={`min-h-[36px] px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                                examEndHm
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-300'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span>
                                {examEndHm
                                  ? `پایان: ${toPersianDigits(examEndHm)}`
                                  : 'پایان آزمون'}
                              </span>
                            </button>
                          </div>
                        </td>

                        {currentFieldRemedialClasses.map((col) => {
                          const att = getStudentClassAttendance(
                            col,
                            student.student_id
                          );
                          const isCellBusy =
                            updatingCellKey === `${col.id}-${student.student_id}`;

                          return (
                            <td
                              key={col.id}
                              className="py-3 px-3 text-center border-r border-slate-100 align-middle"
                            >
                              {att.status === 'none' && (
                                <button
                                  type="button"
                                  disabled={isCellBusy}
                                  onClick={() =>
                                    updateRemedialAttendance(
                                      col.id,
                                      student.student_id,
                                      'in_class'
                                    )
                                  }
                                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700 font-bold text-xs transition-all cursor-pointer w-full max-w-[185px] disabled:opacity-50"
                                >
                                  {isCellBusy ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <LogIn className="w-3.5 h-3.5" />
                                  )}
                                  <span>ثبت ورود به کلاس</span>
                                </button>
                              )}

                              {att.status === 'in_class' && (
                                <div className="inline-flex flex-col items-stretch gap-1.5 p-2 rounded-xl bg-emerald-50/90 border border-emerald-200 w-full max-w-[195px]">
                                  <div className="flex items-center justify-between gap-1 px-1 text-[11px] font-bold text-emerald-800">
                                    <span>حاضر در کلاس</span>
                                    {att.entered_at && (
                                      <span>{toPersianDigits(att.entered_at)}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={isCellBusy}
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'left_class'
                                        )
                                      }
                                      className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      {isCellBusy ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <LogOut className="w-3 h-3" />
                                      )}
                                      ثبت خروج از کلاس
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isCellBusy}
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'none'
                                        )
                                      }
                                      className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center rounded-lg bg-white text-slate-400 hover:text-rose-600 border border-emerald-200/70 cursor-pointer disabled:opacity-50"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {att.status === 'left_class' && (
                                <div className="inline-flex flex-col items-stretch gap-1.5 p-2 rounded-xl bg-indigo-50/80 border border-indigo-200 w-full max-w-[195px]">
                                  <div className="flex items-center justify-between gap-1 px-1 text-[11px] font-bold text-indigo-800">
                                    <span>خارج شده</span>
                                    <button
                                      type="button"
                                      disabled={isCellBusy}
                                      onClick={() =>
                                        updateRemedialAttendance(
                                          col.id,
                                          student.student_id,
                                          'none'
                                        )
                                      }
                                      className="p-1 rounded-md hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="text-[10px] font-bold text-indigo-900 bg-white/90 px-2 py-1 rounded-lg">
                                    {toPersianDigits(att.entered_at || '—')} تا{' '}
                                    {toPersianDigits(att.exited_at || '—')}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isCellBusy}
                                    onClick={() =>
                                      updateRemedialAttendance(
                                        col.id,
                                        student.student_id,
                                        'in_class'
                                      )
                                    }
                                    className="min-h-[34px] inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-white text-slate-600 hover:text-emerald-700 border border-indigo-200/80 text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                  >
                                    {isCellBusy ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <UserCheck className="w-3 h-3" />
                                    )}
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

      {/* Sticky Bottom Action Bar in Multi-Select Mode */}
      {isSelectionMode && selectedStudentIds.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-white/95 backdrop-blur-xs border-t border-slate-200 shadow-2xl">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => openBulkSmsSheet('unsent', true)}
              className="w-full min-h-[48px] h-12 px-5 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                ارسال پیامک ({toPersianDigits(selectedStudentIds.length)})
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Appointment Booking Modal: Bottom Sheet on Mobile (<640px), Centered Modal on Desktop */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`ثبت و ویرایش نوبت ${editingItem.student_name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingItem(null);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Sheet Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-800 truncate">
                  {editingItem.student_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingItem.grade
                    ? `پایه ${toPersianDigits(editingItem.grade)}`
                    : ''}
                  {editingItem.field ? ` • ${editingItem.field}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Single-Column Scrollable Form */}
            <form
              noValidate
              onSubmit={handleSaveAppointment}
              className="flex-1 overflow-y-auto px-5 pt-4 pb-0 space-y-4"
            >
              {/* Parent Phone Quick Row */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                <div className="text-xs min-w-0">
                  <div className="text-slate-500">شماره ولی گیرنده پیامک:</div>
                  <div className="font-bold text-slate-800 mt-0.5 truncate" dir="ltr">
                    {editingItem.mobile_mask || editingItem.mobile
                      ? toPersianDigits(
                          editingItem.mobile_mask || editingItem.mobile || ''
                        )
                      : 'شماره ندارد'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openParentContactsModal(editingItem)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#445D84] text-[#445D84] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>مدیریت شماره</span>
                </button>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  تاریخ نوبت *
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
                  className={MOBILE_INPUT_CLASS(
                    Boolean(appointmentErrors.appointment_date)
                  )}
                />
                {appointmentForm.appointment_date && (
                  <p className="text-xs text-[#445D84] font-medium mt-1">
                    معادل شمسی:{' '}
                    {toPersianDigits(
                      formatGregorianToJalali(appointmentForm.appointment_date)
                    )}
                  </p>
                )}
                <FieldError message={appointmentErrors.appointment_date} />
              </div>

              {/* Start Time Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ساعت نوبت *
                </label>
                <input
                  type="time"
                  value={appointmentForm.start_time}
                  onChange={(e) => {
                    setAppointmentForm((prev) => ({
                      ...prev,
                      start_time: e.target.value,
                    }));
                    if (appointmentErrors.start_time) {
                      setAppointmentErrors((prev) => ({
                        ...prev,
                        start_time: undefined,
                      }));
                    }
                  }}
                  className={MOBILE_INPUT_CLASS(Boolean(appointmentErrors.start_time))}
                />
                <FieldError message={appointmentErrors.start_time} />
              </div>

              {/* 5-Status Selector */}
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
                  className={MOBILE_INPUT_CLASS(false)}
                >
                  <option value="pending">در انتظار</option>
                  <option value="confirmed">تأیید شده</option>
                  <option value="completed">انجام شد</option>
                  <option value="absent">غایب</option>
                  <option value="cancelled">لغو</option>
                </select>
              </div>

              {/* Attendance & Exam Times (single column) */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <p className="text-xs font-bold text-slate-600">
                  ساعات حضور و آزمون (اختیاری)
                </p>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">
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
                    className={MOBILE_INPUT_CLASS(false)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">
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
                    className={MOBILE_INPUT_CLASS(false)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">
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
                    className={MOBILE_INPUT_CLASS(false)}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  توضیحات جلسه
                </label>
                <input
                  type="text"
                  value={appointmentForm.description}
                  onChange={(e) =>
                    setAppointmentForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="مثال: بررسی کارنامه آزمون..."
                  className={MOBILE_INPUT_CLASS(false)}
                />
              </div>

              {/* Sticky Bottom Save Bar */}
              <div className="sticky bottom-0 bg-white pt-3 pb-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingAppointment}
                  className="flex-1 min-h-[48px] h-12 px-4 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSavingAppointment ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>ذخیره نوبت</span>
                </button>

                {editingItem.appointment_id && (
                  <button
                    type="button"
                    onClick={() => setCancelingItem(editingItem)}
                    title="لغو و حذف نوبت"
                    aria-label="لغو نوبت"
                    className="min-w-[48px] min-h-[48px] h-12 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 inline-flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk SMS Confirmation Bottom Sheet (Before Sending) */}
      {isSmsSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأیید ارسال پیامک گروهی"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSendingSms) {
              setIsSmsSheetOpen(false);
            }
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-lg max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Sheet Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  تأیید ارسال پیامک یادآوری نوبت
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  گیرنده نهایی: {toPersianDigits(checkedUniquePhoneCount)} شماره یکتا (
                  {toPersianDigits(smsSheetCheckedIds.length)} دانش‌آموز)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSmsSheetOpen(false)}
                disabled={isSendingSms}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Partial Failure Breakdown Banner (if any) */}
              {lastSendBreakdown && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                  <div className="font-bold">نتیجه ارسال به تفکیک:</div>
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-700 font-bold">
                      موفق: {toPersianDigits(lastSendBreakdown.sent)}
                    </span>
                    <span className="text-rose-700 font-bold">
                      ناموفق: {toPersianDigits(lastSendBreakdown.failed)}
                    </span>
                    {lastSendBreakdown.skipped > 0 && (
                      <span className="text-slate-600">
                        رد شده: {toPersianDigits(lastSendBreakdown.skipped)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Message Text Preview */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700">پیش‌نمایش متن پیامک:</div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-line">
                  {buildSmsMessagePreview(samplePreviewStudent)}
                </div>
              </div>

              {/* Merged Duplicate Notice */}
              {bulkCategorization.mergedDuplicatesCount > 0 && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center gap-2">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>
                    {toPersianDigits(bulkCategorization.mergedDuplicatesCount)} شماره تکراری
                    والدین (چند فرزند با یک شماره) ادغام شد.
                  </span>
                </div>
              )}

              {/* Eligible Recipients List (with Already-Sent unchecked by default) */}
              <div className="space-y-2">
                <div className="font-bold text-slate-700">
                  گیرندگان واجد شرایط ({toPersianDigits(bulkCategorization.recipientGroups.length)}{' '}
                  شماره):
                </div>

                {bulkCategorization.recipientGroups.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                    هیچ گیرنده‌ای با شماره معتبر و نوبت فعال در بین موارد انتخابی وجود ندارد.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bulkCategorization.recipientGroups.map((group) => {
                      const groupIds = group.students.map((s) => s.student_id);
                      const isChecked = groupIds.every((id) =>
                        smsSheetCheckedIds.includes(id)
                      );
                      const studentNames = group.students
                        .map((s) => s.student_name)
                        .join('، ');

                      return (
                        <label
                          key={group.phoneKey}
                          className={`min-h-[48px] p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-[#445D84] bg-[#445D84]/[0.04]'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSmsRecipientGroup(groupIds)}
                              className="w-5 h-5 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 truncate">
                                {studentNames}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                                <span>{group.parentName}</span>
                                <span dir="ltr" className="font-mono">
                                  {toPersianDigits(group.displayPhone)}
                                </span>
                                {group.students.length > 1 && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                                    شماره مشترک ({toPersianDigits(group.students.length)} فرزند)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {group.isAlreadySentAll && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0">
                              پیامک شده در این هفته
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Excluded: No Phone Recipients */}
              {bulkCategorization.noPhoneItems.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="font-bold text-orange-700 flex items-center gap-1.5">
                    <PhoneOff className="w-4 h-4" />
                    <span>
                      حذف‌شده از ارسال — شماره ندارد (
                      {toPersianDigits(bulkCategorization.noPhoneItems.length)} نفر):
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bulkCategorization.noPhoneItems.map((st) => (
                      <span
                        key={st.student_id}
                        className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 text-[11px] font-medium"
                      >
                        {st.student_name} (شماره ندارد)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Excluded: No Active Appointment */}
              {bulkCategorization.noAppointmentItems.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="font-bold text-slate-600">
                    حذف‌شده از ارسال — بدون نوبت فعال (
                    {toPersianDigits(bulkCategorization.noAppointmentItems.length)} نفر):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bulkCategorization.noAppointmentItems.map((st) => (
                      <span
                        key={st.student_id}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px]"
                      >
                        {st.student_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Confirm Bar */}
            <div className="sticky bottom-0 bg-white px-5 py-3.5 border-t border-slate-100 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleConfirmSendSms}
                disabled={isSendingSms || smsSheetCheckedIds.length === 0}
                className="flex-1 min-h-[48px] h-12 px-4 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSendingSms ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSendingSms
                    ? 'در حال ارسال...'
                    : `ارسال پیامک (${toPersianDigits(checkedUniquePhoneCount)})`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsSmsSheetOpen(false)}
                disabled={isSendingSms}
                className="min-h-[48px] h-12 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Contacts CRUD Bottom-Sheet Modal */}
      {contactModalStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`مدیریت شماره‌های والدین ${contactModalStudent.student_name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setContactModalStudent(null);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
              <h3 className="text-base font-bold text-slate-800 truncate">
                شماره والدین: {contactModalStudent.student_name}
              </h3>
              <button
                type="button"
                onClick={() => setContactModalStudent(null)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoadingContacts ? (
                <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#445D84]" />
                  <span>در حال دریافت شماره‌ها...</span>
                </div>
              ) : (parentContactsMap[contactModalStudent.student_id] || []).length >
                0 ? (
                <div className="space-y-2">
                  {(parentContactsMap[contactModalStudent.student_id] || []).map(
                    (c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {c.parent_name}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-bold">
                              {RELATIONSHIP_LABELS[c.relationship]}
                            </span>
                            {Boolean(c.is_primary) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                <Star className="w-3 h-3 fill-emerald-600" />
                                اصلی
                              </span>
                            )}
                          </div>
                          <div dir="ltr" className="font-mono text-slate-600 text-right">
                            {toPersianDigits(c.phone)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteParentContact(c.id)}
                          aria-label="حذف شماره ولی"
                          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 text-orange-700 text-xs text-center">
                  هیچ شماره‌ای برای والدین ثبت نشده است.
                </div>
              )}

              <form
                noValidate
                onSubmit={handleAddParentContact}
                className="space-y-3.5 pt-3 border-t border-slate-200/80"
              >
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#445D84]" />
                  افزودن شماره جدید ولی
                </h4>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نام و نام خانوادگی ولی *
                  </label>
                  <input
                    type="text"
                    value={contactForm.parent_name}
                    onChange={(e) => {
                      setContactForm((prev) => ({
                        ...prev,
                        parent_name: e.target.value,
                      }));
                      if (contactErrors.parent_name) {
                        setContactErrors((prev) => ({
                          ...prev,
                          parent_name: undefined,
                        }));
                      }
                    }}
                    placeholder="مثال: حسین محمدی"
                    className={MOBILE_INPUT_CLASS(Boolean(contactErrors.parent_name))}
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
                    className={MOBILE_INPUT_CLASS(false)}
                  >
                    <option value="father">پدر</option>
                    <option value="mother">مادر</option>
                    <option value="guardian">قیم قانونی</option>
                    <option value="other">سایر بستگان</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    شماره موبایل ولی (۱۱ رقمی) *
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={contactForm.phone}
                    onChange={(e) => {
                      setContactForm((prev) => ({ ...prev, phone: e.target.value }));
                      if (contactErrors.phone) {
                        setContactErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                    }}
                    placeholder="09123456789"
                    className={MOBILE_INPUT_CLASS(Boolean(contactErrors.phone))}
                  />
                  <FieldError message={contactErrors.phone} />
                </div>

                <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={contactForm.is_primary}
                    onChange={(e) =>
                      setContactForm((prev) => ({
                        ...prev,
                        is_primary: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                  />
                  شماره اصلی گیرنده پیامک
                </label>

                <div className="sticky bottom-0 bg-white pt-3 pb-1 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={isSavingContact}
                    className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isSavingContact ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>ذخیره شماره ولی</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Select / Add Week Session Bottom-Sheet Modal */}
      {isNewWeekModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="انتخاب هفته"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewWeekModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">انتخاب هفته</h3>
              <button
                type="button"
                onClick={() => setIsNewWeekModalOpen(false)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleCreateNewWeek}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  انتخاب تاریخ در هفته مورد نظر
                </label>
                <input
                  type="date"
                  value={newWeekForm.week_date}
                  onChange={(e) => {
                    const picked = e.target.value;
                    const sat = getSaturdayOfWeek(picked);
                    const fri = addDaysIso(sat, 6);
                    const sJal = formatGregorianToJalali(sat);
                    const eJal = formatGregorianToJalali(fri);
                    setNewWeekForm((prev) => ({
                      ...prev,
                      week_date: sat,
                      title: prev.title || `هفته ${toPersianDigits(sJal)}`,
                      start_date_jalali: sJal,
                      end_date_jalali: eJal,
                    }));
                  }}
                  className={MOBILE_INPUT_CLASS(false)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان هفته *
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
                  placeholder="مثال: هفته اول خرداد"
                  className={MOBILE_INPUT_CLASS(Boolean(newWeekErrors.title))}
                />
                <FieldError message={newWeekErrors.title} />
              </div>

              <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>مشاهده این هفته</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Remedial Class Bottom-Sheet Modal */}
      {isAddClassModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`افزودن کلاس رفع اشکال ${remedialFieldTab}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddClassModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                افزودن کلاس رفع اشکال ({remedialFieldTab})
              </h3>
              <button
                type="button"
                onClick={() => setIsAddClassModalOpen(false)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleAddRemedialClass}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عنوان کلاس *
                </label>
                <input
                  type="text"
                  value={newClassForm.class_name}
                  onChange={(e) => {
                    setNewClassForm((prev) => ({
                      ...prev,
                      class_name: e.target.value,
                    }));
                    if (newClassErrors.class_name) {
                      setNewClassErrors({ class_name: undefined });
                    }
                  }}
                  placeholder="مثال: کارگاه حل تست دینامیک"
                  className={MOBILE_INPUT_CLASS(Boolean(newClassErrors.class_name))}
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
                    setNewClassForm((prev) => ({
                      ...prev,
                      teacher_name: e.target.value,
                    }))
                  }
                  placeholder="مثال: استاد بهرامی"
                  className={MOBILE_INPUT_CLASS(false)}
                />
              </div>

              <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن کلاس</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Guest Student Bottom-Sheet Modal (POST /api/v1/attendance/guests) */}
      {isAddGuestModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ثبت دانش‌آموز مهمان در لیست حضور"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingGuest) {
              setIsAddGuestModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                ثبت دانش‌آموز مهمان ({toPersianDigits(formatGregorianToJalali(remedialDate))})
              </h3>
              <button
                type="button"
                onClick={() => setIsAddGuestModalOpen(false)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleAddAttendanceGuest}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نام و نام خانوادگی مهمان *
                </label>
                <input
                  type="text"
                  value={guestForm.guest_name}
                  onChange={(e) => {
                    setGuestForm((prev) => ({
                      ...prev,
                      guest_name: e.target.value,
                    }));
                    if (guestError) setGuestError(undefined);
                  }}
                  placeholder="مثال: آرش محمدی"
                  className={MOBILE_INPUT_CLASS(Boolean(guestError))}
                />
                <FieldError message={guestError} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رشته تحصیلی *
                </label>
                <select
                  value={guestForm.field}
                  onChange={(e) =>
                    setGuestForm((prev) => ({
                      ...prev,
                      field: e.target.value as AcademicField,
                    }))
                  }
                  className={MOBILE_INPUT_CLASS(false)}
                >
                  <option value="تجربی">تجربی</option>
                  <option value="ریاضی">ریاضی</option>
                  <option value="انسانی">انسانی</option>
                </select>
              </div>

              <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingGuest}
                  className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSavingGuest ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>ثبت در لیست حضور امروز</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تاریخچه ارسال پیامک نوبت‌ها"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsLogDrawerOpen(false);
          }}
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col justify-between">
            <div className="p-4 sm:p-5 bg-[#344868] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5" />
                <h3 className="text-base font-black">تاریخچه ارسال پیامک نوبت‌ها</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(false)}
                aria-label="بستن کشوی لاگ"
                className="min-w-[44px] min-h-[44px] rounded-xl text-white/80 hover:text-white hover:bg-white/10 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 overflow-x-auto">
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
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setLogStatusFilter(tab.id as 'all' | AppointmentSmsLogStatus)
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      logStatusFilter === tab.id
                        ? 'bg-[#445D84] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs font-bold">
                  هیچ رکوردی در تاریخچه پیامک این هفته یافت نشد
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border border-slate-200/90 bg-white space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">
                          {log.student_name || `دانش‌آموز #${log.student_id}`}
                        </div>
                        <div
                          dir="ltr"
                          className="text-xs font-mono text-slate-500 text-right mt-0.5"
                        >
                          {log.mobile_mask || log.mobile
                            ? toPersianDigits(log.mobile_mask || log.mobile || '')
                            : 'بدون شماره'}
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          log.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : log.status === 'skipped_no_phone'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {log.status === 'sent'
                          ? 'ارسال موفق'
                          : log.status === 'skipped_no_phone'
                          ? 'فاقد شماره'
                          : 'خطا در ارسال'}
                      </span>
                    </div>

                    {log.last_error && (
                      <div className="text-[11px] text-rose-600 font-bold">
                        علت خطا: {log.last_error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
