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
import { validateStudentForm, type FieldErrors } from '../lib/form-validation';
import type { AcademicField, Student, ToastType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';

interface StudentsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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

type StudentFieldKey = 'name' | 'phone' | 'national_id' | 'grade' | 'field';

export const StudentsPage: React.FC<StudentsPageProps> = ({ showToast, searchInputRef }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [clearing, setClearing] = useState(false);
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
  const [addErrors, setAddErrors] = useState<FieldErrors<StudentFieldKey>>({});
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    grade: '12',
    field: 'تجربی' as AcademicField | '',
  });
  const [editErrors, setEditErrors] = useState<FieldErrors<StudentFieldKey>>({});

  // Confirmation Dialog State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
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

  const handleFilterClick = async () => {
    setFiltering(true);
    try {
      await fetchStudents(1);
    } finally {
      setFiltering(false);
    }
  };

  const handleClearFilters = async () => {
    setClearing(true);
    try {
      setSearch('');
      setFieldFilter('');
      setGradeFilter('');
      setStatusFilter('');
      await fetchStudents(1, { search: '', field: '', grade: '', status: '' });
    } finally {
      setClearing(false);
    }
  };

  const openAddModal = () => {
    setAddForm({ name: '', phone: '', national_id: '', grade: '12', field: '' });
    setAddErrors({});
    setIsAddOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const errors = validateStudentForm(addForm);
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً خطاهای فرم را برطرف کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await API.addStudent({
        name: addForm.name.trim(),
        phone: addForm.phone.trim(),
        nationalId: addForm.national_id.trim(),
        grade: Number(addForm.grade),
        field: addForm.field as AcademicField,
      });
      setIsAddOpen(false);
      setAddForm({ name: '', phone: '', national_id: '', grade: '12', field: '' });
      setAddErrors({});
      await fetchStudents(1);
      showToast('دانش‌آموز اضافه شد و حساب کاربری ایجاد شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در افزودن دانش‌آموز', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setEditErrors({});
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
    if (!editingStudent || submitting) return;

    const errors = validateStudentForm(editForm);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً خطاهای فرم را برطرف کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await API.updateStudent(editingStudent.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        nationalId: editForm.national_id.trim(),
        grade: Number(editForm.grade),
        field: editForm.field as AcademicField,
      });
      setEditingStudent(null);
      setEditErrors({});
      await fetchStudents(page);
      showToast('تغییرات ذخیره شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره تغییرات', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (student: Student) => {
    const isActive = Number(student.status ?? student.is_active ?? 1) === 1;
    setConfirmState({
      isOpen: true,
      title: isActive ? 'غیرفعال کردن دانش‌آموز' : 'فعال کردن دانش‌آموز',
      message: `آیا از تغییر وضعیت حساب «${student.name}» اطمینان دارید؟`,
      variant: isActive ? 'danger' : 'primary',
      onConfirm: async () => {
        try {
          await API.toggleStudentStatus(student.id);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          await fetchStudents(page);
          showToast('وضعیت دانش‌آموز تغییر یافت', 'success');
        } catch (err) {
          showToast((err as Error).message || 'خطا در تغییر وضعیت دانش‌آموز', 'error');
        }
      },
    });
  };

  const handleCreateAccount = (student: Student) => {
    setConfirmState({
      isOpen: true,
      title: 'ایجاد حساب کاربری',
      message: `حساب کاربری برای «${student.name}» ایجاد شود؟`,
      variant: 'primary',
      onConfirm: async () => {
        try {
          const res = await API.createStudentAccount(student.id);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          await fetchStudents(page);
          const pwd = res.data?.password ? ` (رمز: ${res.data.password})` : '';
          showToast(`حساب کاربری ایجاد شد${pwd}`, 'success');
        } catch (err) {
          showToast((err as Error).message || 'خطا در ایجاد حساب کاربری', 'error');
        }
      },
    });
  };

  const handleResetPassword = (student: Student) => {
    setConfirmState({
      isOpen: true,
      title: 'بازنشانی رمز عبور',
      message: `رمز عبور حساب «${student.name}» بازنشانی شود؟`,
      variant: 'primary',
      onConfirm: async () => {
        try {
          const res = await API.resetStudentPassword(student.id);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          const newPwd = res.data?.new_password || '1234';
          showToast(`رمز عبور به ${newPwd} بازنشانی شد`, 'success');
        } catch (err) {
          showToast((err as Error).message || 'خطا در بازنشانی رمز عبور', 'error');
        }
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
        try {
          await API.deleteStudent(student.id);
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          await fetchStudents(page);
          showToast('دانش‌آموز حذف شد', 'success');
        } catch (err) {
          showToast((err as Error).message || 'خطا در حذف دانش‌آموز', 'error');
        }
      },
    });
  };

  return (
    <div id="page-students" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84]">دانش‌آموزان</h1>
        <ActionButton
          type="button"
          onClick={openAddModal}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن دانش‌آموز</span>
        </ActionButton>
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
              if (e.key === 'Enter') handleFilterClick();
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
          <ActionButton
            type="button"
            loading={filtering}
            loadingText="جستجو..."
            onClick={handleFilterClick}
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
            className="px-4 py-2.5"
          >
            <span>فیلتر</span>
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            loading={clearing}
            loadingText="پاکسازی..."
            onClick={handleClearFilters}
            icon={<X className="w-4 h-4" aria-hidden="true" />}
            className="px-4 py-2.5"
          >
            <span>پاک کردن</span>
          </ActionButton>
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
          <ActionButton
            type="button"
            onClick={openAddModal}
            icon={<Plus className="w-4 h-4" aria-hidden="true" />}
            className="px-5 py-2.5"
          >
            <span>افزودن دانش‌آموز</span>
          </ActionButton>
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
                  const isActive = Number(s.status ?? s.is_active ?? 1) === 1;
                  const hasAccount = s.user_id !== undefined ? Boolean(s.user_id) : true;
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
                          <ActionButton
                            type="button"
                            variant="ghost"
                            onClick={() => openEditModal(s)}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                            title="ویرایش"
                            aria-label={`ویرایش دانش‌آموز ${s.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </ActionButton>
                          {hasAccount ? (
                            <ActionButton
                              type="button"
                              variant="ghost"
                              onClick={() => handleResetPassword(s)}
                              className="p-2 rounded-lg text-amber-600 hover:bg-amber-50"
                              title="بازنشانی رمز"
                              aria-label={`بازنشانی رمز دانش‌آموز ${s.name}`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </ActionButton>
                          ) : (
                            <ActionButton
                              type="button"
                              variant="ghost"
                              onClick={() => handleCreateAccount(s)}
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"
                              title="ایجاد حساب"
                              aria-label={`ایجاد حساب ${s.name}`}
                            >
                              <UserPlus className="w-4 h-4" />
                            </ActionButton>
                          )}
                          <ActionButton
                            type="button"
                            variant="ghost"
                            onClick={() => handleToggleStatus(s)}
                            className={`p-2 rounded-lg ${
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
                          </ActionButton>
                          <ActionButton
                            type="button"
                            variant="ghost"
                            onClick={() => handleDeleteStudent(s)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                            title="حذف"
                            aria-label={`حذف دانش‌آموز ${s.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </ActionButton>
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
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => fetchStudents(page - 1)}
                  aria-label="صفحه قبلی"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => fetchStudents(page + 1)}
                  aria-label="صفحه بعدی"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setAddErrors({});
          }
        }}
        title="افزودن دانش‌آموز"
        subtitle="اطلاعات دانش‌آموز جدید را وارد کنید"
        icon={<UserPlus className="w-5 h-5" />}
        size="sm"
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="addStudentForm"
              loading={submitting}
              loadingText="در حال افزودن..."
              className="flex-1 py-2.5 px-4"
            >
              ذخیره
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setIsAddOpen(false);
                setAddErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="addStudentForm" noValidate onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              placeholder="نام دانش‌آموز"
              aria-invalid={Boolean(addErrors.name)}
              value={addForm.name}
              onChange={(e) => {
                setAddForm({ ...addForm, name: e.target.value });
                if (addErrors.name) setAddErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={getFieldClass(Boolean(addErrors.name))}
            />
            <FieldError message={addErrors.name} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                شماره موبایل <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                maxLength={11}
                placeholder="09123456789"
                dir="ltr"
                aria-invalid={Boolean(addErrors.phone)}
                value={addForm.phone}
                onChange={(e) => {
                  setAddForm({ ...addForm, phone: e.target.value });
                  if (addErrors.phone) setAddErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                className={getFieldClass(Boolean(addErrors.phone), 'text-left')}
              />
              <FieldError message={addErrors.phone} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                کد ملی <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="national_id"
                maxLength={10}
                placeholder="0012345678"
                dir="ltr"
                aria-invalid={Boolean(addErrors.national_id)}
                value={addForm.national_id}
                onChange={(e) => {
                  setAddForm({ ...addForm, national_id: e.target.value });
                  if (addErrors.national_id)
                    setAddErrors((prev) => ({ ...prev, national_id: undefined }));
                }}
                className={getFieldClass(Boolean(addErrors.national_id), 'text-left')}
              />
              <FieldError message={addErrors.national_id} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                پایه <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="grade"
                min={7}
                max={12}
                aria-invalid={Boolean(addErrors.grade)}
                value={addForm.grade}
                onChange={(e) => {
                  setAddForm({ ...addForm, grade: e.target.value });
                  if (addErrors.grade) setAddErrors((prev) => ({ ...prev, grade: undefined }));
                }}
                className={getFieldClass(Boolean(addErrors.grade))}
              />
              <FieldError message={addErrors.grade} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رشته <span className="text-red-500">*</span>
              </label>
              <select
                name="field"
                aria-invalid={Boolean(addErrors.field)}
                value={addForm.field}
                onChange={(e) => {
                  setAddForm({ ...addForm, field: e.target.value as AcademicField });
                  if (addErrors.field) setAddErrors((prev) => ({ ...prev, field: undefined }));
                }}
                className={getFieldClass(Boolean(addErrors.field))}
              >
                <option value="">انتخاب کنید</option>
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <FieldError message={addErrors.field} />
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
        onClose={() => {
          if (!submitting) {
            setEditingStudent(null);
            setEditErrors({});
          }
        }}
        title="ویرایش دانش‌آموز"
        subtitle="تغییر اطلاعات پایه و تماس"
        icon={<Pencil className="w-5 h-5" />}
        iconColorClass="bg-amber-500 text-white"
        size="sm"
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="editStudentForm"
              loading={submitting}
              loadingText="در حال ذخیره..."
              className="flex-1 py-2.5 px-4"
            >
              ذخیره تغییرات
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setEditingStudent(null);
                setEditErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="editStudentForm" noValidate onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام و نام خانوادگی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              aria-invalid={Boolean(editErrors.name)}
              value={editForm.name}
              onChange={(e) => {
                setEditForm({ ...editForm, name: e.target.value });
                if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={getFieldClass(Boolean(editErrors.name))}
            />
            <FieldError message={editErrors.name} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                شماره موبایل <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                maxLength={11}
                dir="ltr"
                aria-invalid={Boolean(editErrors.phone)}
                value={editForm.phone}
                onChange={(e) => {
                  setEditForm({ ...editForm, phone: e.target.value });
                  if (editErrors.phone) setEditErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                className={getFieldClass(Boolean(editErrors.phone), 'text-left')}
              />
              <FieldError message={editErrors.phone} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                کد ملی <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="national_id"
                maxLength={10}
                dir="ltr"
                aria-invalid={Boolean(editErrors.national_id)}
                value={editForm.national_id}
                onChange={(e) => {
                  setEditForm({ ...editForm, national_id: e.target.value });
                  if (editErrors.national_id)
                    setEditErrors((prev) => ({ ...prev, national_id: undefined }));
                }}
                className={getFieldClass(Boolean(editErrors.national_id), 'text-left')}
              />
              <FieldError message={editErrors.national_id} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                پایه <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="grade"
                min={7}
                max={12}
                aria-invalid={Boolean(editErrors.grade)}
                value={editForm.grade}
                onChange={(e) => {
                  setEditForm({ ...editForm, grade: e.target.value });
                  if (editErrors.grade) setEditErrors((prev) => ({ ...prev, grade: undefined }));
                }}
                className={getFieldClass(Boolean(editErrors.grade))}
              />
              <FieldError message={editErrors.grade} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رشته <span className="text-red-500">*</span>
              </label>
              <select
                name="field"
                aria-invalid={Boolean(editErrors.field)}
                value={editForm.field}
                onChange={(e) => {
                  setEditForm({ ...editForm, field: e.target.value as AcademicField });
                  if (editErrors.field) setEditErrors((prev) => ({ ...prev, field: undefined }));
                }}
                className={getFieldClass(Boolean(editErrors.field))}
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <FieldError message={editErrors.field} />
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
