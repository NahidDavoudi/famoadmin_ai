import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import API from '../lib/api';
import type { Course, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';

interface CoursesPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const CoursesPage: React.FC<CoursesPageProps> = ({ showToast }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
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
    setEditingCourse(course);
    setFormState({
      name: course.name,
      gradient_color_from: course.gradient_color_from || '#445D84',
      gradient_color_to: course.gradient_color_to || '#E2D9C6',
      description: course.description || '',
      price: course.price || '',
      display_order: String(course.display_order || 0),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) {
      showToast('نام دوره الزامی است', 'error');
      return;
    }

    try {
      if (editingCourse) {
        await API.updateCourse(editingCourse.id, {
          name: formState.name.trim(),
          gradient_color_from: formState.gradient_color_from,
          gradient_color_to: formState.gradient_color_to,
          description: formState.description.trim(),
          price: formState.price.trim(),
          display_order: Number(formState.display_order) || 0,
        });
        setEditingCourse(null);
        showToast('دوره به‌روزرسانی شد', 'success');
      } else {
        await API.addCourse({
          name: formState.name.trim(),
          icon: 'fa-book',
          gradient_color_from: formState.gradient_color_from,
          gradient_color_to: formState.gradient_color_to,
          description: formState.description.trim(),
          price: formState.price.trim(),
          display_order: Number(formState.display_order) || 0,
        });
        setIsAddOpen(false);
        showToast('دوره جدید اضافه شد', 'success');
      }
      loadCourses();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره دوره', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteCourse(deleteTarget.id);
      setDeleteTarget(null);
      loadCourses();
      showToast('دوره حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف دوره', 'error');
    }
  };

  return (
    <div id="page-courses" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <BookOpen className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت دوره‌ها</span>
        </h1>
        <button
          type="button"
          onClick={openAdd}
          className="w-full sm:w-auto bg-[#445D84] text-white px-4 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>افزودن دوره</span>
        </button>
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
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2.5 rounded-xl hover:bg-[#5a779e] text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن دوره</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-5 py-3.5 text-right font-semibold">ترتیب</th>
                  <th className="px-5 py-3.5 text-right font-semibold">نام دوره</th>
                  <th className="px-5 py-3.5 text-right font-semibold">قیمت</th>
                  <th className="px-5 py-3.5 text-right font-semibold">رنگ‌بندی</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 tabular-nums font-medium text-slate-600">
                      {c.display_order}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600 tabular-nums">{c.price || '-'}</td>
                    <td className="px-5 py-4">
                      <div
                        className="w-10 h-10 rounded-xl shadow-xs border border-slate-200"
                        style={{
                          background: `linear-gradient(135deg, ${c.gradient_color_from || '#445D84'}, ${c.gradient_color_to || '#E2D9C6'})`,
                        }}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="ویرایش"
                          aria-label={`ویرایش دوره ${c.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف"
                          aria-label={`حذف دوره ${c.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Course Modal */}
      <Modal
        isOpen={isAddOpen || Boolean(editingCourse)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingCourse(null);
        }}
        title={editingCourse ? 'ویرایش دوره' : 'افزودن دوره جدید'}
        subtitle="اطلاعات دوره آموزشی"
        icon={<BookOpen className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="courseModalForm"
              className="flex-1 bg-[#445D84] text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-[#374a6b] transition-colors cursor-pointer"
            >
              {editingCourse ? 'ذخیره تغییرات' : 'ذخیره'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setEditingCourse(null);
              }}
              className="py-2.5 px-5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
            >
              انصراف
            </button>
          </div>
        }
      >
        <form id="courseModalForm" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">نام دوره *</label>
            <input
              type="text"
              required
              value={formState.name}
              onChange={(e) => setFormState({ ...formState, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
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
                value={formState.display_order}
                onChange={(e) => setFormState({ ...formState, display_order: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:border-[#445D84]"
              />
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
