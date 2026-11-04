import React, { useCallback, useEffect, useState } from 'react';
import { School, Plus, Pencil, Trash2 } from 'lucide-react';
import API from '../lib/api';
import { validateInstructorForm, type FieldErrors } from '../lib/form-validation';
import type { Instructor, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';

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

  const [formState, setFormState] = useState({
    name: '',
    title: '',
    description: '',
    initial_letter: '',
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
    setFormState({
      name: '',
      title: '',
      description: '',
      initial_letter: '',
      display_order: String(instructors.length + 1),
    });
    setIsAddOpen(true);
  };

  const openEdit = (inst: Instructor) => {
    setErrors({});
    setEditingInstructor(inst);
    setFormState({
      name: String(inst.name ?? ''),
      title: String(inst.title ?? ''),
      description: String(inst.description ?? ''),
      initial_letter: String(inst.initial_letter ?? ''),
      display_order: String(inst.display_order ?? 0),
    });
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
    const initial =
      String(formState.initial_letter ?? '').trim() || nameTrimmed.charAt(0) || 'ا';

    setSubmitting(true);
    try {
      if (editingInstructor) {
        await API.updateInstructor(editingInstructor.id, {
          name: nameTrimmed,
          title: String(formState.title ?? '').trim(),
          description: String(formState.description ?? '').trim(),
          initial_letter: initial,
          display_order: Number(formState.display_order) || 0,
        });
        setEditingInstructor(null);
        showToast('اطلاعات استاد به‌روزرسانی شد', 'success');
      } else {
        await API.addInstructor({
          name: nameTrimmed,
          title: String(formState.title ?? '').trim(),
          description: String(formState.description ?? '').trim(),
          initial_letter: initial,
          display_order: Number(formState.display_order) || 0,
        });
        setIsAddOpen(false);
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
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-5 py-3.5 text-right font-semibold">ترتیب</th>
                  <th className="px-5 py-3.5 text-right font-semibold">نام</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عنوان / سمت</th>
                  <th className="px-5 py-3.5 text-right font-semibold">حرف اول</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {instructors.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 tabular-nums font-medium text-slate-600">
                      {i.display_order}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{i.name}</td>
                    <td className="px-5 py-4 text-slate-600">{i.title}</td>
                    <td className="px-5 py-4">
                      <div className="w-10 h-10 rounded-full bg-[#E2D9C6] flex items-center justify-center text-[#445D84] font-bold text-sm">
                        {i.initial_letter || i.name.charAt(0)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <ActionButton
                          type="button"
                          variant="ghost"
                          onClick={() => openEdit(i)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                          title="ویرایش"
                          aria-label={`ویرایش استاد ${i.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant="ghost"
                          onClick={() => setDeleteTarget(i)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          title="حذف"
                          aria-label={`حذف استاد ${i.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={isAddOpen || Boolean(editingInstructor)}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setEditingInstructor(null);
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
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">حرف اول</label>
              <input
                type="text"
                maxLength={1}
                placeholder="م"
                value={formState.initial_letter}
                onChange={(e) => setFormState({ ...formState, initial_letter: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-[#445D84]"
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
