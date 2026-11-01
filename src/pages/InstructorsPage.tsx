import React, { useCallback, useEffect, useState } from 'react';
import { School, Plus, Pencil, Trash2 } from 'lucide-react';
import API from '../lib/api';
import type { Instructor, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';

interface InstructorsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const InstructorsPage: React.FC<InstructorsPageProps> = ({ showToast }) => {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
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
    setEditingInstructor(inst);
    setFormState({
      name: inst.name,
      title: inst.title || '',
      description: inst.description || '',
      initial_letter: inst.initial_letter || '',
      display_order: String(inst.display_order || 0),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.title.trim()) {
      showToast('نام و عنوان استاد الزامی است', 'error');
      return;
    }

    const initial =
      formState.initial_letter.trim() || formState.name.trim().charAt(0) || 'ا';

    try {
      if (editingInstructor) {
        await API.updateInstructor(editingInstructor.id, {
          name: formState.name.trim(),
          title: formState.title.trim(),
          description: formState.description.trim(),
          initial_letter: initial,
          display_order: Number(formState.display_order) || 0,
        });
        setEditingInstructor(null);
        showToast('اطلاعات استاد به‌روزرسانی شد', 'success');
      } else {
        await API.addInstructor({
          name: formState.name.trim(),
          title: formState.title.trim(),
          description: formState.description.trim(),
          initial_letter: initial,
          display_order: Number(formState.display_order) || 0,
        });
        setIsAddOpen(false);
        showToast('استاد جدید اضافه شد', 'success');
      }
      loadInstructors();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره اطلاعات استاد', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteInstructor(deleteTarget.id);
      setDeleteTarget(null);
      loadInstructors();
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
        <button
          type="button"
          onClick={openAdd}
          className="w-full sm:w-auto bg-[#445D84] text-white px-4 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>افزودن استاد</span>
        </button>
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
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2.5 rounded-xl hover:bg-[#5a779e] text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن استاد</span>
          </button>
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
                        <button
                          type="button"
                          onClick={() => openEdit(i)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="ویرایش"
                          aria-label={`ویرایش استاد ${i.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(i)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف"
                          aria-label={`حذف استاد ${i.name}`}
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

      <Modal
        isOpen={isAddOpen || Boolean(editingInstructor)}
        onClose={() => {
          setIsAddOpen(false);
          setEditingInstructor(null);
        }}
        title={editingInstructor ? 'ویرایش استاد' : 'افزودن استاد جدید'}
        subtitle="اطلاعات مدرس یا مشاور"
        icon={<School className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="instructorModalForm"
              className="flex-1 bg-[#445D84] text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-[#374a6b] transition-colors cursor-pointer"
            >
              {editingInstructor ? 'ذخیره تغییرات' : 'ذخیره'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setEditingInstructor(null);
              }}
              className="py-2.5 px-5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
            >
              انصراف
            </button>
          </div>
        }
      >
        <form id="instructorModalForm" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی *
            </label>
            <input
              type="text"
              required
              value={formState.name}
              onChange={(e) => setFormState({ ...formState, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">عنوان / سمت *</label>
            <input
              type="text"
              required
              placeholder="مشاور تخصصی تحصیلی"
              value={formState.title}
              onChange={(e) => setFormState({ ...formState, title: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
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
