import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Calendar,
  Users,
  Eye,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Printer,
  MessageSquarePlus,
  Trash2,
  TrendingUp,
  Share2,
  Link2,
  Pencil,
  ListFilter,
  RefreshCw,
} from 'lucide-react';
import API from '../lib/api';
import {
  formatJalaliLong,
  formatGregorianToJalali,
  getTodayGregorianIso,
  toPersianDigits,
} from '../lib/jalali';
import {
  safeNumber,
  safeTrim,
  formatFixed,
  createInitialTeacherFeedbacks,
  getAuthorRoleLabel,
  canEditExamResults,
  groupExamRowsByStudent,
  applyUpdatedExamRowToDetails,
  applyUpdatedExamRowToList,
  type TeacherFeedbackRow,
  type StudentExamTrendPoint,
} from '../lib/exam-math';
import type {
  ExamComment,
  ExamDateSummary,
  ExamDetailsResponse,
  ExamListItem,
  ExamStudentSummary,
  PageId,
  SubjectResult,
  ToastType,
  UserRole,
} from '../types';
import {
  RadialGauge,
  StudentExamTrendChart,
  PrintableStudentTrendChart,
} from '../components/Charts';
import { ActionButton } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';
import { ExamShareLinksModal } from '../components/ExamShareLinksModal';
import { ExamCommentsSection } from '../components/ExamCommentsSection';
import { EditExamResultModal } from '../components/EditExamResultModal';
import { JalaliDatePicker } from '../components/JalaliDatePicker';

interface ExamsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  onNavigate: (page: PageId) => void;
  userRole?: UserRole | string;
}

type ExamViewLevel = 'dates' | 'students' | 'details' | 'list';

export const ExamsPage: React.FC<ExamsPageProps> = ({ showToast, onNavigate, userRole }) => {
  const effectiveRole = safeTrim(userRole || API.currentActorRole || 'admin').toLowerCase();
  const canEdit = canEditExamResults(effectiveRole);

  const [view, setView] = useState<ExamViewLevel>('dates');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [dates, setDates] = useState<ExamDateSummary[]>([]);
  const [students, setStudents] = useState<ExamStudentSummary[]>([]);
  const [details, setDetails] = useState<ExamDetailsResponse | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, ExamDetailsResponse>>({});
  const [teacherFeedbacks, setTeacherFeedbacks] = useState<TeacherFeedbackRow[]>([]);
  const [counselorNote, setCounselorNote] = useState('');
  const [trendPoints, setTrendPoints] = useState<StudentExamTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  // Flat Exams List state (GET /api/v1/exams)
  const [examsList, setExamsList] = useState<ExamListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [filterStudentId, setFilterStudentId] = useState('');
  const [useDateFrom, setUseDateFrom] = useState(false);
  const [useDateTo, setUseDateTo] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState(() => getTodayGregorianIso());
  const [filterDateTo, setFilterDateTo] = useState(() => getTodayGregorianIso());
  const [studentFilterOptions, setStudentFilterOptions] = useState<
    Array<{ id: number; name: string }>
  >([]);

  // Edit Exam Result Modal state
  const [editingExam, setEditingExam] = useState<ExamListItem | null>(null);
  const [resolvingSubjectEdit, setResolvingSubjectEdit] = useState(false);

  const [shareModalState, setShareModalState] = useState<{
    isOpen: boolean;
    studentId?: number | null;
    studentName?: string | null;
    examDate?: string | null;
  }>({ isOpen: false });

  const loadDates = useCallback(
    async (month = monthFilter) => {
      setLoading(true);
      setView('dates');
      setSelectedDate(null);
      setDetails(null);
      try {
        const res = await API.getExamDates(month);
        setDates(res.data?.dates || []);
      } catch {
        showToast('خطا در بارگذاری آزمون‌ها', 'error');
      } finally {
        setLoading(false);
      }
    },
    [monthFilter, showToast]
  );

  useEffect(() => {
    loadDates(monthFilter);
  }, [loadDates, monthFilter]);

  useEffect(() => {
    if (effectiveRole === 'student') return;
    API.getStudentsList()
      .then((res) => {
        const list = res.data || [];
        if (list.length > 0) {
          setStudentFilterOptions(
            list.map((s) => ({ id: s.id, name: s.name }))
          );
        }
      })
      .catch(() => {
        // Teacher role may not have access to /students/list; options populate from /exams rows
      });
  }, [effectiveRole]);

  const loadExamsList = useCallback(
    async (
      pageToLoad = 1,
      overrideFilters?: {
        studentId?: string;
        dateFrom?: string;
        dateTo?: string;
      }
    ) => {
      setListLoading(true);
      try {
        const sid = overrideFilters?.studentId ?? filterStudentId;
        const df =
          overrideFilters?.dateFrom !== undefined
            ? overrideFilters.dateFrom
            : useDateFrom
              ? filterDateFrom
              : '';
        const dt =
          overrideFilters?.dateTo !== undefined
            ? overrideFilters.dateTo
            : useDateTo
              ? filterDateTo
              : '';

        const res = await API.getExamsList({
          student_id: sid || undefined,
          date_from: df || undefined,
          date_to: dt || undefined,
          page: pageToLoad,
          per_page: 20,
        });

        const rows = res.data?.exams || [];
        setExamsList(rows);
        const pag = res.pagination;
        setListPage(pag?.page || pageToLoad);
        setListTotalPages(Math.max(1, pag?.total_pages || 1));
        setListTotal(pag?.total ?? rows.length);

        if (rows.length > 0) {
          setStudentFilterOptions((prev) => {
            const map = new Map<number, string>();
            for (const opt of prev) map.set(opt.id, opt.name);
            for (const row of rows) {
              if (row.student_id && row.student_name && !map.has(row.student_id)) {
                map.set(row.student_id, row.student_name);
              }
            }
            return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
          });
        }
      } catch (err) {
        showToast((err as Error)?.message || 'خطا در بارگذاری لیست نتایج آزمون', 'error');
      } finally {
        setListLoading(false);
      }
    },
    [filterStudentId, useDateFrom, filterDateFrom, useDateTo, filterDateTo, showToast]
  );

  const handleOpenListView = async () => {
    setView('list');
    setSelectedDate(null);
    setDetails(null);
    await loadExamsList(1);
  };

  const handleSelectDate = async (examDate: string) => {
    setLoading(true);
    setSelectedDate(examDate);
    setView('students');
    try {
      let rawStudents: ExamStudentSummary[] = [];

      // Endpoint `/api/v1/exams/students` returns 403 for `teacher`.
      // Teachers load rows via `/api/v1/exams` and `/api/v1/exams/details`.
      if (effectiveRole === 'teacher') {
        const examsRes = await API.getExamsList({
          date_from: examDate,
          date_to: examDate,
          page: 1,
          per_page: 200,
        });
        rawStudents = groupExamRowsByStudent(examsRes.data?.exams || []);
      } else {
        try {
          const res = await API.getExamStudents(examDate);
          rawStudents = res.data?.students || [];
        } catch {
          const examsRes = await API.getExamsList({
            date_from: examDate,
            date_to: examDate,
            page: 1,
            per_page: 200,
          });
          rawStudents = groupExamRowsByStudent(examsRes.data?.exams || []);
        }
      }

      setStudents(rawStudents);

      if (rawStudents.length > 0) {
        const settled = await Promise.allSettled(
          rawStudents.map((s) => API.getExamDetails(examDate, s.student_id))
        );
        const nextCache: Record<string, ExamDetailsResponse> = {};
        const enrichedStudents = rawStudents.map((s, idx) => {
          const outcome = settled[idx];
          if (outcome.status === 'fulfilled' && outcome.value?.data) {
            const detailData = outcome.value.data;
            nextCache[`${examDate}:${s.student_id}`] = detailData;
            return {
              ...s,
              subject_count: detailData.subjects?.length || s.subject_count,
              avg_percentage: detailData.avg_percentage,
            };
          }
          return s;
        });

        setDetailsCache((prev) => ({ ...prev, ...nextCache }));
        setStudents(enrichedStudents);

        const totalAvg =
          enrichedStudents.reduce((sum, s) => sum + safeNumber(s.avg_percentage), 0) /
          enrichedStudents.length;
        const roundedDateAvg = Math.round(totalAvg * 10) / 10;
        setDates((prev) =>
          prev.map((d) =>
            d.exam_date === examDate ? { ...d, avg_percentage: roundedDateAvg } : d
          )
        );
      }
    } catch {
      showToast('خطا در بارگذاری لیست شرکت‌کنندگان', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyDetailsState = (data: ExamDetailsResponse | null) => {
    setDetails(data);
    setTeacherFeedbacks(createInitialTeacherFeedbacks(data));
    const firstCommentBody =
      data?.comments && data.comments.length > 0 ? String(data.comments[0].body || '').trim() : '';
    setCounselorNote(firstCommentBody);
  };

  const loadStudentTrend = async (
    studentId: number,
    examDate: string,
    detailData: ExamDetailsResponse | null
  ) => {
    setTrendLoading(true);
    try {
      const pts = await API.getStudentExamTrend(studentId, examDate, detailData);
      setTrendPoints(pts);
    } catch {
      setTrendPoints([]);
    } finally {
      setTrendLoading(false);
    }
  };

  const handleSelectStudentDetails = async (
    examDate: string,
    studentId: number,
    autoPrint = false
  ) => {
    const cacheKey = `${examDate}:${studentId}`;
    if (detailsCache[cacheKey]) {
      const cached = detailsCache[cacheKey];
      applyDetailsState(cached);
      setView('details');
      await loadStudentTrend(studentId, examDate, cached);
      if (autoPrint) {
        setTimeout(() => window.print(), 150);
      }
      return;
    }

    setLoading(true);
    setView('details');
    try {
      const res = await API.getExamDetails(examDate, studentId);
      applyDetailsState(res.data);
      if (res.data) {
        setDetailsCache((prev) => ({ ...prev, [cacheKey]: res.data }));
      }
      await loadStudentTrend(studentId, examDate, res.data);
      if (autoPrint && res.data) {
        setTimeout(() => window.print(), 180);
      }
    } catch {
      showToast('خطا در بارگذاری جزئیات کارنامه', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReportCard = () => {
    window.print();
  };

  const handleUpdateFeedback = (
    id: string,
    field: 'subject' | 'instructorName' | 'comment',
    value: string
  ) => {
    setTeacherFeedbacks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddFeedbackRow = () => {
    setTeacherFeedbacks((prev) => [
      ...prev,
      {
        id: `feedback-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        subject: '',
        chapter: '',
        percentage: null,
        instructorName: '',
        comment: '',
      },
    ]);
  };

  const handleRemoveFeedbackRow = (id: string) => {
    setTeacherFeedbacks((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCommentsUpdated = (nextComments: ExamComment[]) => {
    setDetails((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, comments: nextComments };
      const dateKey = selectedDate || prev.exam_date || '';
      if (dateKey && prev.student?.id) {
        setDetailsCache((cache) => ({
          ...cache,
          [`${dateKey}:${prev.student.id}`]: updated,
        }));
      }
      return updated;
    });
  };

  const handleOpenEditFromDetails = async (sub: SubjectResult) => {
    if (!canEdit || !details?.student?.id || resolvingSubjectEdit) return;

    const currentExamDate = activeExamDate || sub.exam_date || '';
    if (sub.id && sub.id > 0) {
      setEditingExam({
        id: sub.id,
        student_id: sub.student_id || details.student.id,
        file_id: sub.file_id ?? null,
        exam_date: sub.exam_date || currentExamDate,
        subject: sub.subject,
        chapter: sub.chapter ?? null,
        total_q: sub.total_q,
        correct: sub.correct,
        wrong: sub.wrong,
        skipped: sub.skipped,
        percentage: sub.percentage,
        student_name: details.student.name,
        grade: details.student.grade,
        field: details.student.field,
      });
      return;
    }

    // Fallback: resolve row `id` from GET /api/v1/exams if not attached on subject
    setResolvingSubjectEdit(true);
    try {
      const res = await API.getExamsList({
        student_id: details.student.id,
        date_from: currentExamDate || undefined,
        date_to: currentExamDate || undefined,
        per_page: 100,
      });
      const match = (res.data?.exams || []).find(
        (item) => safeTrim(item.subject) === safeTrim(sub.subject)
      );
      if (match && match.id) {
        setEditingExam({
          ...match,
          student_name: match.student_name || details.student.name,
          grade: match.grade ?? details.student.grade,
          field: match.field ?? details.student.field,
        });
      } else {
        showToast('شناسه ردیف درس برای ویرایش یافت نشد', 'error');
      }
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در دریافت اطلاعات ردیف درس', 'error');
    } finally {
      setResolvingSubjectEdit(false);
    }
  };

  const handleEditSuccess = async (updatedExam: ExamListItem) => {
    // 1. Update flat list state immediately
    setExamsList((prev) => applyUpdatedExamRowToList(prev, updatedExam));

    // 2. Update details state immediately with exact server `data.exam`
    const viewingDate = activeExamDate;
    setDetails((prev) => {
      if (!prev) return prev;
      const updated = applyUpdatedExamRowToDetails(prev, updatedExam, viewingDate);
      if (updated) {
        setTeacherFeedbacks(createInitialTeacherFeedbacks(updated));
      }
      return updated;
    });

    // Clear stale cache entries for affected dates
    setDetailsCache((prev) => {
      const next = { ...prev };
      if (viewingDate && updatedExam.student_id) {
        delete next[`${viewingDate}:${updatedExam.student_id}`];
      }
      if (updatedExam.exam_date && updatedExam.student_id) {
        delete next[`${updatedExam.exam_date}:${updatedExam.student_id}`];
      }
      return next;
    });

    // 3. Refetch details / list from backend so `avg_percentage` stays in sync
    if (view === 'details' && details?.student?.id && viewingDate) {
      try {
        const refreshed = await API.getExamDetails(viewingDate, details.student.id);
        if (refreshed.data) {
          const synced = applyUpdatedExamRowToDetails(refreshed.data, updatedExam, viewingDate);
          if (synced) {
            setDetails(synced);
            setTeacherFeedbacks(createInitialTeacherFeedbacks(synced));
            setDetailsCache((prev) => ({
              ...prev,
              [`${viewingDate}:${details.student.id}`]: synced,
            }));
            await loadStudentTrend(details.student.id, viewingDate, synced);
          }
        }
      } catch {
        // Keep optimistic updated state if refetch fails transiently
      }
    } else if (view === 'list') {
      await loadExamsList(listPage);
    }
  };

  const handleGoBack = async () => {
    if (view === 'details' && selectedDate) {
      setView('students');
      setDetails(null);
    } else if (view === 'details') {
      await handleOpenListView();
    } else {
      await loadDates(monthFilter);
    }
  };

  const activeExamDate = selectedDate || details?.exam_date || '';

  const effectiveTrendPoints: StudentExamTrendPoint[] =
    trendPoints.length > 0
      ? trendPoints
      : details
        ? [
            {
              exam_date: activeExamDate || 'current',
              jalali_date: activeExamDate ? formatGregorianToJalali(activeExamDate) : '-',
              subject_count: (details.subjects || []).length,
              avg_percentage: Math.round(safeNumber(details.avg_percentage) * 10) / 10,
              delta: null,
              is_current: true,
            },
          ]
        : [];

  const pageTitle =
    view === 'dates'
      ? 'آزمون‌های برگزار شده'
      : view === 'list'
        ? 'فهرست نتایج دروس آزمون‌ها'
        : view === 'students'
          ? `شرکت‌کنندگان آزمون ${formatJalaliLong(selectedDate)}`
          : `نتایج ${details?.student?.name || ''} - آزمون ${formatJalaliLong(activeExamDate)}`;

  return (
    <div id="page-exams" className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <ClipboardList className="w-6 h-6 shrink-0" aria-hidden="true" />
            <span>{pageTitle}</span>
          </h1>

          {(view === 'dates' || view === 'list') && (
            <div
              role="tablist"
              aria-label="حالت نمایش آزمون‌ها"
              className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === 'dates'}
                onClick={() => loadDates(monthFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  view === 'dates'
                    ? 'bg-[#445D84] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آزمون‌ها بر اساس تاریخ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'list'}
                onClick={handleOpenListView}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  view === 'list'
                    ? 'bg-[#445D84] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" aria-hidden="true" />
                <span>فهرست ردیف‌های نتایج</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {view === 'details' && details && (
            <>
              <ActionButton
                type="button"
                onClick={() =>
                  setShareModalState({
                    isOpen: true,
                    studentId: details.student?.id,
                    studentName: details.student?.name,
                    examDate: activeExamDate,
                  })
                }
                icon={<Share2 className="w-4 h-4" />}
                className="px-4 py-2"
              >
                <span>اشتراک با والدین / پیامک</span>
              </ActionButton>
              <ActionButton
                type="button"
                onClick={handlePrintReportCard}
                icon={<Printer className="w-4 h-4" />}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <span>چاپ کارنامه</span>
              </ActionButton>
            </>
          )}
          {view !== 'details' && (
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() =>
                setShareModalState({
                  isOpen: true,
                  studentId: null,
                  studentName: null,
                  examDate: selectedDate,
                })
              }
              icon={<Link2 className="w-4 h-4" />}
              className="px-3.5 py-2"
            >
              <span>لینک‌های اشتراک کارنامه</span>
            </ActionButton>
          )}
          {view !== 'dates' && view !== 'list' && (
            <ActionButton
              type="button"
              variant="secondary"
              loading={loading}
              loadingText="در حال بازگشت..."
              onClick={handleGoBack}
              icon={<ChevronRight className="w-4 h-4" />}
              className="px-4 py-2"
            >
              <span>
                {view === 'students'
                  ? 'بازگشت به لیست آزمون‌ها'
                  : selectedDate
                    ? 'بازگشت به شرکت‌کنندگان'
                    : 'بازگشت به فهرست نتایج'}
              </span>
            </ActionButton>
          )}
          {view === 'dates' && (
            <>
              <input
                type="month"
                aria-label="فیلتر ماه آزمون"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="px-3.5 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              />
              {monthFilter && (
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setMonthFilter('')}
                  icon={<X className="w-4 h-4" />}
                  className="px-3.5 py-2"
                >
                  <span>پاک کردن فیلتر</span>
                </ActionButton>
              )}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 no-print">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : view === 'dates' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable<ExamDateSummary>
            tableAriaLabel="جدول آزمون‌های برگزار شده"
            data={dates}
            rowKey={(exam) => exam.exam_date}
            onRowClick={(exam) => handleSelectDate(exam.exam_date)}
            emptyState={
              <div className="p-12 text-center">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <ClipboardList className="w-10 h-10" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">هنوز آزمونی ثبت نشده</h3>
                <p className="text-sm text-slate-500 mb-6">
                  برای ثبت نتایج آزمون جدید از بخش «ثبت نتایج» استفاده کنید.
                </p>
                <ActionButton
                  type="button"
                  onClick={() => onNavigate('exam_entry')}
                  icon={<Plus className="w-4 h-4" />}
                  className="px-5 py-2.5"
                >
                  <span>ثبت اولین آزمون</span>
                </ActionButton>
              </div>
            }
            columns={
              [
                {
                  key: 'exam_date',
                  header: 'تاریخ آزمون',
                  priority: 'primary',
                  cellClassName: 'min-w-0 whitespace-normal break-words',
                  cell: (exam) => (
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="w-4 h-4 text-[#445D84] shrink-0" aria-hidden="true" />
                      <span className="whitespace-normal break-words">
                        {formatJalaliLong(exam.exam_date)}
                      </span>
                    </div>
                  ),
                },
                {
                  key: 'student_count',
                  header: 'تعداد شرکت‌کنندگان',
                  mobileLabel: 'شرکت‌کنندگان',
                  priority: 'secondary',
                  headerClassName: 'w-36 xl:w-40',
                  cellClassName: 'w-36 xl:w-40 tabular-nums text-slate-700 font-medium',
                  cell: (exam) => `${exam.student_count} نفر`,
                },
                {
                  key: 'subject_count',
                  header: 'تعداد دروس ثبت‌شده',
                  priority: 'desktop-only',
                  headerClassName: 'hidden lg:table-cell w-36 xl:w-40',
                  cellClassName: 'hidden lg:table-cell w-36 xl:w-40 tabular-nums text-slate-600',
                  cell: (exam) => `${exam.subject_count} درس`,
                },
                {
                  key: 'avg_percentage',
                  header: 'میانگین درصد',
                  mobileLabel: 'میانگین درصد',
                  priority: 'secondary',
                  headerClassName: 'w-24 xl:w-32',
                  cellClassName: 'w-24 xl:w-32 tabular-nums',
                  cell: (exam) => (
                    <span
                      dir="ltr"
                      className={`inline-block font-bold tabular-nums ${
                        safeNumber(exam.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {formatFixed(exam.avg_percentage, 1)}%
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'عملیات',
                  priority: 'secondary',
                  isAction: true,
                  headerClassName: 'w-44',
                  cellClassName: 'w-44 shrink-0',
                  cell: (exam) => (
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        return handleSelectDate(exam.exam_date);
                      }}
                      icon={<Users className="w-4 h-4" />}
                      className="rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs shrink-0"
                    >
                      <span>مشاهده شرکت‌کنندگان</span>
                    </ActionButton>
                  ),
                },
              ] satisfies Column<ExamDateSummary>[]
            }
          />
        </div>
      ) : view === 'list' ? (
        <div className="space-y-4">
          {/* Filters Toolbar (student_id, Jalali date_from / date_to -> Gregorian YYYY-MM-DD) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-end">
              <div className="md:col-span-2 xl:col-span-1 min-w-0">
                <label
                  htmlFor="examListStudentFilter"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  فیلتر دانش‌آموز:
                </label>
                <select
                  id="examListStudentFilter"
                  value={filterStudentId}
                  onChange={(e) => setFilterStudentId(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#445D84]"
                >
                  <option value="">همه دانش‌آموزان</option>
                  {studentFilterOptions.map((st) => (
                    <option key={st.id} value={String(st.id)}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 min-w-0">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDateFrom}
                    onChange={(e) => setUseDateFrom(e.target.checked)}
                    className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                  />
                  <span>از تاریخ (شمسی):</span>
                </label>
                <JalaliDatePicker
                  value={filterDateFrom}
                  onChange={(iso) => {
                    setFilterDateFrom(iso);
                    if (!useDateFrom) setUseDateFrom(true);
                  }}
                  disabled={!useDateFrom}
                />
              </div>

              <div className="space-y-1.5 min-w-0">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDateTo}
                    onChange={(e) => setUseDateTo(e.target.checked)}
                    className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                  />
                  <span>تا تاریخ (شمسی):</span>
                </label>
                <JalaliDatePicker
                  value={filterDateTo}
                  onChange={(iso) => {
                    setFilterDateTo(iso);
                    if (!useDateTo) setUseDateTo(true);
                  }}
                  disabled={!useDateTo}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-500 tabular-nums">
                مجموع رکوردهای یافت‌شده:{' '}
                <strong className="text-slate-700">{toPersianDigits(listTotal)}</strong> ردیف
              </div>
              <div className="flex items-center gap-2">
                {(filterStudentId || useDateFrom || useDateTo) && (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setFilterStudentId('');
                      setUseDateFrom(false);
                      setUseDateTo(false);
                      loadExamsList(1, { studentId: '', dateFrom: '', dateTo: '' });
                    }}
                    icon={<X className="w-3.5 h-3.5" />}
                    className="px-3 py-1.5 text-xs"
                  >
                    <span>پاک کردن فیلترها</span>
                  </ActionButton>
                )}
                <ActionButton
                  type="button"
                  loading={listLoading}
                  loadingText="در حال جستجو..."
                  onClick={() => loadExamsList(1)}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  className="px-4 py-1.5 text-xs"
                >
                  <span>اعمال فیلتر و بروزرسانی</span>
                </ActionButton>
              </div>
            </div>
          </div>

          {/* Flat Exams Table (GET /api/v1/exams) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
            {listLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <DataTable<ExamListItem>
                tableAriaLabel="جدول ردیف‌های نتایج آزمون"
                data={examsList}
                rowKey={(row) => row.id}
                emptyState={
                  <div className="p-10 text-center">
                    <p className="text-sm font-semibold text-slate-500">
                      نتیجه آزمونی مطابق فیلترهای انتخاب‌شده یافت نشد.
                    </p>
                  </div>
                }
                columns={[
                  {
                    key: 'student_name',
                    header: 'دانش‌آموز',
                    priority: 'primary',
                    cellClassName: 'min-w-0 whitespace-normal break-words',
                    cell: (row) => (
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">
                          {row.student_name || `دانش‌آموز #${toPersianDigits(row.student_id)}`}
                        </div>
                        {(row.grade || row.field) && (
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5 tabular-nums">
                            {row.grade ? `پایه ${toPersianDigits(row.grade)}` : ''}
                            {row.grade && row.field ? ' · ' : ''}
                            {row.field || ''}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'exam_date',
                    header: 'تاریخ آزمون',
                    priority: 'secondary',
                    headerClassName: 'w-28',
                    cellClassName: 'w-28 tabular-nums text-xs text-slate-600 font-medium',
                    cell: (row) => toPersianDigits(formatGregorianToJalali(row.exam_date)),
                  },
                  {
                    key: 'subject',
                    header: 'درس / مبحث',
                    priority: 'secondary',
                    cellClassName: 'min-w-0 whitespace-normal break-words',
                    cell: (row) => (
                      <div>
                        <div className="font-bold text-slate-800">{row.subject}</div>
                        {row.chapter && (
                          <div className="text-[11px] text-slate-500 line-clamp-1">
                            {row.chapter}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'counts',
                    header: 'آمار (کل / ص / غ / ن)',
                    priority: 'desktop-only',
                    headerClassName: 'hidden lg:table-cell w-40 text-center',
                    cellClassName: 'hidden lg:table-cell w-40 text-center tabular-nums text-xs',
                    cell: (row) => (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-slate-600 font-semibold">{row.total_q}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-emerald-700 font-bold">{row.correct}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-red-600 font-bold">{row.wrong}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-slate-500">{row.skipped}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'percentage',
                    header: 'درصد',
                    priority: 'secondary',
                    headerClassName: 'w-24 text-center',
                    cellClassName: 'w-24 text-center tabular-nums',
                    cell: (row) => {
                      const pct = safeNumber(row.percentage);
                      return (
                        <span
                          dir="ltr"
                          className={`inline-block px-2 py-0.5 rounded-lg font-extrabold text-xs border ${
                            pct >= 50
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      );
                    },
                  },
                  {
                    key: 'actions',
                    header: 'عملیات',
                    priority: 'secondary',
                    isAction: true,
                    headerClassName: canEdit ? 'w-40 text-center' : 'w-24 text-center',
                    cellClassName: canEdit ? 'w-40 shrink-0' : 'w-24 shrink-0',
                    cell: (row) => (
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <ActionButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`ویرایش نتیجه ${row.subject} برای ${row.student_name || row.student_id}`}
                            onClick={() => setEditingExam(row)}
                            icon={<Pencil className="w-3.5 h-3.5" />}
                            className="rounded-lg text-[#445D84] hover:bg-slate-100 font-semibold text-xs"
                          >
                            <span>ویرایش</span>
                          </ActionButton>
                        )}
                        <ActionButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectStudentDetails(row.exam_date, row.student_id)}
                          icon={<Eye className="w-3.5 h-3.5" />}
                          className="rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                        >
                          <span>کارنامه</span>
                        </ActionButton>
                      </div>
                    ),
                  },
                ]}
                mobileCardRender={(row) => {
                  const pct = safeNumber(row.percentage);
                  return (
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm text-slate-800">
                            {row.student_name || `دانش‌آموز #${toPersianDigits(row.student_id)}`}
                          </div>
                          <div className="text-xs font-bold text-[#445D84] mt-0.5">
                            {row.subject}
                            {row.chapter ? ` (${row.chapter})` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {toPersianDigits(formatGregorianToJalali(row.exam_date))}
                          </div>
                        </div>
                        <span
                          dir="ltr"
                          className={`shrink-0 inline-block px-2 py-1 rounded-lg font-extrabold text-xs border tabular-nums ${
                            pct >= 50
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                            صحیح: {row.correct}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold">
                            غلط: {row.wrong}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            نزده: {row.skipped}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <ActionButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`ویرایش نتیجه ${row.subject}`}
                              onClick={() => setEditingExam(row)}
                              icon={<Pencil className="w-3.5 h-3.5" />}
                              className="rounded-lg text-[#445D84] hover:bg-slate-100 font-semibold text-xs"
                            >
                              <span>ویرایش</span>
                            </ActionButton>
                          )}
                          <ActionButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleSelectStudentDetails(row.exam_date, row.student_id)
                            }
                            icon={<Eye className="w-3.5 h-3.5" />}
                            className="rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                          >
                            <span>کارنامه</span>
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            )}

            {listTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs">
                <span className="text-slate-500 tabular-nums">
                  صفحه {toPersianDigits(listPage)} از {toPersianDigits(listTotalPages)}
                </span>
                <div className="flex items-center gap-1.5">
                  <ActionButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={listPage <= 1 || listLoading}
                    onClick={() => loadExamsList(listPage - 1)}
                    icon={<ChevronRight className="w-3.5 h-3.5" />}
                    className="px-2.5 py-1"
                  >
                    <span>قبلی</span>
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={listPage >= listTotalPages || listLoading}
                    onClick={() => loadExamsList(listPage + 1)}
                    className="px-2.5 py-1"
                  >
                    <span>بعدی</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : view === 'students' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable<ExamStudentSummary>
            tableAriaLabel="جدول شرکت‌کنندگان آزمون"
            data={students}
            rowKey={(s) => s.student_id}
            columns={
              [
                {
                  key: 'name',
                  header: 'دانش‌آموز',
                  priority: 'primary',
                  cellClassName: 'min-w-0 whitespace-normal break-words',
                  cell: (s) => (
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800 whitespace-normal break-words">
                        {s.name}
                      </span>
                      <div className="hidden md:block lg:hidden text-xs text-slate-500 font-normal mt-0.5 tabular-nums">
                        پایه {s.grade} · {s.field}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'grade',
                  header: 'پایه',
                  priority: 'desktop-only',
                  headerClassName: 'hidden lg:table-cell w-20',
                  cellClassName: 'hidden lg:table-cell w-20 tabular-nums text-slate-600',
                  cell: (s) => `پایه ${s.grade}`,
                },
                {
                  key: 'field',
                  header: 'رشته',
                  mobileLabel: 'پایه و رشته',
                  priority: 'secondary',
                  headerClassName: 'hidden lg:table-cell w-28',
                  cellClassName: 'hidden lg:table-cell w-28 text-slate-600',
                  cell: (s) => (
                    <span>
                      <span className="md:hidden tabular-nums">پایه {s.grade} · </span>
                      <span>{s.field}</span>
                    </span>
                  ),
                },
                {
                  key: 'subject_count',
                  header: 'تعداد دروس',
                  priority: 'desktop-only',
                  headerClassName: 'hidden xl:table-cell w-28',
                  cellClassName: 'hidden xl:table-cell w-28 tabular-nums text-slate-600',
                  cell: (s) => `${s.subject_count} درس`,
                },
                {
                  key: 'avg_percentage',
                  header: 'میانگین درصد',
                  mobileLabel: 'میانگین کل',
                  priority: 'secondary',
                  headerClassName: 'w-20 lg:w-28',
                  cellClassName: 'w-20 lg:w-28 tabular-nums',
                  cell: (s) => (
                    <span
                      dir="ltr"
                      className={`inline-block font-bold tabular-nums ${
                        safeNumber(s.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {formatFixed(s.avg_percentage, 1)}%
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'عملیات',
                  priority: 'secondary',
                  isAction: true,
                  headerClassName: 'w-56 lg:w-64',
                  cellClassName: 'w-56 lg:w-64 shrink-0',
                  cell: (s) => (
                    <div className="flex flex-wrap items-center gap-1">
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          selectedDate
                            ? handleSelectStudentDetails(selectedDate, s.student_id, false)
                            : undefined
                        }
                        icon={<Eye className="w-3.5 h-3.5" />}
                        className="rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                      >
                        <span>کارنامه</span>
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShareModalState({
                            isOpen: true,
                            studentId: s.student_id,
                            studentName: s.name,
                            examDate: selectedDate,
                          })
                        }
                        icon={<Share2 className="w-3.5 h-3.5" />}
                        className="rounded-lg text-[#445D84] hover:bg-slate-100 font-medium text-xs"
                        aria-label={`اشتراک کارنامه ${s.name}`}
                      >
                        <span>اشتراک</span>
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          selectedDate
                            ? handleSelectStudentDetails(selectedDate, s.student_id, true)
                            : undefined
                        }
                        icon={<Printer className="w-3.5 h-3.5" />}
                        className="rounded-lg text-emerald-700 hover:bg-emerald-50 font-medium text-xs"
                      >
                        <span>چاپ</span>
                      </ActionButton>
                    </div>
                  ),
                },
              ] satisfies Column<ExamStudentSummary>[]
            }
          />
        </div>
      ) : (
        details && (
          <div id="printable-report-card" className="w-full max-w-full">
            {/* =====================================================================
                1. INTERACTIVE SCREEN VIEW (Hidden during window.print())
               ===================================================================== */}
            <div className="no-print bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
              {/* Screen Banner */}
              <div className="border-b-2 border-[#344868] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-0.5">
                    آموزشگاه علمی و کنکور فامو
                  </p>
                  <h2 className="text-lg font-extrabold text-[#344868]">
                    کارنامه تحلیلی آزمون و برگه‌ی ارزیابی اساتید
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
                  <Calendar className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
                  <span className="text-slate-500">تاریخ آزمون:</span>
                  <span className="font-bold text-slate-800">
                    {formatJalaliLong(activeExamDate)}
                  </span>
                  {activeExamDate && (
                    <span className="text-slate-500 tabular-nums">
                      ({formatGregorianToJalali(activeExamDate)})
                    </span>
                  )}
                </div>
              </div>

              {/* Student Info & Overall Percentage Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-xs mb-1">نام دانش‌آموز</p>
                  <p className="font-bold text-sm text-slate-800 break-words">
                    {details.student?.name || '-'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-xs mb-1">پایه تحصیلی</p>
                  <p className="font-bold text-sm text-slate-800 tabular-nums">
                    {details.student?.grade ?? '-'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-xs mb-1">رشته تحصیلی</p>
                  <p className="font-bold text-sm text-slate-800">
                    {details.student?.field || '-'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-xs mb-1">تاریخ آزمون</p>
                  <p className="font-bold text-sm text-slate-800 tabular-nums">
                    {activeExamDate ? formatGregorianToJalali(activeExamDate) : '-'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-xs mb-1">میانگین کل (با نمره منفی)</p>
                  <p
                    dir="ltr"
                    className={`font-extrabold text-sm tabular-nums ${
                      safeNumber(details.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {formatFixed(details.avg_percentage, 1)}%
                  </p>
                </div>
              </div>

              {/* Subject-by-Subject Percentages Table (Desktop Table + Mobile Cards) */}
              <div>
                <h3 className="font-bold text-sm sm:text-base mb-2.5 text-[#344868]">
                  ۱. جدول جزئیات درصدهای دروس آزمون:
                </h3>
                <div className="rounded-xl border border-slate-300 bg-slate-50/30 md:bg-white">
                  <DataTable<SubjectResult>
                    tableAriaLabel="جدول جزئیات درصدهای دروس آزمون"
                    data={details.subjects || []}
                    rowKey={(sub, idx) => `${sub.subject}-${idx}`}
                    columns={
                      [
                        {
                          key: 'row_num',
                          header: 'ردیف',
                          priority: 'desktop-only',
                          headerClassName: 'hidden xl:table-cell text-center w-12',
                          cellClassName: 'hidden xl:table-cell w-12 text-center tabular-nums text-slate-500 text-xs',
                          cell: (_sub, idx) => idx + 1,
                        },
                        {
                          key: 'subject',
                          header: 'نام درس',
                          priority: 'primary',
                          cellClassName: 'min-w-0 font-bold text-slate-800 whitespace-normal break-words',
                          cell: (sub) => (
                            <span className="whitespace-normal break-words">{sub.subject}</span>
                          ),
                        },
                        {
                          key: 'chapter',
                          header: 'مبحث',
                          priority: 'secondary',
                          hideWhenEmpty: true,
                          rawValue: (sub) => sub.chapter,
                          headerClassName: 'hidden xl:table-cell w-32',
                          cellClassName: 'hidden xl:table-cell w-32 text-slate-600 whitespace-normal break-words',
                          cell: (sub) => (
                            <span className="whitespace-normal break-words line-clamp-2 max-w-prose">
                              {sub.chapter || '-'}
                            </span>
                          ),
                        },
                        {
                          key: 'total_q',
                          header: 'کل سوالات',
                          priority: 'secondary',
                          headerClassName: 'hidden lg:table-cell w-16 text-center',
                          cellClassName: 'hidden lg:table-cell w-16 text-center tabular-nums font-medium',
                          cell: (sub) => sub.total_q,
                        },
                        {
                          key: 'correct',
                          header: 'صحیح',
                          priority: 'secondary',
                          headerClassName: 'w-14 text-center',
                          cellClassName: 'w-14 text-center tabular-nums text-emerald-700 font-bold',
                          cell: (sub) => sub.correct,
                        },
                        {
                          key: 'wrong',
                          header: 'غلط',
                          priority: 'secondary',
                          headerClassName: 'w-14 text-center',
                          cellClassName: 'w-14 text-center tabular-nums text-red-600 font-bold',
                          cell: (sub) => sub.wrong,
                        },
                        {
                          key: 'skipped',
                          header: 'نزده',
                          priority: 'secondary',
                          headerClassName: 'hidden lg:table-cell w-14 text-center',
                          cellClassName: 'hidden lg:table-cell w-14 text-center tabular-nums text-slate-600',
                          cell: (sub) => sub.skipped,
                        },
                        {
                          key: 'percentage',
                          header: 'درصد (با نمره منفی)',
                          priority: 'secondary',
                          headerClassName: 'w-24 lg:w-28 text-center',
                          cellClassName: 'w-24 lg:w-28 text-center tabular-nums',
                          cell: (sub) => {
                            const pct = safeNumber(sub.percentage);
                            return (
                              <span
                                dir="ltr"
                                className={`inline-block px-2 py-1 rounded-lg font-extrabold text-xs ${
                                  pct >= 50
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                              >
                                {pct.toFixed(1)}%
                              </span>
                            );
                          },
                        },
                        {
                          key: 'chart',
                          header: 'نمودار',
                          priority: 'desktop-only',
                          headerClassName: 'hidden xl:table-cell w-24 text-center',
                          cellClassName: 'hidden xl:table-cell w-24 py-1.5 text-center',
                          cell: (sub) => <RadialGauge percentage={safeNumber(sub.percentage)} />,
                        },
                        ...(canEdit
                          ? [
                              {
                                key: 'actions',
                                header: 'ویرایش',
                                priority: 'secondary' as const,
                                isAction: true,
                                headerClassName: 'w-24 text-center',
                                cellClassName: 'w-24 text-center shrink-0',
                                cell: (sub: SubjectResult) => (
                                  <ActionButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    loading={resolvingSubjectEdit}
                                    onClick={() => handleOpenEditFromDetails(sub)}
                                    icon={<Pencil className="w-3.5 h-3.5" />}
                                    aria-label={`ویرایش نتیجه ${sub.subject}`}
                                    className="rounded-lg text-[#445D84] hover:bg-slate-100 font-semibold text-xs"
                                  >
                                    <span>ویرایش</span>
                                  </ActionButton>
                                ),
                              } satisfies Column<SubjectResult>,
                            ]
                          : []),
                      ] satisfies Column<SubjectResult>[]
                    }
                    mobileCardRender={(sub) => {
                      const pct = safeNumber(sub.percentage);
                      const cleanChapter =
                        sub.chapter && sub.chapter.trim() !== '' && sub.chapter.trim() !== '-'
                          ? sub.chapter.trim()
                          : '';
                      return (
                        <div className="space-y-2.5">
                          {/* ردیف بالا: نام درس (عنوان بزرگ، بدون بریده شدن) + badge درصد در گوشه کارت */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-base font-extrabold text-slate-800 break-words leading-snug">
                                {sub.subject}
                              </div>
                              {cleanChapter && (
                                <div className="text-xs text-slate-500 mt-0.5 break-words">
                                  مبحث: {cleanChapter}
                                </div>
                              )}
                            </div>
                            <span
                              dir="ltr"
                              className={`shrink-0 inline-block px-2.5 py-1 rounded-lg font-extrabold text-xs tabular-nums ${
                                pct >= 50
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {pct.toFixed(1)}%
                            </span>
                          </div>

                          {/* ردیف پایین: سه chip (صحیح سبز، غلط قرمز، نزده خاکستری) + کل سوالات به صورت متن کوچک کنار آن‌ها */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                صحیح: {sub.correct}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold">
                                غلط: {sub.wrong}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                                نزده: {sub.skipped}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 font-medium tabular-nums">
                                کل سوالات: {sub.total_q}
                              </span>
                              {canEdit && (
                                <ActionButton
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  loading={resolvingSubjectEdit}
                                  onClick={() => handleOpenEditFromDetails(sub)}
                                  icon={<Pencil className="w-3.5 h-3.5" />}
                                  aria-label={`ویرایش نتیجه ${sub.subject}`}
                                  className="rounded-lg text-[#445D84] hover:bg-slate-100 font-semibold text-xs"
                                >
                                  <span>ویرایش</span>
                                </ActionButton>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              </div>

              {/* Visual Trend Line Chart (Last 5 Exams via Recharts) */}
              <div className="rounded-xl border border-slate-300 bg-slate-50/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-[#344868] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
                    <span>۲. نمودار روند تغییرات درصد در ۵ آزمون اخیر:</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    محاسبه بر اساس فرمول کنکوری (با احتساب نمره منفی)
                  </span>
                </div>
                <StudentExamTrendChart data={effectiveTrendPoints} loading={trendLoading} />
              </div>

              {/* Per-Subject Instructor Comments & Feedback Inputs */}
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-[#344868]">
                      ۳. نظرات، تحلیل و تکالیف پیشنهادی اساتید هر درس:
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      می‌توانید نظرات اساتید را قبل از چاپ در کادرهای زیر تایپ کنید یا کارنامه را خام چاپ کنید تا هر استاد دستی روی برگه یادداشت کند.
                    </p>
                  </div>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={handleAddFeedbackRow}
                    icon={<MessageSquarePlus className="w-4 h-4" />}
                    className="px-3 py-1.5 text-xs"
                  >
                    <span>افزودن باکس نظر استاد</span>
                  </ActionButton>
                </div>

                <div className="space-y-3">
                  {teacherFeedbacks.map((row, idx) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-300 bg-slate-50/50 p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-bold text-[#344868] bg-slate-200/70 px-2 py-0.5 rounded-md tabular-nums">
                            درس {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={row.subject}
                            onChange={(e) => handleUpdateFeedback(row.id, 'subject', e.target.value)}
                            placeholder="نام درس..."
                            aria-label={`نام درس ردیف ${idx + 1}`}
                            className="font-bold text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#445D84] w-28 sm:w-36"
                          />
                          {row.chapter && (
                            <span className="text-xs text-slate-500">({row.chapter})</span>
                          )}
                          {row.percentage !== null && (
                            <span
                              dir="ltr"
                              className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${
                                row.percentage >= 50
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {row.percentage.toFixed(1)}%
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-600 font-medium whitespace-nowrap">
                            نام استاد:
                          </label>
                          <input
                            type="text"
                            value={row.instructorName}
                            onChange={(e) =>
                              handleUpdateFeedback(row.id, 'instructorName', e.target.value)
                            }
                            placeholder="ثبت نام استاد..."
                            aria-label={`نام استاد ردیف ${idx + 1}`}
                            className="text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#445D84] w-28 sm:w-36"
                          />
                          {teacherFeedbacks.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFeedbackRow(row.id)}
                              title="حذف این باکس"
                              className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={row.comment}
                        onChange={(e) => handleUpdateFeedback(row.id, 'comment', e.target.value)}
                        placeholder="نظر استاد، نقاط قوت و ضعف دانش‌آموز در این درس، و مباحث نیازمند تمرین..."
                        aria-label={`نظر استاد برای ${row.subject || `ردیف ${idx + 1}`}`}
                        className="w-full text-xs sm:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-[#445D84] resize-y"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Counselor Overall Note */}
              <div className="rounded-xl border border-slate-300 p-3.5 bg-slate-50/40">
                <label className="block text-xs sm:text-sm font-bold text-[#344868] mb-1.5">
                  ۴. جمع‌بندی و توصیه مشاور / پشتیبان آموزشی:
                </label>
                <textarea
                  rows={2}
                  value={counselorNote}
                  onChange={(e) => setCounselorNote(e.target.value)}
                  placeholder="توصیه کلی مشاور درباره روند مطالعه هفتگی دانش‌آموز..."
                  className="w-full text-xs sm:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-[#445D84] resize-y"
                />
              </div>

              {/* 5. Server-Persisted Exam Comments (PUT /api/v1/exams/comments) */}
              {details.student?.id && activeExamDate && (
                <ExamCommentsSection
                  studentId={details.student.id}
                  examDate={activeExamDate}
                  comments={details.comments || []}
                  teacherFeedbacks={teacherFeedbacks}
                  counselorNote={counselorNote}
                  onCommentsUpdated={handleCommentsUpdated}
                  showToast={showToast}
                />
              )}
            </div>

            {/* =====================================================================
                2. DEDICATED A4 PRINT SHEET (Pure HTML Tables - Never clips in RTL!)
               ===================================================================== */}
            <div className="print-only-sheet hidden print:block w-full text-slate-900" dir="rtl">
              {/* Print Header Table */}
              <table className="w-full border-collapse mb-2.5">
                <tbody>
                  <tr>
                    <td className="border-2 border-slate-700 p-2 bg-slate-100 text-start w-2/3">
                      <div className="text-[10px] font-bold text-slate-600">
                        آموزشگاه علمی و کنکور فامو
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">
                        کارنامه تحلیلی آزمون هفتگی و برگه‌ی ارزیابی اساتید
                      </div>
                    </td>
                    <td className="border-2 border-slate-700 p-2 bg-slate-50 text-end w-1/3">
                      <div className="text-[11px] font-bold text-slate-800">
                        تاریخ آزمون: {formatJalaliLong(activeExamDate)}
                      </div>
                      {activeExamDate && (
                        <div className="text-[10px] text-slate-600 tabular-nums mt-0.5">
                          تاریخ عددی: {formatGregorianToJalali(activeExamDate)}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Student Summary Table */}
              <table className="w-full border-collapse mb-3 text-center">
                <thead>
                  <tr className="bg-slate-100 text-[10px] text-slate-600">
                    <th className="border border-slate-400 py-1 px-2 w-1/4">نام دانش‌آموز</th>
                    <th className="border border-slate-400 py-1 px-2 w-1/6">پایه تحصیلی</th>
                    <th className="border border-slate-400 py-1 px-2 w-1/5">رشته تحصیلی</th>
                    <th className="border border-slate-400 py-1 px-2 w-1/6">تعداد دروس</th>
                    <th className="border border-slate-400 py-1 px-2 w-1/5">
                      میانگین کل (با نمره منفی)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-xs font-bold text-slate-900">
                    <td className="border border-slate-400 py-1.5 px-2">
                      {details.student?.name || '-'}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2 tabular-nums">
                      {details.student?.grade ?? '-'}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2">
                      {details.student?.field || '-'}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2 tabular-nums">
                      {(details.subjects || []).length} درس
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2 tabular-nums">
                      <span dir="ltr" className="inline-block font-extrabold">
                        {formatFixed(details.avg_percentage, 1)}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 1. Subject Percentages Table */}
              <div className="mb-3">
                <div className="text-xs font-extrabold text-slate-900 mb-1">
                  ۱. جدول جزئیات درصدهای دروس آزمون (محاسبه با نمره منفی کنکور):
                </div>
                <table className="w-full border-collapse text-center">
                  <thead>
                    <tr className="bg-slate-800 text-white text-[10px]">
                      <th className="border border-slate-600 py-1.5 px-1.5 w-8">ردیف</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-start">نام درس</th>
                      <th className="border border-slate-600 py-1.5 px-2 text-start">مبحث</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 w-14">کل سوالات</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 w-12">صحیح</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 w-12">غلط</th>
                      <th className="border border-slate-600 py-1.5 px-1.5 w-12">نزده</th>
                      <th className="border border-slate-600 py-1.5 px-2 w-24">
                        درصد (با نمره منفی)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details.subjects || []).map((sub, idx) => {
                      const pct = safeNumber(sub.percentage);
                      return (
                        <tr key={idx} className="text-[11px]">
                          <td className="border border-slate-400 py-1.5 px-1.5 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-start font-bold">
                            {sub.subject}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 text-start text-slate-700">
                            {sub.chapter || '-'}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1.5 tabular-nums font-semibold">
                            {sub.total_q}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1.5 tabular-nums font-bold text-emerald-800">
                            {sub.correct}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1.5 tabular-nums font-bold text-red-700">
                            {sub.wrong}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-1.5 tabular-nums text-slate-700">
                            {sub.skipped}
                          </td>
                          <td className="border border-slate-400 py-1.5 px-2 tabular-nums font-extrabold">
                            <span dir="ltr" className="inline-block">
                              {pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 2. Last 5 Exams Visual Trend Line Chart + Summary Table (100% Print-Safe) */}
              {effectiveTrendPoints.length > 0 && (
                <div className="mb-3 print-avoid-break">
                  <div className="text-xs font-extrabold text-slate-900 mb-1">
                    ۲. نمودار و روند تغییرات میانگین درصد دانش‌آموز در {effectiveTrendPoints.length}{' '}
                    آزمون اخیر:
                  </div>
                  <table className="w-full border-collapse mb-1.5">
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 p-2 bg-white" dir="ltr">
                          <PrintableStudentTrendChart data={effectiveTrendPoints} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="w-full border-collapse text-center text-[10px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-400 py-1 px-2 text-start">شاخص</th>
                        {effectiveTrendPoints.map((pt, i) => (
                          <th
                            key={pt.exam_date}
                            className="border border-slate-400 py-1 px-2 tabular-nums"
                          >
                            آزمون {i + 1} ({pt.jalali_date})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 py-1 px-2 text-start font-bold">
                          میانگین درصد
                        </td>
                        {effectiveTrendPoints.map((pt) => (
                          <td
                            key={pt.exam_date}
                            className="border border-slate-400 py-1 px-2 font-extrabold tabular-nums"
                          >
                            <span dir="ltr" className="inline-block">
                              {pt.avg_percentage.toFixed(1)}%
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="border border-slate-400 py-1 px-2 text-start font-semibold text-slate-600">
                          تغییر نسبت به آزمون قبل
                        </td>
                        {effectiveTrendPoints.map((pt) => (
                          <td
                            key={pt.exam_date}
                            className="border border-slate-400 py-1 px-2 tabular-nums text-slate-700"
                          >
                            {pt.delta === null ? (
                              '-'
                            ) : (
                              <span dir="ltr" className="inline-block font-bold">
                                {pt.delta > 0
                                  ? `+${pt.delta.toFixed(1)}%`
                                  : `${pt.delta.toFixed(1)}%`}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* 3. Teacher Comments & Feedback Table (Pure Table so it never clips) */}
              <div className="mb-3">
                <div className="text-xs font-extrabold text-slate-900 mb-1">
                  ۳. نظرات، تحلیل و تکالیف پیشنهادی اساتید هر درس:
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 text-[10px]">
                      <th className="border border-slate-400 py-1.5 px-2 text-start w-36">
                        نام درس و درصد
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 text-start w-28">
                        نام استاد
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 text-start">
                        نظر استاد، تحلیل آزمون و تکالیف هفته آینده
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 text-center w-20">
                        امضای استاد
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacherFeedbacks.map((row, idx) => (
                      <tr key={row.id} className="print-avoid-break">
                        <td className="border border-slate-400 p-2 align-top">
                          <div className="font-bold text-[11px] text-slate-900">
                            {idx + 1}. {row.subject || '....................'}
                          </div>
                          {row.chapter && (
                            <div className="text-[9px] text-slate-600 mt-0.5">({row.chapter})</div>
                          )}
                          {row.percentage !== null && (
                            <div className="text-[10px] font-extrabold text-slate-800 mt-1 tabular-nums">
                              درصد:{' '}
                              <span dir="ltr" className="inline-block">
                                {row.percentage.toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-400 p-2 align-top text-[11px] font-semibold text-slate-800">
                          {row.instructorName.trim() || '........................'}
                        </td>
                        <td className="border border-slate-400 p-2 align-top text-[11px] text-slate-900 min-h-[48px]">
                          {row.comment.trim() ? (
                            <div className="whitespace-pre-wrap leading-5">{row.comment}</div>
                          ) : (
                            <div className="space-y-4 py-1">
                              <div className="border-b border-dotted border-slate-300 w-full h-3.5" />
                              <div className="border-b border-dotted border-slate-300 w-full h-3.5" />
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-400 p-2 align-bottom text-center text-[9px] text-slate-400">
                          ................
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. Counselor Note & Signatures Table */}
              <table className="w-full border-collapse print-avoid-break">
                <tbody>
                  <tr>
                    <td className="border border-slate-400 p-2 align-top w-2/3">
                      <div className="text-[11px] font-extrabold text-slate-900 mb-1">
                        ۴. جمع‌بندی و توصیه مشاور / پشتیبان آموزشی:
                      </div>
                      {counselorNote.trim() ? (
                        <div className="text-[11px] text-slate-800 whitespace-pre-wrap leading-5">
                          {counselorNote}
                        </div>
                      ) : details.comments && details.comments.length > 0 ? (
                        <div className="space-y-1.5">
                          {details.comments.map((c, idx) => (
                            <div
                              key={c.id || idx}
                              className="text-[11px] text-slate-800 whitespace-pre-wrap leading-5"
                            >
                              <span className="font-bold">
                                {c.author_name || 'کادر آموزشی'} ({getAuthorRoleLabel(c.author_role)}):{' '}
                              </span>
                              <span>{c.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-4 py-1">
                          <div className="border-b border-dotted border-slate-300 w-full h-3.5" />
                          <div className="border-b border-dotted border-slate-300 w-full h-3.5" />
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-400 p-2 align-top text-center w-1/6">
                      <div className="text-[10px] font-bold text-slate-700 mb-8">
                        امضای مشاور / پشتیبان
                      </div>
                      <div className="text-[9px] text-slate-400">....................</div>
                    </td>
                    <td className="border border-slate-400 p-2 align-top text-center w-1/6">
                      <div className="text-[10px] font-bold text-slate-700 mb-8">
                        اطلاع و امضای ولی
                      </div>
                      <div className="text-[9px] text-slate-400">....................</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Share Links & Melipayamak SMS Modal */}
      <ExamShareLinksModal
        isOpen={shareModalState.isOpen}
        onClose={() => setShareModalState((prev) => ({ ...prev, isOpen: false }))}
        studentId={shareModalState.studentId}
        studentName={shareModalState.studentName}
        examDate={shareModalState.examDate}
        showToast={showToast}
      />

      {/* Edit Exam Result Modal (RBAC: admin & teacher only) */}
      {canEdit && (
        <EditExamResultModal
          isOpen={Boolean(editingExam)}
          exam={editingExam}
          onClose={() => setEditingExam(null)}
          onSuccess={handleEditSuccess}
          showToast={showToast}
        />
      )}
    </div>
  );
};

