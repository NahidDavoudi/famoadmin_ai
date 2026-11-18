import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Headset,
  Plus,
  Check,
  Clock3,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  X,
  Users,
  UserCheck,
  UserMinus,
  History,
  Sparkles,
  Search,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import API from '../lib/api';
import { validateSupporterForm, type FieldErrors } from '../lib/form-validation';
import { fileToAvatarDataUrl, resolveEntityImageUrl } from '../lib/image-upload';
import {
  computeAssignmentStats,
  formatAssignmentJalaliDate,
} from '../lib/assignments';
import type {
  AcademicField,
  AssignmentFilterStatus,
  AssignmentInitialFillReport,
  AssignmentStudentRow,
  Supporter,
  ToastType,
} from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';
import { StudentAssignmentModal } from '../components/StudentAssignmentModal';

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
type SupportersTab = 'supporters' | 'assignments';

const INITIAL_FILL_OUTCOME_STYLES: Record<
  string,
  { label: string; badgeClass: string }
> = {
  assigned: {
    label: 'تخصیص یافت',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  would_assign: {
    label: 'آماده تخصیص (پیش‌نمایش)',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  no_match: {
    label: 'بدون پشتیبان هم‌پایه و هم‌رشته',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  ambiguous: {
    label: 'چند پشتیبان هم‌پایه/رشته (نیازمند انتخاب دستی)',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  skipped: {
    label: 'دارای پشتیبان از قبل / ردشده',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export const SupportersPage: React.FC<SupportersPageProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<SupportersTab>('supporters');

  // Supporters Tab State
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSupporter, setEditingSupporter] = useState<Supporter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supporter | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    phone: '',
    grade: '12',
    field: '' as AcademicField | '',
    description: '',
    image_url: '',
    is_active: 1,
    chat_id: '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors<SupporterFieldKey>>({});

  // Supporter's Assigned Students Modal State (GET /api/v1/assignments/supporters/{supporterId}/students)
  const [viewingSupporterStudents, setViewingSupporterStudents] = useState<Supporter | null>(null);
  const [supporterStudentsList, setSupporterStudentsList] = useState<AssignmentStudentRow[]>([]);
  const [supporterStudentsLoading, setSupporterStudentsLoading] = useState(false);

  // Assignments Tab State (GET /api/v1/assignments/students)
  const [assignmentRows, setAssignmentRows] = useState<AssignmentStudentRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AssignmentFilterStatus>('all');
  const [supporterFilter, setSupporterFilter] = useState<string>('');
  const [fieldFilter, setFieldFilter] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);

  // Student Assignment & History Modal State
  const [selectedStudentForAssignment, setSelectedStudentForAssignment] =
    useState<AssignmentStudentRow | null>(null);
  const [unassignConfirmTarget, setUnassignConfirmTarget] =
    useState<AssignmentStudentRow | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  // Initial Fill Modal State (POST /api/v1/assignments/initial-fill)
  const [isInitialFillOpen, setIsInitialFillOpen] = useState(false);
  const [onlyUnassignedFill, setOnlyUnassignedFill] = useState(true);
  const [initialFillRunning, setInitialFillRunning] = useState(false);
  const [initialFillReport, setInitialFillReport] =
    useState<AssignmentInitialFillReport | null>(null);

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

  const loadAssignments = useCallback(
    async (
      targetPage = 1,
      overrides?: {
        status?: AssignmentFilterStatus;
        supporter_id?: string;
        field?: string;
        grade?: string;
        search?: string;
        include_inactive?: boolean;
      }
    ) => {
      setAssignmentsLoading(true);
      try {
        const activeStatus = overrides?.status !== undefined ? overrides.status : statusFilter;
        const activeSupporter =
          overrides?.supporter_id !== undefined ? overrides.supporter_id : supporterFilter;
        const activeField = overrides?.field !== undefined ? overrides.field : fieldFilter;
        const activeGrade = overrides?.grade !== undefined ? overrides.grade : gradeFilter;
        const activeSearch = overrides?.search !== undefined ? overrides.search : searchFilter;
        const activeInactive =
          overrides?.include_inactive !== undefined ? overrides.include_inactive : includeInactive;

        const res = await API.getAssignmentStudents({
          status: activeStatus,
          supporter_id: activeSupporter ? Number(activeSupporter) : undefined,
          field: activeField || undefined,
          grade: activeGrade ? Number(activeGrade) : undefined,
          search: activeSearch.trim() || undefined,
          include_inactive: activeInactive,
          page: targetPage,
          per_page: 20,
        });
        setAssignmentRows(res.data || []);
        setPage(targetPage);
        setTotalPages(res.pagination?.total_pages || 1);
        setTotalRecords(res.pagination?.total ?? (res.data || []).length);
      } catch (err) {
        showToast((err as Error).message || 'خطا در بارگذاری لیست تخصیص پشتیبان‌ها', 'error');
      } finally {
        setAssignmentsLoading(false);
      }
    },
    [
      statusFilter,
      supporterFilter,
      fieldFilter,
      gradeFilter,
      searchFilter,
      includeInactive,
      showToast,
    ]
  );

  const loadSupporterAssignedStudents = useCallback(
    async (supporter: Supporter) => {
      setViewingSupporterStudents(supporter);
      setSupporterStudentsLoading(true);
      try {
        const res = await API.getSupporterAssignedStudents(supporter.id);
        setSupporterStudentsList(res.data || []);
      } catch (err) {
        showToast(
          (err as Error).message || 'خطا در دریافت لیست دانش‌آموزان پشتیبان',
          'error'
        );
        setSupporterStudentsList([]);
      } finally {
        setSupporterStudentsLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadSupporters();
  }, [loadSupporters]);

  useEffect(() => {
    if (activeTab === 'assignments') {
      loadAssignments(1);
    }
  }, [activeTab, loadAssignments]);

  const totalReplied = supporters.reduce((sum, s) => sum + Number(s.replied_count || 0), 0);
  const totalPending = supporters.reduce((sum, s) => sum + Number(s.pending_count || 0), 0);

  const assignmentStats = useMemo(
    () => computeAssignmentStats(assignmentRows),
    [assignmentRows]
  );

  const openAdd = () => {
    setErrors({});
    setSelectedImageFile(null);
    setFormState({
      name: '',
      phone: '',
      grade: '12',
      field: '',
      description: '',
      image_url: '',
      is_active: 1,
      chat_id: '',
      password: '',
    });
    setShowPassword(false);
    setIsAddOpen(true);
  };

  const openEdit = (s: Supporter) => {
    setErrors({});
    setSelectedImageFile(null);
    setEditingSupporter(s);
    setFormState({
      name: String(s.name ?? ''),
      phone: String(s.phone ?? ''),
      grade: String(s.grade ?? '12'),
      field: (s.field as AcademicField) || '',
      description: String(s.description ?? ''),
      image_url: String(s.avatar_url || s.avatar || ''),
      is_active: s.is_active === false || s.is_active === 0 ? 0 : 1,
      chat_id: s.chat_id !== null && s.chat_id !== undefined ? String(s.chat_id) : '',
      password: '',
    });
    setShowPassword(false);
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

    const validationErrors = validateSupporterForm(formState, Boolean(editingSupporter));
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً خطاهای فرم پشتیبان را برطرف کنید', 'error');
      return;
    }

    const trimmedChatId = String(formState.chat_id ?? '').trim();
    const trimmedPhone = String(formState.phone ?? '').trim();
    const trimmedDescription = String(formState.description ?? '').trim();

    setSubmitting(true);
    try {
      if (editingSupporter) {
        await API.updateSupporter(editingSupporter.id, {
          name: String(formState.name ?? '').trim(),
          phone: trimmedPhone || null,
          grade: Number(formState.grade),
          field: formState.field as AcademicField,
          description: trimmedDescription,
          is_active: formState.is_active ? 1 : 0,
          chat_id: trimmedChatId || null,
          password: formState.password || undefined,
          image: selectedImageFile,
          image_url: formState.image_url,
          avatar: selectedImageFile || formState.image_url,
          avatar_url: formState.image_url,
        });
        setEditingSupporter(null);
        setSelectedImageFile(null);
        showToast('اطلاعات پشتیبان ذخیره شد', 'success');
      } else {
        await API.addSupporter({
          name: String(formState.name ?? '').trim(),
          phone: trimmedPhone,
          grade: Number(formState.grade),
          field: formState.field as AcademicField,
          description: trimmedDescription,
          chat_id: trimmedChatId || null,
          image: selectedImageFile,
          image_url: formState.image_url,
          avatar: selectedImageFile || formState.image_url,
          avatar_url: formState.image_url,
        });
        setIsAddOpen(false);
        setSelectedImageFile(null);
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

  const handleConfirmQuickUnassign = async () => {
    if (!unassignConfirmTarget || unassigning) return;
    setUnassigning(true);
    try {
      await API.unassignStudentSupporter(unassignConfirmTarget.student_id);
      showToast(`تخصیص پشتیبان دانش‌آموز «${unassignConfirmTarget.name}» لغو شد`, 'success');
      setUnassignConfirmTarget(null);
      if (activeTab === 'assignments') {
        await loadAssignments(page);
      }
      if (viewingSupporterStudents) {
        await loadSupporterAssignedStudents(viewingSupporterStudents);
      }
    } catch (err) {
      showToast((err as Error).message || 'خطا در لغو تخصیص پشتیبان', 'error');
    } finally {
      setUnassigning(false);
    }
  };

  const handleRunInitialFill = async (dryRun: boolean) => {
    if (initialFillRunning) return;
    setInitialFillRunning(true);
    try {
      const res = await API.runAssignmentInitialFill({
        dry_run: dryRun,
        only_unassigned: onlyUnassignedFill,
      });
      setInitialFillReport(res.data);
      if (dryRun) {
        showToast('پیش‌نمایش تخصیص خودکار محاسبه شد', 'info');
      } else {
        showToast(
          `${res.data.assigned_count} دانش‌آموز به‌صورت خودکار به پشتیبان هم‌پایه و هم‌رشته تخصیص یافتند`,
          'success'
        );
        await loadAssignments(1);
      }
    } catch (err) {
      showToast((err as Error).message || 'خطا در اجرای تخصیص خودکار اولیه', 'error');
    } finally {
      setInitialFillRunning(false);
    }
  };

  const handleClearAssignmentFilters = async () => {
    setStatusFilter('all');
    setSupporterFilter('');
    setFieldFilter('');
    setGradeFilter('');
    setSearchFilter('');
    setIncludeInactive(false);
    await loadAssignments(1, {
      status: 'all',
      supporter_id: '',
      field: '',
      grade: '',
      search: '',
      include_inactive: false,
    });
  };

  const supporterColumns: Column<Supporter>[] = [
    {
      key: 'name',
      header: 'نام پشتیبان',
      priority: 'primary',
      headerClassName: 'w-32 lg:w-44 xl:w-56',
      cellClassName: 'w-32 lg:w-44 xl:w-56 font-semibold text-slate-800 whitespace-normal break-words',
      cell: (s) => {
        const imgSrc = resolveEntityImageUrl(s.avatar_url || s.avatar);
        return (
          <div className="flex items-center gap-2 min-w-0">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={s.name}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 bg-slate-100"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#E2D9C6] flex items-center justify-center text-[#445D84] font-bold text-xs shrink-0">
                {s.name.charAt(0)}
              </div>
            )}
            <span className="min-w-0 whitespace-normal break-words">{s.name}</span>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'شماره تماس',
      priority: 'secondary',
      mobileLabel: 'شماره تماس',
      headerClassName: 'hidden lg:table-cell w-28 xl:w-32',
      cellClassName: 'hidden lg:table-cell w-28 xl:w-32 tabular-nums text-slate-600',
      value: (s) => s.phone || '-',
      cell: (s) => (
        <span dir="ltr" className="inline-block break-all">
          {s.phone || '-'}
        </span>
      ),
    },
    {
      key: 'field',
      header: 'پایه و رشته',
      priority: 'secondary',
      mobileLabel: 'پایه و رشته',
      headerClassName: 'w-24 lg:w-28 xl:w-32',
      cellClassName: 'w-24 lg:w-28 xl:w-32 text-slate-600 whitespace-normal break-words',
      cell: (s) => (
        <span className="whitespace-normal break-words">
          پایه {s.grade} • {s.field}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'توضیحات',
      priority: 'desktop-only',
      headerClassName: 'hidden lg:table-cell',
      cellClassName: 'hidden lg:table-cell min-w-0 text-slate-600',
      cell: (s) => (
        <div className="whitespace-normal break-words line-clamp-2 max-w-prose text-xs text-slate-600 leading-relaxed">
          {s.description || '—'}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'وضعیت',
      priority: 'secondary',
      mobileLabel: 'وضعیت',
      headerClassName: 'w-16 lg:w-20',
      cellClassName: 'w-16 lg:w-20',
      cell: (s) => {
        const active = s.is_active !== false && s.is_active !== 0;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
              active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {active ? 'فعال' : 'غیرفعال'}
          </span>
        );
      },
    },
    {
      key: 'reports',
      header: 'گزارش‌ها',
      priority: 'desktop-only',
      headerClassName: 'hidden xl:table-cell w-20 xl:w-24',
      cellClassName: 'hidden xl:table-cell w-20 xl:w-24 tabular-nums',
      cell: (s) => (
        <span>
          <span className="text-emerald-600 font-semibold">{s.replied_count ?? 0}</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className="text-amber-600 font-semibold">{s.pending_count ?? 0}</span>
        </span>
      ),
    },
  ];

  const assignmentColumns: Column<AssignmentStudentRow>[] = [
    {
      key: 'name',
      header: 'دانش‌آموز',
      priority: 'primary',
      cellClassName: 'min-w-0 font-semibold text-slate-800 whitespace-normal break-words',
      cell: (row) => (
        <div className="min-w-0">
          <div className="whitespace-normal break-words">{row.name}</div>
          {row.is_active === 0 && (
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
              حساب غیرفعال
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'grade_field',
      header: 'پایه و رشته',
      priority: 'secondary',
      mobileLabel: 'پایه و رشته',
      headerClassName: 'w-24 lg:w-28 text-center',
      cellClassName: 'w-24 lg:w-28 text-center text-xs font-medium text-slate-700',
      cell: (row) => (
        <span className="whitespace-normal break-words">
          پایه {row.grade} • {row.field}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'موبایل / کد ملی',
      priority: 'desktop-only',
      headerClassName: 'hidden lg:table-cell w-28 xl:w-32 text-center',
      cellClassName: 'hidden lg:table-cell w-28 xl:w-32 text-center tabular-nums',
      cell: (row) => (
        <div className="flex flex-col items-center text-xs tabular-nums" dir="ltr">
          <span className="text-slate-700 font-medium">{row.phone || '—'}</span>
          {row.national_id && <span className="text-slate-400">{row.national_id}</span>}
        </div>
      ),
    },
    {
      key: 'supporter',
      header: 'پشتیبان فعلی',
      priority: 'secondary',
      mobileLabel: 'پشتیبان فعلی',
      headerClassName: 'w-40 lg:w-52',
      cellClassName: 'w-40 lg:w-52 min-w-0',
      cell: (row) => {
        if (!row.supporter_id) {
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
              <span>بدون پشتیبان</span>
            </span>
          );
        }
        return (
          <div className="min-w-0 space-y-0.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold max-w-full">
              <Headset className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{row.supporter_name || `#${row.supporter_id}`}</span>
            </div>
            {row.assigned_at && (
              <div className="text-[11px] text-slate-500 ps-1 truncate">
                از {formatAssignmentJalaliDate(row.assigned_at)}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const previewInitial = formState.name ? formState.name.trim().charAt(0) : 'پ';
  const resolvedPreview = resolveEntityImageUrl(formState.image_url);

  return (
    <div id="page-supporters" className="space-y-6">
      {/* Top Header + Tabs */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <Headset className="w-6 h-6" aria-hidden="true" />
            <span>پشتیبان‌ها و تخصیص دانش‌آموز</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مدیریت پشتیبان‌های تحصیلی، تخصیص دانش‌آموز به پشتیبان، تاریخچه تغییرات و تخصیص خودکار اولیه
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <div
          role="tablist"
          aria-label="بخش‌های مدیریت پشتیبان‌ها"
          className="inline-flex p-1 rounded-xl bg-slate-200/80 border border-slate-300/60 w-full sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            id="tab-supporters-list"
            aria-selected={activeTab === 'supporters'}
            onClick={() => setActiveTab('supporters')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'supporters'
                ? 'bg-[#445D84] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Headset className="w-4 h-4" />
            <span>پشتیبان‌های تحصیلی ({supporters.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            id="tab-student-assignments"
            aria-selected={activeTab === 'assignments'}
            onClick={() => setActiveTab('assignments')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'assignments'
                ? 'bg-[#445D84] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>تخصیص دانش‌آموز به پشتیبان</span>
          </button>
        </div>
      </div>

      {activeTab === 'supporters' ? (
        <>
          {/* Action bar for Supporters tab */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#445D84] text-white flex items-center justify-center shrink-0">
                  <Headset className="w-5 h-5" />
                </div>
                <div>
                  <div id="stat-supporters" className="text-xl font-bold text-[#445D84] tabular-nums">
                    {supporters.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">تعداد پشتیبان‌ها</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <div
                    id="stat-supporters-replied"
                    className="text-xl font-bold text-emerald-600 tabular-nums"
                  >
                    {totalReplied}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">گزارش‌های پاسخ‌داده شده</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Clock3 className="w-5 h-5" />
                </div>
                <div>
                  <div
                    id="stat-supporters-pending"
                    className="text-xl font-bold text-amber-600 tabular-nums"
                  >
                    {totalPending}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">گزارش‌های در انتظار</div>
                </div>
              </div>
            </div>
            <ActionButton
              type="button"
              onClick={openAdd}
              icon={<Plus className="w-4 h-4" />}
              className="w-full sm:w-auto px-4 py-2.5 shrink-0"
            >
              <span>افزودن پشتیبان</span>
            </ActionButton>
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
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <DataTable
                columns={supporterColumns}
                data={supporters}
                rowKey={(s) => s.id}
                ariaLabel="جدول پشتیبان‌ها"
                actionsHeader="عملیات"
                actionsHeaderClassName="w-28 lg:w-36 text-center"
                actionsCellClassName="w-28 lg:w-36 shrink-0"
                renderActions={(s) => (
                  <div className="flex items-center justify-center gap-1 shrink-0">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => loadSupporterAssignedStudents(s)}
                      className="min-w-11 min-h-11 p-2.5 rounded-xl text-[#445D84] hover:bg-slate-100"
                      title="مشاهده دانش‌آموزان این پشتیبان"
                      aria-label={`دانش‌آموزان پشتیبان ${s.name}`}
                    >
                      <Users className="w-4 h-4" />
                    </ActionButton>
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
        </>
      ) : (
        /* Assignments Tab */
        <div className="space-y-5">
          {/* KPI Stats + Auto-fill Trigger */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">دانش‌آموزان این صفحه / کل</div>
                  <div className="text-xl font-bold text-[#445D84] tabular-nums mt-0.5">
                    {assignmentStats.total} <span className="text-xs font-normal text-slate-400">از {totalRecords}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#445D84] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">دارای پشتیبان (در صفحه)</div>
                  <div className="text-xl font-bold text-emerald-600 tabular-nums mt-0.5">
                    {assignmentStats.assigned}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">بدون پشتیبان (در صفحه)</div>
                  <div className="text-xl font-bold text-amber-600 tabular-nums mt-0.5">
                    {assignmentStats.unassigned}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <UserMinus className="w-5 h-5" />
                </div>
              </div>
            </div>

            <ActionButton
              type="button"
              onClick={() => {
                setInitialFillReport(null);
                setIsInitialFillOpen(true);
              }}
              icon={<Sparkles className="w-4 h-4" />}
              className="px-4 py-3 shrink-0"
            >
              <span>تخصیص خودکار اولیه (پایه و رشته)</span>
            </ActionButton>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadAssignments(1);
                }}
                placeholder="جستجو نام، موبایل یا کد ملی..."
                className="px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />

              <select
                aria-label="وضعیت تخصیص پشتیبان"
                value={statusFilter}
                onChange={(e) => {
                  const val = e.target.value as AssignmentFilterStatus;
                  setStatusFilter(val);
                  loadAssignments(1, { status: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="all">همه وضعیت‌ها (دارای پشتیبان + بدون پشتیبان)</option>
                <option value="assigned">فقط دارای پشتیبان</option>
                <option value="unassigned">فقط بدون پشتیبان</option>
              </select>

              <select
                aria-label="فیلتر بر اساس پشتیبان"
                value={supporterFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSupporterFilter(val);
                  loadAssignments(1, { supporter_id: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">همه پشتیبان‌ها</option>
                {supporters.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} (پایه {s.grade} - {s.field})
                  </option>
                ))}
              </select>

              <select
                aria-label="فیلتر رشته دانش‌آموز"
                value={fieldFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setFieldFilter(val);
                  loadAssignments(1, { field: val });
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

              <select
                aria-label="فیلتر پایه دانش‌آموز"
                value={gradeFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setGradeFilter(val);
                  loadAssignments(1, { grade: val });
                }}
                className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">همه پایه‌ها</option>
                <option value="7">پایه هفتم</option>
                <option value="8">پایه هشتم</option>
                <option value="9">پایه نهم</option>
                <option value="10">پایه دهم</option>
                <option value="11">پایه یازدهم</option>
                <option value="12">پایه دوازدهم</option>
              </select>

              <div className="flex items-center gap-2">
                <ActionButton
                  type="button"
                  onClick={() => loadAssignments(1)}
                  loading={assignmentsLoading}
                  loadingText="..."
                  icon={<Search className="w-4 h-4" />}
                  className="flex-1 py-2.5 px-3"
                >
                  <span>جستجو</span>
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={handleClearAssignmentFilters}
                  className="py-2.5 px-3"
                  title="پاک کردن فیلترها"
                  aria-label="پاک کردن فیلترها"
                >
                  <X className="w-4 h-4" />
                </ActionButton>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeInactive(checked);
                    loadAssignments(1, { include_inactive: checked });
                  }}
                  className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
                />
                <span>نمایش دانش‌آموزان غیرفعال</span>
              </label>

              {supporterFilter && (
                <span className="text-xs font-medium text-[#445D84]">
                  فیلتر فعال بر اساس پشتیبان انتخاب‌شده
                </span>
              )}
            </div>
          </div>

          {/* Assignments DataTable */}
          {assignmentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-14 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : assignmentRows.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-700 mb-1">
                دانش‌آموزی با این شرایط یافت نشد
              </h3>
              <p className="text-xs text-slate-500">
                فیلترهای وضعیت تخصیص، پایه یا رشته را تغییر دهید.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <DataTable
                columns={assignmentColumns}
                data={assignmentRows}
                rowKey={(row) => row.student_id}
                ariaLabel="جدول تخصیص دانش‌آموزان به پشتیبان"
                actionsHeader="عملیات تخصیص"
                actionsHeaderClassName="w-28 lg:w-36 text-center"
                actionsCellClassName="w-28 lg:w-36 shrink-0"
                renderActions={(row) => {
                  const hasActiveSupporter = Boolean(row.supporter_id);
                  return (
                    <div className="flex items-center justify-center gap-1 shrink-0">
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedStudentForAssignment(row)}
                        className="min-w-11 min-h-11 p-2.5 rounded-xl text-[#445D84] hover:bg-slate-100"
                        title={
                          hasActiveSupporter
                            ? 'تغییر پشتیبان و مشاهده تاریخچه'
                            : 'تخصیص پشتیبان و تاریخچه'
                        }
                        aria-label={`تخصیص یا تغییر پشتیبان ${row.name}`}
                      >
                        <UserCheck className="w-4 h-4" />
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedStudentForAssignment(row)}
                        className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                        title="تاریخچه تغییرات پشتیبان"
                        aria-label={`تاریخچه پشتیبان ${row.name}`}
                      >
                        <History className="w-4 h-4" />
                      </ActionButton>
                      {hasActiveSupporter && (
                        <ActionButton
                          type="button"
                          variant="ghost"
                          onClick={() => setUnassignConfirmTarget(row)}
                          className="min-w-11 min-h-11 p-2.5 rounded-xl text-rose-600 hover:bg-rose-50"
                          title="لغو تخصیص پشتیبان فعلی"
                          aria-label={`لغو تخصیص پشتیبان ${row.name}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </ActionButton>
                      )}
                    </div>
                  );
                }}
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="tabular-nums">
                    کل {totalRecords} دانش‌آموز • صفحه {page} از {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      disabled={page <= 1 || assignmentsLoading}
                      onClick={() => loadAssignments(page - 1)}
                      aria-label="صفحه قبلی"
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      disabled={page >= totalPages || assignmentsLoading}
                      onClick={() => loadAssignments(page + 1)}
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

      {/* Add / Edit Supporter Modal */}
      <Modal
        isOpen={isAddOpen || Boolean(editingSupporter)}
        onClose={() => {
          if (!submitting) {
            setIsAddOpen(false);
            setEditingSupporter(null);
            setSelectedImageFile(null);
            setErrors({});
          }
        }}
        title={editingSupporter ? 'ویرایش پشتیبان' : 'افزودن پشتیبان جدید'}
        subtitle="اطلاعات پشتیبان تحصیلی"
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
        <form id="supporterModalForm" noValidate onSubmit={handleSave} className="space-y-4">
          {/* Avatar / Image Upload */}
          <div className="flex items-center gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            {resolvedPreview ? (
              <img
                src={resolvedPreview}
                alt="پیش‌نمایش تصویر پشتیبان"
                className="w-14 h-14 rounded-full object-cover border border-slate-200 shrink-0 bg-white"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#E2D9C6] flex items-center justify-center text-[#445D84] font-bold text-lg shrink-0">
                {previewInitial}
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-xs font-bold text-slate-700">تصویر پروفایل پشتیبان (اختیاری)</div>
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
            <label className="block text-xs font-medium text-slate-600 mb-1">توضیحات</label>
            <textarea
              rows={3}
              placeholder="سوابق، تخصص یا توضیحات تکمیلی پشتیبان..."
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
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

      {/* Modal: Supporter's Assigned Students (GET /api/v1/assignments/supporters/{supporterId}/students) */}
      <Modal
        isOpen={Boolean(viewingSupporterStudents)}
        onClose={() => setViewingSupporterStudents(null)}
        title={
          viewingSupporterStudents
            ? `دانش‌آموزان تحت پوشش «${viewingSupporterStudents.name}»`
            : 'دانش‌آموزان پشتیبان'
        }
        subtitle={
          viewingSupporterStudents
            ? `پایه ${viewingSupporterStudents.grade} • رشته ${viewingSupporterStudents.field}`
            : ''
        }
        icon={<Users className="w-5 h-5" />}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            {viewingSupporterStudents && (
              <ActionButton
                type="button"
                onClick={() => {
                  const targetSupporterId = String(viewingSupporterStudents.id);
                  setViewingSupporterStudents(null);
                  setSupporterFilter(targetSupporterId);
                  setStatusFilter('assigned');
                  setActiveTab('assignments');
                  loadAssignments(1, {
                    status: 'assigned',
                    supporter_id: targetSupporterId,
                  });
                }}
                icon={<UserCheck className="w-4 h-4" />}
                className="py-2 px-4"
              >
                <span>مدیریت و تخصیص دانش‌آموز جدید در تب تخصیص</span>
              </ActionButton>
            )}
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => setViewingSupporterStudents(null)}
              className="py-2 px-5"
            >
              بستن
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {supporterStudentsLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : supporterStudentsList.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-slate-200/80 text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <div className="text-sm font-bold text-slate-700">
                هیچ دانش‌آموزی به این پشتیبان تخصیص داده نشده است
              </div>
              <p className="text-xs text-slate-500 mt-1">
                از تب «تخصیص دانش‌آموز به پشتیبان» می‌توانید دانش‌آموزان را به این پشتیبان متصل کنید.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pe-1">
              <div className="text-xs font-bold text-slate-600 mb-2">
                تعداد دانش‌آموزان فعال این پشتیبان: {supporterStudentsList.length} نفر
              </div>
              {supporterStudentsList.map((stu) => (
                <div
                  key={stu.student_id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{stu.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                        پایه {stu.grade} • {stu.field}
                      </span>
                      {stu.phone && (
                        <span className="text-xs text-slate-500 tabular-nums" dir="ltr">
                          {stu.phone}
                        </span>
                      )}
                    </div>
                    {stu.assigned_at && (
                      <div className="text-[11px] text-slate-500">
                        تاریخ تخصیص: {formatAssignmentJalaliDate(stu.assigned_at)}
                        {stu.note ? ` • یادداشت: ${stu.note}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ActionButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedStudentForAssignment(stu)}
                      icon={<History className="w-3.5 h-3.5" />}
                      className="px-3 py-1.5"
                    >
                      <span>تغییر / تاریخچه</span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setUnassignConfirmTarget(stu)}
                      icon={<UserMinus className="w-3.5 h-3.5" />}
                      className="px-2.5 py-1.5"
                    >
                      <span>لغو تخصیص</span>
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Initial Fill (POST /api/v1/assignments/initial-fill) */}
      <Modal
        isOpen={isInitialFillOpen}
        onClose={() => {
          if (!initialFillRunning) setIsInitialFillOpen(false);
        }}
        title="تخصیص خودکار اولیه بر اساس پایه و رشته"
        subtitle="تطبیق هوشمند دانش‌آموزان با پشتیبان‌های فعالِ هم‌پایه و هم‌رشته"
        icon={<Sparkles className="w-5 h-5" />}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                loading={initialFillRunning}
                loadingText="در حال بررسی..."
                onClick={() => handleRunInitialFill(true)}
                icon={<Eye className="w-4 h-4" />}
                className="py-2.5 px-4"
              >
                <span>پیش‌نمایش آزمایشی (Dry Run)</span>
              </ActionButton>
              <ActionButton
                type="button"
                loading={initialFillRunning}
                loadingText="در حال تخصیص..."
                onClick={() => handleRunInitialFill(false)}
                icon={<Sparkles className="w-4 h-4" />}
                className="py-2.5 px-4"
              >
                <span>اجرای نهایی تخصیص خودکار</span>
              </ActionButton>
            </div>
            <ActionButton
              type="button"
              variant="ghost"
              disabled={initialFillRunning}
              onClick={() => setIsInitialFillOpen(false)}
              className="py-2 px-4"
            >
              بستن
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed space-y-2">
            <p>
              این ابزار دانش‌آموزان را بر اساس <strong>پایه تحصیلی</strong> و{' '}
              <strong>رشته</strong> با پشتیبان‌های فعال تطبیق می‌دهد. در صورتی که برای یک پایه و رشته
              دقیقاً یک پشتیبان فعال وجود داشته باشد، تخصیص انجام می‌شود.
            </p>
            <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={onlyUnassignedFill}
                onChange={(e) => setOnlyUnassignedFill(e.target.checked)}
                className="rounded border-slate-300 text-[#445D84] focus:ring-[#445D84]"
              />
              <span>فقط دانش‌آموزان بدون پشتیبان فعال بررسی شوند (پیشنهادی)</span>
            </label>
          </div>

          {initialFillReport && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold ${
                  initialFillReport.dry_run
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {initialFillReport.dry_run ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {initialFillReport.dry_run
                    ? 'نتیجه پیش‌نمایش آزمایشی (هنوز در دیتابیس ذخیره نشده است)'
                    : 'تخصیص خودکار با موفقیت در سامانه ثبت شد'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-lg font-bold text-slate-800 tabular-nums">
                    {initialFillReport.total_candidates}
                  </div>
                  <div className="text-[11px] text-slate-500">بررسی‌شده</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-lg font-bold text-emerald-700 tabular-nums">
                    {initialFillReport.assigned_count}
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    {initialFillReport.dry_run ? 'قابل تخصیص' : 'تخصیص‌یافته'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-lg font-bold text-amber-700 tabular-nums">
                    {initialFillReport.no_match_count}
                  </div>
                  <div className="text-[11px] text-amber-700">بدون پشتیبان منطبق</div>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="text-lg font-bold text-purple-700 tabular-nums">
                    {initialFillReport.ambiguous_count}
                  </div>
                  <div className="text-[11px] text-purple-700">چند پشتیبان مشابه</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 col-span-2 sm:col-span-1">
                  <div className="text-lg font-bold text-slate-700 tabular-nums">
                    {initialFillReport.skipped_count}
                  </div>
                  <div className="text-[11px] text-slate-600">ردشده / دارای پشتیبان</div>
                </div>
              </div>

              {initialFillReport.items.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                  <div className="text-xs font-bold text-slate-600">
                    جزئیات دانش‌آموزان بررسی‌شده ({initialFillReport.items.length} مورد)
                  </div>
                  {initialFillReport.items.map((item, idx) => {
                    const style = INITIAL_FILL_OUTCOME_STYLES[item.outcome] || {
                      label: item.outcome,
                      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                    };
                    return (
                      <div
                        key={`${item.student_id}-${idx}`}
                        className="p-2.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800">{item.student_name}</span>
                          <span className="text-slate-500 ms-2">
                            (پایه {item.grade ?? '—'} • {item.field || '—'})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {item.supporter_name && (
                            <span className="font-semibold text-[#445D84]">
                              ← {item.supporter_name}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${style.badgeClass}`}
                          >
                            {style.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Student Assignment & History Modal */}
      <StudentAssignmentModal
        student={selectedStudentForAssignment}
        isOpen={Boolean(selectedStudentForAssignment)}
        onClose={() => setSelectedStudentForAssignment(null)}
        supporters={supporters}
        showToast={showToast}
        onAssignmentChanged={async () => {
          if (activeTab === 'assignments') {
            await loadAssignments(page);
          }
          if (viewingSupporterStudents) {
            await loadSupporterAssignedStudents(viewingSupporterStudents);
          }
        }}
      />

      {/* Quick Unassign Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(unassignConfirmTarget)}
        title="لغو تخصیص پشتیبان"
        message={`آیا از لغو تخصیص پشتیبان دانش‌آموز «${unassignConfirmTarget?.name || ''}» اطمینان دارید؟`}
        confirmText="لغو تخصیص"
        variant="danger"
        onConfirm={handleConfirmQuickUnassign}
        onCancel={() => setUnassignConfirmTarget(null)}
      />

      {/* Delete Supporter Confirmation Modal */}
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
