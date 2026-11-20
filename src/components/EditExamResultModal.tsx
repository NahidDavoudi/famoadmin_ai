import React, { useEffect, useMemo, useState } from 'react';
import {
  Pencil,
  Save,
  AlertTriangle,
  CheckCircle2,
  Calculator,
  Calendar,
  BookOpen,
  User,
  Wand2,
} from 'lucide-react';
import API from '../lib/api';
import { formatJalaliLong, toPersianDigits } from '../lib/jalali';
import {
  buildUpdateExamResultPayload,
  calculateRawExamPercentagePreview,
  computeRemainingQuestions,
  normalizeDigitsToEnglish,
  parseStrictInteger,
  validateExamEditForm,
  type ExamEditFormInput,
} from '../lib/exam-math';
import type { ExamListItem, ToastType } from '../types';
import { Modal } from './Modal';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ActionButton, FieldError, getFieldClass } from './FormControls';

export interface EditExamResultModalProps {
  isOpen: boolean;
  exam: ExamListItem | null;
  onClose: () => void;
  onSuccess: (updatedExam: ExamListItem) => void | Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
}

export const EditExamResultModal: React.FC<EditExamResultModalProps> = ({
  isOpen,
  exam,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [form, setForm] = useState<ExamEditFormInput>({
    exam_date: '',
    subject: '',
    chapter: '',
    total_q: '1',
    correct: '0',
    wrong: '0',
    skipped: '0',
    student_id: undefined,
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && exam) {
      setForm({
        exam_date: exam.exam_date || '',
        subject: exam.subject || '',
        chapter: exam.chapter || '',
        total_q: String(exam.total_q ?? 1),
        correct: String(exam.correct ?? 0),
        wrong: String(exam.wrong ?? 0),
        skipped: String(exam.skipped ?? 0),
        student_id: exam.student_id,
      });
      setTouched(false);
      setServerError(null);
      setSaving(false);
    }
  }, [isOpen, exam]);

  const validation = useMemo(() => validateExamEditForm(form), [form]);
  const remainingInfo = useMemo(
    () => computeRemainingQuestions(form.total_q, form.correct, form.wrong, form.skipped),
    [form.total_q, form.correct, form.wrong, form.skipped]
  );
  const percentagePreview = useMemo(
    () => calculateRawExamPercentagePreview(form.total_q, form.correct),
    [form.total_q, form.correct]
  );

  const handleFieldChange = (field: keyof ExamEditFormInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched(true);
    if (serverError) setServerError(null);
  };

  const handleIntegerChange = (
    field: 'total_q' | 'correct' | 'wrong' | 'skipped',
    rawValue: string
  ) => {
    const normalized = normalizeDigitsToEnglish(rawValue);
    setForm((prev) => ({ ...prev, [field]: normalized }));
    setTouched(true);
    if (serverError) setServerError(null);
  };

  const handleAutoFillSkipped = () => {
    const total = parseStrictInteger(form.total_q);
    const correct = parseStrictInteger(form.correct);
    const wrong = parseStrictInteger(form.wrong);
    if (total === null || correct === null || wrong === null) return;
    const autoSkipped = Math.max(0, total - correct - wrong);
    setForm((prev) => ({ ...prev, skipped: String(autoSkipped) }));
    setTouched(true);
    if (serverError) setServerError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!exam || saving) return;

    setTouched(true);
    setServerError(null);

    if (!validation.isValid) {
      const firstErr = Object.values(validation.errors).find(Boolean);
      showToast(firstErr || 'لطفاً خطاهای فرم را برطرف کنید', 'error');
      return;
    }

    const payload = buildUpdateExamResultPayload(form);

    setSaving(true);
    try {
      const res = await API.updateExamResult(exam.id, payload);
      const updatedExam = res.data?.exam;
      if (updatedExam) {
        await onSuccess(updatedExam);
      }
      showToast(`نتیجه درس «${payload.subject}» با موفقیت ویرایش شد`, 'success');
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || 'خطا در ویرایش نتیجه آزمون';
      setServerError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalQInt = parseStrictInteger(form.total_q);
  const correctInt = parseStrictInteger(form.correct);
  const wrongInt = parseStrictInteger(form.wrong);
  const canAutoFillSkipped =
    totalQInt !== null &&
    totalQInt >= 1 &&
    correctInt !== null &&
    correctInt >= 0 &&
    wrongInt !== null &&
    wrongInt >= 0 &&
    totalQInt - correctInt - wrongInt >= 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="ویرایش نتیجه آزمون و آمار پاسخگویی"
      subtitle={
        exam
          ? `ردیف آزمون #${toPersianDigits(exam.id)}${exam.student_name ? ` · ${exam.student_name}` : ''}`
          : undefined
      }
      icon={<Pencil className="w-5 h-5" />}
      size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
            className="px-5 py-2.5"
          >
            <span>انصراف</span>
          </ActionButton>
          <ActionButton
            type="button"
            onClick={() => handleSubmit()}
            loading={saving}
            loadingText="در حال ذخیره تغییرات..."
            disabled={!validation.isValid || saving}
            icon={<Save className="w-4 h-4" />}
            className="px-6 py-2.5 font-bold"
          >
            <span>ذخیره تغییرات</span>
          </ActionButton>
        </div>
      }
    >
      {exam && (
        <form id="editExamResultForm" noValidate onSubmit={handleSubmit} className="space-y-5">
          {/* Student & Record Context Card */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0">
                <User className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 truncate">
                  {exam.student_name || `دانش‌آموز #${toPersianDigits(exam.student_id)}`}
                </div>
                {(exam.grade || exam.field) && (
                  <div className="text-xs text-slate-500 tabular-nums">
                    {exam.grade ? `پایه ${toPersianDigits(exam.grade)}` : ''}
                    {exam.grade && exam.field ? ' · ' : ''}
                    {exam.field || ''}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-500 tabular-nums bg-white px-2.5 py-1 rounded-lg border border-slate-200">
              شناسه رکورد: <span className="font-bold text-slate-700">{toPersianDigits(exam.id)}</span>
            </div>
          </div>

          {/* Server Validation / RBAC / Auth Error Alert */}
          {serverError && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-red-700 flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Jalali Exam Date Picker (converts to Gregorian YYYY-MM-DD for API) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
              <span>
                تاریخ آزمون (شمسی) <span className="text-red-500">*</span>
              </span>
            </label>
            <JalaliDatePicker
              id="editExamJalaliDate"
              value={form.exam_date}
              onChange={(iso) => handleFieldChange('exam_date', iso)}
              disabled={saving}
            />
            {form.exam_date && (
              <p className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>{formatJalaliLong(form.exam_date)}</span>
                <span className="text-slate-300">|</span>
                <span dir="ltr" className="font-mono text-slate-400">
                  {form.exam_date}
                </span>
              </p>
            )}
            <FieldError message={touched ? validation.errors.exam_date : undefined} />
          </div>

          {/* Subject & Chapter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="editExamSubject"
                  className="text-xs font-bold text-slate-700 flex items-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#445D84]" aria-hidden="true" />
                  <span>
                    نام درس <span className="text-red-500">*</span>
                  </span>
                </label>
                <span
                  dir="ltr"
                  className={`text-[11px] tabular-nums ${
                    form.subject.trim().length > 50 ? 'text-red-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {form.subject.trim().length}/50
                </span>
              </div>
              <input
                id="editExamSubject"
                type="text"
                maxLength={60}
                disabled={saving}
                value={form.subject}
                aria-invalid={Boolean(touched && validation.errors.subject)}
                onChange={(e) => handleFieldChange('subject', e.target.value)}
                placeholder="مثلاً: ریاضی"
                className={getFieldClass(Boolean(touched && validation.errors.subject), 'py-2.5')}
              />
              <FieldError message={touched ? validation.errors.subject : undefined} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="editExamChapter" className="text-xs font-bold text-slate-700">
                  مبحث (اختیاری)
                </label>
                <span
                  dir="ltr"
                  className={`text-[11px] tabular-nums ${
                    form.chapter.trim().length > 100 ? 'text-red-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {form.chapter.trim().length}/100
                </span>
              </div>
              <input
                id="editExamChapter"
                type="text"
                maxLength={110}
                disabled={saving}
                value={form.chapter}
                aria-invalid={Boolean(touched && validation.errors.chapter)}
                onChange={(e) => handleFieldChange('chapter', e.target.value)}
                placeholder="مثلاً: مشتق (در صورت خالی بودن null ذخیره می‌شود)"
                className={getFieldClass(Boolean(touched && validation.errors.chapter), 'py-2.5')}
              />
              <FieldError message={touched ? validation.errors.chapter : undefined} />
            </div>
          </div>

          {/* Numeric Counts Grid */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">آمار پاسخگویی (عدد صحیح):</span>
              {canAutoFillSkipped && (
                <button
                  type="button"
                  onClick={handleAutoFillSkipped}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#445D84] hover:text-[#344868] bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>محاسبه خودکار نزده ({toPersianDigits(totalQInt! - correctInt! - wrongInt!)})</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="editExamTotalQ"
                  className="block text-xs font-semibold text-slate-700 mb-1 text-center"
                >
                  کل سوالات <span className="text-red-500">*</span>
                </label>
                <input
                  id="editExamTotalQ"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  disabled={saving}
                  value={form.total_q}
                  aria-invalid={Boolean(validation.errors.total_q)}
                  onChange={(e) => handleIntegerChange('total_q', e.target.value)}
                  className={getFieldClass(
                    Boolean(validation.errors.total_q),
                    'py-2.5 text-center font-bold tabular-nums'
                  )}
                />
                <FieldError message={validation.errors.total_q} />
              </div>

              <div>
                <label
                  htmlFor="editExamCorrect"
                  className="block text-xs font-semibold text-emerald-700 mb-1 text-center"
                >
                  صحیح <span className="text-red-500">*</span>
                </label>
                <input
                  id="editExamCorrect"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  disabled={saving}
                  value={form.correct}
                  aria-invalid={Boolean(validation.errors.correct || validation.errors.balance)}
                  onChange={(e) => handleIntegerChange('correct', e.target.value)}
                  className={
                    validation.errors.correct || validation.errors.balance
                      ? getFieldClass(true, 'py-2.5 text-center font-bold tabular-nums')
                      : 'w-full px-3.5 py-2.5 border-2 border-emerald-200 bg-emerald-50/40 text-emerald-800 rounded-xl text-center text-sm font-bold tabular-nums focus:outline-none focus:border-emerald-500'
                  }
                />
                <FieldError message={validation.errors.correct} />
              </div>

              <div>
                <label
                  htmlFor="editExamWrong"
                  className="block text-xs font-semibold text-red-600 mb-1 text-center"
                >
                  غلط <span className="text-red-500">*</span>
                </label>
                <input
                  id="editExamWrong"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  disabled={saving}
                  value={form.wrong}
                  aria-invalid={Boolean(validation.errors.wrong || validation.errors.balance)}
                  onChange={(e) => handleIntegerChange('wrong', e.target.value)}
                  className={
                    validation.errors.wrong || validation.errors.balance
                      ? getFieldClass(true, 'py-2.5 text-center font-bold tabular-nums')
                      : 'w-full px-3.5 py-2.5 border-2 border-red-200 bg-red-50/40 text-red-800 rounded-xl text-center text-sm font-bold tabular-nums focus:outline-none focus:border-red-500'
                  }
                />
                <FieldError message={validation.errors.wrong} />
              </div>

              <div>
                <label
                  htmlFor="editExamSkipped"
                  className="block text-xs font-semibold text-slate-600 mb-1 text-center"
                >
                  نزده <span className="text-red-500">*</span>
                </label>
                <input
                  id="editExamSkipped"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  disabled={saving}
                  value={form.skipped}
                  aria-invalid={Boolean(validation.errors.skipped || validation.errors.balance)}
                  onChange={(e) => handleIntegerChange('skipped', e.target.value)}
                  className={
                    validation.errors.skipped || validation.errors.balance
                      ? getFieldClass(true, 'py-2.5 text-center font-bold tabular-nums')
                      : 'w-full px-3.5 py-2.5 border-2 border-slate-200 bg-white text-slate-800 rounded-xl text-center text-sm font-bold tabular-nums focus:outline-none focus:border-[#445D84]'
                  }
                />
                <FieldError message={validation.errors.skipped} />
              </div>
            </div>

            {/* Balance / Remaining Questions + Live Percentage Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div
                className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                  remainingInfo.isOverflow
                    ? 'bg-red-50 border-red-300 text-red-700 font-bold'
                    : remainingInfo.remaining === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {remainingInfo.isOverflow ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
                  ) : (
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        remainingInfo.remaining === 0 ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {remainingInfo.remaining === null
                      ? 'باقیمانده سوالات: نامشخص'
                      : remainingInfo.isOverflow
                        ? `تخطی از کل سوالات (${toPersianDigits(Math.abs(remainingInfo.remaining))} سوال اضافه)`
                        : `سوالات باقیمانده: ${toPersianDigits(remainingInfo.remaining)} از ${toPersianDigits(remainingInfo.total ?? 0)}`}
                  </span>
                </div>
                {remainingInfo.answeredAndSkippedSum !== null && remainingInfo.total !== null && (
                  <span dir="ltr" className="tabular-nums font-bold text-[11px]">
                    {remainingInfo.answeredAndSkippedSum} / {remainingInfo.total}
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-[#445D84]/25 bg-[#445D84]/5 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#344868]">
                  <Calculator className="w-4 h-4 text-[#445D84] shrink-0" aria-hidden="true" />
                  <span>پیش‌نمایش درصد (محاسبه سرور):</span>
                </div>
                <span
                  dir="ltr"
                  data-testid="edit-exam-live-percentage"
                  className={`text-sm font-extrabold tabular-nums px-2 py-0.5 rounded-lg border ${
                    percentagePreview.numeric >= 50
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white text-[#344868] border-slate-200'
                  }`}
                >
                  {percentagePreview.formatted}%
                </span>
              </div>
            </div>

            {validation.errors.balance && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700"
              >
                {validation.errors.balance}
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
};
