import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  MessageSquareQuote,
  Pencil,
  Plus,
  RefreshCw,
  School,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import API from '../lib/api';
import {
  BULK_REJECT_MAX_BATCH,
  canAccessAdminOnlySections,
  chunkBulkRejectIds,
  getAuthorRoleLabel,
} from '../lib/admissions-testimonials';
import { formatGregorianToJalali, toPersianDigits } from '../lib/jalali';
import { createRequestGuard } from '../lib/table-sort';
import type {
  Course,
  Instructor,
  TestimonialRecord,
  TestimonialStatus,
  ToastType,
  UserRole,
} from '../types';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, getFieldClass } from '../components/FormControls';
import { TestimonialFormModal } from '../components/TestimonialFormModal';

interface TestimonialsPageProps {
  showToast: (message: string, type?: ToastType) => void;
  userRole: UserRole;
  onPendingCountChange?: (count: number) => void;
}

const STATUS_TABS: ReadonlyArray<{ id: TestimonialStatus; label: string }> = [
  { id: 'pending', label: 'در انتظار' },
  { id: 'approved', label: 'تأییدشده' },
  { id: 'rejected', label: 'ردشده' },
];

export const TestimonialsPage: React.FC<TestimonialsPageProps> = ({
  showToast,
  userRole,
  onPendingCountChange,
}) => {
  const isAdmin = canAccessAdminOnlySections(userRole);

  const [activeTab, setActiveTab] = useState<TestimonialStatus>('pending');
  const [items, setItems] = useState<TestimonialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Linked dropdown lists from existing panel endpoints
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  // Modals & action states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TestimonialRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<TestimonialRecord | null>(null);
  const [moderatingId, setModeratingId] = useState<number | null>(null);

  // Single reject modal
  const [rejectingItem, setRejectingItem] = useState<TestimonialRecord | null>(null);
  const [singleRejectReason, setSingleRejectReason] = useState('');
  const [submittingSingleReject, setSubmittingSingleReject] = useState(false);

  // Bulk reject modal
  const [isBulkRejectOpen, setIsBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [submittingBulkReject, setSubmittingBulkReject] = useState(false);

  const requestGuardRef = useRef(createRequestGuard());
  const searchRef = useRef(search);
  searchRef.current = search;

  const syncPendingCount = useCallback(
    async (explicitCount?: number) => {
      if (!isAdmin) return;
      if (explicitCount !== undefined) {
        setPendingCount(explicitCount);
        onPendingCountChange?.(explicitCount);
        return;
      }
      try {
        const count = await API.getTestimonialsPendingCount();
        setPendingCount(count);
        onPendingCountChange?.(count);
      } catch {
        // Keep current badge count on background count error
      }
    },
    [isAdmin, onPendingCountChange]
  );

  const loadTestimonials = useCallback(
    async (
      targetTab: TestimonialStatus = activeTab,
      targetPage = page,
      overrideSearch?: string
    ) => {
      if (!isAdmin) {
        setLoading(false);
        return;
      }

      const effectiveSearch =
        overrideSearch !== undefined ? overrideSearch : searchRef.current;
      const { signal, isLatest } = requestGuardRef.current.start();
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await API.getTestimonials(
          {
            status: targetTab,
            page: targetPage,
            per_page: 20,
            search: effectiveSearch.trim() || undefined,
            sort: 'created_at',
            order: 'desc',
          },
          signal
        );

        if (!isLatest()) return;

        setItems(res.data.testimonials || []);
        const total = res.pagination?.total ?? (res.data.testimonials || []).length;
        setTotalRecords(total);
        setTotalPages(Math.max(1, res.pagination?.total_pages ?? 1));
        setSelectedIds([]);

        if (res.data.counts?.pending !== undefined) {
          await syncPendingCount(res.data.counts.pending);
        } else if (targetTab === 'pending' && !effectiveSearch.trim()) {
          await syncPendingCount(total);
        } else {
          await syncPendingCount();
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || !isLatest()) {
          return;
        }
        const msg = (err as Error)?.message || 'خطا در بارگذاری لیست نظرات';
        setErrorMsg(msg);
        showToast(msg, 'error');
      } finally {
        if (isLatest()) {
          setLoading(false);
        }
      }
    },
    [activeTab, isAdmin, page, showToast, syncPendingCount]
  );

  // Load courses & instructors once for linking dropdowns
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    Promise.allSettled([API.getCourses(), API.getInstructors()]).then(([coursesRes, insRes]) => {
      if (!active) return;
      if (coursesRes.status === 'fulfilled' && Array.isArray(coursesRes.value.data)) {
        setCourses(coursesRes.value.data);
      }
      if (insRes.status === 'fulfilled' && Array.isArray(insRes.value.data)) {
        setInstructors(insRes.value.data);
      }
    });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadTestimonials(activeTab, page);
    const guard = requestGuardRef.current;
    return () => {
      guard.abortCurrent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTab, page]);

  const handleTabChange = (nextTab: TestimonialStatus) => {
    if (nextTab === activeTab) return;
    setActiveTab(nextTab);
    setPage(1);
    setSelectedIds([]);
  };

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  const handleToggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((item) => item.id));
    }
  };

  const handleQuickApprove = async (item: TestimonialRecord) => {
    setModeratingId(item.id);
    try {
      await API.moderateTestimonial(item.id, { status: 'approved' });
      showToast(`نظر «${item.author_name}» تأیید و منتشر شد`, 'success');
      await loadTestimonials(activeTab, page);
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در تأیید نظر', 'error');
    } finally {
      setModeratingId(null);
    }
  };

  const handleConfirmSingleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingItem || submittingSingleReject) return;
    setSubmittingSingleReject(true);
    try {
      await API.moderateTestimonial(rejectingItem.id, {
        status: 'rejected',
        rejection_reason: singleRejectReason.trim() || null,
      });
      showToast(`نظر «${rejectingItem.author_name}» رد شد`, 'info');
      setRejectingItem(null);
      setSingleRejectReason('');
      await loadTestimonials(activeTab, page);
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در رد نظر', 'error');
    } finally {
      setSubmittingSingleReject(false);
    }
  };

  const handleConfirmBulkReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0 || submittingBulkReject) return;
    setSubmittingBulkReject(true);
    try {
      const result = await API.bulkRejectTestimonials({
        ids: selectedIds,
        rejection_reason: bulkRejectReason.trim() || null,
      });
      showToast(
        `${toPersianDigits(result.totalRejected)} نظر با موفقیت رد شد`,
        'success'
      );
      setIsBulkRejectOpen(false);
      setBulkRejectReason('');
      setSelectedIds([]);
      await loadTestimonials(activeTab, page);
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در رد دسته‌جمعی نظرات', 'error');
    } finally {
      setSubmittingBulkReject(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const target = deletingItem;
    try {
      await API.deleteTestimonial(target.id);
      showToast(`نظر «${target.author_name}» حذف شد`, 'success');
      setDeletingItem(null);
      await loadTestimonials(activeTab, page);
    } catch (err) {
      showToast((err as Error)?.message || 'خطا در حذف نظر', 'error');
    }
  };

  const courseNameMap = useMemo(() => {
    const map = new Map<number, string>();
    courses.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [courses]);

  const instructorNameMap = useMemo(() => {
    const map = new Map<number, string>();
    instructors.forEach((ins) => map.set(ins.id, ins.name));
    return map;
  }, [instructors]);

  const bulkBatchCount = useMemo(
    () => chunkBulkRejectIds(selectedIds, BULK_REJECT_MAX_BATCH).length,
    [selectedIds]
  );

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-rose-200 shadow-xs space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">دسترسی غیرمجاز</h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          صف تأیید و مدیریت «نظرات» فقط برای نقش مدیر سیستم (Admin) در دسترس است.
        </p>
      </div>
    );
  }

  return (
    <div id="page-testimonials" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2.5">
            <MessageSquareQuote className="w-7 h-7" aria-hidden="true" />
            <span>مدیریت نظرات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            بررسی، ویرایش، تأیید یا رد دیدگاه‌های دانش‌آموزان و والدین و ثبت مستقیم نظرات ادمین
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
          <span>افزودن نظر</span>
        </ActionButton>
      </div>

      {/* Tabs + Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div
            role="tablist"
            aria-label="فیلتر وضعیت نظرات"
            className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 border border-slate-200"
          >
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 ${
                    isActive
                      ? 'bg-[#445D84] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'pending' && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : pendingCount > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {toPersianDigits(pendingCount)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search
                className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="جستجو در نظرات"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    void loadTestimonials(activeTab, 1, search);
                  }
                }}
                placeholder="جستجو نام یا متن نظر..."
                className="w-full ps-9 pe-3 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <ActionButton
              type="button"
              size="sm"
              onClick={() => {
                setPage(1);
                void loadTestimonials(activeTab, 1, search);
              }}
              className="px-3.5 py-2"
            >
              جستجو
            </ActionButton>
          </div>
        </div>

        {/* Multi-select & Bulk Reject Bar */}
        {items.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={handleToggleSelectAllOnPage}
                className="w-4 h-4 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84] cursor-pointer"
              />
              <span>انتخاب همه موارد این صفحه ({toPersianDigits(items.length)})</span>
            </label>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[#445D84] tabular-nums">
                  {toPersianDigits(selectedIds.length)} مورد انتخاب شده
                </span>
                <ActionButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setBulkRejectReason('');
                    setIsBulkRejectOpen(true);
                  }}
                  icon={<XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                  className="px-3.5 py-1.5"
                >
                  <span>رد دسته‌جمعی</span>
                </ActionButton>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 cursor-pointer"
                >
                  لغو انتخاب
                </button>
              </div>
            )}
          </div>
        )}
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
            onClick={() => void loadTestimonials(activeTab, page)}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            تلاش مجدد
          </ActionButton>
        </div>
      )}

      {/* List / Skeleton / Empty */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 space-y-3 animate-pulse"
            >
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-14 w-full bg-slate-100 rounded-xl" />
              <div className="h-8 w-64 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <MessageSquareQuote className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-slate-700">
            {activeTab === 'pending'
              ? 'نظری در انتظار تأیید نیست'
              : activeTab === 'approved'
                ? 'نظر تأییدشده‌ای یافت نشد'
                : 'نظر ردشده‌ای یافت نشد'}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            می‌توانید از طریق دکمه «افزودن نظر» دیدگاه‌های قدیمی اینستاگرام یا تلگرام را مستقیماً
            ثبت کنید.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isModerating = moderatingId === item.id;
            const resolvedCourseName =
              item.course_name || (item.course_id ? courseNameMap.get(item.course_id) : null);
            const resolvedInstructorName =
              item.instructor_name ||
              (item.instructor_id ? instructorNameMap.get(item.instructor_id) : null);
            const formattedDate = item.created_at
              ? toPersianDigits(formatGregorianToJalali(item.created_at))
              : '—';

            return (
              <article
                key={item.id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-colors shadow-2xs space-y-3.5 ${
                  isSelected
                    ? 'border-[#445D84] bg-blue-50/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Top meta bar */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      aria-label={`انتخاب نظر ${item.author_name}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelectOne(item.id)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-[#445D84] focus:ring-[#445D84] cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{item.author_name}</h3>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {getAuthorRoleLabel(item.author_role)}
                        </span>
                        {item.source === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                            <span>ادمین</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            <Globe className="w-3 h-3" aria-hidden="true" />
                            <span>فرم عمومی</span>
                          </span>
                        )}
                      </div>
                      {item.author_subtitle && (
                        <p className="text-xs text-slate-500">{item.author_subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* Rating & Date */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div
                      className="inline-flex items-center gap-0.5"
                      aria-label={`امتیاز ${toPersianDigits(item.rating)} از ۵`}
                    >
                      {[1, 2, 3, 4, 5].map((starIdx) => (
                        <Star
                          key={starIdx}
                          className={`w-4 h-4 ${
                            starIdx <= item.rating
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-slate-200'
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                      <span className="ms-1 font-bold text-slate-700 tabular-nums">
                        ({toPersianDigits(item.rating)})
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-slate-500 tabular-nums">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{formattedDate}</span>
                    </span>
                  </div>
                </div>

                {/* Full text rendered strictly as safe plain text */}
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
                  {item.content}
                </p>

                {/* Linked Course / Instructor & Rejection Reason */}
                {(resolvedCourseName || resolvedInstructorName || item.rejection_reason) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {resolvedCourseName && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 text-[#445D84] border border-blue-200/70 font-semibold">
                        <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>دوره: {resolvedCourseName}</span>
                      </span>
                    )}
                    {resolvedInstructorName && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50/80 text-purple-700 border border-purple-200/70 font-semibold">
                        <School className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>استاد: {resolvedInstructorName}</span>
                      </span>
                    )}
                    {item.rejection_reason && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>دلیل رد: {item.rejection_reason}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Quick Actions */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                  {item.status !== 'approved' && (
                    <ActionButton
                      type="button"
                      variant="emerald"
                      size="sm"
                      loading={isModerating}
                      onClick={() => handleQuickApprove(item)}
                      aria-label={`تأیید نظر ${item.author_name}`}
                      icon={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      className="px-3 py-1.5"
                    >
                      <span>تأیید</span>
                    </ActionButton>
                  )}

                  {item.status !== 'rejected' && (
                    <ActionButton
                      type="button"
                      variant="warning"
                      size="sm"
                      disabled={isModerating}
                      onClick={() => {
                        setRejectingItem(item);
                        setSingleRejectReason(item.rejection_reason || '');
                      }}
                      aria-label={`رد نظر ${item.author_name}`}
                      icon={<XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                      className="px-3 py-1.5"
                    >
                      <span>رد</span>
                    </ActionButton>
                  )}

                  <ActionButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingItem(item);
                      setIsFormOpen(true);
                    }}
                    aria-label={`ویرایش نظر ${item.author_name}`}
                    icon={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
                    className="px-3 py-1.5"
                  >
                    <span>ویرایش</span>
                  </ActionButton>

                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingItem(item)}
                    aria-label={`حذف نظر ${item.author_name}`}
                    icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    className="px-3 py-1.5 text-rose-600 hover:bg-rose-50"
                  >
                    <span>حذف</span>
                  </ActionButton>
                </div>
              </article>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white rounded-2xl px-4 py-3 border border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
              <span className="tabular-nums">
                کل {toPersianDigits(totalRecords)} نظر · صفحه {toPersianDigits(page)} از{' '}
                {toPersianDigits(totalPages)}
              </span>
              <div className="flex items-center gap-1.5">
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="صفحه قبلی"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {/* Admin Add / Edit Modal */}
      <TestimonialFormModal
        isOpen={isFormOpen}
        editingItem={editingItem}
        courses={courses}
        instructors={instructors}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
        }}
        onSaved={() => loadTestimonials(activeTab, page)}
        showToast={showToast}
      />

      {/* Single Reject Modal (with optional rejection_reason) */}
      <Modal
        isOpen={Boolean(rejectingItem)}
        onClose={() => {
          if (!submittingSingleReject) {
            setRejectingItem(null);
            setSingleRejectReason('');
          }
        }}
        title="رد نظر"
        subtitle={rejectingItem ? `رد دیدگاه ثبت‌شده توسط «${rejectingItem.author_name}»` : ''}
        icon={<XCircle className="w-5 h-5" />}
        iconColorClass="bg-amber-500 text-white"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submittingSingleReject}
              onClick={() => {
                setRejectingItem(null);
                setSingleRejectReason('');
              }}
            >
              انصراف
            </ActionButton>
            <ActionButton
              type="submit"
              form="single-reject-form"
              variant="danger"
              loading={submittingSingleReject}
              loadingText="در حال ثبت..."
            >
              تأیید رد نظر
            </ActionButton>
          </div>
        }
      >
        <form id="single-reject-form" onSubmit={handleConfirmSingleReject} className="space-y-3">
          <div>
            <label
              htmlFor="singleRejectReasonInput"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              دلیل رد (اختیاری)
            </label>
            <textarea
              id="singleRejectReasonInput"
              rows={3}
              value={singleRejectReason}
              onChange={(e) => setSingleRejectReason(e.target.value)}
              placeholder="در صورت نیاز، دلیل رد این نظر را یادداشت کنید..."
              className={getFieldClass(false, 'resize-y')}
            />
          </div>
        </form>
      </Modal>

      {/* Bulk Reject Confirmation Modal */}
      <Modal
        isOpen={isBulkRejectOpen}
        onClose={() => {
          if (!submittingBulkReject) {
            setIsBulkRejectOpen(false);
          }
        }}
        title="رد دسته‌جمعی نظرات"
        subtitle={`تعداد ${toPersianDigits(selectedIds.length)} نظر برای رد انتخاب شده است`}
        icon={<XCircle className="w-5 h-5" />}
        iconColorClass="bg-red-600 text-white"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submittingBulkReject}
              onClick={() => setIsBulkRejectOpen(false)}
            >
              انصراف
            </ActionButton>
            <ActionButton
              type="submit"
              form="bulk-reject-form"
              variant="danger"
              loading={submittingBulkReject}
              loadingText="در حال رد دسته‌جمعی..."
            >
              تأیید رد ({toPersianDigits(selectedIds.length)} مورد)
            </ActionButton>
          </div>
        }
      >
        <form id="bulk-reject-form" onSubmit={handleConfirmBulkReject} className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            آیا از رد دسته‌جمعی{' '}
            <strong className="text-slate-800">{toPersianDigits(selectedIds.length)}</strong> نظر
            انتخاب‌شده مطمئن هستید؟
          </p>
          {bulkBatchCount > 1 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
              به‌دلیل محدودیت ۱۰۰ مورد در هر درخواست، عملیات به‌صورت خودکار در{' '}
              {toPersianDigits(bulkBatchCount)} بسته متوالی ارسال می‌شود.
            </p>
          )}
          <div>
            <label
              htmlFor="bulkRejectReasonInput"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              دلیل رد (اختیاری - روی همه موارد انتخاب‌شده اعمال می‌شود)
            </label>
            <textarea
              id="bulkRejectReasonInput"
              rows={3}
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              placeholder="مثلاً: اسپم یا نامرتبط با خدمات آموزشگاه"
              className={getFieldClass(false, 'resize-y')}
            />
          </div>
        </form>
      </Modal>

      {/* 2-Step Delete Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingItem)}
        title="حذف نظر"
        message={
          deletingItem
            ? `آیا از حذف کامل نظر «${deletingItem.author_name}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.`
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
