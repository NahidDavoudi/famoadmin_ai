import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FilterX,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import API from '../lib/api';
import {
  CONSENT_REQUIRED_MESSAGE,
  canAccessAdminOnlySections,
  extractApiFieldErrors,
  getExamTypeLabel,
} from '../lib/admissions-testimonials';
import {
  admissionsQueueStore,
  findPossibleDuplicateAdmission,
  matchesAdmissionFilters,
  type AdmissionQueueItem,
} from '../lib/admissions-queue';
import type { CompletedOptimisticMutation } from '../lib/optimistic-queue';
import { useOptimisticQueue } from '../hooks/useOptimisticQueue';
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

interface AdmissionDisplayRow {
  kind: 'server' | 'queued_create';
  rowKey: string;
  record: AdmissionRecord;
  queueItem: AdmissionQueueItem | null;
  isOutOfFilter: boolean;
}

interface AmbiguousRetryConfirmState {
  queueItem: AdmissionQueueItem;
  duplicateFound: AdmissionRecord | null;
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
  const [editingQueueItem, setEditingQueueItem] = useState<AdmissionQueueItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<AdmissionRecord | null>(null);

  const [checkingRetryId, setCheckingRetryId] = useState<string | null>(null);
  const [retryConfirmState, setRetryConfirmState] = useState<AmbiguousRetryConfirmState | null>(
    null
  );

  const requestGuardRef = useRef(createRequestGuard());
  const filtersRef = useRef({ search, yearFilter, statusFilter });
  filtersRef.current = { search, yearFilter, statusFilter };

  const itemsRef = useRef<AdmissionRecord[]>(items);
  itemsRef.current = items;

  /** Tracks submission sequence of recently created records so rows stay in exact order as they confirm */
  const recentCreatedSeqRef = useRef<Map<number, number>>(new Map());
  /** Keeps stable React keys across the pending -> confirmed server record transition */
  const stableKeyByServerIdRef = useRef<Map<number, string>>(new Map());

  const sortCtrlRef = useRef<ReturnType<typeof useTableSort<AdmissionSortKey>> | null>(null);

  const loadAdmissions = useCallback(
    async (
      targetPage?: number,
      overrideFilters?: {
        search?: string;
        year?: string;
        status?: AdmissionStatus | '';
      },
      overrideSort?: { sort: AdmissionSortKey; order: SortOrder },
      options?: { silent?: boolean }
    ) => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      const silent = Boolean(options?.silent);
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
      if (!silent) {
        recentCreatedSeqRef.current.clear();
        stableKeyByServerIdRef.current.clear();
        setLoading(true);
        setErrorMsg(null);
      }

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

        if (silent) {
          recentCreatedSeqRef.current.clear();
        }
        setItems(res.data || []);
        setTotalRecords(res.pagination?.total ?? (res.data || []).length);
        setTotalPages(Math.max(1, res.pagination?.total_pages ?? 1));
        sortCtrlRef.current?.syncFromResponse(res.pagination);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || !isLatest()) {
          return;
        }
        if (!silent) {
          const msg = (err as Error)?.message || 'خطا در بارگذاری لیست قبولی‌ها';
          setErrorMsg(msg);
          showToast(msg, 'error');
        }
      } finally {
        if (!silent && isLatest()) {
          setLoading(false);
        }
      }
    },
    [isAdmin, showToast]
  );

  const handleQueueCompleted = useCallback(
    (completed: CompletedOptimisticMutation<AdmissionRecord>) => {
      if (completed.operation === 'create') {
        recentCreatedSeqRef.current.set(completed.record.id, completed.createdAtSeq);
        stableKeyByServerIdRef.current.set(completed.record.id, completed.queueId);
        let addedNew = false;
        setItems((prev) => {
          const exists = prev.some((r) => r.id === completed.record.id);
          if (exists) {
            return prev.map((r) => (r.id === completed.record.id ? completed.record : r));
          }
          addedNew = true;
          return [completed.record, ...prev];
        });
        if (addedNew) {
          setTotalRecords((prev) => prev + 1);
        }
      } else {
        setItems((prev) =>
          prev.map((r) => (r.id === completed.record.id ? completed.record : r))
        );
      }
    },
    []
  );

  const handleQueueDrained = useCallback(() => {
    void loadAdmissions(undefined, undefined, undefined, { silent: true });
  }, [loadAdmissions]);

  const queueSnap = useOptimisticQueue(admissionsQueueStore, {
    onCompleted: handleQueueCompleted,
    onDrained: handleQueueDrained,
  });

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

  // Strictly server-confirmed (not optimistic)
  const handleQuickToggleStatus = async (item: AdmissionRecord) => {
    if (admissionsQueueStore.isTargetLocked(item.id)) {
      showToast('ویرایش این رکورد هنوز در حال ذخیره است.', 'warning');
      return;
    }
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

  // Strictly server-confirmed 2-step delete (not optimistic)
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

  const handleRetryQueueItem = async (queueItem: AdmissionQueueItem) => {
    // Non-ambiguous failure (e.g. offline pre-send) -> immediate retry with same Idempotency-Key
    if (!queueItem.isAmbiguous) {
      admissionsQueueStore.retry(queueItem.queueId);
      return;
    }

    // Ambiguous failure (timeout / 5xx / mid-flight disconnect) -> check server list first
    setCheckingRetryId(queueItem.queueId);
    let duplicateFound: AdmissionRecord | null = null;
    try {
      const res = await API.getAdmissions({
        page: 1,
        per_page: 20,
        search: queueItem.payload.student_name,
        year: String(queueItem.payload.year),
      });
      const combined = [...(res.data || []), ...itemsRef.current];
      duplicateFound = findPossibleDuplicateAdmission(queueItem.optimisticRecord, combined);
    } catch {
      duplicateFound = findPossibleDuplicateAdmission(
        queueItem.optimisticRecord,
        itemsRef.current
      );
    } finally {
      setCheckingRetryId(null);
    }

    setRetryConfirmState({ queueItem, duplicateFound });
  };

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = todayJy + 1; y >= todayJy - 8; y -= 1) {
      years.push(y);
    }
    return years;
  }, [todayJy]);

  const mergedRows = useMemo<AdmissionDisplayRow[]>(() => {
    const activeFilters = {
      search,
      year: yearFilter,
      status: statusFilter,
      page: sortCtrl.page,
    };

    const queuedUpdatesById = new Map<number, AdmissionQueueItem>();
    const topSessionRows: Array<{ seq: number; row: AdmissionDisplayRow }> = [];

    for (const qItem of queueSnap.items) {
      if (qItem.operation === 'update' && qItem.targetId !== null) {
        queuedUpdatesById.set(qItem.targetId, qItem);
      } else if (qItem.operation === 'create') {
        topSessionRows.push({
          seq: qItem.createdAtSeq,
          row: {
            kind: 'queued_create',
            rowKey: qItem.queueId,
            record: qItem.optimisticRecord,
            queueItem: qItem,
            isOutOfFilter: !matchesAdmissionFilters(qItem.optimisticRecord, activeFilters),
          },
        });
      }
    }

    const normalServerRows: AdmissionDisplayRow[] = [];

    for (const rec of items) {
      const queuedUpdate = queuedUpdatesById.get(rec.id) ?? null;
      const effectiveRecord = queuedUpdate ? queuedUpdate.optimisticRecord : rec;
      const recentSeq = recentCreatedSeqRef.current.get(rec.id);

      if (recentSeq !== undefined) {
        topSessionRows.push({
          seq: recentSeq,
          row: {
            kind: 'server',
            rowKey: stableKeyByServerIdRef.current.get(rec.id) || String(rec.id),
            record: effectiveRecord,
            queueItem: queuedUpdate,
            isOutOfFilter: !matchesAdmissionFilters(effectiveRecord, activeFilters),
          },
        });
      } else {
        normalServerRows.push({
          kind: 'server',
          rowKey: String(rec.id),
          record: effectiveRecord,
          queueItem: queuedUpdate,
          isOutOfFilter: false,
        });
      }
    }

    // Preserve exact submission order (newest submitted at top) across pending & newly confirmed rows
    topSessionRows.sort((a, b) => b.seq - a.seq);

    return [...topSessionRows.map((entry) => entry.row), ...normalServerRows];
  }, [items, queueSnap.items, search, yearFilter, statusFilter, sortCtrl.page]);

  const columns: Column<AdmissionDisplayRow>[] = useMemo(
    () => [
      {
        key: 'photo',
        header: 'عکس',
        priority: 'desktop-only',
        headerClassName: 'w-16 text-center',
        cellClassName: 'w-16 text-center',
        cell: (row) => {
          const rec = row.record;
          const resolved = rec.photo_url?.startsWith('blob:')
            ? rec.photo_url
            : resolveEntityImageUrl(rec.photo_url);
          const initials = (rec.student_name || 'ق').trim().slice(0, 1);
          return resolved ? (
            <img
              src={resolved}
              alt={rec.student_name}
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
        cell: (row) => {
          const rec = row.record;
          const qItem = row.queueItem;
          return (
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-800">{rec.student_name}</span>
                {row.isOutOfFilter && (
                  <span
                    data-testid="out-of-filter-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                  >
                    <FilterX className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>خارج از فیلتر فعلی</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 font-normal tabular-nums">
                {getExamTypeLabel(rec.exam_type)}
                {rec.rank ? ` · رتبه ${toPersianDigits(String(rec.rank))}` : ''}
              </div>
              {qItem &&
                (qItem.status === 'needs_edit' || qItem.status === 'failed') &&
                qItem.errorMessage && (
                  <div
                    role="alert"
                    className={`mt-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-start gap-1.5 leading-relaxed ${
                      qItem.status === 'needs_edit'
                        ? 'bg-amber-100/80 text-amber-900 border border-amber-200'
                        : 'bg-rose-100/80 text-rose-900 border border-rose-200'
                    }`}
                  >
                    {qItem.status === 'needs_edit' ? (
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <WifiOff
                        className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <span>{qItem.errorMessage}</span>
                  </div>
                )}
            </div>
          );
        },
      },
      {
        key: 'year',
        header: 'سال',
        sortKey: 'jalali_year',
        priority: 'secondary',
        headerClassName: 'w-20 text-center',
        cellClassName: 'w-20 text-center tabular-nums font-bold text-slate-700',
        cell: (row) => toPersianDigits(row.record.year),
      },
      {
        key: 'field_university',
        header: 'رشته / دانشگاه',
        priority: 'secondary',
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-slate-800">{row.record.admission_title}</div>
            <div className="text-[11px] text-[#445D84] font-medium mt-0.5">{row.record.field}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'وضعیت',
        sortKey: 'status',
        priority: 'secondary',
        headerClassName: 'w-36 text-center',
        cellClassName: 'w-36 text-center',
        cell: (row) => {
          const qItem = row.queueItem;
          if (qItem?.status === 'pending') {
            return (
              <span
                data-testid="admission-row-status-pending"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                <span>در حال ذخیره</span>
              </span>
            );
          }
          if (qItem?.status === 'needs_edit') {
            return (
              <span
                data-testid="admission-row-status-needs-edit"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>نیازمند ویرایش</span>
              </span>
            );
          }
          if (qItem?.status === 'failed') {
            return (
              <span
                data-testid="admission-row-status-failed"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300 whitespace-nowrap"
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>ناموفق</span>
              </span>
            );
          }
          return row.record.status === 'published' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>منتشرشده</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>پیش‌نویس</span>
            </span>
          );
        },
      },
      {
        key: 'consent',
        header: 'رضایت',
        priority: 'secondary',
        headerClassName: 'w-20 text-center',
        cellClassName: 'w-20 text-center',
        cell: (row) => {
          // Do not display a green checkmark on pending optimistic rows
          if (row.queueItem?.status === 'pending') {
            return (
              <span
                title="در انتظار تأیید سرور"
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[11px] font-semibold"
              >
                در انتظار
              </span>
            );
          }
          return row.record.consent_obtained ? (
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
          );
        },
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
      {/* Screen-reader live region for queue status updates */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="admissions-aria-live"
      >
        {queueSnap.lastAnnouncement}
      </div>

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
            setEditingQueueItem(null);
            setIsFormOpen(true);
          }}
          icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن قبولی</span>
        </ActionButton>
      </div>

      {/* Compact Top-of-Page Optimistic Queue Summary */}
      {(queueSnap.pendingCount > 0 || queueSnap.totalAttentionCount > 0) && (
        <div
          data-testid="admissions-queue-banner"
          className={`rounded-2xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 text-xs font-bold ${
            queueSnap.totalAttentionCount > 0
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {queueSnap.pendingCount > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            )}
            <span className="tabular-nums">
              {toPersianDigits(queueSnap.pendingCount)} در حال ذخیره،{' '}
              {toPersianDigits(queueSnap.totalAttentionCount)} ناموفق
            </span>
            {queueSnap.needsEditCount > 0 && (
              <span className="font-medium text-amber-800 tabular-nums">
                ({toPersianDigits(queueSnap.needsEditCount)} مورد نیازمند ویرایش)
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium opacity-80">
            می‌توانید بدون توقف به کار یا ثبت مورد بعدی ادامه دهید
          </span>
        </div>
      )}

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
      ) : mergedRows.length === 0 ? (
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
                setEditingQueueItem(null);
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
          <DataTable<AdmissionDisplayRow>
            columns={columns}
            data={mergedRows}
            rowKey={(r) => r.rowKey}
            rowClassName={(row) => {
              if (row.queueItem?.status === 'pending') return 'opacity-75 bg-sky-50/35';
              if (row.queueItem?.status === 'needs_edit') return 'bg-amber-50/50';
              if (row.queueItem?.status === 'failed') return 'bg-rose-50/50';
              return '';
            }}
            tableAriaLabel="جدول قبولی‌ها"
            sortController={sortCtrl}
            actionsHeader="عملیات"
            actionsHeaderClassName="w-56 text-center"
            actionsCellClassName="w-56 shrink-0 text-center"
            renderActions={(row) => {
              const rec = row.record;
              const qItem = row.queueItem;

              // Pending optimistic row (create or update): lock actions while saving
              if (qItem?.status === 'pending') {
                return (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                    <span>در حال ارسال...</span>
                  </div>
                );
              }

              // Server validation error (422): Edit (re-open pre-filled) + Dismiss (no blind retry)
              if (qItem?.status === 'needs_edit') {
                return (
                  <div className="flex items-center justify-center gap-1.5">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingItem(null);
                        setEditingQueueItem(qItem);
                        setIsFormOpen(true);
                      }}
                      title="ویرایش و اصلاح خطاها"
                      aria-label={`ویرایش قبولی ${rec.student_name}`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-100/70 hover:bg-amber-200/70"
                      icon={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      <span>ویرایش</span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => admissionsQueueStore.dismiss(qItem.queueId)}
                      title="حذف از صف"
                      aria-label={`حذف ${rec.student_name} از صف`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      <span>حذف از صف</span>
                    </ActionButton>
                  </div>
                );
              }

              // Network / Timeout / 5xx error: Retry (same Idempotency-Key) + Dismiss
              if (qItem?.status === 'failed') {
                const isChecking = checkingRetryId === qItem.queueId;
                return (
                  <div className="flex items-center justify-center gap-1.5">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={isChecking}
                      loadingText="بررسی..."
                      onClick={() => void handleRetryQueueItem(qItem)}
                      title="ارسال مجدد بدون پرکردن مجدد فرم"
                      aria-label={`ارسال مجدد قبولی ${rec.student_name}`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-800 bg-rose-100/80 hover:bg-rose-200/80"
                      icon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      <span>ارسال مجدد</span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isChecking}
                      onClick={() => admissionsQueueStore.dismiss(qItem.queueId)}
                      title="حذف از صف"
                      aria-label={`حذف ${rec.student_name} از صف`}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70"
                      icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      <span>حذف از صف</span>
                    </ActionButton>
                  </div>
                );
              }

              // Normal confirmed server record
              const isPublished = rec.status === 'published';
              const isBusy = togglingId === rec.id;
              const isLocked = admissionsQueueStore.isTargetLocked(rec.id);

              return (
                <div className="flex items-center justify-center gap-1">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={isBusy}
                    disabled={isLocked}
                    onClick={() => handleQuickToggleStatus(rec)}
                    title={
                      isPublished
                        ? 'لغو انتشار (تبدیل به پیش‌نویس)'
                        : rec.consent_obtained
                          ? 'انتشار عمومی'
                          : 'نیاز به ثبت رضایت‌نامه برای انتشار'
                    }
                    aria-label={
                      isPublished
                        ? `لغو انتشار قبولی ${rec.student_name}`
                        : `انتشار قبولی ${rec.student_name}`
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                      isPublished
                        ? 'text-amber-700 hover:bg-amber-50'
                        : rec.consent_obtained
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
                    disabled={isLocked}
                    onClick={() => {
                      setEditingQueueItem(null);
                      setEditingItem(rec);
                      setIsFormOpen(true);
                    }}
                    title={isLocked ? 'ویرایش این رکورد در حال ذخیره است' : 'ویرایش'}
                    aria-label={`ویرایش قبولی ${rec.student_name}`}
                    className="p-2 rounded-lg text-[#445D84] hover:bg-slate-100"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </ActionButton>

                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isLocked}
                    onClick={() => setDeletingItem(rec)}
                    title="حذف"
                    aria-label={`حذف قبولی ${rec.student_name}`}
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
        editingQueueItem={editingQueueItem}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
          setEditingQueueItem(null);
        }}
        showToast={showToast}
      />

      {/* Ambiguous Retry Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(retryConfirmState)}
        title={
          retryConfirmState?.duplicateFound
            ? 'احتمال ثبت تکراری — رکورد مشابه یافت شد'
            : 'هشدار ارسال مجدد (وضعیت نامشخص در سرور)'
        }
        message={
          retryConfirmState?.duplicateFound
            ? `یک قبولی مشابه برای «${retryConfirmState.duplicateFound.student_name}» (${retryConfirmState.duplicateFound.admission_title} - سال ${toPersianDigits(retryConfirmState.duplicateFound.year)}) هم‌اکنون در لیست سرور وجود دارد. اگر قبلاً ثبت شده است، «انصراف» را بزنید و این مورد را از صف حذف کنید.`
            : 'درخواست قبلی پس از ارسال به سرور با Timeout یا خطای سرور مواجه شد و ممکن است قبلاً ثبت شده باشد. لطفاً لیست قبولی‌ها را بررسی کنید؛ در صورت اطمینان از عدم ثبت، ارسال مجدد را تأیید کنید.'
        }
        confirmText="بله، ارسال مجدد انجام شود"
        cancelText="انصراف و بررسی لیست"
        variant="danger"
        onCancel={() => setRetryConfirmState(null)}
        onConfirm={() => {
          if (retryConfirmState) {
            admissionsQueueStore.retry(retryConfirmState.queueItem.queueId);
          }
          setRetryConfirmState(null);
        }}
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
