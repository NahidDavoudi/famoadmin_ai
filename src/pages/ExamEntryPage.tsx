import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pencil,
  School,
  CalendarDays,
  Plus,
  Save,
  Trash2,
  Settings,
} from 'lucide-react';
import API from '../lib/api';
import {
  getJalaliMonths,
  getTodayJalali,
  jalaliMonthDays,
  jalaliToGregorianIso,
} from '../lib/jalali';
import { calculateSubjectMetrics, type SubjectDraft } from '../lib/exam-math';
import type { Student, SubjectResult, ToastType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface ExamEntryPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

function createEmptyRow(): SubjectDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    subject: '',
    chapter: '',
    total_q: '',
    correct: '',
    wrong: '',
  };
}

export const ExamEntryPage: React.FC<ExamEntryPageProps> = ({ showToast }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [todayYear, todayMonth, todayDay] = getTodayJalali();
  const [jYear, setJYear] = useState<number>(todayYear);
  const [jMonth, setJMonth] = useState<number>(todayMonth);
  const [jDay, setJDay] = useState<number>(todayDay);

  const [rows, setRows] = useState<SubjectDraft[]>(() => [createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement | null>(null);
  const months = getJalaliMonths();
  const maxDaysInMonth = jalaliMonthDays(jMonth, jYear);
  const yearOptions = [todayYear - 2, todayYear - 1, todayYear, todayYear + 1];

  useEffect(() => {
    if (jDay > maxDaysInMonth) {
      setJDay(maxDaysInMonth);
    }
  }, [jMonth, jYear, jDay, maxDaysInMonth]);

  useEffect(() => {
    API.getStudentsList()
      .then((res) => setStudents(res.data || []))
      .catch(() => showToast('خطا در بارگذاری لیست دانش‌آموزان', 'error'));
  }, [showToast]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuggestions = studentQuery.trim()
    ? students
        .filter((s) => {
          const q = studentQuery.toLowerCase().trim();
          return (
            s.name.toLowerCase().includes(q) ||
            `${s.grade} ${s.field}`.toLowerCase().includes(q)
          );
        })
        .slice(0, 10)
    : students.slice(0, 8);

  const addSubjectRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeSubjectRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : [createEmptyRow()]));
  };

  const updateRowField = (id: string, field: keyof SubjectDraft, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const resetForm = useCallback(() => {
    setSelectedStudent(null);
    setStudentQuery('');
    const [ty, tm, td] = getTodayJalali();
    setJYear(ty);
    setJMonth(tm);
    setJDay(td);
    setRows([createEmptyRow()]);
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (submitting) return;

      const resolvedStudent =
        selectedStudent ||
        students.find((s) => s.name.trim() === studentQuery.trim()) ||
        null;

      if (!resolvedStudent) {
        showToast('لطفاً ابتدا دانش‌آموز را از لیست انتخاب کنید', 'error');
        return;
      }

      const validSubjects: SubjectResult[] = [];
      for (const row of rows) {
        if (!row.subject.trim() && !row.total_q) continue;
        if (!row.subject.trim()) {
          showToast('نام درس را وارد کنید', 'error');
          return;
        }
        const metrics = calculateSubjectMetrics(row.total_q, row.correct || 0, row.wrong || 0);
        if (!metrics.isValid || metrics.skipped === null || metrics.percentage === null) {
          showToast(`درس «${row.subject}»: مجموع پاسخ‌های صحیح و غلط بیشتر از کل سوالات است`, 'error');
          return;
        }
        validSubjects.push({
          subject: row.subject.trim(),
          chapter: row.chapter.trim() || undefined,
          total_q: Number(row.total_q),
          correct: Number(row.correct) || 0,
          wrong: Number(row.wrong) || 0,
          skipped: metrics.skipped,
          percentage: metrics.percentage,
        });
      }

      if (validSubjects.length === 0) {
        showToast('حداقل یک درس با تعداد سوالات معتبر وارد کنید', 'error');
        return;
      }

      const gregorianDate = jalaliToGregorianIso(jYear, jMonth, jDay);

      setSubmitting(true);
      try {
        await API.submitExamEntry({
          student_id: resolvedStudent.id,
          exam_date: gregorianDate,
          subjects: validSubjects,
        });
        resetForm();
        showToast(`نتایج آزمون برای «${resolvedStudent.name}» با موفقیت ثبت شد`, 'success');
      } catch (err) {
        showToast((err as Error).message || 'خطا در ثبت نتایج آزمون', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, selectedStudent, students, studentQuery, rows, jYear, jMonth, jDay, resetForm, showToast]
  );

  // Ctrl+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSubmit();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  return (
    <div id="page-exam_entry" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <Pencil className="w-6 h-6" aria-hidden="true" />
          <span>ثبت نتایج آزمون</span>
        </h1>
      </div>

      {/* Step 1: Exam Info */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="bg-[#445D84] px-6 py-4 flex items-center gap-3 text-white">
          <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
            ۱
          </span>
          <h2 className="font-bold text-base">اطلاعات آزمون</h2>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Student Autocomplete */}
          <div ref={autocompleteRef} className="relative">
            <label
              htmlFor="examStudentSelect"
              className="block mb-2 font-medium text-slate-700 text-sm flex items-center gap-1.5"
            >
              <School className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
              <span>دانش‌آموز</span>
            </label>
            <input
              id="examStudentSelect"
              type="text"
              autoComplete="off"
              placeholder="نام دانش‌آموز را تایپ یا انتخاب کنید..."
              value={studentQuery}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setStudentQuery(e.target.value);
                setSelectedStudent(null);
                setShowSuggestions(true);
              }}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <ul
                id="studentSuggestions"
                className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100"
              >
                {filteredSuggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(s);
                        setStudentQuery(s.name);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800">{s.name}</span>
                      <span className="text-xs text-slate-500">
                        پایه {s.grade} • {s.field}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Jalali Date Picker */}
          <div>
            <label className="block mb-2 font-medium text-slate-700 text-sm flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
              <span>تاریخ آزمون (شمسی)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <select
                  id="examJalaliYear"
                  aria-label="سال شمسی"
                  value={jYear}
                  onChange={(e) => setJYear(Number(e.target.value))}
                  className="w-full px-3 py-3 border-2 border-slate-200 rounded-xl text-sm text-center bg-white focus:outline-none focus:border-[#445D84]"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400 text-center mt-1">سال</span>
              </div>
              <div>
                <select
                  id="examJalaliMonth"
                  aria-label="ماه شمسی"
                  value={jMonth}
                  onChange={(e) => setJMonth(Number(e.target.value))}
                  className="w-full px-3 py-3 border-2 border-slate-200 rounded-xl text-sm text-center bg-white focus:outline-none focus:border-[#445D84]"
                >
                  {months.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {idx + 1} - {m}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400 text-center mt-1">ماه</span>
              </div>
              <div>
                <select
                  id="examJalaliDay"
                  aria-label="روز شمسی"
                  value={jDay}
                  onChange={(e) => setJDay(Number(e.target.value))}
                  className="w-full px-3 py-3 border-2 border-slate-200 rounded-xl text-sm text-center bg-white focus:outline-none focus:border-[#445D84]"
                >
                  {Array.from({ length: maxDaysInMonth }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-400 text-center mt-1">روز</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Subject Rows */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
              ۲
            </span>
            <h2 className="font-bold text-base">نتایج دروس</h2>
          </div>
          <button
            type="button"
            onClick={addSubjectRow}
            className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن درس</span>
          </button>
        </div>

        <form id="examEntryForm" onSubmit={handleSubmit} className="p-6 space-y-4">
          <div id="subjectsContainer" className="space-y-4">
            {rows.map((row, idx) => {
              const metrics = calculateSubjectMetrics(
                row.total_q,
                row.correct || 0,
                row.wrong || 0
              );

              return (
                <div
                  key={row.id}
                  className="subject-row bg-slate-50/70 rounded-2xl border border-slate-200 p-4 flex items-start gap-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubjectRow();
                    }
                  }}
                >
                  <div className="w-8 h-8 rounded-xl bg-[#445D84] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-6 tabular-nums">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          نام درس *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="مثلاً: زیست‌شناسی"
                          value={row.subject}
                          onChange={(e) => updateRowField(row.id, 'subject', e.target.value)}
                          className="w-full px-3.5 py-2 border-2 border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          مبحث (اختیاری)
                        </label>
                        <input
                          type="text"
                          placeholder="مثلاً: فصل ۳"
                          value={row.chapter}
                          onChange={(e) => updateRowField(row.id, 'chapter', e.target.value)}
                          className="w-full px-3.5 py-2 border-2 border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1 text-center">
                          کل سوالات
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          placeholder="0"
                          value={row.total_q}
                          onChange={(e) => updateRowField(row.id, 'total_q', e.target.value)}
                          className="w-full px-2 py-2 border-2 border-slate-200 bg-white rounded-xl text-center text-sm font-semibold tabular-nums focus:outline-none focus:border-[#445D84]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-emerald-700 mb-1 text-center">
                          صحیح
                        </label>
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="0"
                          value={row.correct}
                          onChange={(e) => updateRowField(row.id, 'correct', e.target.value)}
                          className="w-full px-2 py-2 border-2 border-emerald-200 bg-emerald-50/40 text-emerald-800 rounded-xl text-center text-sm font-semibold tabular-nums focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-red-600 mb-1 text-center">
                          غلط
                        </label>
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="0"
                          value={row.wrong}
                          onChange={(e) => updateRowField(row.id, 'wrong', e.target.value)}
                          className="w-full px-2 py-2 border-2 border-red-200 bg-red-50/40 text-red-800 rounded-xl text-center text-sm font-semibold tabular-nums focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1 text-center">
                          نزده
                        </label>
                        <div
                          className={`w-full px-2 py-2 border-2 rounded-xl text-center text-sm font-bold tabular-nums ${
                            metrics.skipped !== null && metrics.skipped < 0
                              ? 'bg-red-50 border-red-200 text-red-600'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {metrics.skipped !== null && metrics.skipped >= 0 ? metrics.skipped : '-'}
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-medium text-[#445D84] mb-1 text-center">
                          درصد
                        </label>
                        <div
                          className={`w-full px-2 py-2 border-2 rounded-xl text-center text-sm font-bold tabular-nums ${
                            metrics.percentage === null
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : metrics.percentage >= 50
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-red-50 border-red-200 text-red-700'
                          }`}
                          dir="ltr"
                        >
                          {metrics.percentage !== null ? `${metrics.percentage}%` : '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSubjectRow(row.id)}
                    title="حذف ردیف درس"
                    aria-label={`حذف ردیف درس ${idx + 1}`}
                    className="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 flex items-center justify-center shrink-0 mt-6 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[#445D84] hover:bg-[#374a6b] text-white px-6 py-3.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-3 cursor-pointer"
            >
              <Save className="w-5 h-5" />
              <span>{submitting ? 'در حال ثبت...' : 'ثبت نتایج آزمون'}</span>
              <kbd className="bg-white/20 px-2 py-0.5 rounded text-xs font-mono">Ctrl+S</kbd>
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>پاک کردن فرم</span>
            </button>
          </div>
        </form>
      </div>

      {/* Keyboard Shortcuts Help Box */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4">
        <h3 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4" aria-hidden="true" />
          <span>میانبرهای کیبورد</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-blue-800">
          <div>
            <kbd className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">Tab</kbd> رفتن به فیلد بعدی
          </div>
          <div>
            <kbd className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">Enter</kbd> افزودن درس جدید
          </div>
          <div>
            <kbd className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">Ctrl+S</kbd> ثبت سریع نتایج
          </div>
          <div>
            <kbd className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">Esc</kbd> بستن پنجره راهنما
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmClearOpen}
        title="پاک کردن فرم"
        message="آیا مطمئن هستید که می‌خواهید اطلاعات وارد شده در فرم ثبت نتایج را پاک کنید؟"
        confirmText="پاک کردن"
        variant="danger"
        onConfirm={() => {
          setConfirmClearOpen(false);
          resetForm();
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
