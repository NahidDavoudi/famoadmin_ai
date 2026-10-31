import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  X,
  Pencil,
  KeyRound,
  UserPlus,
  Minus,
  Trash2,
  Users,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import API from '../lib/api';
import { isValidIranianPhone, isValidNationalId } from '../lib/exam-math';
import type { AcademicField, Student, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';

interface StudentsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const FIELDS: AcademicField[] = ['ریاضی', 'تجربی', 'انسانی', 'راهنمایی'];

export const StudentsPage: React.FC<StudentsPageProps> = ({ showToast, searchInputRef }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fieldFilter, setFieldFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Add Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    grade: '12',
    field: '' as AcademicField | '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    grade: '12',
    field: 'تجربی' as AcademicField,
  });

  // Confirmation Dialog State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const internalSearchRef = useRef<HTMLInputElement | null>(null);
  const activeSearchRef = searchInputRef || internalSearchRef;

  const fetchStudents = useCallback(
    async (
      targetPage = 1,
      overrides?: {
        search?: string;
        field?: string;
        grade?: string;
        status?: '' | 'active' | 'inactive';
      }
    ) => {
      setLoading(true);
      try {
        const res = await API.getStudents({
          search: overrides?.search !== undefined ? overrides.search : search,
          field: overrides?.field !== undefined ? overrides.field : fieldFilter,
          grade: overrides?.grade !== undefined ? overrides.grade : gradeFilter,
          status: overrides?.status !== undefined ? overrides.status : statusFilter,
          page: targetPage,
          perPage: 20,
        });
        setStudents(res.data || []);
        setPage(targetPage);
        setTotalPages(res.pagination?.total_pages || 1);
        setTotalRecords(res.pagination?.total || 0);
      } catch {
        showToast('خطا در بارگذاری دانش‌آموزان', 'error');
      } finally {
        setLoading(false);
      }
    },
    [search, fieldFilter, gradeFilter, statusFilter, showToast]
  );

  useEffect(() => {
    fetchStudents(1);
  }, [fetchStudents]);

  const handleClearFilters = () => {
    setSearch('');
    setFieldFilter('');
    setGradeFilter('');
    setStatusFilter('');
    fetchStudents(1, { search: '', field: '', grade: '', status: '' });
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      showToast('نام دانش‌آموز الزامی است', 'error');
      return;
    }
    if (!isValidIranianPhone(addForm.phone)) {
      showToast('شماره موبایل نامعتبر است (فرمت: 09xxxxxxxxx)', 'error');
      return;
    }
    if (!isValidNationalId(addForm.national_id)) {
      showToast('کد ملی باید ۱۰ رقم باشد', 'error');
      return;
    }
    if (!addForm.field) {
      showToast('لطفاً رشته تحصیلی را انتخاب کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await API.addStudent({
        name: addForm.name,
        phone: addForm.phone,
        nationalId: addForm.national_id,
        grade: Number(addForm.grade),
        field: addForm.field as AcademicField,
      });
      setIsAddOpen(false);
      setAddForm({ name: '', phone: '', national_id: '', grade: '12', field: '' });
      fetchStudents(1);
      showToast('دانش‌آموز اضافه شد و حساب کاربری ایجاد شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در افزودن دانش‌آموز', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      name: student.name,
      phone: student.phone,
      national_id: student.national_id,
      grade: String(student.grade),
      field: student.field,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    if (!isValidIranianPhone(editForm.phone)) {
      showToast('شماره موبایل نامعتبر است (فرمت: 09xxxxxxxxx)', 'error');
      return;
    }
    if (!isValidNationalId(editForm.national_id)) {
      showToast('کد ملی باید ۱۰ رقم باشد', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await API.updateStudent(editingStudent.id, {
        name: editForm.name,
        phone: editForm.phone,
        nationalId: editForm.national_id,
        grade: Number(editForm.grade),
        field: editForm.field,
      });
      setEditingStudent(null);
      fetchStudents(page);
      showToast('تغییرات ذخیره شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره تغییرات', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (student: Student) => {
    const isActive = Number(student.is_active) === 1;
    setConfirmState({
      isOpen: true,
      title: isActive ? 'غیرفعال کردن دانش‌آموز' : 'فعال کردن دانش‌آموز',
      message: `آیا از تغییر وضعیت حساب «${student.name}» اطمینان دارید؟`,
      variant: isActive ? 'danger' : 'primary',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        await API.toggleStudentStatus(student.id);
        fetchStudents(page);
        showToast('وضعیت دانش‌آموز تغییر یافت', 'success');
      },
    });
  };

  const handleCreateAccount = (student: Student) => {
    setConfirmState({
      isOpen: true,
      title: 'ایجاد حساب کاربری',
      message: `حساب کاربری برای «${student.name}» با رمز پیش‌فرض 1234 ایجاد شود؟`,
      variant: 'primary',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        await API.createStudentAccount(student.id);
        fetchStudents(page);
        showToast('حساب کاربری ایجاد شد', 'success');
      },
    });
  };

  const handleResetPassword = (student: Student) => {
    setConfirmState({
      isOpen: true,
      title: 'بازنشانی رمز عبور',
      message: `رمز عبور «${student.name}» به 1234 بازنشانی شود؟`,
      variant: 'primary',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        await API.resetStudentPassword(student.id);
        showToast('رمز عبور به 1234 بازنشانی شد', 'success');
      },
    });
  };

  const handleDeleteStudent = (student: Student) => {
    setConfirmState({
      isOpen: true,
      title: 'حذف دانش‌آموز',
      message: `آیا از حذف دانش‌آموز «${student.name}» و حساب کاربری مرتبط اطمینان دارید؟`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        await API.deleteStudent(student.id);
        fetchStudents(page);
        showToast('دانش‌آموز حذف شد', 'success');
      },
    });
  };

  return (
    <div id="page-students" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84]">دانش‌آموزان</h1>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="w-full sm:w-auto bg-[#445D84] text-white px-4 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors flex items-center justify-center gap-2 font-medium text-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>افزودن دانش‌آموز</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            ref={activeSearchRef}
            id="filterSearch"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchStudents(1);
            }}
            placeholder="جستجو نام، موبایل یا کد ملی..."
            className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
          />
          <select
            id="filterField"
            aria-label="فیلتر رشته"
            value={fieldFilter}
            onChange={(e) => {
              const val = e.target.value;
              setFieldFilter(val);
              fetchStudents(1, { field: val });
            }}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه رشته‌ها</option>
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input
            id="filterGrade"
            type="number"
            min={7}
            max={12}
            value={gradeFilter}
            onChange={(e) => {
              const val = e.target.value;
              setGradeFilter(val);
              fetchStudents(1, { grade: val });
            }}
            placeholder="پایه (۷ تا ۱۲)..."
            className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
          />
          <select
            id="filterStatus"
            aria-label="فیلتر وضعیت"
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as '' | 'active' | 'inactive';
              setStatusFilter(val);
              fetchStudents(1, { status: val });
            }}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="active">فعال</option>
            <option value="inactive">غیرفعال</option>
          </select>
          <button
            type="button"
            onClick={() => fetchStudents(1)}
            className="bg-[#445D84] text-white px-4 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            <span>فیلتر</span>
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>پاک کردن</span>
          </button>
        </div>
      </div>

      {/* Table / Empty / Skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-14 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Users className="w-10 h-10" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ دانش‌آموزی یافت نشد</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            دانش‌آموزی با این مشخصات در سیستم ثبت نشده است. می‌توانید دانش‌آموز جدیدی اضافه کنید.
          </p>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>افزودن دانش‌آموز</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-4 py-3.5 text-right font-semibold">نام</th>
                  <th className="px-4 py-3.5 text-center font-semibold">تماس / کد ملی</th>
                  <th className="px-4 py-3.5 text-center font-semibold">پایه</th>
                  <th className="px-4 py-3.5 text-center font-semibold">رشته</th>
                  <th className="px-4 py-3.5 text-center font-semibold">حساب</th>
                  <th className="px-4 py-3.5 text-center font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => {
                  const isActive = Number(s.is_active) === 1;
                  const hasAccount = Boolean(s.user_id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-center tabular-nums" dir="ltr">
                        <div className="flex flex-col items-center text-xs">
                          <span className="text-slate-700 font-medium">{s.phone || '-'}</span>
                          <span className="text-slate-400">{s.national_id || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 tabular-nums">
                        پایه {s.grade}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700">
                        {s.field}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-semibold ${
                            isActive ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="ویرایش"
                            aria-label={`ویرایش دانش‌آموز ${s.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {hasAccount ? (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(s)}
                              className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="بازنشانی رمز"
                              aria-label={`بازنشانی رمز دانش‌آموز ${s.name}`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCreateAccount(s)}
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="ایجاد حساب"
                              aria-label={`ایجاد حساب ${s.name}`}
                            >
                              <UserPlus className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(s)}
                            className={`p-2 rounded-lg transition-colors cursor-pointer ${
                              isActive
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                            aria-label={`${isActive ? 'غیرفعال کردن' : 'فعال کردن'} دانش‌آموز ${s.name}`}
                          >
                            {isActive ? (
                              <Minus className="w-4 h-4" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(s)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="حذف"
                            aria-label={`حذف دانش‌آموز ${s.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="tabular-nums">
                کل {totalRecords} رکورد • صفحه {page} از {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => fetchStudents(page - 1)}
                  aria-label="صفحه قبلی"
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => fetchStudents(page + 1)}
                  aria-label="صفحه بعدی"
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="افزودن دانش‌آموز"
        subtitle="اطلاعات دانش‌آموز جدید را وارد کنید"
        icon={<UserPlus className="w-5 h-5" />}
        size="sm"
        footer={
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="addStudentForm"
              disabled={submitting}
              className="flex-1 bg-[#445D84] text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-[#374a6b] transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'در حال افزودن...' : 'ذخیره'}
            </button>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="py-2.5 px-5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
            >
              انصراف
            </button>
          </div>
        }
      >
        <form id="addStudentForm" onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="نام دانش‌آموز"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                شماره موبایل <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                required
                maxLength={11}
                placeholder="09123456789"
                dir="ltr"
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                کد ملی <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="national_id"
                required
                maxLength={10}
                placeholder="0012345678"
                dir="ltr"
                value={addForm.national_id}
                onChange={(e) => setAddForm({ ...addForm, national_id: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">پایه</label>
              <input
                type="number"
                name="grade"
                min={7}
                max={12}
                required
                value={addForm.grade}
                onChange={(e) => setAddForm({ ...addForm, grade: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رشته</label>
              <select
                name="field"
                required
                value={addForm.field}
                onChange={(e) =>
                  setAddForm({ ...addForm, field: e.target.value as AcademicField })
                }
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">انتخاب کنید</option>
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            حساب کاربری با شماره موبایل و رمز پیش‌فرض <strong>1234</strong> ساخته می‌شود.
          </div>
        </form>
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        isOpen={Boolean(editingStudent)}
        onClose={() => setEditingStudent(null)}
        title="ویرایش دانش‌آموز"
        subtitle="تغییر اطلاعات پایه و تماس"
        icon={<Pencil className="w-5 h-5" />}
        iconColorClass="bg-amber-500 text-white"
        size="sm"
        footer={
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="editStudentForm"
              disabled={submitting}
              className="flex-1 bg-[#445D84] text-white py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-[#374a6b] transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
            </button>
            <button
              type="button"
              onClick={() => setEditingStudent(null)}
              className="py-2.5 px-5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
            >
              انصراف
            </button>
          </div>
        }
      >
        <form id="editStudentForm" onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">نام</label>
            <input
              type="text"
              name="name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">شماره موبایل</label>
              <input
                type="tel"
                name="phone"
                required
                maxLength={11}
                dir="ltr"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">کد ملی</label>
              <input
                type="text"
                name="national_id"
                required
                maxLength={10}
                dir="ltr"
                value={editForm.national_id}
                onChange={(e) => setEditForm({ ...editForm, national_id: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">پایه</label>
              <input
                type="number"
                name="grade"
                min={7}
                max={12}
                required
                value={editForm.grade}
                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رشته</label>
              <select
                name="field"
                required
                value={editForm.field}
                onChange={(e) =>
                  setEditForm({ ...editForm, field: e.target.value as AcademicField })
                }
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
