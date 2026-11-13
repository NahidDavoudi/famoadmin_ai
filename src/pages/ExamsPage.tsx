import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Calendar,
  Users,
  Eye,
  ChevronRight,
  X,
  Plus,
  Printer,
  MessageSquarePlus,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import API from '../lib/api';
import { formatJalaliLong, formatGregorianToJalali } from '../lib/jalali';
import {
  safeNumber,
  formatFixed,
  createInitialTeacherFeedbacks,
  type TeacherFeedbackRow,
  type StudentExamTrendPoint,
} from '../lib/exam-math';
import type {
  ExamDateSummary,
  ExamDetailsResponse,
  ExamStudentSummary,
  PageId,
  SubjectResult,
  ToastType,
} from '../types';
import {
  RadialGauge,
  StudentExamTrendChart,
  PrintableStudentTrendChart,
} from '../components/Charts';
import { ActionButton } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

interface ExamsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  onNavigate: (page: PageId) => void;
}

type ExamViewLevel = 'dates' | 'students' | 'details';

export const ExamsPage: React.FC<ExamsPageProps> = ({ showToast, onNavigate }) => {
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

  const handleSelectDate = async (examDate: string) => {
    setLoading(true);
    setSelectedDate(examDate);
    setView('students');
    try {
      const res = await API.getExamStudents(examDate);
      const rawStudents = res.data?.students || [];
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
    setCounselorNote('');
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

  const handleGoBack = async () => {
    if (view === 'details' && selectedDate) {
      setView('students');
      setDetails(null);
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
      : view === 'students'
        ? `شرکت‌کنندگان آزمون ${formatJalaliLong(selectedDate)}`
        : `نتایج ${details?.student?.name || ''} - آزمون ${formatJalaliLong(activeExamDate)}`;

  return (
    <div id="page-exams" className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <ClipboardList className="w-6 h-6 shrink-0" aria-hidden="true" />
          <span>{pageTitle}</span>
        </h1>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {view === 'details' && details && (
            <ActionButton
              type="button"
              onClick={handlePrintReportCard}
              icon={<Printer className="w-4 h-4" />}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <span>چاپ کارنامه</span>
            </ActionButton>
          )}
          {view !== 'dates' && (
            <ActionButton
              type="button"
              variant="secondary"
              loading={loading}
              loadingText="در حال بازگشت..."
              onClick={handleGoBack}
              icon={<ChevronRight className="w-4 h-4" />}
              className="px-4 py-2"
            >
              <span>{view === 'students' ? 'بازگشت به لیست آزمون‌ها' : 'بازگشت به شرکت‌کنندگان'}</span>
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
                  headerClassName: 'w-36 xl:w-40',
                  cellClassName: 'w-36 xl:w-40 tabular-nums text-slate-600',
                  cell: (exam) => `${exam.subject_count} درس`,
                },
                {
                  key: 'avg_percentage',
                  header: 'میانگین درصد',
                  mobileLabel: 'میانگین درصد',
                  priority: 'secondary',
                  headerClassName: 'w-28 xl:w-32',
                  cellClassName: 'w-28 xl:w-32 tabular-nums',
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
                      onClick={(e) => {
                        e.stopPropagation();
                        return handleSelectDate(exam.exam_date);
                      }}
                      icon={<Users className="w-4 h-4" />}
                      className="px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs shrink-0"
                    >
                      <span>مشاهده شرکت‌کنندگان</span>
                    </ActionButton>
                  ),
                },
              ] satisfies Column<ExamDateSummary>[]
            }
          />
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
                    <span className="font-semibold text-slate-800 whitespace-normal break-words">
                      {s.name}
                    </span>
                  ),
                },
                {
                  key: 'grade',
                  header: 'پایه',
                  priority: 'desktop-only',
                  headerClassName: 'w-20',
                  cellClassName: 'w-20 tabular-nums text-slate-600',
                  cell: (s) => `پایه ${s.grade}`,
                },
                {
                  key: 'field',
                  header: 'رشته',
                  mobileLabel: 'پایه و رشته',
                  priority: 'secondary',
                  headerClassName: 'w-28',
                  cellClassName: 'w-28 text-slate-600',
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
                  headerClassName: 'w-28',
                  cellClassName: 'w-28 tabular-nums text-slate-600',
                  cell: (s) => `${s.subject_count} درس`,
                },
                {
                  key: 'avg_percentage',
                  header: 'میانگین درصد',
                  mobileLabel: 'میانگین کل',
                  priority: 'secondary',
                  headerClassName: 'w-28',
                  cellClassName: 'w-28 tabular-nums',
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
                  headerClassName: 'w-48',
                  cellClassName: 'w-48 shrink-0',
                  cell: (s) => (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          selectedDate
                            ? handleSelectStudentDetails(selectedDate, s.student_id, false)
                            : undefined
                        }
                        icon={<Eye className="w-4 h-4" />}
                        className="px-2.5 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                      >
                        <span>کارنامه</span>
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          selectedDate
                            ? handleSelectStudentDetails(selectedDate, s.student_id, true)
                            : undefined
                        }
                        icon={<Printer className="w-4 h-4" />}
                        className="px-2.5 py-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 font-medium text-xs"
                      >
                        <span className="hidden sm:inline">چاپ کارنامه</span>
                        <span className="sm:hidden">چاپ</span>
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
                          headerClassName: 'text-center w-14',
                          cellClassName: 'w-14 text-center tabular-nums text-slate-500 text-xs',
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
                          headerClassName: 'w-32 xl:w-40',
                          cellClassName: 'w-32 xl:w-40 text-slate-600 whitespace-normal break-words',
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
                          headerClassName: 'w-20 text-center',
                          cellClassName: 'w-20 text-center tabular-nums font-medium',
                          cell: (sub) => sub.total_q,
                        },
                        {
                          key: 'correct',
                          header: 'صحیح',
                          priority: 'secondary',
                          headerClassName: 'w-16 text-center',
                          cellClassName: 'w-16 text-center tabular-nums text-emerald-700 font-bold',
                          cell: (sub) => sub.correct,
                        },
                        {
                          key: 'wrong',
                          header: 'غلط',
                          priority: 'secondary',
                          headerClassName: 'w-16 text-center',
                          cellClassName: 'w-16 text-center tabular-nums text-red-600 font-bold',
                          cell: (sub) => sub.wrong,
                        },
                        {
                          key: 'skipped',
                          header: 'نزده',
                          priority: 'secondary',
                          headerClassName: 'w-16 text-center',
                          cellClassName: 'w-16 text-center tabular-nums text-slate-600',
                          cell: (sub) => sub.skipped,
                        },
                        {
                          key: 'percentage',
                          header: 'درصد (با نمره منفی)',
                          priority: 'secondary',
                          headerClassName: 'w-32 text-center',
                          cellClassName: 'w-32 text-center tabular-nums',
                          cell: (sub) => {
                            const pct = safeNumber(sub.percentage);
                            return (
                              <span
                                dir="ltr"
                                className={`inline-block px-2.5 py-1 rounded-lg font-extrabold text-xs ${
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
                          headerClassName: 'w-24 text-center',
                          cellClassName: 'w-24 py-1.5 text-center',
                          cell: (sub) => <RadialGauge percentage={safeNumber(sub.percentage)} />,
                        },
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
                            <span className="text-[11px] text-slate-500 font-medium tabular-nums">
                              کل سوالات: {sub.total_q}
                            </span>
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
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                          <span className="text-xs font-bold text-[#344868] bg-slate-200/70 px-2 py-0.5 rounded-md tabular-nums">
                            درس {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={row.subject}
                            onChange={(e) => handleUpdateFeedback(row.id, 'subject', e.target.value)}
                            placeholder="نام درس..."
                            aria-label={`نام درس ردیف ${idx + 1}`}
                            className="font-bold text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#445D84] min-w-[150px]"
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
                            className="text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#445D84] w-40"
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
    </div>
  );
};

