import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import API from '../lib/api';
import { validateCourseForm, type FieldErrors } from '../lib/form-validation';
import type { Course, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

interface CoursesPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const CoursesPage: React.FC<CoursesPageProps> = ({ showToast }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    gradient_color_from: '#445D84',
    gradient_color_to: '#5a779e',
    description: '',
    price: '',
    display_order: '0',
  });
  const [errors, setErrors] = useState<FieldErrors<'name' | 'display_order'>>({});

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.getCourses();
      setCourses(res.data || []);
    } catch {
      showToast('خطا در بارگذاری دوره‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const openAdd = () => {
    setErrors({});
    setFormState({
      name: '',
      gradient_color_from: '#445D84',
      gradient_color_to: '#5a779e',
      description: '',
      price: '',
      display_order: String(courses.length + 1),
    });
    setIsAddOpen(true);
  };

  const openEdit = (course: Course) => {
    setErrors({});
    setEditingCourse(course);
    setFormState({
      name: String(course.name ?? ''),
      gradient_color_from: String(course.gradient_color_from || '#445D84'),
      gradient_color_to: String(course.gradient_color_to || '#E2D9C6'),
      description: String(course.description ?? ''),
      price: String(course.price ?? ''),
      display_order: String(course.display_order ?? 0),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateCourseForm(formState);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً فیلدهای الزامی دوره را تکمیل کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCourse) {
        await API.updateCourse(editingCourse.id, {
          name: String(formState.name ?? '').trim(),
          gradient_color_from: formState.gradient_color_from,
          gradient_color_to: formState.gradient_color_to,
          description: String(formState.description ?? '').trim(),
          price: String(formState.price ?? '').trim(),
          display_order: Number(formState.display_order) || 0,
        });
        setEditingCourse(null);
        showToast('دوره به‌روزرسانی شد', 'success');
      } else {
        await API.addCourse({
          name: String(formState.name ?? '').trim(),
          icon: 'fa-book',
          gradient_color_from: formState.gradient_color_from,
          gradient_color_to: formState.gradient_color_to,
          description: String(formState.description ?? '').trim(),
          price: String(formState.price ?? '').trim(),
          display_order: Number(formState.display_order) || 0,
        });
        setIsAddOpen(false);
        showToast('دوره جدید اضافه شد', 'success');
      }
      setErrors({});
      await loadCourses();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره دوره', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteCourse(deleteTarget.id);
      setDeleteTarget(null);
      await loadCourses();
      showToast('دوره حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف دوره', 'error');
    }
  };

  const courseColumns: Column<Course>[] = [
    {
      key: 'display_order',
      header: 'ترتیب',
      priority: 'desktop-only',
      headerClassName: 'w-16',
      cellClassName: 'w-16 tabular-nums font-medium text-slate-600',
      cell: (c) => c.display_order,
    },
    {
      key: 'name',
      header: 'نام دوره',
      priority: 'primary',
      headerClassName: 'w-48 xl:w-56',
      cellClassName: 'w-48 xl:w-56 font-semibold text-slate-800 whitespace-normal break-words',
      cell: (c) => (
        <div className="font-semibold text-slate-800 whitespace-normal break-words">{c.name}</div>
      ),
    },
    {
      key: 'description',
      header: 'توضیحات',
      priority: 'desktop-only',
      cellClassName: 'min-w-0 text-slate-600',
      cell: (c) => (
        <div className="whitespace-normal break-words line-clamp-2 max-w-prose text-xs text-slate-600 leading-relaxed">
          {c.description || '—'}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'قیمت',
      priority: 'secondary',
      mobileLabel: 'قیمت',
      headerClassName: 'w-32 xl:w-36',
      cellClassName: 'w-32 xl:w-36 text-slate-600 tabular-nums whitespace-normal break-words',
      value: (c) => c.price || '-',
      cell: (c) => c.price || '-',
    },
    {
      key: 'colors',
      header: 'رنگ‌بندی',
      priority: 'desktop-only',
      headerClassName: 'w-20',
      cellClassName: 'w-20',
      cell: (c) => (
        <div
          className="w-10 h-10 rounded-xl shadow-xs border border-slate-200"
          style={{
            background: `linear-gradient(135deg, ${c.gradient_color_from || '#445D84'}, ${c.gradient_color_to || '#E2D9C6'})`,
          }}
        />
      ),
    },
  ];

  return (
    <div id="page-courses" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <BookOpen className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت دوره‌ها</span>
        </h1>
        <ActionButton
          type="button"
          onClick={openAdd}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن دوره</span>
        </ActionButton>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <BookOpen className="w-10 h-10" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ دوره‌ای یافت نشد</h3>
          <p className="text-sm text-slate-500 mb-6">
            هنوز دوره‌ای در سیستم ثبت نشده است. اولین دوره را اضافه کنید.
          </p>
          <ActionButton
            type="button"
            onClick={openAdd}
            icon={<Plus className="w-4 h-4" />}
            className="px-5 py-2.5"
          >
            <span>افزودن دوره</span>
          </ActionButton>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable
            columns={courseColumns}
            data={courses}
            rowKey={(c) => c.id}
            ariaLabel="جدول دوره‌های آموزشی"
            actionsHeader="عملیات"
            actionsHeaderClassName="w-28"
            actionsCellClassName="w-28 shrink-0"
            renderActions={(c) => (
              <div className="flex items-center gap-1 shrink-0">
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => openEdit(c)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                  title="ویرایش"
                  aria-label={`ویرایش دوره ${c.name}`}
                >
                  <Pencil className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteTarget(c)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                  title="حذف"
                  aria-label={`حذف دوره ${c.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </ActionButton>
              </div>
            )}
          />
        </div>
      )}

      {/* Add / Edit Course Modal */}
      <Modal
        isOpen={isAddOpen || Boolean(editingCourse)}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setEditingCourse(null);
            setErrors({});
          }
        }}
        title={editingCourse ? 'ویرایش دوره' : 'افزودن دوره جدید'}
        subtitle="اطلاعات دوره آموزشی"
        icon={<BookOpen className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="courseModalForm"
              loading={submitting}
              loadingText="در حال ذخیره..."
              className="flex-1 py-2.5 px-4"
            >
              {editingCourse ? 'ذخیره تغییرات' : 'ذخیره'}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setIsAddOpen(false);
                setEditingCourse(null);
                setErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="courseModalForm" noValidate onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام دوره <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: دوره جامع کنکور تجربی"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رنگ شروع</label>
              <input
                type="color"
                value={formState.gradient_color_from}
                onChange={(e) =>
                  setFormState({ ...formState, gradient_color_from: e.target.value })
                }
                className="w-full h-11 border-2 border-slate-200 rounded-xl cursor-pointer p-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رنگ پایان</label>
              <input
                type="color"
                value={formState.gradient_color_to}
                onChange={(e) => setFormState({ ...formState, gradient_color_to: e.target.value })}
                className="w-full h-11 border-2 border-slate-200 rounded-xl cursor-pointer p-1"
              />
            </div>
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
              <label className="block text-xs font-medium text-slate-600 mb-1">قیمت</label>
              <input
                type="text"
                placeholder="4,500,000 تومان"
                value={formState.price}
                onChange={(e) => setFormState({ ...formState, price: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
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
        title="حذف دوره"
        message={`آیا از حذف دوره «${deleteTarget?.name || ''}» اطمینان دارید؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
