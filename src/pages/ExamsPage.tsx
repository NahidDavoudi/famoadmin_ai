import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Calendar,
  Users,
  Eye,
  ChevronRight,
  X,
  Plus,
} from 'lucide-react';
import API from '../lib/api';
import { formatJalaliLong } from '../lib/jalali';
import { safeNumber, formatFixed } from '../lib/exam-math';
import type {
  ExamDateSummary,
  ExamDetailsResponse,
  ExamStudentSummary,
  PageId,
  ToastType,
} from '../types';
import { RadialGauge } from '../components/Charts';
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

  const handleSelectStudentDetails = async (examDate: string, studentId: number) => {
    const cacheKey = `${examDate}:${studentId}`;
    if (detailsCache[cacheKey]) {
      setDetails(detailsCache[cacheKey]);
      setView('details');
      return;
    }

    setLoading(true);
    setView('details');
    try {
      const res = await API.getExamDetails(examDate, studentId);
      setDetails(res.data);
      if (res.data) {
        setDetailsCache((prev) => ({ ...prev, [cacheKey]: res.data }));
      }
    } catch {
      showToast('خطا در بارگذاری جزئیات کارنامه', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = async () => {
    if (view === 'details' && selectedDate) {
      setView('students');
      setDetails(null);
    } else {
      await loadDates(monthFilter);
    }
  };

  const pageTitle =
    view === 'dates'
      ? 'آزمون‌های برگزار شده'
      : view === 'students'
        ? `شرکت‌کنندگان آزمون ${formatJalaliLong(selectedDate)}`
        : `نتایج ${details?.student?.name || ''} - آزمون ${formatJalaliLong(selectedDate)}`;

  return (
    <div id="page-exams" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <ClipboardList className="w-6 h-6 shrink-0" aria-hidden="true" />
          <span>{pageTitle}</span>
        </h1>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {view !== 'dates' && (
            <ActionButton
              type="button"
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
        <div className="space-y-3">
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
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          selectedDate
                            ? handleSelectStudentDetails(selectedDate, s.student_id)
                            : undefined
                        }
                        icon={<Eye className="w-4 h-4" />}
                        className="px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 font-medium text-xs"
                      >
                        <span>جزئیات کارنامه</span>
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        details && (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-center">
                <p className="text-slate-500 text-xs mb-1">دانش‌آموز</p>
                <p className="font-bold text-sm text-slate-800">{details.student?.name || '-'}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-center">
                <p className="text-slate-500 text-xs mb-1">پایه</p>
                <p className="font-bold text-sm text-slate-800 tabular-nums">
                  {details.student?.grade ?? '-'}
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-center">
                <p className="text-slate-500 text-xs mb-1">رشته</p>
                <p className="font-bold text-sm text-slate-800">{details.student?.field || '-'}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-center">
                <p className="text-slate-500 text-xs mb-1">میانگین کل</p>
                <p
                  dir="ltr"
                  className={`font-bold text-sm tabular-nums ${
                    safeNumber(details.avg_percentage) >= 50 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {formatFixed(details.avg_percentage, 1)}%
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-base mb-3 text-[#445D84]">نتایج درس به درس:</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-[#344868] text-white text-xs">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold">درس</th>
                      <th className="px-4 py-3 text-right font-semibold">مبحث</th>
                      <th className="px-4 py-3 text-center font-semibold">کل سوالات</th>
                      <th className="px-4 py-3 text-center font-semibold">صحیح</th>
                      <th className="px-4 py-3 text-center font-semibold">غلط</th>
                      <th className="px-4 py-3 text-center font-semibold">نزده</th>
                      <th className="px-4 py-3 text-center font-semibold">نمودار درصد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(details.subjects || []).map((sub, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-slate-800">{sub.subject}</td>
                        <td className="px-4 py-3 text-slate-600">{sub.chapter || '-'}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{sub.total_q}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-emerald-600 font-bold">
                          {sub.correct}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-red-600 font-bold">
                          {sub.wrong}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                          {sub.skipped}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <RadialGauge percentage={safeNumber(sub.percentage)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};
