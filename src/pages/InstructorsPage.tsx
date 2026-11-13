import React, { useCallback, useEffect, useState } from 'react';
import { School, Plus, Pencil, Trash2, Upload, X } from 'lucide-react';
import API from '../lib/api';
import { validateInstructorForm, type FieldErrors } from '../lib/form-validation';
import { fileToAvatarDataUrl, resolveEntityImageUrl } from '../lib/image-upload';
import type { Instructor, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

interface InstructorsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const InstructorsPage: React.FC<InstructorsPageProps> = ({ showToast }) => {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Instructor | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    title: '',
    description: '',
    image_url: '',
    display_order: '0',
  });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'title' | 'display_order'>>({});

  const loadInstructors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.getInstructors();
      setInstructors(res.data || []);
    } catch {
      showToast('خطا در بارگذاری اساتید', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadInstructors();
  }, [loadInstructors]);

  const openAdd = () => {
    setErrors({});
    setSelectedImageFile(null);
    setFormState({
      name: '',
      title: '',
      description: '',
      image_url: '',
      display_order: String(instructors.length + 1),
    });
    setIsAddOpen(true);
  };

  const openEdit = (inst: Instructor) => {
    setErrors({});
    setSelectedImageFile(null);
    setEditingInstructor(inst);
    setFormState({
      name: String(inst.name ?? ''),
      title: String(inst.title ?? ''),
      description: String(inst.description ?? ''),
      image_url: String(inst.image_url ?? ''),
      display_order: String(inst.display_order ?? 0),
    });
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setSelectedImageFile(file);
      setFormState((prev) => ({ ...prev, image_url: dataUrl }));
    } catch (err) {
      showToast((err as Error).message || 'خطا در بارگذاری تصویر', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateInstructorForm(formState);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً فیلدهای الزامی استاد را تکمیل کنید', 'error');
      return;
    }

    const nameTrimmed = String(formState.name ?? '').trim();

    setSubmitting(true);
    try {
      if (editingInstructor) {
        await API.updateInstructor(editingInstructor.id, {
          name: nameTrimmed,
          title: String(formState.title ?? '').trim(),
          description: String(formState.description ?? '').trim(),
          display_order: Number(formState.display_order) || 0,
          image: selectedImageFile,
        });
        setEditingInstructor(null);
        setSelectedImageFile(null);
        showToast('اطلاعات استاد به‌روزرسانی شد', 'success');
      } else {
        await API.addInstructor({
          name: nameTrimmed,
          title: String(formState.title ?? '').trim(),
          description: String(formState.description ?? '').trim(),
          display_order: Number(formState.display_order) || 0,
          image: selectedImageFile,
        });
        setIsAddOpen(false);
        setSelectedImageFile(null);
        showToast('استاد جدید اضافه شد', 'success');
      }
      setErrors({});
      await loadInstructors();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره اطلاعات استاد', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteInstructor(deleteTarget.id);
      setDeleteTarget(null);
      await loadInstructors();
      showToast('استاد حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف استاد', 'error');
    }
  };

  const instructorColumns: Column<Instructor>[] = [
    {
      key: 'display_order',
      header: 'ترتیب',
      priority: 'desktop-only',
      headerClassName: 'w-16',
      cellClassName: 'w-16 tabular-nums font-medium text-slate-600',
      cell: (i) => i.display_order,
    },
    {
      key: 'name',
      header: 'نام',
      priority: 'primary',
      headerClassName: 'w-48 xl:w-56',
      cellClassName: 'w-48 xl:w-56 font-semibold text-slate-800 whitespace-normal break-words',
      cell: (i) => {
        const imgSrc = resolveEntityImageUrl(i.image_url);
        return (
          <div className="flex items-center gap-3 min-w-0">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={i.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#E2D9C6] flex items-center justify-center text-[#445D84] font-bold text-sm shrink-0">
                {i.initial_letter || i.name.charAt(0)}
              </div>
            )}
            <span className="min-w-0 font-semibold text-slate-800 whitespace-normal break-words">
              {i.name}
            </span>
          </div>
        );
      },
    },
    {
      key: 'title',
      header: 'عنوان / سمت',
      priority: 'secondary',
      headerClassName: 'w-40 xl:w-48',
      cellClassName: 'w-40 xl:w-48 text-slate-600 whitespace-normal break-words',
      value: (i) => i.title,
      cell: (i) => (
        <div className="whitespace-normal break-words">{i.title || '—'}</div>
      ),
    },
    {
      key: 'description',
      header: 'توضیحات',
      priority: 'desktop-only',
      cellClassName: 'min-w-0 text-slate-600',
      cell: (i) => (
        <div className="whitespace-normal break-words line-clamp-2 max-w-prose text-xs text-slate-600 leading-relaxed">
          {i.description || '—'}
        </div>
      ),
    },
  ];

  const previewImgUrl = resolveEntityImageUrl(formState.image_url);
  const previewInitial = String(formState.name ?? '').trim().charAt(0) || 'ا';

  return (
    <div id="page-instructors" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <School className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت اساتید</span>
        </h1>
        <ActionButton
          type="button"
          onClick={openAdd}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن استاد</span>
        </ActionButton>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : instructors.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <School className="w-10 h-10" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ استادی یافت نشد</h3>
          <p className="text-sm text-slate-500 mb-6">
            هنوز استادی در سیستم ثبت نشده است. اولین استاد را اضافه کنید.
          </p>
          <ActionButton
            type="button"
            onClick={openAdd}
            icon={<Plus className="w-4 h-4" />}
            className="px-5 py-2.5"
          >
            <span>افزودن استاد</span>
          </ActionButton>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable
            columns={instructorColumns}
            data={instructors}
            rowKey={(i) => i.id}
            ariaLabel="جدول اساتید"
            actionsHeader="عملیات"
            actionsHeaderClassName="w-28"
            actionsCellClassName="w-28 shrink-0"
            renderActions={(i) => (
              <div className="flex items-center gap-1 shrink-0">
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => openEdit(i)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                  title="ویرایش"
                  aria-label={`ویرایش استاد ${i.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteTarget(i)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                  title="حذف"
                  aria-label={`حذف استاد ${i.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </ActionButton>
              </div>
            )}
            renderMobileCard={(i) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-900 leading-snug whitespace-normal break-words">
                    {i.name}
                  </div>
                  {i.title && (
                    <div className="text-xs text-slate-500 mt-1 whitespace-normal break-words">
                      {i.title}
                    </div>
                  )}
                  {i.description && (
                    <div className="text-xs text-slate-400 mt-1 whitespace-normal break-words line-clamp-2 max-w-prose">
                      {i.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => openEdit(i)}
                    className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                    title="ویرایش"
                    aria-label={`ویرایش استاد ${i.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setDeleteTarget(i)}
                    className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                    title="حذف"
                    aria-label={`حذف استاد ${i.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </ActionButton>
                </div>
              </div>
            )}
          />
        </div>
      )}

      <Modal
        isOpen={isAddOpen || Boolean(editingInstructor)}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setEditingInstructor(null);
            setSelectedImageFile(null);
            setErrors({});
          }
        }}
        title={editingInstructor ? 'ویرایش استاد' : 'افزودن استاد جدید'}
        subtitle="اطلاعات مدرس یا مشاور"
        icon={<School className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="instructorModalForm"
              loading={submitting}
              loadingText="در حال ذخیره..."
              className="flex-1 py-2.5 px-4"
            >
              {editingInstructor ? 'ذخیره تغییرات' : 'ذخیره'}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setIsAddOpen(false);
                setEditingInstructor(null);
                setSelectedImageFile(null);
                setErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="instructorModalForm" noValidate onSubmit={handleSave} className="space-y-4">
          {/* Profile Image Upload */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
            {previewImgUrl ? (
              <img
                src={previewImgUrl}
                alt="پیش‌نمایش تصویر استاد"
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs shrink-0 bg-slate-100"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#E2D9C6] flex items-center justify-center text-[#445D84] font-bold text-lg shrink-0">
                {previewInitial}
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-xs font-bold text-slate-700">تصویر پروفایل استاد (اختیاری)</div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#445D84] hover:bg-[#344868] text-white text-xs font-semibold cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>انتخاب تصویر</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />
                </label>
                {formState.image_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImageFile(null);
                      setFormState((prev) => ({ ...prev, image_url: '' }));
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>حذف تصویر</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: دکتر علی محمدی"
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
              عنوان / سمت <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مشاور تخصصی تحصیلی"
              aria-invalid={Boolean(errors.title)}
              value={formState.title}
              onChange={(e) => {
                setFormState({ ...formState, title: e.target.value });
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              className={getFieldClass(Boolean(errors.title))}
            />
            <FieldError message={errors.title} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">توضیحات</label>
            <textarea
              rows={3}
              placeholder="سوابق علمی، رزومه یا توضیحات تکمیلی استاد..."
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ترتیب نمایش</label>
            <input
              type="number"
              min={0}
              aria-invalid={Boolean(errors.display_order)}
              value={formState.display_order}
              onChange={(e) => {
                setFormState({ ...formState, display_order: e.target.value });
                if (errors.display_order)
                  setErrors((prev) => ({ ...prev, display_order: undefined }));
              }}
              className={getFieldClass(Boolean(errors.display_order), 'text-center')}
            />
            <FieldError message={errors.display_order} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="حذف استاد"
        message={`آیا از حذف استاد «${deleteTarget?.name || ''}» اطمینان دارید؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
