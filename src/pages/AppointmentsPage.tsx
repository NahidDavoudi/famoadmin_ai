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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  UserCheck,
  AlertCircle,
  MessageSquare,
  X,
  PhoneOff,
  UserPlus,
  Star,
  LogIn,
  LogOut,
  RotateCcw,
  Check,
  ClipboardList,
  Save,
} from 'lucide-react';
import type {
  AcademicField,
  AppointmentRecord,
  AppointmentSmsPreviewItem,
  AppointmentSmsPreviewSummary,
  AppointmentSmsLogItem,
  AppointmentSmsLogStatus,
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
  Student,
} from '../types';
import { API } from '../lib/api';
import {
  formatGregorianToJalali,
  getTodayGregorianIso,
  toPersianDigits,
  JALALI_WEEKDAYS,
} from '../lib/jalali';
import {
  validateParentContactForm,
  validateWeekSessionForm,
  validateRemedialClassForm,
  hasErrors,
  type FieldErrors,
} from '../lib/form-validation';
import {
  normalizeTimeInput,
  isValidAppointmentTimeHm,
  computeSpreadsheetSyncPlan,
  type ExistingDayAppointment,
} from '../lib/appointments-logic';
import { ActionButton, FieldError } from '../components/FormControls';

interface AppointmentsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

type MainTab = 'appointments' | 'remedial';

type SpreadsheetField = 'تجربی' | 'ریاضی' | 'انسانی';

const ACADEMIC_FIELDS: SpreadsheetField[] = ['تجربی', 'ریاضی', 'انسانی'];

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
  const todayIso = useMemo(() => getTodayGregorianIso(), []);
  const initialSatIso = useMemo(() => getSaturdayOfWeek(todayIso), [todayIso]);

  // Navigation & Compact Week Selection
  const [activeTab, setActiveTab] = useState<MainTab>('appointments');
  const [weeks, setWeeks] = useState<WeeklySessionInfo[]>(() => [
    buildWeekSession(initialSatIso, 1, 'هفته جاری'),
  ]);
  const [selectedWeekId, setSelectedWeekId] = useState<number>(1);

  // Excel-like Appointment Sheet State: Field Tab + Selected Day + Inline Time Drafts
  const [appointmentFieldTab, setAppointmentFieldTab] =
    useState<SpreadsheetField>('تجربی');
  const [selectedDayIso, setSelectedDayIso] = useState<string>(todayIso);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [draftTimesByDay, setDraftTimesByDay] = useState<
    Record<string, Record<number, string>>
  >({});
  const [allAppointments, setAllAppointments] = useState<AppointmentRecord[]>([]);
  const [isSubmittingSheet, setIsSubmittingSheet] = useState<boolean>(false);
  const [isSavingOnly, setIsSavingOnly] = useState<boolean>(false);
  const timeInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

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

  // SMS Log Drawer State
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState<boolean>(false);
  const [logStatusFilter, setLogStatusFilter] = useState<
    'all' | AppointmentSmsLogStatus
  >('all');

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
  const [remedialDate, setRemedialDate] = useState<string>(todayIso);
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [updatingCellKey, setUpdatingCellKey] = useState<string | null>(null);
  const [updatingTimeKey, setUpdatingTimeKey] = useState<string | null>(null);
  const [teacherStatus, setTeacherStatus] = useState<TeacherTutoringStatus>('ready');
  const [isUpdatingTeacherStatus, setIsUpdatingTeacherStatus] =
    useState<boolean>(false);
  const [isAddClassModalOpen, setIsAddClassModalOpen] = useState<boolean>(false);
  const [newClassForm, setNewClassForm] = useState({
    class_name: '',
    teacher_name: '',
  });
  const [newClassErrors, setNewClassErrors] =
    useState<FieldErrors<'class_name'>>({});

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

  // Days of the current Saturday–Friday week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const iso = addDaysIso(currentWeek.week_date, idx);
      const jalali = formatGregorianToJalali(iso);
      const shortJalali = jalali.slice(5); // MM/DD
      return {
        iso,
        weekday: JALALI_WEEKDAYS[idx] || '',
        jalali,
        shortJalali,
      };
    });
  }, [currentWeek.week_date]);

  // Keep selectedDayIso inside currentWeek when week changes
  useEffect(() => {
    const start = currentWeek.week_date;
    const end = addDaysIso(start, 6);
    if (selectedDayIso < start || selectedDayIso > end) {
      setSelectedDayIso(start);
    }
  }, [currentWeek.week_date, selectedDayIso]);

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
              class_name:
                b.classroom_name || prevCol?.class_name || `کلاس #${classId}`,
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
      }
    },
    []
  );

  // Fetch preview, students list, appointments list, logs, tutoring board & daily attendance
  const fetchWeekData = useCallback(
    async (weekDate: string, showRefreshToast = false) => {
      setIsLoading(true);
      setErrorState(null);
      try {
        const [previewRes, logRes, apptsRes, studentsRes] =
          await Promise.allSettled([
            API.getAppointmentsSmsPreview(weekDate),
            API.getAppointmentsSmsLog({ week_date: weekDate, per_page: 50 }),
            API.getAppointmentsList({ page: 1, per_page: 200 }),
            API.getStudentsList(),
          ]);

        let mergedItems: AppointmentSmsPreviewItem[] = [];

        if (previewRes.status === 'fulfilled') {
          const data = previewRes.value.data;
          mergedItems = [...(data?.items || [])];
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
          setServerSummary(null);
          const errMsg =
            (previewRes.reason as Error)?.message ||
            'خطا در دریافت لیست نوبت‌های هفتگی از سرور';
          setErrorState(errMsg);
          showToast(errMsg, 'error');
        }

        // Merge any active students from /api/v1/students if not already present in preview
        if (studentsRes.status === 'fulfilled') {
          const rawStudents: Student[] = studentsRes.value.data || [];
          const knownIds = new Set(mergedItems.map((i) => i.student_id));
          for (const st of rawStudents) {
            if (st.is_active !== 0 && !knownIds.has(st.id)) {
              knownIds.add(st.id);
              mergedItems.push({
                student_id: st.id,
                student_name: st.name,
                grade: st.grade,
                field: st.field,
                status: 'no_appointment',
                recipient_type: 'parent',
                parent_name: null,
                mobile: null,
                mobile_mask: null,
                appointment_id: null,
                appointment_date: null,
                start_time: null,
                end_time: null,
                appointment_at: null,
                active_appointments_count: 0,
                multiple_appointments: false,
                last_error: null,
                last_sent_at: null,
                attempts: 0,
              });
            }
          }
        }

        setItems(mergedItems);

        if (apptsRes.status === 'fulfilled') {
          setAllAppointments(apptsRes.value.data || []);
        } else {
          setAllAppointments([]);
        }

        if (logRes.status === 'fulfilled') {
          setSmsLogs(logRes.value.data?.items || []);
        } else {
          setSmsLogs([]);
        }

        await fetchRemedialAndAttendanceData(remedialDate);

        if (showRefreshToast && previewRes.status === 'fulfilled') {
          showToast('اطلاعات نوبت‌ها از سرور بروزرسانی شد', 'info');
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
    const targetSat = getSaturdayOfWeek(
      addDaysIso(currentWeek.week_date, deltaDays)
    );
    const existing = weeks.find((w) => w.week_date === targetSat);
    if (existing) {
      setSelectedWeekId(existing.id);
      setSelectedDayIso(targetSat);
      return;
    }
    const newId = Date.now();
    const created = buildWeekSession(targetSat, newId);
    setWeeks((prev) => [created, ...prev]);
    setSelectedWeekId(newId);
    setSelectedDayIso(targetSat);
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

  // Existing appointments on selectedDayIso indexed by student_id
  const existingAppointmentsForSelectedDay = useMemo(() => {
    const map: Record<number, ExistingDayAppointment | undefined> = {};

    // 1. From preview items (including nested item.appointments array if provided by backend)
    for (const item of items) {
      const itemWithList = item as AppointmentSmsPreviewItem & {
        appointments?: Array<{
          id: number;
          date?: string;
          appointment_date?: string;
          time_start?: string;
          start_time?: string;
          status?: string;
        }>;
      };

      if (Array.isArray(itemWithList.appointments)) {
        for (const ap of itemWithList.appointments) {
          const apDate = ap.appointment_date || ap.date;
          const apTime = ap.start_time || ap.time_start;
          if (
            apDate === selectedDayIso &&
            apTime &&
            ap.status !== 'cancelled' &&
            ap.status !== 'canceled'
          ) {
            map[item.student_id] = {
              appointment_id: ap.id,
              student_id: item.student_id,
              appointment_date: apDate,
              start_time: String(apTime).slice(0, 5),
            };
          }
        }
      }

      if (
        item.appointment_id &&
        item.appointment_date === selectedDayIso &&
        item.start_time &&
        item.appointment_status !== 'cancelled' &&
        item.appointment_status !== 'canceled'
      ) {
        map[item.student_id] = {
          appointment_id: item.appointment_id,
          student_id: item.student_id,
          appointment_date: item.appointment_date,
          start_time: String(item.start_time).slice(0, 5),
        };
      }
    }

    // 2. From /api/v1/appointments list
    for (const ap of allAppointments) {
      if (
        ap.appointment_date === selectedDayIso &&
        ap.start_time &&
        ap.status !== 'cancelled' &&
        ap.status !== 'canceled'
      ) {
        map[ap.student_id] = {
          appointment_id: ap.id,
          student_id: ap.student_id,
          appointment_date: ap.appointment_date,
          start_time: String(ap.start_time).slice(0, 5),
        };
      }
    }

    return map;
  }, [items, allAppointments, selectedDayIso]);

  // Draft map for current selectedDayIso
  const currentDayDrafts = useMemo(
    () => draftTimesByDay[selectedDayIso] || {},
    [draftTimesByDay, selectedDayIso]
  );

  // Get displayed value for a student's time input on selectedDayIso
  const getStudentInputTime = useCallback(
    (studentId: number): string => {
      if (studentId in currentDayDrafts) {
        return currentDayDrafts[studentId];
      }
      return existingAppointmentsForSelectedDay[studentId]?.start_time || '';
    },
    [currentDayDrafts, existingAppointmentsForSelectedDay]
  );

  const handleTimeInputChange = (studentId: number, value: string) => {
    setDraftTimesByDay((prev) => ({
      ...prev,
      [selectedDayIso]: {
        ...(prev[selectedDayIso] || {}),
        [studentId]: value,
      },
    }));
  };

  const handleTimeInputBlur = (studentId: number) => {
    const currentVal = getStudentInputTime(studentId);
    if (!currentVal.trim()) return;
    const normalized = normalizeTimeInput(currentVal);
    if (normalized !== currentVal) {
      handleTimeInputChange(studentId, normalized);
    }
  };

  // Students filtered by selected academic field tab & search query
  const spreadsheetStudents = useMemo(() => {
    return items.filter((item) => {
      const itemField = item.field || 'تجربی';
      if (itemField !== appointmentFieldTab) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim();
        if (!String(item.student_name ?? '').includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [items, appointmentFieldTab, searchQuery]);

  // Counts per field tab
  const fieldTabCounts = useMemo(() => {
    const counts: Record<SpreadsheetField, { total: number; filled: number }> = {
      تجربی: { total: 0, filled: 0 },
      ریاضی: { total: 0, filled: 0 },
      انسانی: { total: 0, filled: 0 },
    };

    for (const item of items) {
      const f: SpreadsheetField =
        item.field === 'ریاضی' || item.field === 'انسانی' ? item.field : 'تجربی';
      counts[f].total += 1;
      const t = getStudentInputTime(item.student_id).trim();
      if (t && isValidAppointmentTimeHm(t)) {
        counts[f].filled += 1;
      }
    }

    return counts;
  }, [items, getStudentInputTime]);

  // Sync plan across ALL students for selectedDayIso (so switching field tabs never loses edits)
  const syncPlan = useMemo(
    () =>
      computeSpreadsheetSyncPlan(
        items,
        existingAppointmentsForSelectedDay,
        currentDayDrafts
      ),
    [items, existingAppointmentsForSelectedDay, currentDayDrafts]
  );

  const pendingChangesCount =
    syncPlan.toCreate.length + syncPlan.toUpdate.length + syncPlan.toDelete.length;

  // Excel-like Enter / ArrowDown / ArrowUp navigation between row inputs
  const handleTimeInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    studentId: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      handleTimeInputBlur(studentId);
      const nextStudent = spreadsheetStudents[rowIndex + 1];
      if (nextStudent) {
        const nextEl = timeInputRefs.current[nextStudent.student_id];
        nextEl?.focus();
        nextEl?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleTimeInputBlur(studentId);
      const prevStudent = spreadsheetStudents[rowIndex - 1];
      if (prevStudent) {
        const prevEl = timeInputRefs.current[prevStudent.student_id];
        prevEl?.focus();
        prevEl?.select();
      }
    }
  };

  // Save all entered/modified times for selectedDayIso, and optionally dispatch SMS immediately
  const handlePersistAndSend = async (sendSmsAfterSave: boolean) => {
    if (syncPlan.invalidRows.length > 0) {
      const firstInvalid = syncPlan.invalidRows[0];
      showToast(
        `ساعت واردشده برای «${firstInvalid.student_name}» معتبر نیست (فرمت صحیح: مثلاً ۱۴:۳۰)`,
        'error'
      );
      timeInputRefs.current[firstInvalid.student_id]?.focus();
      return;
    }

    if (
      !sendSmsAfterSave &&
      pendingChangesCount === 0
    ) {
      showToast('تغییر جدیدی برای ذخیره وجود ندارد', 'info');
      return;
    }

    if (
      sendSmsAfterSave &&
      pendingChangesCount === 0 &&
      syncPlan.activeStudentIdsWithTime.length === 0 &&
      summary.will_send === 0 &&
      summary.changed_since_sent === 0
    ) {
      showToast(
        'ابتدا ساعت نوبت حداقل یک دانش‌آموز را در جدول وارد کنید',
        'warning'
      );
      return;
    }

    if (sendSmsAfterSave) {
      setIsSubmittingSheet(true);
    } else {
      setIsSavingOnly(true);
    }

    try {
      let savedCount = 0;
      let deletedCount = 0;

      // 1. Delete cleared appointments
      for (const delItem of syncPlan.toDelete) {
        await API.deleteAppointment(delItem.appointment_id);
        deletedCount += 1;
      }

      // 2. Update modified appointments (PUT or DELETE + POST fallback)
      for (const updItem of syncPlan.toUpdate) {
        try {
          await API.upsertAppointment({
            id: updItem.appointment_id,
            student_id: updItem.student_id,
            appointment_date: selectedDayIso,
            start_time: updItem.start_time,
            status: 'confirmed',
          });
        } catch {
          await API.deleteAppointment(updItem.appointment_id);
          await API.upsertAppointment({
            student_id: updItem.student_id,
            appointment_date: selectedDayIso,
            start_time: updItem.start_time,
            status: 'confirmed',
          });
        }
        savedCount += 1;
      }

      // 3. Create newly entered appointments
      for (const newItem of syncPlan.toCreate) {
        await API.upsertAppointment({
          student_id: newItem.student_id,
          appointment_date: selectedDayIso,
          start_time: newItem.start_time,
          status: 'confirmed',
        });
        savedCount += 1;
      }

      // Clear local draft overrides for selectedDayIso now that they're persisted
      setDraftTimesByDay((prev) => {
        const next = { ...prev };
        delete next[selectedDayIso];
        return next;
      });

      // 4. If sendSmsAfterSave is true, dispatch SMS reminders via POST /api/v1/appointments/sms/send
      if (sendSmsAfterSave) {
        const targetStudentIds = Array.from(
          new Set([
            ...syncPlan.toCreate.map((i) => i.student_id),
            ...syncPlan.toUpdate.map((i) => i.student_id),
            ...syncPlan.activeStudentIdsWithTime,
          ])
        );

        let totalSent = 0;
        let totalFailed = 0;

        // Send unsent appointments
        const unsentRes = await API.sendAppointmentsSms({
          week_date: currentWeek.week_date,
          mode: 'unsent',
          student_ids: targetStudentIds.length > 0 ? targetStudentIds : undefined,
          operation_id: `op-unsent-${currentWeek.week_date.replace(/-/g, '')}-${Date.now()}`,
        });
        totalSent += unsentRes.data?.summary?.sent ?? 0;
        totalFailed += unsentRes.data?.summary?.failed ?? 0;

        // If any existing appointments were updated, also send 'changed' mode for them
        if (syncPlan.toUpdate.length > 0 || summary.changed_since_sent > 0) {
          const changedIds = syncPlan.toUpdate.map((u) => u.student_id);
          try {
            const changedRes = await API.sendAppointmentsSms({
              week_date: currentWeek.week_date,
              mode: 'changed',
              student_ids: changedIds.length > 0 ? changedIds : undefined,
              operation_id: `op-changed-${currentWeek.week_date.replace(/-/g, '')}-${Date.now()}`,
            });
            totalSent += changedRes.data?.summary?.sent ?? 0;
            totalFailed += changedRes.data?.summary?.failed ?? 0;
          } catch {
            // Ignore if no changed items needed SMS
          }
        }

        await fetchWeekData(currentWeek.week_date, false);

        if (totalFailed > 0) {
          showToast(
            `${toPersianDigits(savedCount)} نوبت ذخیره شد • پیامک: ${toPersianDigits(totalSent)} موفق، ${toPersianDigits(totalFailed)} ناموفق`,
            'warning'
          );
        } else {
          showToast(
            `نوبت‌ها ثبت و پیامک یادآوری برای ${toPersianDigits(totalSent)} نفر ارسال شد`,
            'success'
          );
        }
      } else {
        await fetchWeekData(currentWeek.week_date, false);
        showToast(
          `${toPersianDigits(savedCount)} نوبت ذخیره${
            deletedCount > 0 ? ` و ${toPersianDigits(deletedCount)} نوبت حذف` : ''
          } شد`,
          'success'
        );
      }
    } catch (err) {
      showToast(
        (err as Error)?.message || 'خطا در ثبت نوبت‌ها یا ارسال پیامک',
        'error'
      );
    } finally {
      setIsSubmittingSheet(false);
      setIsSavingOnly(false);
    }
  };

  // Clear a single student's appointment on selectedDayIso immediately or in draft
  const handleClearStudentRowTime = async (studentId: number, studentName: string) => {
    const existing = existingAppointmentsForSelectedDay[studentId];
    if (existing && existing.appointment_id) {
      try {
        await API.deleteAppointment(existing.appointment_id);
        setDraftTimesByDay((prev) => {
          const dayMap = { ...(prev[selectedDayIso] || {}) };
          delete dayMap[studentId];
          return { ...prev, [selectedDayIso]: dayMap };
        });
        await fetchWeekData(currentWeek.week_date, false);
        showToast(`نوبت «${studentName}» حذف شد`, 'info');
      } catch (err) {
        showToast((err as Error)?.message || 'خطا در حذف نوبت', 'error');
      }
    } else {
      handleTimeInputChange(studentId, '');
    }
  };

  // Parent Contacts Modal Handlers (/api/v1/students/{studentId}/parent-contacts)
  const openParentContactsModal = async (item: AppointmentSmsPreviewItem) => {
    setContactModalStudent(item);
    setContactForm({
      parent_name: item.parent_name || '',
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
        (err as Error)?.message || 'خطا در دریافت شماره‌های تماس والدین',
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

    const studentId = contactModalStudent.student_id;
    setIsSavingContact(true);
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
      await fetchWeekData(currentWeek.week_date, false);

      setContactForm({
        parent_name: '',
        relationship: 'father',
        phone: '',
        is_primary: false,
      });
      setContactErrors({});
      showToast('شماره تماس ولی ثبت شد', 'success');
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
    setSelectedDayIso(satIso);
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
        if (!resolvedSessionId) {
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
      const entry = attendanceEntries.find((e) => e.student_id === studentId);
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

  const selectedDayMeta = useMemo(
    () =>
      weekDays.find((d) => d.iso === selectedDayIso) || {
        iso: selectedDayIso,
        weekday: '',
        jalali: formatGregorianToJalali(selectedDayIso),
        shortJalali: formatGregorianToJalali(selectedDayIso).slice(5),
      },
    [weekDays, selectedDayIso]
  );

  return (
    <div
      id="page-appointments"
      className="space-y-4 pb-24 max-w-full overflow-x-hidden"
    >
      {/* Top Bar: Week Navigation + Mode Switch (Appointments Sheet vs Remedial Matrix) + SMS Log */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Week Navigation */}
          <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/70 rounded-xl p-1">
            <button
              type="button"
              onClick={() => handleShiftWeek(-7)}
              aria-label="هفته قبل"
              title="هفته قبل"
              className="min-w-[40px] min-h-[40px] rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#445D84] transition-colors cursor-pointer shrink-0"
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
              className="min-h-[40px] px-3 py-1 rounded-lg hover:bg-white transition-colors text-center cursor-pointer whitespace-nowrap"
              title="تغییر بازه هفته"
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
              className="min-w-[40px] min-h-[40px] rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-[#445D84] transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-navigation: Appointments Spreadsheet vs Remedial Matrix */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/70">
            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'appointments'
                  ? 'bg-[#445D84] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>جدول نوبت‌دهی ({toPersianDigits(summary.total)})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('remedial')}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'remedial'
                  ? 'bg-[#445D84] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>رفع اشکال ({toPersianDigits(remedialClasses.length)})</span>
            </button>
          </div>

          {/* Right Quick Utilities: SMS Logs + Server Refresh */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsLogDrawerOpen(true)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              aria-label="لاگ پیامک"
            >
              <History className="w-4 h-4 text-[#445D84]" />
              <span>لاگ پیامک ({toPersianDigits(smsLogs.length)})</span>
            </button>

            <button
              type="button"
              onClick={() => fetchWeekData(currentWeek.week_date, true)}
              disabled={isLoading}
              aria-label="بروزرسانی از سرور"
              title="بروزرسانی از سرور"
              className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#445D84]' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'appointments' ? (
        /* ======================================================================
           Excel-Like Fast Appointment Scheduling View
           1. Field Tabs (تجربی | ریاضی | انسانی)
           2. Day Selector (شنبه تا جمعه)
           3. Spreadsheet Table (Student Name + Time Input HH:MM)
           4. Primary "ارسال" Button (Saves times & sends SMS)
           ====================================================================== */
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          {/* Control Strip: Day Selector + Field Tabs + Search + Send Button */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200/80 space-y-3.5 bg-slate-50/50">
            {/* Step 1: Select Day of the Week */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-xs font-bold text-slate-500 pe-1 whitespace-nowrap shrink-0">
                  انتخاب روز نوبت:
                </span>
                {weekDays.map((day) => {
                  const isSelectedDay = day.iso === selectedDayIso;
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() => setSelectedDayIso(day.iso)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 border ${
                        isSelectedDay
                          ? 'bg-[#445D84] text-white border-[#445D84]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{day.weekday}</span>
                      <span
                        className={`tabular-nums text-[11px] ${
                          isSelectedDay ? 'text-white/85' : 'text-slate-400'
                        }`}
                      >
                        {toPersianDigits(day.shortJalali)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Direct Date Input fallback */}
              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 self-start lg:self-auto shrink-0">
                <Calendar className="w-3.5 h-3.5 text-[#445D84]" />
                <input
                  type="date"
                  aria-label="تاریخ دقیق نوبت"
                  value={selectedDayIso}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDayIso(e.target.value);
                  }}
                  className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none min-h-[32px] tabular-nums"
                />
                <span className="text-[11px] text-slate-500 tabular-nums">
                  ({toPersianDigits(selectedDayMeta.jalali)})
                </span>
              </div>
            </div>

            {/* Step 2: Field Tabs (تجربی | ریاضی | انسانی) + Search + Primary Send CTA */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/60">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="tablist"
                  aria-label="تب‌های رشته تحصیلی"
                  className="inline-flex flex-wrap p-1 rounded-xl bg-slate-200/70 border border-slate-200"
                >
                  {ACADEMIC_FIELDS.map((field) => {
                    const isActive = appointmentFieldTab === field;
                    const stat = fieldTabCounts[field];
                    return (
                      <button
                        key={field}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setAppointmentFieldTab(field)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-white text-[#445D84] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>رشته {field}</span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          ({toPersianDigits(stat.filled)}/{toPersianDigits(stat.total)})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Student Name Filter */}
                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجوی نام شاگرد..."
                    className="w-full min-h-[38px] ps-8 pe-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-[#445D84]"
                  />
                </div>
              </div>

              {/* Action Buttons: Save Only & Save + Send SMS */}
              <div className="flex items-center gap-2 shrink-0">
                {pendingChangesCount > 0 && (
                  <button
                    type="button"
                    disabled={isSavingOnly || isSubmittingSheet}
                    onClick={() => handlePersistAndSend(false)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isSavingOnly ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-[#445D84]" />
                    )}
                    <span>
                      فقط ذخیره ({toPersianDigits(pendingChangesCount)})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSubmittingSheet || isSavingOnly}
                  onClick={() => handlePersistAndSend(true)}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isSubmittingSheet ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {isSubmittingSheet ? 'در حال ثبت و ارسال...' : 'ارسال'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Error Banner if API failed */}
          {errorState && (
            <div className="m-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-rose-700 text-xs font-bold">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorState}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchWeekData(currentWeek.week_date, true)}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {/* Step 3: Excel-Like Spreadsheet Table */}
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-11 rounded-lg bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : spreadsheetStudents.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                دانش‌آموزی در رشته {appointmentFieldTab} یافت نشد
              </p>
              {searchQuery.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold text-[#445D84] hover:underline cursor-pointer"
                >
                  پاک کردن جستجو
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* Desktop View: Full Table */}
              <table
                aria-label={`جدول اکسل نوبت‌دهی رشته ${appointmentFieldTab}`}
                className="hidden md:table w-full text-start border-collapse"
              >
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 text-xs">
                    <th className="py-2.5 px-3 font-bold w-12 text-center border-e border-slate-200/80">
                      #
                    </th>
                    <th className="py-2.5 px-4 font-bold min-w-[180px] border-e border-slate-200/80">
                      نام شاگرد ({appointmentFieldTab})
                    </th>
                    <th className="py-2.5 px-4 font-bold w-56 border-e border-slate-200/80">
                      ساعت نوبت ({selectedDayMeta.weekday}{' '}
                      {toPersianDigits(selectedDayMeta.shortJalali)})
                    </th>
                    <th className="py-2.5 px-4 font-bold min-w-[190px]">
                      وضعیت و شماره ولی
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {spreadsheetStudents.map((student, idx) => {
                    const existingOnDay =
                      existingAppointmentsForSelectedDay[student.student_id];
                    const existingTime = existingOnDay?.start_time || '';
                    const inputVal = getStudentInputTime(student.student_id);
                    const trimmedVal = inputVal.trim();
                    const isValidTime =
                      !trimmedVal || isValidAppointmentTimeHm(trimmedVal);
                    const normalizedVal = trimmedVal
                      ? normalizeTimeInput(trimmedVal)
                      : '';
                    const isModified = normalizedVal !== existingTime;
                    const hasPhone =
                      Boolean(student.mobile_mask || student.mobile) &&
                      student.status !== 'no_phone';

                    return (
                      <tr
                        key={student.student_id}
                        className={`transition-colors ${
                          !isValidTime
                            ? 'bg-rose-50/50'
                            : isModified
                            ? 'bg-amber-50/40'
                            : existingTime
                            ? 'bg-emerald-50/20 hover:bg-slate-50'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Row Number */}
                        <td className="py-2 px-3 text-center text-slate-400 font-mono tabular-nums border-e border-slate-200/60">
                          {toPersianDigits(idx + 1)}
                        </td>

                        {/* Student Name & Grade */}
                        <td className="py-2 px-4 border-e border-slate-200/60">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-sm whitespace-nowrap">
                              {student.student_name}
                            </span>
                            {student.grade && (
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                پایه {toPersianDigits(student.grade)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Spreadsheet Time Input Cell */}
                        <td className="py-1.5 px-3 border-e border-slate-200/60">
                          <div className="flex items-center gap-1.5">
                            <input
                              ref={(el) => {
                                timeInputRefs.current[student.student_id] = el;
                              }}
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              aria-label={`ساعت نوبت ${student.student_name}`}
                              value={inputVal}
                              placeholder="مثلاً 14:30"
                              onChange={(e) =>
                                handleTimeInputChange(
                                  student.student_id,
                                  e.target.value
                                )
                              }
                              onBlur={() => handleTimeInputBlur(student.student_id)}
                              onKeyDown={(e) =>
                                handleTimeInputKeyDown(
                                  e,
                                  idx,
                                  student.student_id
                                )
                              }
                              className={`w-full h-9 px-3 rounded-lg border font-mono text-sm font-bold text-center tabular-nums transition-colors focus:outline-none ${
                                !isValidTime
                                  ? 'border-rose-400 bg-white text-rose-700 focus:border-rose-600'
                                  : isModified
                                  ? 'border-amber-400 bg-white text-slate-900 focus:border-[#445D84]'
                                  : trimmedVal
                                  ? 'border-emerald-300 bg-white text-emerald-900 focus:border-[#445D84]'
                                  : 'border-slate-200 bg-slate-50/70 text-slate-800 focus:bg-white focus:border-[#445D84]'
                              }`}
                            />
                            {(trimmedVal || existingTime) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleClearStudentRowTime(
                                    student.student_id,
                                    student.student_name
                                  )
                                }
                                title="پاک کردن ساعت نوبت"
                                aria-label={`پاک کردن ساعت نوبت ${student.student_name}`}
                                className="min-w-[32px] min-h-[32px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Status & Parent Phone Info */}
                        <td className="py-2 px-4">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {!isValidTime ? (
                                <span className="text-rose-600 font-bold">
                                  ساعت نامعتبر (مثال: 14:30)
                                </span>
                              ) : isModified && normalizedVal ? (
                                <span className="text-amber-700 font-bold">
                                  آماده ثبت ({toPersianDigits(normalizedVal)})
                                </span>
                              ) : isModified && !normalizedVal ? (
                                <span className="text-rose-600 font-bold">
                                  حذف نوبت پس از ارسال
                                </span>
                              ) : existingTime ? (
                                student.status === 'already_sent' ? (
                                  <span className="text-emerald-700 font-bold">
                                    ثبت و پیامک شده ({toPersianDigits(existingTime)})
                                  </span>
                                ) : (
                                  <span className="text-[#445D84] font-bold">
                                    ثبت شده ({toPersianDigits(existingTime)})
                                  </span>
                                )
                              ) : student.appointment_date &&
                                student.appointment_date !== selectedDayIso &&
                                student.start_time ? (
                                <span className="text-slate-400">
                                  نوبت در{' '}
                                  {toPersianDigits(
                                    formatGregorianToJalali(
                                      student.appointment_date
                                    ).slice(5)
                                  )}{' '}
                                  ساعت {toPersianDigits(student.start_time.slice(0, 5))}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => openParentContactsModal(student)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                                hasPhone
                                  ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                  : 'text-orange-600 bg-orange-50 hover:bg-orange-100 font-bold'
                              }`}
                              title="مدیریت شماره موبایل ولی"
                            >
                              {hasPhone ? (
                                <>
                                  <Phone className="w-3 h-3" />
                                  <span dir="ltr" className="font-mono tabular-nums">
                                    {toPersianDigits(
                                      student.mobile_mask || student.mobile || ''
                                    )}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <PhoneOff className="w-3 h-3" />
                                  <span>ثبت شماره ولی</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile View: Card List */}
              <ul className="md:hidden space-y-3 p-3" role="list">
                {spreadsheetStudents.map((student) => {
                  const existingOnDay =
                    existingAppointmentsForSelectedDay[student.student_id];
                  const existingTime = existingOnDay?.start_time || '';
                  const inputVal = getStudentInputTime(student.student_id);
                  const trimmedVal = inputVal.trim();
                  const isValidTime =
                    !trimmedVal || isValidAppointmentTimeHm(trimmedVal);
                  const normalizedVal = trimmedVal
                    ? normalizeTimeInput(trimmedVal)
                    : '';
                  const isModified = normalizedVal !== existingTime;
                  const hasPhone =
                    Boolean(student.mobile_mask || student.mobile) &&
                    student.status !== 'no_phone';

                  return (
                    <li
                      key={student.student_id}
                      className={`rounded-2xl border p-3.5 shadow-2xs space-y-3 ${
                        !isValidTime
                          ? 'border-rose-300 bg-rose-50/40'
                          : isModified
                          ? 'border-amber-300 bg-amber-50/30'
                          : existingTime
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-slate-200/90 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-extrabold text-slate-900 break-words">
                            {student.student_name}
                          </div>
                          {student.grade && (
                            <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                              پایه {toPersianDigits(student.grade)}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openParentContactsModal(student)}
                          className={`min-w-11 min-h-11 px-2.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                            hasPhone
                              ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                              : 'text-orange-700 bg-orange-100 hover:bg-orange-200'
                          }`}
                          title="مدیریت شماره موبایل ولی"
                          aria-label={`شماره ولی ${student.student_name}`}
                        >
                          {hasPhone ? (
                            <Phone className="w-4 h-4" />
                          ) : (
                            <PhoneOff className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          aria-label={`ساعت نوبت ${student.student_name}`}
                          value={inputVal}
                          placeholder="ساعت نوبت (مثلاً 14:30)"
                          onChange={(e) =>
                            handleTimeInputChange(
                              student.student_id,
                              e.target.value
                            )
                          }
                          onBlur={() => handleTimeInputBlur(student.student_id)}
                          className={`flex-1 min-h-11 px-3 rounded-xl border font-mono text-sm font-bold text-center tabular-nums transition-colors focus:outline-none ${
                            !isValidTime
                              ? 'border-rose-400 bg-white text-rose-700 focus:border-rose-600'
                              : isModified
                              ? 'border-amber-400 bg-white text-slate-900 focus:border-[#445D84]'
                              : trimmedVal
                              ? 'border-emerald-300 bg-white text-emerald-900 focus:border-[#445D84]'
                              : 'border-slate-200 bg-slate-50 text-slate-800 focus:bg-white focus:border-[#445D84]'
                          }`}
                        />
                        {(trimmedVal || existingTime) && (
                          <button
                            type="button"
                            onClick={() =>
                              handleClearStudentRowTime(
                                student.student_id,
                                student.student_name
                              )
                            }
                            title="پاک کردن ساعت نوبت"
                            aria-label={`پاک کردن ساعت نوبت ${student.student_name}`}
                            className="min-w-11 min-h-11 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {(!isValidTime || isModified || existingTime) && (
                        <div className="text-xs pt-1 border-t border-slate-100">
                          {!isValidTime ? (
                            <span className="text-rose-600 font-bold">
                              ساعت نامعتبر (مثال: 14:30)
                            </span>
                          ) : isModified && normalizedVal ? (
                            <span className="text-amber-700 font-bold">
                              آماده ثبت ({toPersianDigits(normalizedVal)})
                            </span>
                          ) : isModified && !normalizedVal ? (
                            <span className="text-rose-600 font-bold">
                              حذف نوبت پس از ارسال
                            </span>
                          ) : existingTime ? (
                            student.status === 'already_sent' ? (
                              <span className="text-emerald-700 font-bold">
                                ثبت و پیامک شده ({toPersianDigits(existingTime)})
                              </span>
                            ) : (
                              <span className="text-[#445D84] font-bold">
                                ثبت شده ({toPersianDigits(existingTime)})
                              </span>
                            )
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Bottom Quick Summary & Submit Bar */}
          <div className="p-3.5 sm:p-4 bg-slate-50/80 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                روز انتخابی:{' '}
                <strong className="text-slate-800">
                  {selectedDayMeta.weekday}{' '}
                  {toPersianDigits(selectedDayMeta.jalali)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                دارای ساعت در این روز:{' '}
                <strong className="text-slate-800 tabular-nums">
                  {toPersianDigits(syncPlan.activeStudentIdsWithTime.length)} نفر
                </strong>
              </span>
              {pendingChangesCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-bold tabular-nums">
                    {toPersianDigits(pendingChangesCount)} تغییر ذخیره‌نشده
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmittingSheet || isSavingOnly}
                onClick={() => handlePersistAndSend(true)}
                className="min-h-[42px] px-6 py-2 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmittingSheet ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSubmittingSheet ? 'در حال ثبت و ارسال...' : 'ارسال'}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Remedial Classes & Daily Attendance Matrix View (/api/v1/tutoring* & /api/v1/attendance*) */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                {ACADEMIC_FIELDS.map((f) => (
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
            <div>
              {/* Desktop View: Remedial Classes Attendance Table */}
              <div className="hidden md:block rounded-xl border border-slate-200/80 overflow-hidden">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-[#344868] text-white text-xs">
                      <th className="py-3.5 px-4 font-bold min-w-[170px]">
                        نام دانش‌آموز ({remedialFieldTab})
                      </th>
                      <th className="py-3.5 px-4 font-bold text-center min-w-[230px] border-s border-white/10">
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
                            className="py-3.5 px-4 font-bold text-center min-w-[200px] border-s border-white/10"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 text-start">
                                <div className="break-words">{col.class_name}</div>
                                {col.teacher_name && (
                                  <div className="text-[10px] font-normal text-white/75 break-words">
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
                          <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                            <div>{student.student_name}</div>
                            {student.grade && (
                              <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                                پایه {toPersianDigits(student.grade)}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-center border-s border-slate-100 align-middle">
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
                                className="py-3 px-3 text-center border-s border-slate-100 align-middle"
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

              {/* Mobile View: Card List for Remedial Classes & Daily Attendance */}
              <div className="md:hidden space-y-3">
                {currentFieldRemedialClasses.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {currentFieldRemedialClasses.map((col) => {
                      const inClassCount = allFieldStudents.filter(
                        (s) =>
                          getStudentClassAttendance(col, s.student_id).status ===
                          'in_class'
                      ).length;
                      return (
                        <div
                          key={col.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#344868] text-white text-xs"
                        >
                          <span className="font-bold">{col.class_name}</span>
                          <span className="text-[11px] text-emerald-200">
                            (حاضر: {toPersianDigits(inClassCount)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteRemedialClass(col.id)}
                            className="p-1 rounded-lg text-white/70 hover:text-rose-300 cursor-pointer"
                            title="حذف ستون کلاس"
                            aria-label={`حذف کلاس ${col.class_name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ul className="space-y-3" role="list">
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
                      <li
                        key={student.student_id}
                        className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold text-slate-900 break-words">
                            {student.student_name}
                          </span>
                          {student.grade && (
                            <span className="text-xs text-slate-500 tabular-nums shrink-0">
                              پایه {toPersianDigits(student.grade)}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
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
                            className={`min-h-11 px-2 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                              arrivedHm
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <LogIn className="w-3.5 h-3.5 shrink-0" />
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
                            className={`min-h-11 px-2 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                              departedHm
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <LogOut className="w-3.5 h-3.5 shrink-0" />
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
                            className={`min-h-11 px-2 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                              examStartHm
                                ? 'bg-blue-50 border-blue-200 text-blue-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <ClipboardList className="w-3.5 h-3.5 shrink-0" />
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
                            className={`min-h-11 px-2 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                              examEndHm
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {examEndHm
                                ? `پایان: ${toPersianDigits(examEndHm)}`
                                : 'پایان آزمون'}
                            </span>
                          </button>
                        </div>

                        {currentFieldRemedialClasses.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            {currentFieldRemedialClasses.map((col) => {
                              const att = getStudentClassAttendance(
                                col,
                                student.student_id
                              );
                              const isCellBusy =
                                updatingCellKey === `${col.id}-${student.student_id}`;

                              return (
                                <div
                                  key={col.id}
                                  className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80"
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-bold text-slate-800">
                                      {col.class_name}
                                    </span>
                                    {col.teacher_name && (
                                      <span className="text-[11px] text-slate-500">
                                        {col.teacher_name}
                                      </span>
                                    )}
                                  </div>

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
                                      className="min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-white text-slate-700 font-bold text-xs cursor-pointer disabled:opacity-50"
                                    >
                                      <LogIn className="w-3.5 h-3.5" />
                                      <span>ثبت ورود به کلاس</span>
                                    </button>
                                  )}

                                  {att.status === 'in_class' && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-emerald-700">
                                        حاضر ({toPersianDigits(att.entered_at || '')})
                                      </span>
                                      <div className="flex items-center gap-1.5">
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
                                          className="min-h-11 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        >
                                          <LogOut className="w-3.5 h-3.5" />
                                          <span>ثبت خروج</span>
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
                                          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-600 border border-slate-200 cursor-pointer"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {att.status === 'left_class' && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-indigo-800">
                                        خارج شده ({toPersianDigits(att.entered_at || '—')} تا{' '}
                                        {toPersianDigits(att.exited_at || '—')})
                                      </span>
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
                                        className="min-h-11 px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-bold text-slate-700 cursor-pointer"
                                      >
                                        برگشت به کلاس
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
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
                          <div dir="ltr" className="font-mono text-slate-600 text-end">
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

      {/* SMS Log Slide-Over / Bottom Sheet Drawer */}
      {isLogDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="گزارش لاگ پیامک‌های یادآوری نوبت"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsLogDrawerOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-stretch sm:justify-end"
        >
          <div className="w-full sm:max-w-md max-h-[88vh] sm:max-h-full bg-white rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-[#344868] text-white flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <h3 className="text-sm font-bold">
                  تاریخچه ارسال پیامک ({toPersianDigits(smsLogs.length)})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(false)}
                aria-label="بستن"
                className="min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center hover:bg-white/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0">
              {(
                [
                  { id: 'all', label: 'همه' },
                  { id: 'sent', label: 'ارسال موفق' },
                  { id: 'failed', label: 'ناموفق' },
                  { id: 'skipped_no_phone', label: 'بدون شماره' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLogStatusFilter(tab.id)}
                  className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    logStatusFilter === tab.id
                      ? 'bg-[#445D84] text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  لاگی برای نمایش وجود ندارد.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 bg-white space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        {log.student_name || `دانش‌آموز #${log.student_id}`}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : log.status === 'failed'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-orange-50 text-orange-700 border border-orange-200'
                        }`}
                      >
                        {log.status === 'sent'
                          ? 'موفق'
                          : log.status === 'failed'
                          ? 'ناموفق'
                          : 'بدون شماره'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span dir="ltr" className="font-mono">
                        {toPersianDigits(log.mobile_mask || log.mobile || '—')}
                      </span>
                      <span>
                        {log.sent_at
                          ? toPersianDigits(
                              formatGregorianToJalali(log.sent_at.slice(0, 10))
                            )
                          : ''}
                      </span>
                    </div>
                    {log.last_error && (
                      <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg">
                        {log.last_error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Week Date Picker Modal */}
      {isNewWeekModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تغییر تاریخ هفته"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewWeekModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">انتخاب هفته</h3>
              <button
                type="button"
                onClick={() => setIsNewWeekModalOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              noValidate
              onSubmit={handleCreateNewWeek}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تاریخ یکی از روزهای هفته *
                </label>
                <input
                  type="date"
                  value={newWeekForm.week_date}
                  onChange={(e) => {
                    const iso = e.target.value;
                    const sat = getSaturdayOfWeek(iso);
                    const fri = addDaysIso(sat, 6);
                    const sJal = formatGregorianToJalali(sat);
                    const eJal = formatGregorianToJalali(fri);
                    setNewWeekForm({
                      title: `${toPersianDigits(sJal)} تا ${toPersianDigits(eJal)}`,
                      week_date: sat,
                      start_date_jalali: sJal,
                      end_date_jalali: eJal,
                    });
                  }}
                  className={MOBILE_INPUT_CLASS(false)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  شروع هفته:{' '}
                  <strong className="text-slate-800">
                    {toPersianDigits(newWeekForm.start_date_jalali)}
                  </strong>
                </div>
                <div>
                  پایان هفته:{' '}
                  <strong className="text-slate-800">
                    {toPersianDigits(newWeekForm.end_date_jalali)}
                  </strong>
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base cursor-pointer"
              >
                مشاهده این هفته
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Remedial Class Modal */}
      {isAddClassModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="افزودن ستون کلاس رفع اشکال"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddClassModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                افزودن کلاس رفع اشکال ({remedialFieldTab})
              </h3>
              <button
                type="button"
                onClick={() => setIsAddClassModalOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              noValidate
              onSubmit={handleAddRemedialClass}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام کلاس / درس *
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
                      setNewClassErrors({});
                    }
                  }}
                  placeholder="مثال: رفع اشکال زیست‌شناسی"
                  className={MOBILE_INPUT_CLASS(Boolean(newClassErrors.class_name))}
                />
                <FieldError message={newClassErrors.class_name} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
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
                  placeholder="مثال: دکتر علوی"
                  className={MOBILE_INPUT_CLASS(false)}
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base cursor-pointer"
              >
                ثبت ستون کلاس
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Guest Student Modal (POST /api/v1/attendance/guests) */}
      {isAddGuestModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ثبت دانش‌آموز مهمان در حضور روزانه"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddGuestModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                ثبت دانش‌آموز مهمان ({toPersianDigits(formatGregorianToJalali(remedialDate))})
              </h3>
              <button
                type="button"
                onClick={() => setIsAddGuestModalOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              noValidate
              onSubmit={handleAddAttendanceGuest}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نام و نام خانوادگی دانش‌آموز مهمان *
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
                  placeholder="مثال: علی احمدی"
                  className={MOBILE_INPUT_CLASS(Boolean(guestError))}
                />
                <FieldError message={guestError} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
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

              <button
                type="submit"
                disabled={isSavingGuest}
                className="w-full min-h-[48px] h-12 rounded-xl bg-[#445D84] hover:bg-[#344868] text-white font-bold text-base inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingGuest && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>ثبت حضور مهمان</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
