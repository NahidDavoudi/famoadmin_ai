import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import API from '../lib/api';
import type { Course, Student, Subscription, SubscriptionStatus, ToastType } from '../types';
import {
  SUBSCRIPTION_STATUS_OPTIONS,
  getSubscriptionStatusBadgeClass,
  getSubscriptionStatusLabel,
  formatSubscriptionDateInput,
  formatSubscriptionJalaliDate,
  formatCoursePrice,
  validateSubscriptionForm,
  resolveSubscriptionIsActive,
  computeSubscriptionStats,
  type SubscriptionFormErrors,
} from '../lib/subscriptions';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from './FormControls';

interface StudentSubscriptionsModalProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: ToastType) => void;
  onSubscriptionsChanged?: () => void;
}

export const StudentSubscriptionsModal: React.FC<StudentSubscriptionsModalProps> = ({
  student,
  isOpen,
  onClose,
  showToast,
  onSubscriptionsChanged,
}) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);

  // Enrollment / Edit Form State
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [startedAt, setStartedAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [note, setNote] = useState('');
  const [formErrors, setFormErrors] = useState<SubscriptionFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Quick status update loading map
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  const loadData = useCallback(async () => {
    if (!student?.id) return;
    setLoading(true);
    try {
      const [subsRes, coursesRes] = await Promise.allSettled([
        API.getStudentSubscriptions(student.id, onlyActive),
        API.getCourses(),
      ]);

      if (subsRes.status === 'fulfilled') {
        setSubscriptions(subsRes.value.data || []);
      } else {
        showToast('خطا در بارگذاری دوره‌های دانش‌آموز', 'error');
      }

      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [student?.id, onlyActive, showToast]);

  useEffect(() => {
    if (isOpen && student?.id) {
      resetForm();
      loadData();
    }
  }, [isOpen, student?.id, loadData]);

  const resetForm = () => {
    setEditingSub(null);
    setCourseId('');
    setStatus('active');
    setStartedAt('');
    setEndAt('');
    setNote('');
    setFormErrors({});
  };

  const handleStartEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setCourseId(String(sub.course_id || sub.course?.id || ''));
    setStatus(sub.status || 'active');
    setStartedAt(formatSubscriptionDateInput(sub.started_at));
    setEndAt(formatSubscriptionDateInput(sub.end_at));
    setNote(sub.note || '');
    setFormErrors({});
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student?.id || submitting) return;

    const errors = validateSubscriptionForm({
      student_id: student.id,
      course_id: courseId,
      status,
      started_at: startedAt,
      end_at: endAt,
      note,
    });
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً فیلدهای فرم اشتراک را بررسی کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const isActive = resolveSubscriptionIsActive(status);
      if (editingSub) {
        await API.updateSubscription(editingSub.id, {
          student_id: student.id,
          course_id: Number(courseId),
          status,
          is_active: isActive,
          started_at: startedAt ? startedAt : null,
          end_at: endAt ? endAt : null,
          note: note.trim() || null,
        });
        showToast('اطلاعات اشتراک دوره ویرایش شد', 'success');
      } else {
        await API.createSubscription({
          student_id: student.id,
          course_id: Number(courseId),
          status,
          is_active: isActive,
          started_at: startedAt ? startedAt : null,
          end_at: endAt ? endAt : null,
          note: note.trim() || null,
        });
        showToast('دانش‌آموز با موفقیت در دوره ثبت‌نام شد', 'success');
      }
      resetForm();
      await loadData();
      onSubscriptionsChanged?.();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره اشتراک دوره', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (
    sub: Subscription,
    nextStatus: SubscriptionStatus
  ) => {
    if (updatingStatusId === sub.id || sub.status === nextStatus) return;
    setUpdatingStatusId(sub.id);
    try {
      await API.updateSubscriptionStatus(sub.id, {
        status: nextStatus,
        note: sub.note,
      });
      showToast(
        `وضعیت اشتراک به «${getSubscriptionStatusLabel(nextStatus)}» تغییر یافت`,
        'success'
      );
      await loadData();
      onSubscriptionsChanged?.();
    } catch (err) {
      showToast((err as Error).message || 'خطا در تغییر وضعیت اشتراک', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteSubscription(deleteTarget.id);
      setDeleteTarget(null);
      showToast('اشتراک دوره حذف شد', 'success');
      if (editingSub?.id === deleteTarget.id) {
        resetForm();
      }
      await loadData();
      onSubscriptionsChanged?.();
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف اشتراک دوره', 'error');
    }
  };

  const stats = computeSubscriptionStats(subscriptions);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`دوره‌ها و اشتراک‌های ${student?.name || 'دانش‌آموز'}`}
        subtitle={
          student
            ? `پایه ${student.grade} · رشته ${student.field}${student.phone ? ` · ${student.phone}` : ''}`
            : 'مدیریت ثبت‌نام دوره‌های دانش‌آموز'
        }
        icon={<BookOpen className="w-5 h-5" />}
        size="lg"
        footer={
          <div className="flex items-center justify-end">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={onClose}
              className="px-5 py-2.5"
            >
              بستن
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Summary Pills */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-slate-500">کل دوره‌ها</div>
                <div className="text-base font-bold text-slate-800 tabular-nums">
                  {stats.total}
                </div>
              </div>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-emerald-700">فعال</div>
                <div className="text-base font-bold text-emerald-800 tabular-nums">
                  {stats.active}
                </div>
              </div>
            </div>
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-amber-700">معلق / در انتظار</div>
                <div className="text-base font-bold text-amber-800 tabular-nums">
                  {stats.pending}
                </div>
              </div>
            </div>
          </div>

          {/* Enroll / Edit Form */}
          <form
            noValidate
            onSubmit={handleFormSubmit}
            className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#344868] flex items-center gap-1.5">
                {editingSub ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    <span>
                      ویرایش اشتراک دوره «{editingSub.course?.name || `#${editingSub.course_id}`}»
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>ثبت‌نام در دوره جدید</span>
                  </>
                )}
              </h4>
              {editingSub && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  انصراف از ویرایش
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  انتخاب دوره آموزشی <span className="text-red-500">*</span>
                </label>
                <select
                  aria-label="انتخاب دوره آموزشی"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    if (formErrors.course_id) {
                      setFormErrors((prev) => ({ ...prev, course_id: undefined }));
                    }
                  }}
                  className={getFieldClass(Boolean(formErrors.course_id), 'bg-white')}
                >
                  <option value="">انتخاب دوره...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} ({formatCoursePrice(c.price)})
                    </option>
                  ))}
                </select>
                <FieldError message={formErrors.course_id} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  وضعیت اشتراک
                </label>
                <select
                  aria-label="وضعیت اشتراک"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                  className={getFieldClass(false, 'bg-white')}
                >
                  {SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  تاریخ شروع (اختیاری)
                </label>
                <input
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className={getFieldClass(false, 'bg-white')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  تاریخ پایان (اختیاری)
                </label>
                <input
                  type="date"
                  value={endAt}
                  onChange={(e) => {
                    setEndAt(e.target.value);
                    if (formErrors.end_at) {
                      setFormErrors((prev) => ({ ...prev, end_at: undefined }));
                    }
                  }}
                  className={getFieldClass(Boolean(formErrors.end_at), 'bg-white')}
                />
                <FieldError message={formErrors.end_at} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                یادداشت اشتراک (اختیاری)
              </label>
              <input
                type="text"
                maxLength={1000}
                placeholder="توضیحات پرداخت، تخفیف یا شرایط ثبت‌نام..."
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (formErrors.note) {
                    setFormErrors((prev) => ({ ...prev, note: undefined }));
                  }
                }}
                className={getFieldClass(Boolean(formErrors.note), 'bg-white')}
              />
              <FieldError message={formErrors.note} />
            </div>

            <div className="flex justify-end">
              <ActionButton
                type="submit"
                size="sm"
                loading={submitting}
                loadingText="در حال ثبت..."
                icon={editingSub ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
                className="px-4 py-2"
              >
                <span>{editingSub ? 'ذخیره تغییرات اشتراک' : 'ثبت‌نام دانش‌آموز در دوره'}</span>
              </ActionButton>
            </div>
          </form>

          {/* List Header & Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h4 className="text-sm font-bold text-slate-700">
              فهرست دوره‌های ثبت‌شده ({subscriptions.length})
            </h4>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                  className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                />
                <span>فقط اشتراک‌های فعال</span>
              </label>
              <ActionButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={loadData}
                loading={loading}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                className="px-2.5 py-1.5 text-xs"
              >
                <span>بروزرسانی</span>
              </ActionButton>
            </div>
          </div>

          {/* Subscriptions List */}
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2].map((n) => (
                <div key={n} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center">
              <BookOpen className="w-9 h-9 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                هیچ اشتراک دوره‌ای برای این دانش‌آموز یافت نشد
              </p>
              <p className="text-xs text-slate-500 mt-1">
                از فرم بالا می‌توانید دانش‌آموز را در دوره موردنظر ثبت‌نام کنید.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {subscriptions.map((sub) => (
                <li
                  key={sub.id}
                  className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-800 whitespace-normal break-words">
                        {sub.course?.name || `دوره #${sub.course_id}`}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${getSubscriptionStatusBadgeClass(
                          sub.status,
                          sub.is_active
                        )}`}
                      >
                        {getSubscriptionStatusLabel(sub.status, sub.is_active)}
                      </span>
                      {sub.course?.price !== undefined && sub.course?.price !== null && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          ({formatCoursePrice(sub.course.price)})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>شروع: {formatSubscriptionJalaliDate(sub.started_at)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>پایان: {formatSubscriptionJalaliDate(sub.end_at)}</span>
                      </span>
                    </div>

                    {sub.note && (
                      <p className="text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 whitespace-normal break-words">
                        یادداشت: {sub.note}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <select
                      aria-label={`تغییر وضعیت اشتراک ${sub.course?.name || sub.id}`}
                      disabled={updatingStatusId === sub.id}
                      value={sub.status}
                      onChange={(e) =>
                        handleQuickStatusChange(sub, e.target.value as SubscriptionStatus)
                      }
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 focus:outline-none focus:border-[#445D84] cursor-pointer disabled:opacity-50"
                    >
                      {SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(sub)}
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                      title="ویرایش اشتراک"
                      aria-label={`ویرایش اشتراک ${sub.course?.name || sub.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(sub)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                      title="حذف اشتراک"
                      aria-label={`حذف اشتراک ${sub.course?.name || sub.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="حذف اشتراک دوره"
        message={`آیا از حذف اشتراک دوره «${deleteTarget?.course?.name || ''}» برای «${student?.name || ''}» اطمینان دارید؟`}
        confirmText="حذف اشتراک"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
};
