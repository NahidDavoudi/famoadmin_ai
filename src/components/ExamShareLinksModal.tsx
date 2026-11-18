import React, { useCallback, useEffect, useState } from 'react';
import {
  Share2,
  Send,
  Link2,
  Copy,
  Check,
  ShieldOff,
  Phone,
  Clock,
  Eye,
  RefreshCw,
  Search,
  MessageSquare,
} from 'lucide-react';
import API from '../lib/api';
import { formatActivityJalaliDateTime } from '../lib/activity-log';
import { formatGregorianToJalali, formatJalaliLong } from '../lib/jalali';
import {
  filterExamShareLinks,
  getAuthorRoleLabel,
  isValidIranianPhone,
  normalizeIranianPhone,
  safeNumber,
  safeTrim,
} from '../lib/exam-math';
import type {
  ExamShareLinkItem,
  ExamShareLinkResponse,
  ExamShareLinkStatus,
  ParentContactRecord,
  PublicSharedExamResult,
  ToastType,
} from '../types';
import { Modal } from './Modal';
import { ActionButton, FieldError, getFieldClass } from './FormControls';
import { DataTable, type Column } from './DataTable';

export interface ExamShareLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: number | null;
  studentName?: string | null;
  examDate?: string | null;
  showToast: (message: string, type?: ToastType) => void;
}

const RELATION_LABELS: Record<string, string> = {
  father: 'پدر',
  mother: 'مادر',
  guardian: 'ولی / سرپرست',
  other: 'سایر',
};

export const ExamShareLinksModal: React.FC<ExamShareLinksModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  examDate,
  showToast,
}) => {
  const [links, setLinks] = useState<ExamShareLinkItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [parentContacts, setParentContacts] = useState<ParentContactRecord[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');

  const [creatingLink, setCreatingLink] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const [generatedLink, setGeneratedLink] = useState<ExamShareLinkResponse | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'' | ExamShareLinkStatus>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Public Parent View Preview State (GET /api/v1/public/exam-results/{token})
  const [previewResult, setPreviewResult] = useState<PublicSharedExamResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const hasTargetStudentAndDate = Boolean(studentId && Number(studentId) > 0 && examDate);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await API.getExamShareLinks({
        student_id: studentId && Number(studentId) > 0 ? Number(studentId) : undefined,
        exam_date: examDate || undefined,
      });
      setLinks(res.data?.links || []);
    } catch (err) {
      showToast((err as Error).message || 'خطا در بارگذاری لینک‌های اشتراک کارنامه', 'error');
    } finally {
      setLoadingLinks(false);
    }
  }, [studentId, examDate, showToast]);

  const loadParentContacts = useCallback(async () => {
    if (!studentId || Number(studentId) <= 0) {
      setParentContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const res = await API.getParentContacts(Number(studentId));
      const list = Array.isArray(res.data) ? res.data : [];
      setParentContacts(list);
      const primary = list.find((c) => Boolean(c.is_primary)) || list[0];
      setSelectedContactId(primary ? String(primary.id) : '');
    } catch {
      setParentContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (isOpen) {
      setGeneratedLink(null);
      setPreviewResult(null);
      setCopiedToken(false);
      setCustomPhone('');
      setPhoneError('');
      setStatusFilter('');
      setSearchQuery('');
      loadLinks();
      if (studentId && Number(studentId) > 0) {
        loadParentContacts();
      }
    }
  }, [isOpen, studentId, examDate, loadLinks, loadParentContacts]);

  const handleCreateLinkOnly = async () => {
    if (!studentId || !examDate || creatingLink || sendingSms) return;
    setPhoneError('');
    setCreatingLink(true);
    try {
      const res = await API.createExamShareLink({
        student_id: Number(studentId),
        exam_date: examDate,
        send_sms: false,
      });
      if (res.data) {
        setGeneratedLink(res.data);
      }
      showToast('لینک ۱۴ روزه کارنامه با موفقیت ساخته شد', 'success');
      await loadLinks();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ساخت لینک اشتراک کارنامه', 'error');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCreateAndSendSms = async () => {
    if (!studentId || !examDate || creatingLink || sendingSms) return;
    const trimmedPhone = safeTrim(customPhone);

    if (trimmedPhone && !isValidIranianPhone(trimmedPhone)) {
      setPhoneError('شماره موبایل والد معتبر نیست (مثال: 09123456789)');
      return;
    }
    if (!trimmedPhone && !selectedContactId && parentContacts.length === 0) {
      setPhoneError('لطفاً شماره موبایل والد را وارد کنید');
      return;
    }

    setPhoneError('');
    setSendingSms(true);
    try {
      const res = await API.sendExamShareLinkSms({
        student_id: Number(studentId),
        exam_date: examDate,
        send_sms: true,
        parent_contact_id:
          !trimmedPhone && selectedContactId ? Number(selectedContactId) : undefined,
        phone: trimmedPhone ? normalizeIranianPhone(trimmedPhone) : undefined,
      });
      if (res.data) {
        setGeneratedLink(res.data);
      }
      showToast(
        res.data?.recipient_phone_mask
          ? `لینک کارنامه ساخته شد و به شماره ${res.data.recipient_phone_mask} پیامک شد`
          : 'لینک کارنامه ساخته شد و از طریق ملی‌پیامک برای والد ارسال گردید',
        'success'
      );
      await loadLinks();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ارسال پیامک لینک کارنامه', 'error');
    } finally {
      setSendingSms(false);
    }
  };

  const handleCopyUrl = async (urlToCopy: string) => {
    if (!urlToCopy) return;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopiedToken(true);
      showToast('لینک کارنامه در کلیپ‌بورد کپی شد', 'success');
      setTimeout(() => setCopiedToken(false), 2500);
    } catch {
      showToast('امکان کپی خودکار وجود ندارد، لطفاً لینک را دستی کپی کنید', 'info');
    }
  };

  const handlePreviewParentView = async (token: string) => {
    if (!token || loadingPreview) return;
    setLoadingPreview(true);
    try {
      const res = await API.getPublicSharedExamResult(token);
      setPreviewResult(res.data);
    } catch (err) {
      showToast((err as Error).message || 'خطا در پیش‌نمایش کارنامه عمومی والدین', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRevokeLink = async (id: number) => {
    if (revokingId !== null) return;
    setRevokingId(id);
    try {
      await API.revokeExamShareLink(id);
      showToast('لینک اشتراک‌گذاری کارنامه باطل شد', 'success');
      if (generatedLink?.id === id) {
        setGeneratedLink(null);
        setPreviewResult(null);
      }
      await loadLinks();
    } catch (err) {
      showToast((err as Error).message || 'خطا در ابطال لینک کارنامه', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const filteredLinks = filterExamShareLinks(links, {
    status: statusFilter,
    search: searchQuery,
  });

  const renderStatusBadge = (status: ExamShareLinkStatus) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          فعال
        </span>
      );
    }
    if (status === 'revoked') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          ابطال‌شده
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        منقضی‌شده
      </span>
    );
  };

  const shareLinkColumns: Column<ExamShareLinkItem>[] = [
    {
      key: 'student_info',
      header: 'دانش‌آموز و آزمون',
      priority: 'primary',
      headerClassName: 'w-40 lg:w-48',
      cellClassName: 'w-40 lg:w-48 min-w-0 whitespace-normal break-words',
      cell: (item) => (
        <div className="space-y-0.5 min-w-0">
          <div className="font-bold text-slate-800 text-xs sm:text-sm break-words">
            {item.student_name || studentName || `دانش‌آموز #${item.student_id}`}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            آزمون {item.exam_date ? formatGregorianToJalali(item.exam_date) : '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      mobileLabel: 'وضعیت',
      priority: 'secondary',
      headerClassName: 'w-24',
      cellClassName: 'w-24',
      cell: (item) => renderStatusBadge(item.status),
    },
    {
      key: 'expires_at',
      header: 'اعتبار تا (۱۴ روزه)',
      mobileLabel: 'انقضا',
      priority: 'secondary',
      headerClassName: 'w-32 lg:w-36',
      cellClassName: 'w-32 lg:w-36 text-xs text-slate-600 tabular-nums',
      cell: (item) => (
        <span dir="ltr" className="inline-block">
          {formatActivityJalaliDateTime(item.expires_at)}
        </span>
      ),
    },
    {
      key: 'sms_and_view',
      header: 'پیامک / بازدید والد',
      mobileLabel: 'پیامک و بازدید',
      priority: 'secondary',
      headerClassName: 'hidden lg:table-cell w-44',
      cellClassName: 'hidden lg:table-cell w-44 text-xs text-slate-600',
      cell: (item) => (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1">
            <Send className="w-3 h-3 text-[#445D84] shrink-0" />
            <span>
              {item.sms_sent_at
                ? `پیامک: ${formatActivityJalaliDateTime(item.sms_sent_at)}`
                : 'بدون ارسال پیامک'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Eye className="w-3 h-3 shrink-0" />
            <span>
              {item.last_viewed_at
                ? `بازدید: ${formatActivityJalaliDateTime(item.last_viewed_at)}`
                : 'هنوز مشاهده نشده'}
            </span>
          </div>
        </div>
      ),
    },
  ];

  const shareUrlValue = generatedLink?.share_url || generatedLink?.url || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        hasTargetStudentAndDate
          ? `اشتراک‌گذاری کارنامه با والدین — ${studentName || `دانش‌آموز #${studentId}`}`
          : 'مدیریت لینک‌های اشتراک‌گذاری کارنامه با والدین'
      }
      subtitle={
        examDate
          ? `آزمون ${formatJalaliLong(examDate)} (${formatGregorianToJalali(examDate)}) • لینک اختصاصی ۱۴ روزه بدون نیاز به لاگین`
          : 'مدیریت و ابطال لینک‌های ۱۴ روزه کارنامه ارسال‌شده برای والدین'
      }
      icon={<Share2 className="w-5 h-5" />}
      footer={
        <div className="flex items-center justify-end gap-2">
          <ActionButton type="button" variant="secondary" onClick={onClose} className="px-5 py-2">
            بستن
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 1. Generate 14-Day Share Link & Melipayamak SMS Section (When opened for a specific student + exam_date) */}
        {hasTargetStudentAndDate && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-[#344868] flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#445D84]" />
                  <span>صدور لینک اختصاصی ۱۴ روزه و ارسال پیامک کارنامه به والد</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  والدین با باز کردن این لینک بدون نیاز به نام کاربری یا رمز عبور، کارنامه، درصدها و نظرات اساتید را مشاهده می‌کنند.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Parent Contact Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  انتخاب مخاطب والد ثبت‌شده
                </label>
                <select
                  value={selectedContactId}
                  disabled={loadingContacts || parentContacts.length === 0}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  aria-label="انتخاب مخاطب والد"
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84] disabled:bg-slate-100"
                >
                  {loadingContacts ? (
                    <option value="">در حال بارگذاری شماره والدین...</option>
                  ) : parentContacts.length === 0 ? (
                    <option value="">مخاطب والدی ثبت نشده (شماره دستی وارد کنید)</option>
                  ) : (
                    parentContacts.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.parent_name || RELATION_LABELS[c.relationship || ''] || 'والد'} (
                        {RELATION_LABELS[c.relationship || ''] || c.relationship || 'ولی'}) — {c.phone}
                        {c.is_primary ? ' [اصلی]' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Optional Custom Phone Number Override */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  شماره موبایل دلخواه والد (اختیاری - جایگزین مخاطب بالا)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    dir="ltr"
                    maxLength={14}
                    value={customPhone}
                    onChange={(e) => {
                      setCustomPhone(e.target.value);
                      if (phoneError) setPhoneError('');
                    }}
                    placeholder="09123456789"
                    aria-label="شماره موبایل والد برای ارسال پیامک کارنامه"
                    className={getFieldClass(Boolean(phoneError), 'text-start ps-3 pe-9 py-2')}
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <FieldError message={phoneError} />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <ActionButton
                type="button"
                onClick={handleCreateAndSendSms}
                loading={sendingSms}
                disabled={creatingLink}
                loadingText="در حال ساخت لینک و ارسال پیامک..."
                icon={<Send className="w-4 h-4" />}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm"
              >
                <span>ساخت لینک ۱۴ روزه و ارسال پیامک به والد</span>
              </ActionButton>

              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleCreateLinkOnly}
                loading={creatingLink}
                disabled={sendingSms}
                loadingText="در حال ساخت لینک..."
                icon={<Link2 className="w-4 h-4" />}
                className="px-4 py-2.5 text-xs sm:text-sm"
              >
                <span>فقط ساخت لینک ۱۴ روزه (بدون پیامک)</span>
              </ActionButton>
            </div>

            {/* Generated Link Box */}
            {generatedLink && (
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>لینک اختصاصی ۱۴ روزه صادر شد</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {generatedLink.sms_sent && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold">
                        پیامک ارسال شد{' '}
                        {generatedLink.recipient_phone_mask
                          ? `به ${generatedLink.recipient_phone_mask}`
                          : ''}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 font-semibold tabular-nums flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>اعتبار تا: {formatActivityJalaliDateTime(generatedLink.expires_at)}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={shareUrlValue}
                    aria-label="آدرس لینک اشتراک‌گذاری کارنامه"
                    className="flex-1 bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 select-all focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <ActionButton
                      type="button"
                      onClick={() => handleCopyUrl(shareUrlValue)}
                      icon={copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      className="px-3.5 py-2 text-xs"
                    >
                      <span>{copiedToken ? 'کپی شد!' : 'کپی لینک'}</span>
                    </ActionButton>
                    {generatedLink.token && (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        loading={loadingPreview}
                        loadingText="در حال بارگذاری..."
                        onClick={() => handlePreviewParentView(generatedLink.token)}
                        icon={<Eye className="w-4 h-4" />}
                        className="px-3 py-2 text-xs"
                      >
                        <span>پیش‌نمایش نمای والد</span>
                      </ActionButton>
                    )}
                  </div>
                </div>

                {/* Parent Public View Preview Card */}
                {previewResult && (
                  <div className="mt-2 rounded-xl bg-white border border-slate-200 p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-[#344868]">
                        پیش‌نمایش کارنامه عمومی والدین (بدون اطلاعات محرمانه):
                      </span>
                      <span className="font-extrabold text-emerald-700 tabular-nums" dir="ltr">
                        میانگین کل: {safeNumber(previewResult.avg_percentage).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(previewResult.subjects || []).map((s, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-slate-700 tabular-nums"
                        >
                          {s.subject}:{' '}
                          <strong
                            dir="ltr"
                            className={`inline-block ${
                              safeNumber(s.percentage) >= 50 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {safeNumber(s.percentage).toFixed(1)}%
                          </strong>
                        </span>
                      ))}
                    </div>
                    {previewResult.comments && previewResult.comments.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-100 space-y-1">
                        <div className="font-bold text-slate-600 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-[#445D84]" />
                          <span>نظرات ثبت‌شده در کارنامه والدین ({previewResult.comments.length}):</span>
                        </div>
                        {previewResult.comments.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-50 text-slate-700 whitespace-pre-wrap"
                          >
                            <span className="font-bold text-[#344868]">
                              {c.author_name || getAuthorRoleLabel(c.author_role)} (
                              {getAuthorRoleLabel(c.author_role)}):
                            </span>{' '}
                            {c.body}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. Existing Share Links Management List & Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <h4 className="text-sm font-extrabold text-[#344868]">
              لیست لینک‌های اشتراک‌گذاری صادرشده ({filteredLinks.length})
            </h4>

            <div className="flex flex-wrap items-center gap-2">
              {!hasTargetStudentAndDate && (
                <div className="relative flex-1 sm:w-52">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجوی نام دانش‌آموز یا تاریخ..."
                    aria-label="جستجو در لینک‌های اشتراک کارنامه"
                    className="w-full ps-3 pe-8 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84]"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | ExamShareLinkStatus)}
                aria-label="فیلتر وضعیت لینک اشتراک"
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">همه وضعیت‌ها</option>
                <option value="active">فقط لینک‌های فعال</option>
                <option value="expired">منقضی‌شده</option>
                <option value="revoked">ابطال‌شده</option>
              </select>

              <ActionButton
                type="button"
                variant="secondary"
                onClick={loadLinks}
                loading={loadingLinks}
                loadingText="..."
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                className="px-2.5 py-1.5 text-xs"
              >
                <span>بروزرسانی</span>
              </ActionButton>
            </div>
          </div>

          {loadingLinks ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div key={n} className="h-14 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/90 bg-white">
              <DataTable<ExamShareLinkItem>
                tableAriaLabel="جدول لینک‌های اشتراک‌گذاری کارنامه"
                data={filteredLinks}
                rowKey={(item) => item.id}
                columns={shareLinkColumns}
                actionsHeader="عملیات"
                actionsHeaderClassName="w-28"
                actionsCellClassName="w-28 shrink-0"
                emptyState={
                  <div className="p-8 text-center text-slate-500 text-xs">
                    هیچ لینک اشتراک‌گذاری کارنامه‌ای با این مشخصات یافت نشد.
                  </div>
                }
                renderActions={(item) =>
                  item.status === 'active' ? (
                    <ActionButton
                      type="button"
                      variant="ghost"
                      loading={revokingId === item.id}
                      loadingText="در حال ابطال..."
                      onClick={() => handleRevokeLink(item.id)}
                      icon={<ShieldOff className="w-3.5 h-3.5" />}
                      aria-label={`ابطال لینک کارنامه ${item.student_name || item.id}`}
                      className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 font-semibold text-xs"
                    >
                      <span>ابطال لینک</span>
                    </ActionButton>
                  ) : (
                    <span className="text-[11px] text-slate-400">غیرفعال</span>
                  )
                }
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
