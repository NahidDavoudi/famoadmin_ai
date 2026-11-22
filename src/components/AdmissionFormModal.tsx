import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  ImagePlus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  ADMISSION_CONSENT_LABEL,
  ADMISSION_EXAM_TYPES,
  CONSENT_REQUIRED_MESSAGE,
  getDefaultNewAdmissionFormState,
  getNextRapidAdmissionFormState,
  shouldWarnConsentUnpublish,
  validateAdmissionForm,
  type AdmissionFormValues,
} from '../lib/admissions-testimonials';
import {
  ADMISSIONS_KEEP_OPEN_STORAGE_KEY,
  admissionsQueueStore,
  buildOptimisticAdmissionRecord,
  type AdmissionQueueItem,
} from '../lib/admissions-queue';
import { useKeepOpenPreference } from '../hooks/useOptimisticQueue';
import { resolveEntityImageUrl } from '../lib/image-upload';
import {
  getTodayJalali,
  normalizeIntegerInput,
  parseStrictInteger,
  toEnglishDigits,
  toPersianDigits,
} from '../lib/jalali';
import type {
  AcademicField,
  AdmissionExamType,
  AdmissionRecord,
  AdmissionStatus,
  AdmissionUpsertInput,
  ToastType,
} from '../types';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from './FormControls';

const ACADEMIC_FIELDS: AcademicField[] = [
  'تجربی',
  'ریاضی',
  'انسانی',
  'هنر',
  'زبان',
  'عمومی',
  'راهنمایی',
];

const SUBMIT_COOLDOWN_MS = 350;

interface AdmissionFormModalProps {
  isOpen: boolean;
  editingItem: AdmissionRecord | null;
  editingQueueItem?: AdmissionQueueItem | null;
  onClose: () => void;
  showToast: (message: string, type?: ToastType) => void;
}

export const AdmissionFormModal: React.FC<AdmissionFormModalProps> = ({
  isOpen,
  editingItem,
  editingQueueItem = null,
  onClose,
  showToast,
}) => {
  const [todayJy] = getTodayJalali();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studentNameInputRef = useRef<HTMLInputElement | null>(null);
  const lastSubmitAtRef = useRef<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Blob URLs owned by the queue store (either inherited from editingQueueItem or handed off on submit) */
  const storeOwnedBlobUrlsRef = useRef<Set<string>>(new Set());

  const [keepOpen, setKeepOpen] = useKeepOpenPreference(ADMISSIONS_KEEP_OPEN_STORAGE_KEY, false);
  const isCreateMode = !editingItem && !editingQueueItem;

  const initialDefaults = getDefaultNewAdmissionFormState(todayJy);
  const [studentName, setStudentName] = useState(initialDefaults.student_name);
  const [year, setYear] = useState(initialDefaults.year);
  const [examType, setExamType] = useState<AdmissionExamType>(initialDefaults.exam_type);
  const [field, setField] = useState<string>(initialDefaults.field);
  const [admissionTitle, setAdmissionTitle] = useState(initialDefaults.admission_title);
  const [rank, setRank] = useState(initialDefaults.rank);
  const [displayOrder, setDisplayOrder] = useState(initialDefaults.display_order);
  const [status, setStatus] = useState<AdmissionStatus>(initialDefaults.status);
  const [consentObtained, setConsentObtained] = useState(initialDefaults.consent_obtained);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentBannerError, setConsentBannerError] = useState<string | null>(null);
  const [serverErrorBanner, setServerErrorBanner] = useState<string | null>(null);
  const [isCooldown, setIsCooldown] = useState(false);
  const [sessionQueuedCount, setSessionQueuedCount] = useState(0);
  const [showUnpublishWarning, setShowUnpublishWarning] = useState(false);

  const safeRevokeLocalBlobUrl = (url: string | null) => {
    if (!url || !url.startsWith('blob:')) return;
    if (storeOwnedBlobUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setConsentBannerError(null);
    setServerErrorBanner(null);
    setShowUnpublishWarning(false);
    setIsCooldown(false);
    setSessionQueuedCount(0);
    setPhotoFile(null);
    setRemovePhoto(false);

    if (editingQueueItem) {
      const p = editingQueueItem.payload;
      setStudentName(p.student_name || '');
      setYear(String(p.year || todayJy));
      setExamType(p.exam_type || 'konkur');
      setField(p.field || 'تجربی');
      setAdmissionTitle(p.admission_title || '');
      setRank(p.rank !== null && p.rank !== undefined ? String(p.rank) : '');
      setDisplayOrder(String(p.display_order ?? 0));
      setStatus(p.status || 'published');
      setConsentObtained(Boolean(p.consent_obtained));
      setPhotoFile(p.photo ?? null);
      setRemovePhoto(Boolean(p.remove_photo));

      if (editingQueueItem.previewUrl) {
        storeOwnedBlobUrlsRef.current.add(editingQueueItem.previewUrl);
        setPhotoPreviewUrl(editingQueueItem.previewUrl);
      } else if (p.photo) {
        setPhotoPreviewUrl(URL.createObjectURL(p.photo));
      } else if (!p.remove_photo && editingQueueItem.optimisticRecord.photo_url) {
        setPhotoPreviewUrl(resolveEntityImageUrl(editingQueueItem.optimisticRecord.photo_url));
      } else {
        setPhotoPreviewUrl(null);
      }

      setErrors(editingQueueItem.fieldErrors || {});
      if (editingQueueItem.isConsentRequired) {
        setConsentBannerError(editingQueueItem.errorMessage || CONSENT_REQUIRED_MESSAGE);
      } else if (editingQueueItem.errorMessage) {
        setServerErrorBanner(editingQueueItem.errorMessage);
      }
    } else if (editingItem) {
      setStudentName(editingItem.student_name || '');
      setYear(String(editingItem.year || todayJy));
      setExamType(editingItem.exam_type || 'konkur');
      setField(editingItem.field || 'تجربی');
      setAdmissionTitle(editingItem.admission_title || '');
      setRank(editingItem.rank !== null && editingItem.rank !== undefined ? String(editingItem.rank) : '');
      setDisplayOrder(String(editingItem.display_order ?? 0));
      setStatus(editingItem.status || 'draft');
      setConsentObtained(Boolean(editingItem.consent_obtained));
      setPhotoPreviewUrl(resolveEntityImageUrl(editingItem.photo_url));
    } else {
      const defaults = getDefaultNewAdmissionFormState(todayJy);
      setStudentName(defaults.student_name);
      setYear(defaults.year);
      setExamType(defaults.exam_type);
      setField(defaults.field);
      setAdmissionTitle(defaults.admission_title);
      setRank(defaults.rank);
      setDisplayOrder(defaults.display_order);
      setStatus(defaults.status);
      setConsentObtained(defaults.consent_obtained);
      setPhotoPreviewUrl(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const focusTimer = setTimeout(() => {
      studentNameInputRef.current?.focus();
    }, 30);
    return () => clearTimeout(focusTimer);
  }, [isOpen, editingItem, editingQueueItem, todayJy]);

  // Revoke locally created object URLs on unmount / preview replacement
  useEffect(() => {
    const currentUrl = photoPreviewUrl;
    return () => {
      safeRevokeLocalBlobUrl(currentUrl);
    };
  }, [photoPreviewUrl]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, photo: 'فقط فایل‌های تصویری (JPG، PNG، WebP) مجاز هستند' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, photo: 'حجم تصویر نباید بیشتر از ۵ مگابایت باشد' }));
      return;
    }

    safeRevokeLocalBlobUrl(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setRemovePhoto(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
  };

  const handleRemovePhoto = () => {
    safeRevokeLocalBlobUrl(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setRemovePhoto(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConsentToggle = (checked: boolean) => {
    setConsentObtained(checked);
    setConsentBannerError(null);
    if (!checked && status === 'published') {
      setStatus('draft');
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.consent_obtained;
      delete next.status;
      return next;
    });
  };

  const startSubmitCooldown = () => {
    lastSubmitAtRef.current = Date.now();
    setIsCooldown(true);
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      setIsCooldown(false);
      cooldownTimerRef.current = null;
    }, SUBMIT_COOLDOWN_MS);
  };

  const enqueueSave = (forceStatus?: AdmissionStatus) => {
    const now = Date.now();
    if (now - lastSubmitAtRef.current < SUBMIT_COOLDOWN_MS) {
      return;
    }

    const effectiveStatus: AdmissionStatus = forceStatus ?? (consentObtained ? status : 'draft');
    const formValues: AdmissionFormValues = {
      student_name: studentName,
      year,
      exam_type: examType,
      field,
      admission_title: admissionTitle,
      rank,
      display_order: displayOrder,
      status: effectiveStatus,
      consent_obtained: consentObtained,
    };

    const clientErrors = validateAdmissionForm(formValues);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      if (clientErrors.consent_obtained) {
        setConsentBannerError(clientErrors.consent_obtained);
      }
      return;
    }

    const savedName = studentName.trim();
    const payload: AdmissionUpsertInput = {
      student_name: savedName,
      year: parseStrictInteger(year) ?? todayJy,
      exam_type: examType,
      field: field.trim(),
      admission_title: admissionTitle.trim(),
      rank: rank.trim() ? toEnglishDigits(rank).trim() : null,
      display_order: parseStrictInteger(displayOrder) ?? 0,
      status: effectiveStatus,
      consent_obtained: consentObtained,
      photo: photoFile,
      remove_photo: removePhoto,
    };

    // Transfer blob URL ownership to the queue store if a local File is attached
    let queuePreviewUrl: string | null = null;
    if (photoFile) {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        storeOwnedBlobUrlsRef.current.add(photoPreviewUrl);
        queuePreviewUrl = photoPreviewUrl;
      } else {
        queuePreviewUrl = URL.createObjectURL(photoFile);
        storeOwnedBlobUrlsRef.current.add(queuePreviewUrl);
      }
    } else if (editingQueueItem?.previewUrl && !removePhoto) {
      queuePreviewUrl = editingQueueItem.previewUrl;
    }

    const existingPhotoUrl = removePhoto
      ? null
      : editingItem?.photo_url ??
        (editingQueueItem && !editingQueueItem.previewUrl
          ? editingQueueItem.optimisticRecord.photo_url
          : null);

    setErrors({});
    setConsentBannerError(null);
    setServerErrorBanner(null);
    setShowUnpublishWarning(false);

    // Case 1: Re-submitting a failed/needs_edit item from the queue
    if (editingQueueItem) {
      const optimisticRecord = buildOptimisticAdmissionRecord(payload, {
        id: editingQueueItem.targetId ?? editingQueueItem.tempId,
        existingPhotoUrl,
        previewUrl: queuePreviewUrl,
      });
      const ok = admissionsQueueStore.updateAndResubmit(editingQueueItem.queueId, {
        payload,
        optimisticRecord,
        previewUrl: queuePreviewUrl,
      });
      if (!ok) {
        showToast('این مورد هم‌اکنون در حال ارسال است.', 'warning');
        return;
      }
      startSubmitCooldown();
      onClose();
      return;
    }

    // Case 2: Optimistic update of an existing server record
    if (editingItem) {
      if (admissionsQueueStore.isTargetLocked(editingItem.id)) {
        showToast('ویرایش قبلی این رکورد هنوز در حال ذخیره است. لطفاً لحظه‌ای صبر کنید.', 'warning');
        return;
      }
      const optimisticRecord = buildOptimisticAdmissionRecord(payload, {
        id: editingItem.id,
        existingPhotoUrl,
        previewUrl: queuePreviewUrl,
      });
      const queued = admissionsQueueStore.enqueueUpdate({
        targetId: editingItem.id,
        payload,
        optimisticRecord,
        previewUrl: queuePreviewUrl,
      });
      if (!queued) {
        showToast('ویرایش قبلی این رکورد هنوز در حال ذخیره است.', 'warning');
        return;
      }
      startSubmitCooldown();
      onClose();
      return;
    }

    // Case 3: Optimistic create
    const optimisticRecord = buildOptimisticAdmissionRecord(payload, {
      id: -Date.now(),
      existingPhotoUrl: null,
      previewUrl: queuePreviewUrl,
    });
    admissionsQueueStore.enqueueCreate({
      payload,
      optimisticRecord,
      previewUrl: queuePreviewUrl,
    });
    startSubmitCooldown();

    if (keepOpen) {
      const nextState = getNextRapidAdmissionFormState(formValues);
      setStudentName(nextState.student_name);
      setYear(nextState.year);
      setExamType(nextState.exam_type);
      setField(nextState.field);
      setAdmissionTitle(nextState.admission_title);
      setRank(nextState.rank);
      setDisplayOrder(nextState.display_order);
      setStatus(nextState.status);
      setConsentObtained(nextState.consent_obtained);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setRemovePhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSessionQueuedCount((c) => c + 1);
      requestAnimationFrame(() => {
        studentNameInputRef.current?.focus();
      });
    } else {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCooldown) return;

    // Pre-save warning if removing consent on a currently published record
    if (shouldWarnConsentUnpublish(editingItem, consentObtained)) {
      const previewErrors = validateAdmissionForm({
        student_name: studentName,
        year,
        exam_type: examType,
        field,
        admission_title: admissionTitle,
        rank,
        display_order: displayOrder,
        status: 'draft',
        consent_obtained: false,
      });
      if (Object.keys(previewErrors).length > 0) {
        setErrors(previewErrors);
        return;
      }
      setShowUnpublishWarning(true);
      return;
    }

    enqueueSave();
  };

  const clearFieldError = (key: string) => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const modalTitle = editingQueueItem
    ? 'ویرایش و ارسال مجدد قبولی'
    : editingItem
      ? 'ویرایش قبولی'
      : 'افزودن قبولی جدید';

  const modalSubtitle = editingQueueItem
    ? 'خطاهای اعلام‌شده توسط سرور را اصلاح کنید و دوباره ارسال نمایید'
    : editingItem
      ? `ویرایش رکورد «${editingItem.student_name}»`
      : 'ثبت سریع و غیرمسدودکننده — ذخیره در پس‌زمینه انجام می‌شود';

  const submitLabel = editingQueueItem
    ? 'اصلاح و ارسال مجدد'
    : editingItem
      ? 'ذخیره تغییرات'
      : 'ثبت';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={modalTitle}
        subtitle={modalSubtitle}
        icon={<Award className="w-5 h-5" />}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {isCreateMode && (
                <label
                  htmlFor="admissionKeepOpenCheckbox"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  <input
                    id="admissionKeepOpenCheckbox"
                    type="checkbox"
                    checked={keepOpen}
                    onChange={(e) => setKeepOpen(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84] cursor-pointer"
                  />
                  <span>باز نگه داشتن مودال برای ثبت بعدی</span>
                </label>
              )}
              {isCreateMode && sessionQueuedCount > 0 && (
                <span
                  data-testid="admission-session-saved-count"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold tabular-nums"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{toPersianDigits(sessionQueuedCount)} مورد به صف اضافه شد</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={onClose}
                className="px-4 py-2.5"
              >
                {sessionQueuedCount > 0 ? 'بستن' : 'انصراف'}
              </ActionButton>
              <ActionButton
                type="submit"
                form="admission-upsert-form"
                disabled={isCooldown}
                icon={<CheckCircle2 className="w-4 h-4" />}
                className="px-5 py-2.5"
              >
                {submitLabel}
              </ActionButton>
            </div>
          </div>
        }
      >
        <form id="admission-upsert-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {serverErrorBanner && (
            <div
              role="alert"
              data-testid="admission-server-error-banner"
              className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="font-bold">پیام اعتبارسنجی سرور</div>
                <p className="font-normal leading-relaxed">{serverErrorBanner}</p>
              </div>
            </div>
          )}

          {editingQueueItem?.hasDetachedFileAfterReload && (
            <div
              role="note"
              className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed">
                به‌دلیل بارگذاری مجدد صفحه، فایل تصویر قبلاً انتخاب‌شده در دسترس نیست. در صورت نیاز
                تصویر دانش‌آموز را دوباره انتخاب کنید.
              </p>
            </div>
          )}

          {consentBannerError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="font-bold">عدم امکان انتشار بدون رضایت‌نامه</div>
                <p className="font-normal leading-relaxed">{consentBannerError}</p>
              </div>
            </div>
          )}

          {/* Photo upload with live preview + remove */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt={studentName || 'پیش‌نمایش عکس قبولی'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImagePlus className="w-6 h-6 text-slate-400" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-xs font-bold text-slate-700">تصویر دانش‌آموز (اختیاری)</div>
              <p className="text-[11px] text-slate-500">
                فرمت‌های مجاز: JPG، PNG، WebP (حداکثر ۵ مگابایت)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  id="admissionPhotoInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-[#445D84] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{photoPreviewUrl ? 'تغییر عکس' : 'انتخاب عکس'}</span>
                </button>
                {photoPreviewUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>حذف عکس</span>
                  </button>
                )}
              </div>
              <FieldError message={errors.photo} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Student Name */}
            <div>
              <label
                htmlFor="admissionStudentName"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                نام و نام خانوادگی <span className="text-red-500">*</span>
              </label>
              <input
                ref={studentNameInputRef}
                id="admissionStudentName"
                type="text"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value);
                  clearFieldError('student_name');
                }}
                placeholder="مثلاً: سارا محمدی"
                className={getFieldClass(Boolean(errors.student_name))}
              />
              <FieldError message={errors.student_name} />
            </div>

            {/* Jalali Year */}
            <div>
              <label
                htmlFor="admissionYear"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                سال شمسی قبولی <span className="text-red-500">*</span>
              </label>
              <input
                id="admissionYear"
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                value={year}
                onChange={(e) => {
                  setYear(normalizeIntegerInput(e.target.value, 4));
                  clearFieldError('year');
                }}
                placeholder={String(todayJy)}
                className={getFieldClass(Boolean(errors.year), 'tabular-nums text-right')}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                اعداد انگلیسی یا فارسی به‌صورت خودکار نرمالایز می‌شوند (مثلاً {todayJy}).
              </p>
              <FieldError message={errors.year} />
            </div>

            {/* Exam Type */}
            <div>
              <label
                htmlFor="admissionExamType"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                نوع آزمون <span className="text-red-500">*</span>
              </label>
              <select
                id="admissionExamType"
                value={examType}
                onChange={(e) => {
                  setExamType(e.target.value);
                  clearFieldError('exam_type');
                }}
                className={getFieldClass(Boolean(errors.exam_type))}
              >
                {ADMISSION_EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <FieldError message={errors.exam_type} />
            </div>

            {/* Field */}
            <div>
              <label
                htmlFor="admissionField"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                رشته <span className="text-red-500">*</span>
              </label>
              <select
                id="admissionField"
                value={field}
                onChange={(e) => {
                  setField(e.target.value);
                  clearFieldError('field');
                }}
                className={getFieldClass(Boolean(errors.field))}
              >
                {ACADEMIC_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <FieldError message={errors.field} />
            </div>

            {/* Admission Title / University */}
            <div className="sm:col-span-2">
              <label
                htmlFor="admissionTitle"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                عنوان قبولی / دانشگاه یا مدرسه <span className="text-red-500">*</span>
              </label>
              <input
                id="admissionTitle"
                type="text"
                value={admissionTitle}
                onChange={(e) => {
                  setAdmissionTitle(e.target.value);
                  clearFieldError('admission_title');
                }}
                placeholder="مثلاً: پزشکی دانشگاه علوم پزشکی تهران"
                className={getFieldClass(Boolean(errors.admission_title))}
              />
              <FieldError message={errors.admission_title} />
            </div>

            {/* Rank */}
            <div>
              <label
                htmlFor="admissionRank"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                رتبه (اختیاری)
              </label>
              <input
                id="admissionRank"
                type="text"
                value={rank}
                onChange={(e) => {
                  setRank(e.target.value);
                  clearFieldError('rank');
                }}
                placeholder="مثلاً: ۱۲۵ منطقه ۱"
                className={getFieldClass(Boolean(errors.rank), 'tabular-nums')}
              />
              <FieldError message={errors.rank} />
            </div>

            {/* Display Order */}
            <div>
              <label
                htmlFor="admissionDisplayOrder"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                ترتیب نمایش
              </label>
              <input
                id="admissionDisplayOrder"
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={5}
                value={displayOrder}
                onChange={(e) => {
                  setDisplayOrder(normalizeIntegerInput(e.target.value, 5));
                  clearFieldError('display_order');
                }}
                placeholder="0"
                className={getFieldClass(Boolean(errors.display_order), 'tabular-nums text-right')}
              />
              <FieldError message={errors.display_order} />
            </div>
          </div>

          {/* Consent Checkbox */}
          <div
            className={`p-3.5 rounded-xl border transition-colors ${
              errors.consent_obtained
                ? 'bg-rose-50/70 border-rose-300'
                : consentObtained
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-amber-50/60 border-amber-200'
            }`}
          >
            <label
              htmlFor="admissionConsentCheckbox"
              className="flex items-start gap-2.5 cursor-pointer select-none"
            >
              <input
                id="admissionConsentCheckbox"
                type="checkbox"
                checked={consentObtained}
                onChange={(e) => handleConsentToggle(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84] cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800 leading-relaxed">
                {ADMISSION_CONSENT_LABEL}
              </span>
            </label>
            <FieldError message={errors.consent_obtained} />

            {shouldWarnConsentUnpublish(editingItem, consentObtained) && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-amber-100/80 border border-amber-300 text-amber-900 text-[11px] font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  هشدار: این رکورد در حال حاضر «منتشرشده» است. با برداشتن تیک رضایت و ذخیره تغییرات،
                  رکورد به‌صورت خودکار از حالت انتشار خارج شده و به «پیش‌نویس» تبدیل می‌شود.
                </span>
              </div>
            )}
          </div>

          {/* Status Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="admissionStatusSelect"
              className="block text-xs font-bold text-slate-700"
            >
              وضعیت انتشار
            </label>
            <select
              id="admissionStatusSelect"
              value={consentObtained ? status : 'draft'}
              onChange={(e) => {
                setStatus(e.target.value as AdmissionStatus);
                clearFieldError('status');
              }}
              className={getFieldClass(Boolean(errors.status))}
            >
              <option value="draft">پیش‌نویس (عدم نمایش عمومی)</option>
              <option value="published" disabled={!consentObtained}>
                منتشرشده (آماده انتشار عمومی در سایت)
              </option>
            </select>
            {!consentObtained && (
              <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                گزینه «منتشرشده» تا زمان فعال‌کردن تیک رضایت شاگرد/ولی غیرفعال است.
              </p>
            )}
            <FieldError message={errors.status} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showUnpublishWarning}
        title="خروج خودکار از حالت انتشار"
        message="این قبولی در حال حاضر روی سایت منتشر شده است. با برداشتن تیک رضایت، این رکورد از حالت انتشار خارج و به «پیش‌نویس» تبدیل می‌شود. آیا مطمئن هستید؟"
        confirmText="بله، ذخیره و لغو انتشار"
        cancelText="بازگشت"
        variant="danger"
        onCancel={() => setShowUnpublishWarning(false)}
        onConfirm={() => {
          enqueueSave('draft');
        }}
      />
    </>
  );
};
