import React, { useCallback, useEffect, useState } from 'react';
import {
  Headset,
  Plus,
  Check,
  Clock3,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import API from '../lib/api';
import { validateSupporterForm, type FieldErrors } from '../lib/form-validation';
import { resolveEntityImageUrl } from '../lib/image-upload';
import type { AcademicField, Supporter, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

interface SupportersPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

const FIELDS: AcademicField[] = [
  'ریاضی',
  'تجربی',
  'انسانی',
  'زبان',
  'هنر',
  'عمومی',
  'راهنمایی',
];

type SupporterFieldKey = 'name' | 'phone' | 'grade' | 'field' | 'password';

export const SupportersPage: React.FC<SupportersPageProps> = ({ showToast }) => {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSupporter, setEditingSupporter] = useState<Supporter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supporter | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formState, setFormState] = useState({
    name: '',
    phone: '',
    grade: '12',
    field: '' as AcademicField | '',
    is_active: 1,
    chat_id: '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors<SupporterFieldKey>>({});

  const loadSupporters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.getSupporters();
      setSupporters(res.data || []);
    } catch {
      showToast('خطا در بارگذاری پشتیبان‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSupporters();
  }, [loadSupporters]);

  const totalReplied = supporters.reduce((sum, s) => sum + Number(s.replied_count || 0), 0);
  const totalPending = supporters.reduce((sum, s) => sum + Number(s.pending_count || 0), 0);

  const openAdd = () => {
    setErrors({});
    setFormState({
      name: '',
      phone: '',
      grade: '12',
      field: '',
      is_active: 1,
      chat_id: '',
      password: '',
    });
    setShowPassword(false);
    setIsAddOpen(true);
  };

  const openEdit = (s: Supporter) => {
    setErrors({});
    setEditingSupporter(s);
    setFormState({
      name: String(s.name ?? ''),
      phone: String(s.phone ?? ''),
      grade: String(s.grade ?? '12'),
      field: (s.field as AcademicField) || '',
      is_active: s.is_active === false || s.is_active === 0 ? 0 : 1,
      chat_id: s.chat_id !== null && s.chat_id !== undefined ? String(s.chat_id) : '',
      password: '',
    });
    setShowPassword(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateSupporterForm(formState, Boolean(editingSupporter));
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً خطاهای فرم پشتیبان را برطرف کنید', 'error');
      return;
    }

    const trimmedChatId = String(formState.chat_id ?? '').trim();
    const trimmedPhone = String(formState.phone ?? '').trim();

    setSubmitting(true);
    try {
      if (editingSupporter) {
        await API.updateSupporter(editingSupporter.id, {
          name: String(formState.name ?? '').trim(),
          phone: trimmedPhone || null,
          grade: Number(formState.grade),
          field: formState.field as AcademicField,
          is_active: formState.is_active ? 1 : 0,
          chat_id: trimmedChatId || null,
          password: formState.password || undefined,
        });
        setEditingSupporter(null);
        showToast('اطلاعات پشتیبان ذخیره شد', 'success');
      } else {
        await API.addSupporter({
          name: String(formState.name ?? '').trim(),
          phone: trimmedPhone,
          grade: Number(formState.grade),
          field: formState.field as AcademicField,
          chat_id: trimmedChatId || null,
        });
        setIsAddOpen(false);
        showToast('پشتیبان جدید اضافه شد', 'success');
      }
      setErrors({});
      await loadSupporters();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره اطلاعات پشتیبان', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteSupporter(deleteTarget.id);
      setDeleteTarget(null);
      await loadSupporters();
      showToast('پشتیبان حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف پشتیبان', 'error');
    }
  };

  const supporterColumns: Column<Supporter>[] = [
    {
      key: 'name',
      header: 'نام پشتیبان',
      priority: 'primary',
      headerClassName: 'min-w-[180px]',
      cellClassName: 'font-semibold text-slate-800 whitespace-nowrap',
      cell: (s) => {
        const imgSrc = resolveEntityImageUrl(s.avatar_url || s.avatar);
        return (
          <div className="flex items-center gap-3">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={s.name}
                className="hidden md:block w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0 bg-slate-100"
              />
            ) : (
              <div className="hidden md:flex w-9 h-9 rounded-full bg-[#E2D9C6] items-center justify-center text-[#445D84] font-bold text-xs shrink-0">
                {s.name.charAt(0)}
              </div>
            )}
            <span>{s.name}</span>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'شماره تماس',
      priority: 'secondary',
      mobileLabel: 'شماره تماس',
      cellClassName: 'tabular-nums text-slate-600',
      value: (s) => s.phone || '-',
      cell: (s) => (
        <span dir="ltr" className="inline-block">
          {s.phone || '-'}
        </span>
      ),
    },
    {
      key: 'grade',
      header: 'پایه',
      priority: 'desktop-only',
      cellClassName: 'tabular-nums text-slate-600',
      cell: (s) => `پایه ${s.grade}`,
    },
    {
      key: 'field',
      header: 'رشته / درس',
      priority: 'secondary',
      mobileLabel: 'پایه و رشته',
      cellClassName: 'text-slate-600',
      cell: (s) => (
        <span>
          <span className="md:hidden">پایه {s.grade} • </span>
          {s.field}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'وضعیت',
      priority: 'secondary',
      mobileLabel: 'وضعیت',
      cell: (s) => {
        const active = s.is_active !== false && s.is_active !== 0;
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
              active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {active ? 'فعال' : 'غیرفعال'}
          </span>
        );
      },
    },
    {
      key: 'chat_id',
      header: 'شناسه تلگرام',
      priority: 'desktop-only',
      cellClassName: 'tabular-nums',
      cell: (s) =>
        s.chat_id ? (
          <span className="text-emerald-600 font-medium">{s.chat_id}</span>
        ) : (
          <span className="text-slate-400">ثبت نشده</span>
        ),
    },
    {
      key: 'reports',
      header: 'گزارش‌ها (پاسخ / انتظار)',
      priority: 'desktop-only',
      cellClassName: 'tabular-nums',
      cell: (s) => (
        <span>
          <span className="text-emerald-600 font-semibold">{s.replied_count ?? 0}</span>
          <span className="text-slate-300 mx-1.5">/</span>
          <span className="text-amber-600 font-semibold">{s.pending_count ?? 0}</span>
        </span>
      ),
    },
  ];

  return (
    <div id="page-supporters" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <Headset className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت پشتیبان‌ها</span>
        </h1>
        <ActionButton
          type="button"
          onClick={openAdd}
          icon={<Plus className="w-4 h-4" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن پشتیبان</span>
        </ActionButton>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#445D84] text-white flex items-center justify-center shrink-0">
            <Headset className="w-6 h-6" />
          </div>
          <div>
            <div id="stat-supporters" className="text-2xl font-bold text-[#445D84] tabular-nums">
              {supporters.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">تعداد پشتیبان‌ها</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <div
              id="stat-supporters-replied"
              className="text-2xl font-bold text-emerald-600 tabular-nums"
            >
              {totalReplied}
            </div>
            <div className="text-xs text-slate-500 mt-1">گزارش‌های پاسخ‌داده شده</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Clock3 className="w-6 h-6" />
          </div>
          <div>
            <div
              id="stat-supporters-pending"
              className="text-2xl font-bold text-amber-600 tabular-nums"
            >
              {totalPending}
            </div>
            <div className="text-xs text-slate-500 mt-1">گزارش‌های در انتظار</div>
          </div>
        </div>
      </div>

      {/* Supporters Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : supporters.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Headset className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ پشتیبانی ثبت نشده</h3>
          <p className="text-sm text-slate-500 mb-6">اولین پشتیبان را به سیستم اضافه کنید.</p>
          <ActionButton
            type="button"
            onClick={openAdd}
            icon={<Plus className="w-4 h-4" />}
            className="px-5 py-2.5"
          >
            <span>افزودن پشتیبان</span>
          </ActionButton>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <DataTable
            columns={supporterColumns}
            data={supporters}
            rowKey={(s) => s.id}
            ariaLabel="جدول پشتیبان‌ها"
            actionsHeader="عملیات"
            renderActions={(s) => (
              <div className="flex items-center gap-1">
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => openEdit(s)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                  title="ویرایش"
                  aria-label={`ویرایش پشتیبان ${s.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteTarget(s)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                  title="حذف"
                  aria-label={`حذف پشتیبان ${s.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </ActionButton>
              </div>
            )}
          />
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isAddOpen || Boolean(editingSupporter)}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setEditingSupporter(null);
            setErrors({});
          }
        }}
        title={editingSupporter ? 'ویرایش پشتیبان' : 'افزودن پشتیبان جدید'}
        subtitle="اطلاعات پشتیبان تحصیلی (مطابق API بک‌اند)"
        icon={<Headset className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="supporterModalForm"
              loading={submitting}
              loadingText="در حال ذخیره..."
              className="flex-1 py-2.5 px-4"
            >
              {editingSupporter ? 'ذخیره تغییرات' : 'ذخیره'}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setIsAddOpen(false);
                setEditingSupporter(null);
                setErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="supporterModalForm" noValidate onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: سارا کریمی"
              aria-invalid={Boolean(errors.name)}
              value={formState.name}
              onChange={(e) => {
                setFormState({ ...formState, name: e.target.value });
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={getFieldClass(Boolean(errors.name))}
            />
            <FieldError message={errors.name} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              شماره موبایل {!editingSupporter && <span className="text-red-500">*</span>}
            </label>
            <input
              type="tel"
              maxLength={14}
              placeholder="09123456789"
              dir="ltr"
              aria-invalid={Boolean(errors.phone)}
              value={formState.phone}
              onChange={(e) => {
                setFormState({ ...formState, phone: e.target.value });
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              className={getFieldClass(Boolean(errors.phone), 'text-start')}
            />
            <FieldError message={errors.phone} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                پایه تحصیلی <span className="text-red-500">*</span>
              </label>
              <select
                aria-invalid={Boolean(errors.grade)}
                value={formState.grade}
                onChange={(e) => {
                  setFormState({ ...formState, grade: e.target.value });
                  if (errors.grade) setErrors((prev) => ({ ...prev, grade: undefined }));
                }}
                className={getFieldClass(Boolean(errors.grade))}
              >
                <option value="7">هفتم</option>
                <option value="8">هشتم</option>
                <option value="9">نهم</option>
                <option value="10">دهم</option>
                <option value="11">یازدهم</option>
                <option value="12">دوازدهم</option>
              </select>
              <FieldError message={errors.grade} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رشته / درس <span className="text-red-500">*</span>
              </label>
              <select
                aria-invalid={Boolean(errors.field)}
                value={formState.field}
                onChange={(e) => {
                  setFormState({ ...formState, field: e.target.value as AcademicField });
                  if (errors.field) setErrors((prev) => ({ ...prev, field: undefined }));
                }}
                className={getFieldClass(Boolean(errors.field))}
              >
                <option value="">انتخاب کنید</option>
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <FieldError message={errors.field} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              شناسه تلگرام (اختیاری)
            </label>
            <input
              type="text"
              placeholder="123456789"
              dir="ltr"
              value={formState.chat_id}
              onChange={(e) => setFormState({ ...formState, chat_id: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-start focus:outline-none focus:border-[#445D84]"
            />
          </div>

          {editingSupporter && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">وضعیت فعالیت</label>
                <select
                  value={String(formState.is_active)}
                  onChange={(e) =>
                    setFormState({ ...formState, is_active: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
                >
                  <option value="1">فعال</option>
                  <option value="0">غیرفعال</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  رمز عبور جدید (خالی = بدون تغییر)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="حداقل ۴ کاراکتر"
                    aria-invalid={Boolean(errors.password)}
                    value={formState.password}
                    onChange={(e) => {
                      setFormState({ ...formState, password: e.target.value });
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    className={getFieldClass(Boolean(errors.password), 'ps-3.5 pe-10')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="نمایش یا مخفی کردن رمز عبور"
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <FieldError message={errors.password} />
              </div>
            </>
          )}
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="حذف پشتیبان"
        message={`آیا از حذف پشتیبان «${deleteTarget?.name || ''}» اطمینان دارید؟ گزارش‌های مرتبط حذف نخواهند شد.`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
