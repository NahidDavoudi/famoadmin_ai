import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Headset,
  UserCheck,
  UserX,
  History,
  Calendar,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import API from '../lib/api';
import {
  categorizeSupportersForStudent,
  formatAssignmentJalaliDate,
} from '../lib/assignments';
import type {
  AssignmentHistoryEntry,
  Supporter,
  ToastType,
} from '../types';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { ActionButton, getFieldClass } from './FormControls';

export interface StudentAssignmentTarget {
  student_id: number;
  name: string;
  phone?: string | null;
  grade?: number | null;
  field?: string | null;
  supporter_id?: number | null;
  supporter_name?: string | null;
  assigned_at?: string | null;
  note?: string | null;
}

interface StudentAssignmentModalProps {
  student: StudentAssignmentTarget | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: ToastType) => void;
  supporters?: Supporter[];
  onAssignmentChanged?: () => void;
}

export const StudentAssignmentModal: React.FC<StudentAssignmentModalProps> = ({
  student,
  isOpen,
  onClose,
  showToast,
  supporters: propSupporters,
  onAssignmentChanged,
}) => {
  const [supporters, setSupporters] = useState<Supporter[]>(propSupporters || []);
  const [history, setHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [currentSupporterId, setCurrentSupporterId] = useState<number | null>(null);
  const [currentSupporterName, setCurrentSupporterName] = useState<string | null>(null);
  const [currentAssignedAt, setCurrentAssignedAt] = useState<string | null>(null);

  const [selectedSupporterId, setSelectedSupporterId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isUnassignConfirmOpen, setIsUnassignConfirmOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  useEffect(() => {
    if (propSupporters && propSupporters.length > 0) {
      setSupporters(propSupporters);
    }
  }, [propSupporters]);

  const loadHistoryAndSupporters = useCallback(async () => {
    if (!student?.student_id) return;
    setLoadingHistory(true);
    try {
      const promises: [
        Promise<Awaited<ReturnType<typeof API.getStudentAssignmentHistory>>>,
        Promise<Awaited<ReturnType<typeof API.getSupporters>>> | null,
      ] = [
        API.getStudentAssignmentHistory(student.student_id),
        !propSupporters || propSupporters.length === 0 ? API.getSupporters() : null,
      ];

      const [histRes, supRes] = await Promise.allSettled([
        promises[0],
        promises[1] || Promise.resolve(null),
      ]);

      let activeSupList = propSupporters || [];
      if (
        supRes.status === 'fulfilled' &&
        supRes.value &&
        Array.isArray(supRes.value.data)
      ) {
        activeSupList = supRes.value.data;
        setSupporters(activeSupList);
      }

      if (histRes.status === 'fulfilled') {
        const list = histRes.value.data || [];
        setHistory(list);

        // If student prop didn't include active supporter info, infer from active history entry
        const activeEntry = list.find((h) => h.is_active && h.supporter_id);
        if (activeEntry) {
          setCurrentSupporterId(activeEntry.supporter_id);
          setCurrentSupporterName(activeEntry.supporter_name);
          setCurrentAssignedAt(activeEntry.assigned_at);
          setSelectedSupporterId(String(activeEntry.supporter_id));
        }
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [student?.student_id, propSupporters]);

  useEffect(() => {
    if (isOpen && student) {
      const initSupId =
        student.supporter_id && student.supporter_id > 0 ? student.supporter_id : null;
      setCurrentSupporterId(initSupId);
      setCurrentSupporterName(student.supporter_name || null);
      setCurrentAssignedAt(student.assigned_at || null);
      setSelectedSupporterId(initSupId ? String(initSupId) : '');
      setNote(student.note || '');
      loadHistoryAndSupporters();
    }
  }, [isOpen, student, loadHistoryAndSupporters]);

  const categorizedSupporters = useMemo(() => {
    return categorizeSupportersForStudent(
      { grade: student?.grade, field: student?.field },
      supporters
    );
  }, [student?.grade, student?.field, supporters]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student?.student_id || submitting) return;
    const supId = Number(selectedSupporterId);
    if (!supId || supId <= 0) {
      showToast('لطفاً پشتیبان موردنظر را انتخاب کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await API.assignStudentToSupporter({
        student_id: student.student_id,
        supporter_id: supId,
        note: note.trim() || null,
      });
      const matchedSup = supporters.find((s) => s.id === supId);
      setCurrentSupporterId(supId);
      setCurrentSupporterName(
        res.data?.supporter_name || matchedSup?.name || `پشتیبان #${supId}`
      );
      setCurrentAssignedAt(res.data?.assigned_at || new Date().toISOString());
      showToast(
        `پشتیبان دانش‌آموز «${student.name}» با موفقیت ثبت شد`,
        'success'
      );
      await loadHistoryAndSupporters();
      onAssignmentChanged?.();
    } catch (err) {
      showToast((err as Error).message || 'خطا در تخصیص پشتیبان', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!student?.student_id || unassigning) return;
    setUnassigning(true);
    try {
      await API.unassignStudentSupporter(student.student_id);
      setIsUnassignConfirmOpen(false);
      setCurrentSupporterId(null);
      setCurrentSupporterName(null);
      setCurrentAssignedAt(null);
      setSelectedSupporterId('');
      showToast(`تخصیص پشتیبان دانش‌آموز «${student.name}» لغو شد`, 'success');
      await loadHistoryAndSupporters();
      onAssignmentChanged?.();
    } catch (err) {
      showToast((err as Error).message || 'خطا در لغو تخصیص پشتیبان', 'error');
    } finally {
      setUnassigning(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`مدیریت پشتیبان و تاریخچه — ${student?.name || ''}`}
        subtitle={
          student
            ? `پایه ${student.grade || '-'} · رشته ${student.field || '-'}${
                student.phone ? ` · ${student.phone}` : ''
              }`
            : 'تخصیص پشتیبان و مشاهده سوابق تغییرات'
        }
        icon={<Headset className="w-5 h-5" />}
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
          {/* Current Assignment Status Card */}
          <div
            className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              currentSupporterId
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/70 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  currentSupporterId
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {currentSupporterId ? (
                  <UserCheck className="w-5 h-5" />
                ) : (
                  <UserX className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-600">
                  وضعیت فعلی پشتیبان تحصیلی:
                </div>
                {currentSupporterId ? (
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="font-bold text-sm text-emerald-900">
                      {currentSupporterName || `پشتیبان #${currentSupporterId}`}
                    </span>
                    {currentAssignedAt && (
                      <span className="text-xs text-emerald-700 tabular-nums">
                        (از تاریخ {formatAssignmentJalaliDate(currentAssignedAt)})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="font-bold text-sm text-amber-900 mt-0.5">
                    بدون پشتیبان فعال
                  </div>
                )}
              </div>
            </div>

            {currentSupporterId && (
              <ActionButton
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setIsUnassignConfirmOpen(true)}
                icon={<UserX className="w-4 h-4" />}
                className="px-3 py-2 shrink-0"
              >
                <span>لغو تخصیص پشتیبان</span>
              </ActionButton>
            )}
          </div>

          {/* Assign / Reassign Form */}
          <form
            noValidate
            onSubmit={handleAssignSubmit}
            className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#344868] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>
                  {currentSupporterId
                    ? 'تغییر پشتیبان این دانش‌آموز'
                    : 'تخصیص پشتیبان به این دانش‌آموز'}
                </span>
              </h4>
              {categorizedSupporters.exactMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSupporterId(
                      String(categorizedSupporters.exactMatches[0].id)
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#445D84] hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    پیشنهاد هم‌پایه و هم‌رشته ({categorizedSupporters.exactMatches[0].name})
                  </span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  انتخاب پشتیبان <span className="text-red-500">*</span>
                </label>
                <select
                  aria-label="انتخاب پشتیبان برای دانش‌آموز"
                  value={selectedSupporterId}
                  onChange={(e) => setSelectedSupporterId(e.target.value)}
                  className={getFieldClass(false, 'bg-white')}
                >
                  <option value="">انتخاب پشتیبان...</option>
                  {categorizedSupporters.exactMatches.length > 0 && (
                    <optgroup label="پیشنهادی (هم‌پایه و هم‌رشته)">
                      {categorizedSupporters.exactMatches.map((sup) => (
                        <option key={sup.id} value={String(sup.id)}>
                          ★ {sup.name} — پایه {sup.grade} {sup.field}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {categorizedSupporters.fieldMatches.length > 0 && (
                    <optgroup label="هم‌رشته">
                      {categorizedSupporters.fieldMatches.map((sup) => (
                        <option key={sup.id} value={String(sup.id)}>
                          {sup.name} — پایه {sup.grade} {sup.field}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {categorizedSupporters.otherSupporters.length > 0 && (
                    <optgroup label="سایر پشتیبان‌های فعال">
                      {categorizedSupporters.otherSupporters.map((sup) => (
                        <option key={sup.id} value={String(sup.id)}>
                          {sup.name} — پایه {sup.grade} {sup.field}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  یادداشت / علت تغییر (اختیاری)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثال: تخصیص بر اساس رشته تجربی..."
                  className={getFieldClass(false, 'bg-white')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <ActionButton
                type="submit"
                size="sm"
                loading={submitting}
                loadingText="در حال ثبت..."
                icon={<UserCheck className="w-4 h-4" />}
                className="px-4 py-2"
              >
                <span>
                  {currentSupporterId ? 'ذخیره تغییر پشتیبان' : 'ثبت تخصیص پشتیبان'}
                </span>
              </ActionButton>
            </div>
          </form>

          {/* Assignment History Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#445D84]" />
                <span>تاریخچه تغییرات پشتیبان ({history.length})</span>
              </h4>
              <ActionButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={loadHistoryAndSupporters}
                loading={loadingHistory}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                className="px-2.5 py-1.5 text-xs"
              >
                <span>بروزرسانی</span>
              </ActionButton>
            </div>

            {loadingHistory ? (
              <div className="space-y-2">
                {[1, 2].map((n) => (
                  <div key={n} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                هنوز سابقه‌ای از تخصیص یا تغییر پشتیبان برای این دانش‌آموز ثبت نشده است.
              </div>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className={`rounded-xl p-3 border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      h.is_active
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">
                          {h.supporter_name || 'بدون پشتیبان'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            h.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {h.is_active ? 'پشتیبان فعلی' : 'پایان‌یافته'}
                        </span>
                        {h.assigned_by_name && (
                          <span className="text-slate-500">
                            توسط: {h.assigned_by_name}
                          </span>
                        )}
                      </div>
                      {h.note && (
                        <p className="text-slate-600 whitespace-normal break-words">
                          یادداشت: {h.note}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-slate-500 tabular-nums shrink-0">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>شروع: {formatAssignmentJalaliDate(h.assigned_at)}</span>
                      </span>
                      {h.unassigned_at && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>پایان: {formatAssignmentJalaliDate(h.unassigned_at)}</span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={isUnassignConfirmOpen}
        title="لغو تخصیص پشتیبان"
        message={`آیا از لغو تخصیص پشتیبان «${currentSupporterName || ''}» برای دانش‌آموز «${
          student?.name || ''
        }» اطمینان دارید؟`}
        confirmText="لغو تخصیص"
        variant="danger"
        onConfirm={handleConfirmUnassign}
        onCancel={() => setIsUnassignConfirmOpen(false)}
      />
    </>
  );
};
