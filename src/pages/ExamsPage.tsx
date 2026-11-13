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
  ToastType,
} from '../types';
import { RadialGauge, StudentExamTrendChart } from '../components/Charts';
import { ActionButton } from '../components/FormControls';

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
        dates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
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
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#344868] text-white text-xs">
                  <tr>
                    <th className="px-5 py-3.5 text-right font-semibold">تاریخ آزمون</th>
                    <th className="px-5 py-3.5 text-right font-semibold">تعداد شرکت‌کنندگان</th>
                    <th className="px-5 py-3.5 text-right font-semibold">تعداد دروس ثبت‌شده</th>
                    <th className="px-5 py-3.5 text-right font-semibold">میانگین درصد</th>
                    <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dates.map((exam) => (
                    <tr
                      key={exam.exam_date}
                      onClick={() => handleSelectDate(exam.exam_date)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
                          <span>{formatJalaliLong(exam.exam_date)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 font-medium">
                        {exam.student_count} نفر
                      </td>
                      <td className="px-5 py-4 tabular-nums text-slate-600">
                        {exam.subject_count} درس
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        <span
                          dir="ltr"
                          className={`inline-block font-bold ${
                            safeNumber(exam.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {formatFixed(exam.avg_percentage, 1)}%
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ActionButton
                          type="button"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            return handleSelectDate(exam.exam_date);
                          }}
                          icon={<Users className="w-4 h-4" />}
                          className="px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                        >
                          <span>مشاهده شرکت‌کنندگان</span>
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : view === 'students' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-5 py-3.5 text-right font-semibold">دانش‌آموز</th>
                  <th className="px-5 py-3.5 text-right font-semibold">پایه</th>
                  <th className="px-5 py-3.5 text-right font-semibold">رشته</th>
                  <th className="px-5 py-3.5 text-right font-semibold">تعداد دروس</th>
                  <th className="px-5 py-3.5 text-right font-semibold">میانگین درصد</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-semibold text-slate-800">{s.name}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{s.grade}</td>
                    <td className="px-5 py-4 text-slate-600">{s.field}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{s.subject_count}</td>
                    <td className="px-5 py-4 tabular-nums">
                      <span
                        dir="ltr"
                        className={`inline-block font-bold ${
                          safeNumber(s.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {formatFixed(s.avg_percentage, 1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <ActionButton
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            selectedDate
                              ? handleSelectStudentDetails(selectedDate, s.student_id, false)
                              : undefined
                          }
                          icon={<Eye className="w-4 h-4" />}
                          className="px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                        >
                          <span>جزئیات کارنامه</span>
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
                          className="px-3 py-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 font-medium text-xs"
                        >
                          <span>چاپ کارنامه</span>
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        details && (
          <div
            id="printable-report-card"
            className="bg-white rounded-2xl p-6 print:p-0 border border-slate-200/80 print:border-0 shadow-xs print:shadow-none space-y-6 print:space-y-4"
          >
            {/* Official Report Card Banner (Shown on both screen & print) */}
            <div className="border-b-2 border-[#344868] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-0.5">آموزشگاه علمی و کنکور فامو</p>
                <h2 className="text-lg font-extrabold text-[#344868]">
                  کارنامه تحلیلی آزمون و برگه‌ی ارزیابی اساتید
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-1.5">
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
            </div>

            {/* Student Info & Overall Percentage Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:grid-cols-5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">نام دانش‌آموز</p>
                <p className="font-bold text-sm text-slate-800">{details.student?.name || '-'}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">پایه تحصیلی</p>
                <p className="font-bold text-sm text-slate-800 tabular-nums">
                  {details.student?.grade ?? '-'}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">رشته تحصیلی</p>
                <p className="font-bold text-sm text-slate-800">{details.student?.field || '-'}</p>
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

            {/* Subject-by-Subject Percentages Table */}
            <div>
              <h3 className="font-bold text-sm sm:text-base mb-2.5 text-[#344868]">
                ۱. جدول جزئیات درصدهای دروس آزمون:
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-300">
                <table className="w-full text-sm">
                  <thead className="bg-[#344868] text-white text-xs">
                    <tr>
                      <th className="px-3 py-2.5 text-center font-semibold w-10">ردیف</th>
                      <th className="px-4 py-2.5 text-right font-semibold">نام درس</th>
                      <th className="px-4 py-2.5 text-right font-semibold">مبحث</th>
                      <th className="px-3 py-2.5 text-center font-semibold">کل سوالات</th>
                      <th className="px-3 py-2.5 text-center font-semibold">صحیح</th>
                      <th className="px-3 py-2.5 text-center font-semibold">غلط</th>
                      <th className="px-3 py-2.5 text-center font-semibold">نزده</th>
                      <th className="px-3 py-2.5 text-center font-semibold">درصد (با نمره منفی)</th>
                      <th className="px-3 py-2.5 text-center font-semibold print:hidden">نمودار</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(details.subjects || []).map((sub, idx) => {
                      const pct = safeNumber(sub.percentage);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2.5 text-center tabular-nums text-slate-500 text-xs">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-800">{sub.subject}</td>
                          <td className="px-4 py-2.5 text-slate-600">{sub.chapter || '-'}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums font-medium">
                            {sub.total_q}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700 font-bold">
                            {sub.correct}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-red-600 font-bold">
                            {sub.wrong}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                            {sub.skipped}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
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
                          </td>
                          <td className="px-3 py-1.5 text-center print:hidden">
                            <RadialGauge percentage={pct} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual Trend Line Chart (Last 5 Exams via Recharts) */}
            <div className="print-avoid-break rounded-xl border border-slate-300 bg-slate-50/40 print:bg-white p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm sm:text-base text-[#344868] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
                  <span>۲. نمودار روند تغییرات درصد در ۵ آزمون اخیر:</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  محاسبه بر اساس فرمول کنکوری (با احتساب نمره منفی)
                </span>
              </div>
              <StudentExamTrendChart data={trendPoints} loading={trendLoading} />
            </div>

            {/* Per-Subject Instructor Comments & Feedback Inputs */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#344868]">
                    ۳. نظرات، تحلیل و تکالیف پیشنهادی اساتید هر درس:
                  </h3>
                  <p className="text-xs text-slate-500 no-print mt-0.5">
                    می‌توانید نظرات اساتید را قبل از چاپ در کادرهای زیر تایپ کنید یا کارنامه را خام چاپ کنید تا هر استاد دستی یادداشت کند.
                  </p>
                </div>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={handleAddFeedbackRow}
                  icon={<MessageSquarePlus className="w-4 h-4" />}
                  className="no-print px-3 py-1.5 text-xs"
                >
                  <span>افزودن باکس نظر استاد</span>
                </ActionButton>
              </div>

              <div className="space-y-3">
                {teacherFeedbacks.map((row, idx) => (
                  <div
                    key={row.id}
                    className="print-avoid-break rounded-xl border border-slate-300 bg-slate-50/50 print:bg-white p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                        <span className="text-xs font-bold text-[#344868] bg-slate-200/70 px-2 py-0.5 rounded-md tabular-nums">
                          درس {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={row.subject}
                          onChange={(e) => handleUpdateFeedback(row.id, 'subject', e.target.value)}
                          placeholder="نام درس (مثلاً زیست‌شناسی، ریاضی...)"
                          aria-label={`نام درس ردیف ${idx + 1}`}
                          className="font-bold text-sm text-slate-800 bg-white print:bg-transparent border border-slate-200 print:border-0 rounded-lg px-2.5 py-1 print:px-0 focus:outline-none focus:border-[#445D84] min-w-[160px]"
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
                          className="no-print text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#445D84] w-40"
                        />
                        <span className="hidden print:inline-block text-xs font-semibold text-slate-800 min-w-[130px] border-b border-dotted border-slate-400 pb-0.5">
                          {row.instructorName.trim() || '........................................'}
                        </span>

                        {teacherFeedbacks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFeedbackRow(row.id)}
                            title="حذف این باکس"
                            className="no-print p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                      <div className="sm:col-span-9">
                        {/* On-screen editable textarea */}
                        <textarea
                          rows={2}
                          value={row.comment}
                          onChange={(e) => handleUpdateFeedback(row.id, 'comment', e.target.value)}
                          placeholder="نظر استاد، نقاط قوت و ضعف دانش‌آموز در این درس، و مباحث نیازمند تمرین..."
                          aria-label={`نظر استاد برای ${row.subject || `ردیف ${idx + 1}`}`}
                          className="no-print w-full text-xs sm:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-[#445D84] resize-y"
                        />

                        {/* Print representation: shows typed text or clean writing lines if empty */}
                        <div className="hidden print:block min-h-[60px] text-xs text-slate-800 leading-6">
                          {row.comment.trim() ? (
                            <p className="whitespace-pre-wrap">{row.comment}</p>
                          ) : (
                            <div className="space-y-5 pt-2">
                              <div className="border-b border-dotted border-slate-300 w-full h-4" />
                              <div className="border-b border-dotted border-slate-300 w-full h-4" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-3 flex flex-col justify-between border border-dashed border-slate-300 rounded-lg p-2 text-center bg-white min-h-[64px]">
                        <span className="text-[11px] text-slate-400">محل امضای استاد درس</span>
                        <span className="text-[10px] text-slate-300">....................</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Counselor Overall Note & Parent Signature Footer */}
            <div className="print-avoid-break grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-200">
              <div className="sm:col-span-8 rounded-xl border border-slate-300 p-3 bg-slate-50/40 print:bg-white">
                <label className="block text-xs font-bold text-[#344868] mb-1.5">
                  ۴. جمع‌بندی و توصیه مشاور / پشتیبان آموزشی:
                </label>
                <textarea
                  rows={2}
                  value={counselorNote}
                  onChange={(e) => setCounselorNote(e.target.value)}
                  placeholder="توصیه کلی مشاور درباره روند مطالعه هفتگی دانش‌آموز..."
                  className="no-print w-full text-xs sm:text-sm text-slate-800 bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#445D84] resize-y"
                />
                <div className="hidden print:block min-h-[52px] text-xs text-slate-800 leading-6">
                  {counselorNote.trim() ? (
                    <p className="whitespace-pre-wrap">{counselorNote}</p>
                  ) : (
                    <div className="space-y-5 pt-2">
                      <div className="border-b border-dotted border-slate-300 w-full h-4" />
                      <div className="border-b border-dotted border-slate-300 w-full h-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-300 p-2.5 flex flex-col justify-between text-center bg-white min-h-[80px]">
                  <span className="text-xs font-semibold text-slate-600">امضای مشاور / پشتیبان</span>
                  <span className="text-[11px] text-slate-300">....................</span>
                </div>
                <div className="rounded-xl border border-slate-300 p-2.5 flex flex-col justify-between text-center bg-white min-h-[80px]">
                  <span className="text-xs font-semibold text-slate-600">اطلاع و امضای ولی</span>
                  <span className="text-[11px] text-slate-300">....................</span>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

