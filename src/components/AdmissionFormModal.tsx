import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ImagePlus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import API from '../lib/api';
import {
  ADMISSION_CONSENT_LABEL,
  ADMISSION_EXAM_TYPES,
  CONSENT_REQUIRED_MESSAGE,
  extractApiFieldErrors,
  shouldWarnConsentUnpublish,
  validateAdmissionForm,
  type AdmissionFormValues,
} from '../lib/admissions-testimonials';
import { resolveEntityImageUrl } from '../lib/image-upload';
import {
  getTodayJalali,
  normalizeIntegerInput,
  parseStrictInteger,
  toEnglishDigits,
} from '../lib/jalali';
import type {
  AcademicField,
  AdmissionExamType,
  AdmissionRecord,
  AdmissionStatus,
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

const ADMISSION_FIELD_ALIASES: Record<string, string> = {
  name: 'student_name',
  jalali_year: 'year',
  admission_year: 'year',
  title: 'admission_title',
  university: 'admission_title',
  university_title: 'admission_title',
  major: 'field',
  sort_order: 'display_order',
  consent: 'consent_obtained',
  has_consent: 'consent_obtained',
  image: 'photo',
};

interface AdmissionFormModalProps {
  isOpen: boolean;
  editingItem: AdmissionRecord | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
}

export const AdmissionFormModal: React.FC<AdmissionFormModalProps> = ({
  isOpen,
  editingItem,
  onClose,
  onSaved,
  showToast,
}) => {
  const [todayJy] = getTodayJalali();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [studentName, setStudentName] = useState('');
  const [year, setYear] = useState(String(todayJy));
  const [examType, setExamType] = useState<AdmissionExamType>('konkur');
  const [field, setField] = useState<string>('تجربی');
  const [admissionTitle, setAdmissionTitle] = useState('');
  const [rank, setRank] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [status, setStatus] = useState<AdmissionStatus>('draft');
  const [consentObtained, setConsentObtained] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentBannerError, setConsentBannerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showUnpublishWarning, setShowUnpublishWarning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setConsentBannerError(null);
    setShowUnpublishWarning(false);
    setPhotoFile(null);
    setRemovePhoto(false);

    if (editingItem) {
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
      setStudentName('');
      setYear(String(todayJy));
      setExamType('konkur');
      setField('تجربی');
      setAdmissionTitle('');
      setRank('');
      setDisplayOrder('0');
      setStatus('draft');
      setConsentObtained(false);
      setPhotoPreviewUrl(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [isOpen, editingItem, todayJy]);

  // Revoke object URL on unmount / preview change
  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
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

    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
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
    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
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

  const performSave = async (forceStatus?: AdmissionStatus) => {
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

    setSubmitting(true);
    setErrors({});
    setConsentBannerError(null);

    try {
      const payload = {
        student_name: studentName.trim(),
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

      if (editingItem) {
        await API.updateAdmission(editingItem.id, payload);
        showToast('اطلاعات قبولی با موفقیت ویرایش شد', 'success');
      } else {
        await API.createAdmission(payload);
        showToast('قبولی جدید با موفقیت ثبت شد', 'success');
      }

      setShowUnpublishWarning(false);
      await onSaved();
      onClose();
    } catch (err) {
      const parsed = extractApiFieldErrors(err, ADMISSION_FIELD_ALIASES);
      if (Object.keys(parsed.fieldErrors).length > 0) {
        setErrors(parsed.fieldErrors);
      }
      if (parsed.isConsentRequired) {
        setConsentBannerError(parsed.message || CONSENT_REQUIRED_MESSAGE);
        showToast(parsed.message || CONSENT_REQUIRED_MESSAGE, 'error');
      } else {
        showToast(parsed.message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

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

    await performSave();
  };

  const clearFieldError = (key: string) => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          if (!submitting) onClose();
        }}
        title={editingItem ? 'ویرایش قبولی' : 'افزودن قبولی جدید'}
        subtitle={
          editingItem
            ? `ویرایش رکورد «${editingItem.student_name}»`
            : 'ثبت مشخصات قبولی برای نمایش در بخش افتخارات سایت'
        }
        icon={<Award className="w-5 h-5" />}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2.5"
            >
              انصراف
            </ActionButton>
            <ActionButton
              type="submit"
              form="admission-upsert-form"
              loading={submitting}
              loadingText="در حال ذخیره..."
              icon={<CheckCircle2 className="w-4 h-4" />}
              className="px-5 py-2.5"
            >
              {editingItem ? 'ذخیره تغییرات' : 'ثبت قبولی'}
            </ActionButton>
          </div>
        }
      >
        <form id="admission-upsert-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                منتشرشده (نمایش عمومی در سایت)
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
        loading={submitting}
        onCancel={() => setShowUnpublishWarning(false)}
        onConfirm={async () => {
          await performSave('draft');
        }}
      />
    </>
  );
};
