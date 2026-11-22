import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import API from '../lib/api';
import {
  CONSENT_REQUIRED_MESSAGE,
  canAccessAdminOnlySections,
  extractApiFieldErrors,
  getExamTypeLabel,
} from '../lib/admissions-testimonials';
import { resolveEntityImageUrl } from '../lib/image-upload';
import { getTodayJalali, toEnglishDigits, toPersianDigits } from '../lib/jalali';
import {
  createRequestGuard,
  useTableSort,
  type TableSortConfig,
} from '../lib/table-sort';
import type {
  AdmissionRecord,
  AdmissionSortKey,
  AdmissionStatus,
  SortOrder,
  ToastType,
  UserRole,
} from '../types';
import { DataTable, type Column } from '../components/DataTable';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton } from '../components/FormControls';
import { AdmissionFormModal } from '../components/AdmissionFormModal';

interface AdmissionsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  userRole: UserRole;
}

const ADMISSIONS_SORT_COLUMNS: TableSortConfig<AdmissionSortKey>['columns'] = [
  { key: 'jalali_year', label: 'سال قبولی', defaultOrder: 'desc' },
  { key: 'display_order', label: 'ترتیب نمایش', defaultOrder: 'asc' },
  { key: 'student_name', label: 'نام', defaultOrder: 'asc' },
  { key: 'status', label: 'وضعیت', defaultOrder: 'desc' },
  { key: 'created_at', label: 'تاریخ ثبت', defaultOrder: 'desc' },
  { key: 'published_at', label: 'تاریخ انتشار', defaultOrder: 'desc' },
];

const ADMISSIONS_ALLOWED_SORT_KEYS: readonly AdmissionSortKey[] = [
  'jalali_year',
  'student_name',
  'display_order',
  'status',
  'created_at',
  'published_at',
];

export const AdmissionsPage: React.FC<AdmissionsPageProps> = ({ showToast, userRole }) => {
  const isAdmin = canAccessAdminOnlySections(userRole);
  const [todayJy] = getTodayJalali();

  const [items, setItems] = useState<AdmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | ''>('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdmissionRecord | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<AdmissionRecord | null>(null);

  const requestGuardRef = useRef(createRequestGuard());
  const filtersRef = useRef({ search, yearFilter, statusFilter });
  filtersRef.current = { search, yearFilter, statusFilter };

  const sortCtrlRef = useRef<ReturnType<typeof useTableSort<AdmissionSortKey>> | null>(null);

  const loadAdmissions = useCallback(
    async (
      targetPage?: number,
      overrideFilters?: {
        search?: string;
        year?: string;
        status?: AdmissionStatus | '';
      },
      overrideSort?: { sort: AdmissionSortKey; order: SortOrder }
    ) => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      const sortCtrl = sortCtrlRef.current;
      const effectivePage = targetPage ?? sortCtrl?.page ?? 1;
      const effectiveSort = overrideSort?.sort ?? sortCtrl?.sort ?? 'jalali_year';
      const effectiveOrder = overrideSort?.order ?? sortCtrl?.order ?? 'desc';

      const currentFilters = filtersRef.current;
      const effectiveSearch =
        overrideFilters?.search !== undefined ? overrideFilters.search : currentFilters.search;
      const effectiveYear =
        overrideFilters?.year !== undefined ? overrideFilters.year : currentFilters.yearFilter;
      const effectiveStatus =
        overrideFilters?.status !== undefined ? overrideFilters.status : currentFilters.statusFilter;

      const { signal, isLatest } = requestGuardRef.current.start();
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await API.getAdmissions(
          {
            page: effectivePage,
            per_page: 20,
            search: effectiveSearch.trim() || undefined,
            year: effectiveYear.trim() ? toEnglishDigits(effectiveYear).trim() : undefined,
            status: effectiveStatus || undefined,
            sort: effectiveSort,
            order: effectiveOrder,
          },
          signal
        );

        if (!isLatest()) return;

        setItems(res.data || []);
        setTotalRecords(res.pagination?.total ?? (res.data || []).length);
        setTotalPages(Math.max(1, res.pagination?.total_pages ?? 1));
        sortCtrlRef.current?.syncFromResponse(res.pagination);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || !isLatest()) {
          return;
        }
        const msg = (err as Error)?.message || 'خطا در بارگذاری لیست قبولی‌ها';
        setErrorMsg(msg);
        showToast(msg, 'error');
      } finally {
        if (isLatest()) {
          setLoading(false);
        }
      }
    },
    [isAdmin, showToast]
  );

  const sortConfig = useMemo<TableSortConfig<AdmissionSortKey>>(
    () => ({
      allowedKeys: ADMISSIONS_ALLOWED_SORT_KEYS,
      defaultSort: 'jalali_year',
      defaultOrder: 'desc',
      columns: ADMISSIONS_SORT_COLUMNS,
      isActive: isAdmin,
    }),
    [isAdmin]
  );

  const sortCtrl = useTableSort<AdmissionSortKey>(sortConfig, (next) => {
    void loadAdmissions(next.page, undefined, { sort: next.sort, order: next.order });
  });
  sortCtrlRef.current = sortCtrl;

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdmissions(sortCtrl.page, undefined, {
      sort: sortCtrl.sort,
      order: sortCtrl.order,
    });
    const guard = requestGuardRef.current;
    return () => {
      guard.abortCurrent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleApplyFilters = () => {
    sortCtrl.setPage(1);
    void loadAdmissions(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setYearFilter('');
    setStatusFilter('');
    sortCtrl.setPage(1);
    void loadAdmissions(1, { search: '', year: '', status: '' });
  };

  const handleQuickToggleStatus = async (item: AdmissionRecord) => {
    const nextStatus: AdmissionStatus = item.status === 'published' ? 'draft' : 'published';
    if (nextStatus === 'published' && !item.consent_obtained) {
      showToast(CONSENT_REQUIRED_MESSAGE, 'error');
      return;
    }

    setTogglingId(item.id);
    try {
      await API.updateAdmissionStatus(item.id, nextStatus);
      showToast(
        nextStatus === 'published'
          ? `قبولی «${item.student_name}» منتشر شد`
          : `انتشار قبولی «${item.student_name}» لغو شد`,
        'success'
      );
      await loadAdmissions();
    } catch (err) {
      const parsed = extractApiFieldErrors(err);
      showToast(
        parsed.isConsentRequired ? parsed.message || CONSENT_REQUIRED_MESSAGE : parsed.message,
        'error'
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const target = deletingItem;
    try {
      await API.deleteAdmission(target.id);
      showToast(`قبولی «${target.student_name}» حذف شد`, 'success');
      setDeletingItem(null);
      await loadAdmissions();
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در حذف قبولی', 'error');
    }
  };

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = todayJy + 1; y >= todayJy - 8; y -= 1) {
      years.push(y);
    }
    return years;
  }, [todayJy]);

  const columns: Column<AdmissionRecord>[] = useMemo(
    () => [
      {
        key: 'photo',
        header: 'عکس',
        priority: 'desktop-only',
        headerClassName: 'w-16 text-center',
        cellClassName: 'w-16 text-center',
        cell: (row) => {
          const resolved = resolveEntityImageUrl(row.photo_url);
          const initials = (row.student_name || 'ق').trim().slice(0, 1);
          return resolved ? (
            <img
              src={resolved}
              alt={row.student_name}
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 mx-auto"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-[#445D84] font-bold text-sm flex items-center justify-center border border-slate-200 mx-auto">
              {initials}
            </div>
          );
        },
      },
      {
        key: 'student_name',
        header: 'نام',
        sortKey: 'student_name',
        priority: 'primary',
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-bold text-slate-800">{row.student_name}</div>
            <div className="text-[11px] text-slate-500 font-normal mt-0.5 tabular-nums">
              {getExamTypeLabel(row.exam_type)}
              {row.rank ? ` · رتبه ${toPersianDigits(String(row.rank))}` : ''}
            </div>
          </div>
        ),
      },
      {
        key: 'year',
        header: 'سال',
        sortKey: 'jalali_year',
        priority: 'secondary',
        headerClassName: 'w-20 text-center',
        cellClassName: 'w-20 text-center tabular-nums font-bold text-slate-700',
        cell: (row) => toPersianDigits(row.year),
      },
      {
        key: 'field_university',
        header: 'رشته / دانشگاه',
        priority: 'secondary',
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-slate-800">{row.admission_title}</div>
            <div className="text-[11px] text-[#445D84] font-medium mt-0.5">{row.field}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'وضعیت',
        sortKey: 'status',
        priority: 'secondary',
        headerClassName: 'w-28 text-center',
        cellClassName: 'w-28 text-center',
        cell: (row) =>
          row.status === 'published' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              منتشرشده
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              پیش‌نویس
            </span>
          ),
      },
      {
        key: 'consent',
        header: 'رضایت',
        priority: 'secondary',
        headerClassName: 'w-20 text-center',
        cellClassName: 'w-20 text-center',
        cell: (row) =>
          row.consent_obtained ? (
            <span
              title="رضایت‌نامه ثبت شده است"
              aria-label="رضایت ثبت شده"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
            </span>
          ) : (
            <span
              title="رضایت‌نامه ثبت نشده است"
              aria-label="بدون رضایت"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-50 text-rose-600 border border-rose-200 font-bold"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </span>
          ),
      },
    ],
    []
  );

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-rose-200 shadow-xs space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">دسترسی غیرمجاز</h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          مدیریت بخش «قبولی‌ها» فقط برای نقش مدیر سیستم (Admin) مجاز است.
        </p>
      </div>
    );
  }

  return (
    <div id="page-admissions" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2.5">
            <Award className="w-7 h-7" aria-hidden="true" />
            <span>مدیریت قبولی‌ها</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ثبت، ویرایش، کنترل رضایت‌نامه و انتشار افتخارات و قبولی‌های دانش‌آموزان
          </p>
        </div>
        <ActionButton
          type="button"
          onClick={() => {
            setEditingItem(null);
            setIsFormOpen(true);
          }}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن قبولی</span>
        </ActionButton>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="search"
            aria-label="جستجو در قبولی‌ها"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyFilters();
            }}
            placeholder="جستجو نام، دانشگاه یا رشته..."
            className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
          />

          <select
            aria-label="فیلتر سال قبولی"
            value={yearFilter}
            onChange={(e) => {
              const val = e.target.value;
              setYearFilter(val);
              sortCtrl.setPage(1);
              void loadAdmissions(1, { year: val });
            }}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84] tabular-nums"
          >
            <option value="">همه سال‌ها</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                سال {toPersianDigits(y)}
              </option>
            ))}
          </select>

          <select
            aria-label="فیلتر وضعیت انتشار"
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as AdmissionStatus | '';
              setStatusFilter(val);
              sortCtrl.setPage(1);
              void loadAdmissions(1, { status: val });
            }}
            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="published">منتشرشده</option>
            <option value="draft">پیش‌نویس</option>
          </select>

          <ActionButton
            type="button"
            onClick={handleApplyFilters}
            icon={<Search className="w-4 h-4" aria-hidden="true" />}
            className="px-4 py-2.5"
          >
            <span>فیلتر</span>
          </ActionButton>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={handleClearFilters}
            icon={<X className="w-4 h-4" aria-hidden="true" />}
            className="px-4 py-2.5"
          >
            <span>پاک کردن</span>
          </ActionButton>
        </div>
      </div>

      {/* Error State */}
      {errorMsg && !loading && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-rose-800 text-sm"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadAdmissions()}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            تلاش مجدد
          </ActionButton>
        </div>
      )}

      {/* Table / Skeleton / Empty */}
      {loading ? (
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Award className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-slate-700">هیچ قبولی ثبت نشده است</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            با کلیک روی «افزودن قبولی» می‌توانید افتخارات دانش‌آموزان را ثبت و پس از دریافت
            رضایت‌نامه منتشر کنید.
          </p>
          <div className="pt-2">
            <ActionButton
              type="button"
              onClick={() => {
                setEditingItem(null);
                setIsFormOpen(true);
              }}
              icon={<Plus className="w-4 h-4" aria-hidden="true" />}
              className="px-5 py-2.5"
            >
              <span>افزودن قبولی</span>
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable<AdmissionRecord>
            columns={columns}
            data={items}
            rowKey={(r) => r.id}
            tableAriaLabel="جدول قبولی‌ها"
            sortController={sortCtrl}
            actionsHeader="عملیات"
            actionsHeaderClassName="w-52 text-center"
            actionsCellClassName="w-52 shrink-0 text-center"
            renderActions={(row) => {
              const isPublished = row.status === 'published';
              const isBusy = togglingId === row.id;
              return (
                <div className="flex items-center justify-center gap-1">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={isBusy}
                    onClick={() => handleQuickToggleStatus(row)}
                    title={
                      isPublished
                        ? 'لغو انتشار (تبدیل به پیش‌نویس)'
                        : row.consent_obtained
                          ? 'انتشار عمومی'
                          : 'نیاز به ثبت رضایت‌نامه برای انتشار'
                    }
                    aria-label={
                      isPublished
                        ? `لغو انتشار قبولی ${row.student_name}`
                        : `انتشار قبولی ${row.student_name}`
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                      isPublished
                        ? 'text-amber-700 hover:bg-amber-50'
                        : row.consent_obtained
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    icon={
                      isPublished ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      )
                    }
                  >
                    <span>{isPublished ? 'لغو انتشار' : 'انتشار'}</span>
                  </ActionButton>

                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingItem(row);
                      setIsFormOpen(true);
                    }}
                    title="ویرایش"
                    aria-label={`ویرایش قبولی ${row.student_name}`}
                    className="p-2 rounded-lg text-[#445D84] hover:bg-slate-100"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </ActionButton>

                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingItem(row)}
                    title="حذف"
                    aria-label={`حذف قبولی ${row.student_name}`}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </ActionButton>
                </div>
              );
            }}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="tabular-nums">
                کل {toPersianDigits(totalRecords)} رکورد · صفحه {toPersianDigits(sortCtrl.page)} از{' '}
                {toPersianDigits(totalPages)}
              </span>
              <div className="flex items-center gap-1.5">
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={sortCtrl.page <= 1 || loading}
                  onClick={() => {
                    const prevPage = Math.max(1, sortCtrl.page - 1);
                    sortCtrl.setPage(prevPage);
                    void loadAdmissions(prevPage);
                  }}
                  aria-label="صفحه قبلی"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={sortCtrl.page >= totalPages || loading}
                  onClick={() => {
                    const nextPage = Math.min(totalPages, sortCtrl.page + 1);
                    sortCtrl.setPage(nextPage);
                    void loadAdmissions(nextPage);
                  }}
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

      {/* Add / Edit Modal */}
      <AdmissionFormModal
        isOpen={isFormOpen}
        editingItem={editingItem}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
        }}
        onSaved={() => loadAdmissions()}
        showToast={showToast}
      />

      {/* 2-Step Delete Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingItem)}
        title="حذف قبولی"
        message={
          deletingItem
            ? `آیا از حذف قبولی «${deletingItem.student_name}» (${deletingItem.admission_title}) مطمئن هستید؟ این عملیات قابل بازگشت نیست.`
            : ''
        }
        confirmText="بله، حذف شود"
        cancelText="انصراف"
        variant="danger"
        onCancel={() => setDeletingItem(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
