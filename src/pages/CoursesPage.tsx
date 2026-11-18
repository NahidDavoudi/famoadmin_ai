import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Search,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import API from '../lib/api';
import { validateCourseForm, type FieldErrors } from '../lib/form-validation';
import {
  SUBSCRIPTION_STATUS_OPTIONS,
  getSubscriptionStatusBadgeClass,
  getSubscriptionStatusLabel,
  formatSubscriptionDateInput,
  formatSubscriptionJalaliDate,
  formatCoursePrice,
  validateSubscriptionForm,
  resolveSubscriptionIsActive,
  computeSubscriptionStats,
  filterSubscriptions,
  type SubscriptionFormErrors,
} from '../lib/subscriptions';
import type {
  Course,
  Student,
  Subscription,
  SubscriptionStatus,
  ToastType,
} from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';
import { StudentSubscriptionsModal } from '../components/StudentSubscriptionsModal';

interface CoursesPageProps {
  showToast: (message: string, type?: ToastType) => void;
  initialTab?: 'courses' | 'subscriptions';
}

export const CoursesPage: React.FC<CoursesPageProps> = ({
  showToast,
  initialTab = 'courses',
}) => {
  const [activeTab, setActiveTab] = useState<'courses' | 'subscriptions'>(initialTab);

  // Courses Catalog State
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deleteCourseTarget, setDeleteCourseTarget] = useState<Course | null>(null);

  const [courseFormState, setCourseFormState] = useState({
    name: '',
    gradient_color_from: '#445D84',
    gradient_color_to: '#5a779e',
    description: '',
    price: '',
    display_order: '0',
  });
  const [courseErrors, setCourseErrors] = useState<FieldErrors<'name' | 'display_order'>>({});

  // Subscriptions Management State
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);
  const [subTotalRecords, setSubTotalRecords] = useState(0);

  // Subscription Filters
  const [subSearch, setSubSearch] = useState('');
  const [subCourseFilter, setSubCourseFilter] = useState<string>('');
  const [subStatusFilter, setSubStatusFilter] = useState<SubscriptionStatus | ''>('');
  const [subActiveFilter, setSubActiveFilter] = useState<'' | '1' | '0'>('');

  // Create / Edit Subscription Modal State
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [subForm, setSubForm] = useState<{
    student_id: string;
    course_id: string;
    status: SubscriptionStatus;
    started_at: string;
    end_at: string;
    note: string;
  }>({
    student_id: '',
    course_id: '',
    status: 'active',
    started_at: '',
    end_at: '',
    note: '',
  });
  const [subFormErrors, setSubFormErrors] = useState<SubscriptionFormErrors>({});
  const [submittingSub, setSubmittingSub] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [deleteSubTarget, setDeleteSubTarget] = useState<Subscription | null>(null);

  // Student-specific Subscriptions Modal
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<Student | null>(null);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await API.getCourses();
      setCourses(res.data || []);
    } catch {
      showToast('خطا در بارگذاری دوره‌ها', 'error');
    } finally {
      setLoadingCourses(false);
    }
  }, [showToast]);

  const loadStudentsDirectory = useCallback(async () => {
    try {
      const res = await API.getStudents({ page: 1, perPage: 200 });
      setStudentsList(res.data || []);
    } catch {
      // Student list is optional for dropdown enrichment
    }
  }, []);

  const loadSubscriptions = useCallback(
    async (
      targetPage = 1,
      overrides?: {
        search?: string;
        course_id?: string;
        status?: SubscriptionStatus | '';
        is_active?: '' | '1' | '0';
      }
    ) => {
      setLoadingSubs(true);
      try {
        const activeVal =
          overrides?.is_active !== undefined ? overrides.is_active : subActiveFilter;
        const res = await API.getSubscriptions({
          page: targetPage,
          per_page: 50,
          search: overrides?.search !== undefined ? overrides.search : subSearch,
          course_id:
            overrides?.course_id !== undefined ? overrides.course_id : subCourseFilter,
          status: overrides?.status !== undefined ? overrides.status : subStatusFilter,
          is_active: activeVal === '1' ? 1 : activeVal === '0' ? 0 : '',
        });
        setSubscriptions(res.data || []);
        setSubPage(targetPage);
        setSubTotalPages(res.pagination?.total_pages || 1);
        setSubTotalRecords(res.pagination?.total || (res.data || []).length);
      } catch {
        showToast('خطا در بارگذاری لیست اشتراک‌ها', 'error');
      } finally {
        setLoadingSubs(false);
      }
    },
    [subSearch, subCourseFilter, subStatusFilter, subActiveFilter, showToast]
  );

  useEffect(() => {
    loadCourses();
    loadStudentsDirectory();
    loadSubscriptions(1);
  }, [loadCourses, loadStudentsDirectory, loadSubscriptions]);

  // Filtered subscriptions (handles both server-side and instant client-side filtering)
  const displayedSubscriptions = useMemo(() => {
    return filterSubscriptions(subscriptions, {
      search: subSearch,
      course_id: subCourseFilter,
      status: subStatusFilter,
      is_active: subActiveFilter === '1' ? 1 : subActiveFilter === '0' ? 0 : '',
    });
  }, [subscriptions, subSearch, subCourseFilter, subStatusFilter, subActiveFilter]);

  const subStats = useMemo(
    () => computeSubscriptionStats(displayedSubscriptions),
    [displayedSubscriptions]
  );

  const filteredStudentsForSelect = useMemo(() => {
    const q = studentSearchTerm.trim().toLowerCase();
    if (!q) return studentsList;
    return studentsList.filter(
      (s) =>
        String(s.name || '')
          .toLowerCase()
          .includes(q) ||
        String(s.phone || '').includes(q) ||
        String(s.national_id || '').includes(q)
    );
  }, [studentsList, studentSearchTerm]);

  // ────────────────────── Course Catalog Handlers ──────────────────────
  const openAddCourse = () => {
    setCourseErrors({});
    setCourseFormState({
      name: '',
      gradient_color_from: '#445D84',
      gradient_color_to: '#5a779e',
      description: '',
      price: '',
      display_order: String(courses.length + 1),
    });
    setIsAddCourseOpen(true);
  };

  const openEditCourse = (course: Course) => {
    setCourseErrors({});
    setEditingCourse(course);
    setCourseFormState({
      name: String(course.name ?? ''),
      gradient_color_from: String(course.gradient_color_from || '#445D84'),
      gradient_color_to: String(course.gradient_color_to || '#E2D9C6'),
      description: String(course.description ?? ''),
      price: String(course.price ?? ''),
      display_order: String(course.display_order ?? 0),
    });
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingCourse) return;

    const validationErrors = validateCourseForm(courseFormState);
    setCourseErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً فیلدهای الزامی دوره را تکمیل کنید', 'error');
      return;
    }

    setSubmittingCourse(true);
    try {
      if (editingCourse) {
        await API.updateCourse(editingCourse.id, {
          name: String(courseFormState.name ?? '').trim(),
          gradient_color_from: courseFormState.gradient_color_from,
          gradient_color_to: courseFormState.gradient_color_to,
          description: String(courseFormState.description ?? '').trim(),
          price: String(courseFormState.price ?? '').trim(),
          display_order: Number(courseFormState.display_order) || 0,
        });
        setEditingCourse(null);
        showToast('دوره به‌روزرسانی شد', 'success');
      } else {
        await API.addCourse({
          name: String(courseFormState.name ?? '').trim(),
          icon: 'fa-book',
          gradient_color_from: courseFormState.gradient_color_from,
          gradient_color_to: courseFormState.gradient_color_to,
          description: String(courseFormState.description ?? '').trim(),
          price: String(courseFormState.price ?? '').trim(),
          display_order: Number(courseFormState.display_order) || 0,
        });
        setIsAddCourseOpen(false);
        showToast('دوره جدید اضافه شد', 'success');
      }
      setCourseErrors({});
      await loadCourses();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره دوره', 'error');
    } finally {
      setSubmittingCourse(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!deleteCourseTarget) return;
    try {
      await API.deleteCourse(deleteCourseTarget.id);
      setDeleteCourseTarget(null);
      await loadCourses();
      showToast('دوره حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف دوره', 'error');
    }
  };

  // ────────────────────── Subscription Handlers ──────────────────────
  const openAddSubscription = (preselectedCourseId?: number) => {
    setEditingSubscription(null);
    setStudentSearchTerm('');
    setSubFormErrors({});
    setSubForm({
      student_id: '',
      course_id: preselectedCourseId
        ? String(preselectedCourseId)
        : subCourseFilter || (courses[0]?.id ? String(courses[0].id) : ''),
      status: 'active',
      started_at: '',
      end_at: '',
      note: '',
    });
    setIsSubModalOpen(true);
  };

  const openEditSubscription = (sub: Subscription) => {
    setEditingSubscription(sub);
    setStudentSearchTerm('');
    setSubFormErrors({});
    setSubForm({
      student_id: String(sub.student_id || sub.student?.id || ''),
      course_id: String(sub.course_id || sub.course?.id || ''),
      status: sub.status || 'active',
      started_at: formatSubscriptionDateInput(sub.started_at),
      end_at: formatSubscriptionDateInput(sub.end_at),
      note: sub.note || '',
    });
    setIsSubModalOpen(true);
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingSub) return;

    const errors = validateSubscriptionForm(subForm);
    setSubFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً فیلدهای الزامی اشتراک را تکمیل کنید', 'error');
      return;
    }

    setSubmittingSub(true);
    try {
      const isActive = resolveSubscriptionIsActive(subForm.status);
      if (editingSubscription) {
        await API.updateSubscription(editingSubscription.id, {
          student_id: Number(subForm.student_id),
          course_id: Number(subForm.course_id),
          status: subForm.status,
          is_active: isActive,
          started_at: subForm.started_at ? subForm.started_at : null,
          end_at: subForm.end_at ? subForm.end_at : null,
          note: subForm.note.trim() || null,
        });
        showToast('اشتراک دوره با موفقیت ویرایش شد', 'success');
      } else {
        await API.createSubscription({
          student_id: Number(subForm.student_id),
          course_id: Number(subForm.course_id),
          status: subForm.status,
          is_active: isActive,
          started_at: subForm.started_at ? subForm.started_at : null,
          end_at: subForm.end_at ? subForm.end_at : null,
          note: subForm.note.trim() || null,
        });
        showToast('دانش‌آموز با موفقیت در دوره ثبت‌نام شد', 'success');
      }
      setIsSubModalOpen(false);
      setEditingSubscription(null);
      await loadSubscriptions(subPage);
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره اشتراک دوره', 'error');
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleQuickStatusChange = async (
    sub: Subscription,
    nextStatus: SubscriptionStatus
  ) => {
    if (updatingStatusId === sub.id || sub.status === nextStatus) return;
    setUpdatingStatusId(sub.id);
    try {
      await API.updateSubscriptionStatus(sub.id, {
        status: nextStatus,
        note: sub.note,
      });
      showToast(
        `وضعیت اشتراک «${sub.student?.name || ''}» به «${getSubscriptionStatusLabel(
          nextStatus
        )}» تغییر یافت`,
        'success'
      );
      await loadSubscriptions(subPage);
    } catch (err) {
      showToast((err as Error).message || 'خطا در تغییر وضعیت اشتراک', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const confirmDeleteSubscription = async () => {
    if (!deleteSubTarget) return;
    try {
      await API.deleteSubscription(deleteSubTarget.id);
      setDeleteSubTarget(null);
      await loadSubscriptions(subPage);
      showToast('اشتراک دوره حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف اشتراک دوره', 'error');
    }
  };

  const handleResetSubFilters = async () => {
    setSubSearch('');
    setSubCourseFilter('');
    setSubStatusFilter('');
    setSubActiveFilter('');
    await loadSubscriptions(1, {
      search: '',
      course_id: '',
      status: '',
      is_active: '',
    });
  };

  const handleOpenStudentCoursesModal = (sub: Subscription) => {
    const matchedStudent = studentsList.find((s) => s.id === sub.student_id);
    if (matchedStudent) {
      setSelectedStudentForModal(matchedStudent);
      return;
    }
    setSelectedStudentForModal({
      id: sub.student_id,
      name: sub.student?.name || `دانش‌آموز #${sub.student_id}`,
      phone: sub.student?.phone || '',
      national_id: '',
      grade: Number(sub.student?.grade || 12),
      field: (sub.student?.field as Student['field']) || 'تجربی',
    });
  };

  // ────────────────────── Columns Definitions ──────────────────────
  const courseColumns: Column<Course>[] = [
    {
      key: 'display_order',
      header: 'ترتیب',
      priority: 'desktop-only',
      headerClassName: 'hidden lg:table-cell w-16',
      cellClassName: 'hidden lg:table-cell w-16 tabular-nums font-medium text-slate-600',
      cell: (c) => c.display_order,
    },
    {
      key: 'name',
      header: 'نام دوره',
      priority: 'primary',
      cellClassName: 'min-w-0 font-semibold text-slate-800 whitespace-normal break-words',
      cell: (c) => (
        <div className="font-semibold text-slate-800 whitespace-normal break-words">{c.name}</div>
      ),
    },
    {
      key: 'description',
      header: 'توضیحات',
      priority: 'desktop-only',
      headerClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden lg:table-cell min-w-0 text-slate-600',
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
      headerClassName: 'w-28 xl:w-36',
      cellClassName: 'w-28 xl:w-36 text-slate-600 tabular-nums whitespace-normal break-words',
      value: (c) => formatCoursePrice(c.price),
      cell: (c) => formatCoursePrice(c.price),
    },
    {
      key: 'colors',
      header: 'رنگ‌بندی',
      priority: 'desktop-only',
      headerClassName: 'hidden xl:table-cell w-20',
      cellClassName: 'hidden xl:table-cell w-20',
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

  const subscriptionColumns: Column<Subscription>[] = [
    {
      key: 'student',
      header: 'دانش‌آموز',
      priority: 'primary',
      cellClassName: 'min-w-0 whitespace-normal break-words',
      cell: (sub) => (
        <div className="min-w-0 space-y-0.5">
          <button
            type="button"
            onClick={() => handleOpenStudentCoursesModal(sub)}
            className="font-bold text-slate-800 hover:text-[#445D84] text-start whitespace-normal break-words cursor-pointer transition-colors"
            title="مشاهده تمام دوره‌های این دانش‌آموز"
          >
            {sub.student?.name || `دانش‌آموز #${sub.student_id}`}
          </button>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {sub.student?.grade && <span>پایه {sub.student.grade}</span>}
            {sub.student?.field && <span>· {sub.student.field}</span>}
            {sub.student?.phone && (
              <span dir="ltr" className="tabular-nums font-medium text-slate-600">
                {sub.student.phone}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'دوره آموزشی',
      priority: 'secondary',
      mobileLabel: 'دوره',
      headerClassName: 'w-32 lg:w-44 xl:w-52',
      cellClassName: 'w-32 lg:w-44 xl:w-52 min-w-0 whitespace-normal break-words',
      cell: (sub) => (
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 whitespace-normal break-words">
            {sub.course?.name || `دوره #${sub.course_id}`}
          </div>
          {sub.course?.price !== undefined && sub.course?.price !== null && (
            <div className="text-xs text-slate-500 tabular-nums mt-0.5">
              {formatCoursePrice(sub.course.price)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'dates_note',
      header: 'بازه زمانی و یادداشت',
      priority: 'desktop-only',
      headerClassName: 'hidden xl:table-cell w-52',
      cellClassName: 'hidden xl:table-cell w-52 min-w-0 text-xs text-slate-600',
      cell: (sub) => (
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>شروع: {formatSubscriptionJalaliDate(sub.started_at)}</span>
            </span>
            <span>پایان: {formatSubscriptionJalaliDate(sub.end_at)}</span>
          </div>
          {sub.note && (
            <div className="text-slate-500 whitespace-normal break-words line-clamp-2">
              {sub.note}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت اشتراک',
      priority: 'secondary',
      mobileLabel: 'وضعیت',
      headerClassName: 'w-36 lg:w-44',
      cellClassName: 'w-36 lg:w-44',
      cell: (sub) => (
        <div className="flex flex-col gap-1.5">
          <div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${getSubscriptionStatusBadgeClass(
                sub.status,
                sub.is_active
              )}`}
            >
              {getSubscriptionStatusLabel(sub.status, sub.is_active)}
            </span>
          </div>
          <select
            aria-label={`تغییر وضعیت اشتراک ${sub.student?.name || sub.id}`}
            disabled={updatingStatusId === sub.id}
            value={sub.status}
            onChange={(e) =>
              handleQuickStatusChange(sub, e.target.value as SubscriptionStatus)
            }
            className="w-full px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 focus:outline-none focus:border-[#445D84] cursor-pointer disabled:opacity-50"
          >
            {SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ),
    },
  ];

  return (
    <div id="page-courses" className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <BookOpen className="w-6 h-6 shrink-0" aria-hidden="true" />
            <span>مدیریت دوره‌ها و اشتراک‌ها</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تعریف دوره‌های آموزشی، ثبت‌نام دانش‌آموزان و مدیریت وضعیت اشتراک‌ها
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeTab === 'courses' ? (
            <ActionButton
              type="button"
              onClick={openAddCourse}
              icon={<Plus className="w-4 h-4" aria-hidden="true" />}
              className="w-full sm:w-auto px-4 py-2.5"
            >
              <span>افزودن دوره</span>
            </ActionButton>
          ) : (
            <ActionButton
              type="button"
              onClick={() => openAddSubscription()}
              icon={<UserPlus className="w-4 h-4" aria-hidden="true" />}
              className="w-full sm:w-auto px-4 py-2.5"
            >
              <span>ثبت‌نام دانش‌آموز در دوره</span>
            </ActionButton>
          )}
        </div>
      </div>

      {/* Segmented Tab Bar */}
      <div
        role="tablist"
        aria-label="بخش‌های مدیریت دوره‌ها و اشتراک‌ها"
        className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs inline-flex flex-wrap gap-1.5 w-full sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'courses'}
          onClick={() => setActiveTab('courses')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'courses'
              ? 'bg-[#445D84] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>دوره‌های آموزشی ({courses.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subscriptions'}
          onClick={() => setActiveTab('subscriptions')}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'subscriptions'
              ? 'bg-[#445D84] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>اشتراک‌ها و ثبت‌نام‌ها ({subTotalRecords || subscriptions.length})</span>
        </button>
      </div>

      {/* ========================================================================
          TAB 1: COURSES CATALOG
         ======================================================================== */}
      {activeTab === 'courses' && (
        <>
          {loadingCourses ? (
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
                onClick={openAddCourse}
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
                actionsHeaderClassName="w-40 lg:w-44"
                actionsCellClassName="w-40 lg:w-44 shrink-0"
                renderActions={(c) => (
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSubCourseFilter(String(c.id));
                        setActiveTab('subscriptions');
                        loadSubscriptions(1, { course_id: String(c.id) });
                      }}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-[#445D84] hover:bg-slate-100"
                      title="مشاهده مشترکین این دوره"
                      aria-label={`مشترکین دوره ${c.name}`}
                    >
                      <Users className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => openEditCourse(c)}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                      title="ویرایش"
                      aria-label={`ویرایش دوره ${c.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => setDeleteCourseTarget(c)}
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
        </>
      )}

      {/* ========================================================================
          TAB 2: SUBSCRIPTIONS MANAGEMENT
         ======================================================================== */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500">کل اشتراک‌ها</div>
                <div className="text-xl font-extrabold text-slate-800 tabular-nums">
                  {subStats.total}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-emerald-200/80 shadow-xs flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-emerald-700 font-medium">اشتراک‌های فعال</div>
                <div className="text-xl font-extrabold text-emerald-800 tabular-nums">
                  {subStats.active}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-xs flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-amber-700 font-medium">در انتظار تأیید / معلق</div>
                <div className="text-xl font-extrabold text-amber-800 tabular-nums">
                  {subStats.pending}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-red-200/80 shadow-xs flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-red-700 font-medium">لغو / منقضی / ردشده</div>
                <div className="text-xl font-extrabold text-red-800 tabular-nums">
                  {subStats.cancelled + subStats.expired + subStats.rejected}
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadSubscriptions(1);
                  }}
                  placeholder="جستجو دانش‌آموز، موبایل، دوره یا یادداشت..."
                  className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
                />
              </div>

              <select
                aria-label="فیلتر بر اساس دوره"
                value={subCourseFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSubCourseFilter(val);
                  loadSubscriptions(1, { course_id: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">همه دوره‌های آموزشی</option>
                {courses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="فیلتر وضعیت اشتراک"
                value={subStatusFilter}
                onChange={(e) => {
                  const val = e.target.value as SubscriptionStatus | '';
                  setSubStatusFilter(val);
                  loadSubscriptions(1, { status: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">همه وضعیت‌ها</option>
                {SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="فیلتر فعال بودن اشتراک"
                value={subActiveFilter}
                onChange={(e) => {
                  const val = e.target.value as '' | '1' | '0';
                  setSubActiveFilter(val);
                  loadSubscriptions(1, { is_active: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">وضعیت دسترسی (همه)</option>
                <option value="1">فقط فعال (دارای دسترسی)</option>
                <option value="0">غیرفعال / معلق</option>
              </select>

              <div className="flex items-center gap-2">
                <ActionButton
                  type="button"
                  onClick={() => loadSubscriptions(1)}
                  loading={loadingSubs}
                  icon={<Search className="w-4 h-4" />}
                  className="flex-1 py-2.5 px-3"
                >
                  <span>جستجو</span>
                </ActionButton>
                {(subSearch || subCourseFilter || subStatusFilter || subActiveFilter) && (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={handleResetSubFilters}
                    icon={<X className="w-4 h-4" />}
                    className="py-2.5 px-3"
                    title="پاک کردن فیلترها"
                    aria-label="پاک کردن فیلترها"
                  >
                    <span>پاک‌سازی</span>
                  </ActionButton>
                )}
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => loadSubscriptions(subPage)}
                  loading={loadingSubs}
                  icon={<RefreshCw className="w-4 h-4" />}
                  className="py-2.5 px-3"
                  title="بروزرسانی لیست"
                  aria-label="بروزرسانی لیست اشتراک‌ها"
                />
              </div>
            </div>
          </div>

          {/* Subscriptions Table */}
          {loadingSubs ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : displayedSubscriptions.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Users className="w-10 h-10" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">
                هیچ اشتراکی با این مشخصات یافت نشد
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                می‌توانید دانش‌آموزان را در دوره‌های آموزشی ثبت‌نام کنید و وضعیت اشتراک آن‌ها را مدیریت نمایید.
              </p>
              <ActionButton
                type="button"
                onClick={() => openAddSubscription()}
                icon={<UserPlus className="w-4 h-4" />}
                className="px-5 py-2.5"
              >
                <span>ثبت‌نام دانش‌آموز در دوره</span>
              </ActionButton>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <DataTable
                columns={subscriptionColumns}
                data={displayedSubscriptions}
                rowKey={(sub) => sub.id}
                ariaLabel="جدول اشتراک‌ها و ثبت‌نام دوره‌ها"
                actionsHeader="عملیات"
                actionsHeaderClassName="w-36 lg:w-40"
                actionsCellClassName="w-36 lg:w-40 shrink-0"
                renderActions={(sub) => (
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => handleOpenStudentCoursesModal(sub)}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-[#445D84] hover:bg-slate-100"
                      title="مشاهده تمام دوره‌های این دانش‌آموز"
                      aria-label={`دوره‌های دانش‌آموز ${sub.student?.name || sub.student_id}`}
                    >
                      <BookOpen className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => openEditSubscription(sub)}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                      title="ویرایش اشتراک"
                      aria-label={`ویرایش اشتراک ${sub.student?.name || sub.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => setDeleteSubTarget(sub)}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                      title="حذف اشتراک"
                      aria-label={`حذف اشتراک ${sub.student?.name || sub.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </ActionButton>
                  </div>
                )}
              />

              {subTotalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="tabular-nums">
                    کل {subTotalRecords} اشتراک • صفحه {subPage} از {subTotalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      disabled={subPage <= 1 || loadingSubs}
                      onClick={() => loadSubscriptions(subPage - 1)}
                      aria-label="صفحه قبلی"
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      disabled={subPage >= subTotalPages || loadingSubs}
                      onClick={() => loadSubscriptions(subPage + 1)}
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
        </div>
      )}

      {/* ========================================================================
          ADD / EDIT COURSE MODAL
         ======================================================================== */}
      <Modal
        isOpen={isAddCourseOpen || Boolean(editingCourse)}
        onClose={() => {
          if (!submittingCourse) {
            setIsAddCourseOpen(false);
            setEditingCourse(null);
            setCourseErrors({});
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
              loading={submittingCourse}
              loadingText="در حال ذخیره..."
              className="flex-1 py-2.5 px-4"
            >
              {editingCourse ? 'ذخیره تغییرات' : 'ذخیره'}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submittingCourse}
              onClick={() => {
                setIsAddCourseOpen(false);
                setEditingCourse(null);
                setCourseErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form id="courseModalForm" noValidate onSubmit={handleSaveCourse} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              نام دوره <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: دوره جامع کنکور تجربی"
              aria-invalid={Boolean(courseErrors.name)}
              value={courseFormState.name}
              onChange={(e) => {
                setCourseFormState({ ...courseFormState, name: e.target.value });
                if (courseErrors.name) setCourseErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={getFieldClass(Boolean(courseErrors.name))}
            />
            <FieldError message={courseErrors.name} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رنگ شروع</label>
              <input
                type="color"
                value={courseFormState.gradient_color_from}
                onChange={(e) =>
                  setCourseFormState({ ...courseFormState, gradient_color_from: e.target.value })
                }
                className="w-full h-11 border-2 border-slate-200 rounded-xl cursor-pointer p-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رنگ پایان</label>
              <input
                type="color"
                value={courseFormState.gradient_color_to}
                onChange={(e) =>
                  setCourseFormState({ ...courseFormState, gradient_color_to: e.target.value })
                }
                className="w-full h-11 border-2 border-slate-200 rounded-xl cursor-pointer p-1"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">توضیحات</label>
            <textarea
              rows={3}
              value={courseFormState.description}
              onChange={(e) =>
                setCourseFormState({ ...courseFormState, description: e.target.value })
              }
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">قیمت</label>
              <input
                type="text"
                placeholder="4,500,000 تومان"
                value={courseFormState.price}
                onChange={(e) => setCourseFormState({ ...courseFormState, price: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ترتیب نمایش</label>
              <input
                type="number"
                min={0}
                aria-invalid={Boolean(courseErrors.display_order)}
                value={courseFormState.display_order}
                onChange={(e) => {
                  setCourseFormState({ ...courseFormState, display_order: e.target.value });
                  if (courseErrors.display_order)
                    setCourseErrors((prev) => ({ ...prev, display_order: undefined }));
                }}
                className={getFieldClass(Boolean(courseErrors.display_order), 'text-center')}
              />
              <FieldError message={courseErrors.display_order} />
            </div>
          </div>
        </form>
      </Modal>

      {/* ========================================================================
          ADD / EDIT SUBSCRIPTION MODAL
         ======================================================================== */}
      <Modal
        isOpen={isSubModalOpen}
        onClose={() => {
          if (!submittingSub) {
            setIsSubModalOpen(false);
            setEditingSubscription(null);
            setSubFormErrors({});
          }
        }}
        title={
          editingSubscription
            ? 'ویرایش اشتراک دوره'
            : 'ثبت‌نام دانش‌آموز در دوره آموزشی'
        }
        subtitle="تعیین دوره، وضعیت اشتراک و بازه زمانی دسترسی دانش‌آموز"
        icon={<UserPlus className="w-5 h-5" />}
        footer={
          <div className="flex items-center gap-3">
            <ActionButton
              type="submit"
              form="subscriptionModalForm"
              loading={submittingSub}
              loadingText="در حال ثبت..."
              className="flex-1 py-2.5 px-4"
            >
              {editingSubscription ? 'ذخیره تغییرات اشتراک' : 'ثبت‌نام در دوره'}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submittingSub}
              onClick={() => {
                setIsSubModalOpen(false);
                setEditingSubscription(null);
                setSubFormErrors({});
              }}
              className="py-2.5 px-5"
            >
              انصراف
            </ActionButton>
          </div>
        }
      >
        <form
          id="subscriptionModalForm"
          noValidate
          onSubmit={handleSaveSubscription}
          className="space-y-4"
        >
          {/* Student Selection with Quick Search */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              دانش‌آموز <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={studentSearchTerm}
              onChange={(e) => setStudentSearchTerm(e.target.value)}
              placeholder="فیلتر سریع نام یا موبایل دانش‌آموز..."
              className="w-full px-3 py-2 mb-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:outline-none focus:border-[#445D84]"
            />
            <select
              aria-label="انتخاب دانش‌آموز برای اشتراک"
              aria-invalid={Boolean(subFormErrors.student_id)}
              value={subForm.student_id}
              onChange={(e) => {
                setSubForm({ ...subForm, student_id: e.target.value });
                if (subFormErrors.student_id) {
                  setSubFormErrors((prev) => ({ ...prev, student_id: undefined }));
                }
              }}
              className={getFieldClass(Boolean(subFormErrors.student_id))}
            >
              <option value="">انتخاب دانش‌آموز...</option>
              {editingSubscription &&
                !filteredStudentsForSelect.some(
                  (s) => String(s.id) === String(editingSubscription.student_id)
                ) && (
                  <option value={String(editingSubscription.student_id)}>
                    {editingSubscription.student?.name ||
                      `دانش‌آموز #${editingSubscription.student_id}`}
                  </option>
                )}
              {filteredStudentsForSelect.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} — پایه {s.grade} {s.field} ({s.phone})
                </option>
              ))}
            </select>
            <FieldError message={subFormErrors.student_id} />
          </div>

          {/* Course Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              دوره آموزشی <span className="text-red-500">*</span>
            </label>
            <select
              aria-label="انتخاب دوره آموزشی برای اشتراک"
              aria-invalid={Boolean(subFormErrors.course_id)}
              value={subForm.course_id}
              onChange={(e) => {
                setSubForm({ ...subForm, course_id: e.target.value });
                if (subFormErrors.course_id) {
                  setSubFormErrors((prev) => ({ ...prev, course_id: undefined }));
                }
              }}
              className={getFieldClass(Boolean(subFormErrors.course_id))}
            >
              <option value="">انتخاب دوره آموزشی...</option>
              {courses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({formatCoursePrice(c.price)})
                </option>
              ))}
            </select>
            <FieldError message={subFormErrors.course_id} />
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              وضعیت اشتراک
            </label>
            <select
              aria-label="وضعیت اشتراک دوره"
              value={subForm.status}
              onChange={(e) =>
                setSubForm({ ...subForm, status: e.target.value as SubscriptionStatus })
              }
              className={getFieldClass(false)}
            >
              {SUBSCRIPTION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start & End Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تاریخ شروع (اختیاری)
              </label>
              <input
                type="date"
                value={subForm.started_at}
                onChange={(e) => setSubForm({ ...subForm, started_at: e.target.value })}
                className={getFieldClass(false)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تاریخ پایان (اختیاری)
              </label>
              <input
                type="date"
                aria-invalid={Boolean(subFormErrors.end_at)}
                value={subForm.end_at}
                onChange={(e) => {
                  setSubForm({ ...subForm, end_at: e.target.value });
                  if (subFormErrors.end_at) {
                    setSubFormErrors((prev) => ({ ...prev, end_at: undefined }));
                  }
                }}
                className={getFieldClass(Boolean(subFormErrors.end_at))}
              />
              <FieldError message={subFormErrors.end_at} />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              یادداشت یا توضیحات اشتراک (اختیاری)
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="توضیحات پرداخت، شماره فیش، تخفیف یا شرایط ثبت‌نام..."
              value={subForm.note}
              onChange={(e) => {
                setSubForm({ ...subForm, note: e.target.value });
                if (subFormErrors.note) {
                  setSubFormErrors((prev) => ({ ...prev, note: undefined }));
                }
              }}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
            <FieldError message={subFormErrors.note} />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteCourseTarget)}
        title="حذف دوره"
        message={`آیا از حذف دوره «${deleteCourseTarget?.name || ''}» اطمینان دارید؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDeleteCourse}
        onCancel={() => setDeleteCourseTarget(null)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteSubTarget)}
        title="حذف اشتراک دوره"
        message={`آیا از حذف اشتراک دوره «${deleteSubTarget?.course?.name || ''}» برای دانش‌آموز «${deleteSubTarget?.student?.name || ''}» اطمینان دارید؟`}
        confirmText="حذف اشتراک"
        variant="danger"
        onConfirm={confirmDeleteSubscription}
        onCancel={() => setDeleteSubTarget(null)}
      />

      <StudentSubscriptionsModal
        student={selectedStudentForModal}
        isOpen={Boolean(selectedStudentForModal)}
        onClose={() => setSelectedStudentForModal(null)}
        showToast={showToast}
        onSubscriptionsChanged={() => loadSubscriptions(subPage)}
      />
    </div>
  );
};
