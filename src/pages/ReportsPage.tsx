import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock3, Check, Search } from 'lucide-react';
import API from '../lib/api';
import { validateReportDateFilter, type FieldErrors } from '../lib/form-validation';
import type { ReportDayStat, ToastType } from '../types';
import { DailyReportsAreaChart } from '../components/Charts';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';

interface ReportsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ showToast }) => {
  const [reports, setReports] = useState<ReportDayStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return `${today.slice(0, 8)}01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [errors, setErrors] = useState<FieldErrors<'dateFrom' | 'dateTo'>>({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.getReportsStats(dateFrom, dateTo);
      setReports(res.data?.stats || []);
    } catch {
      showToast('خطا در بارگذاری گزارش‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, showToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filtering) return;

    const validationErrors = validateReportDateFilter({ dateFrom, dateTo });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً بازه تاریخ را به درستی وارد کنید', 'error');
      return;
    }

    setFiltering(true);
    try {
      await loadReports();
    } finally {
      setFiltering(false);
    }
  };

  const totalReplied = reports.reduce((sum, r) => sum + Number(r.replied || 0), 0);
  const totalPending = reports.reduce((sum, r) => sum + Number(r.pending || 0), 0);
  const totalAll = totalReplied + totalPending;

  return (
    <div id="page-reports" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <h1 className="text-xl md:text-2xl font-bold text-[#445D84]">تحلیل گزارش‌ها</h1>
      </div>

      {/* Filter Bar */}
      <form
        noValidate
        onSubmit={handleFilterSubmit}
        className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-start">
          <div className="flex-1 min-w-0">
            <input
              id="reportDateFrom"
              type="date"
              aria-label="از تاریخ"
              aria-invalid={Boolean(errors.dateFrom)}
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (errors.dateFrom) setErrors((prev) => ({ ...prev, dateFrom: undefined }));
              }}
              className={getFieldClass(Boolean(errors.dateFrom))}
            />
            <FieldError message={errors.dateFrom} />
          </div>
          <span className="text-slate-500 text-center text-sm sm:pt-2.5">تا</span>
          <div className="flex-1 min-w-0">
            <input
              id="reportDateTo"
              type="date"
              aria-label="تا تاریخ"
              aria-invalid={Boolean(errors.dateTo)}
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                if (errors.dateTo) setErrors((prev) => ({ ...prev, dateTo: undefined }));
              }}
              className={getFieldClass(Boolean(errors.dateTo))}
            />
            <FieldError message={errors.dateTo} />
          </div>
          <ActionButton
            type="submit"
            loading={filtering}
            loadingText="در حال فیلتر..."
            icon={<Search className="w-4 h-4" />}
            className="px-6 py-2.5"
          >
            <span>فیلتر</span>
          </ActionButton>
        </div>
      </form>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#445D84] text-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <div id="report-total" className="text-2xl font-bold text-[#445D84] tabular-nums">
              {totalAll}
            </div>
            <div className="text-xs text-slate-500 mt-1">کل گزارش‌ها</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Clock3 className="w-6 h-6" />
          </div>
          <div>
            <div id="report-pending" className="text-2xl font-bold text-amber-600 tabular-nums">
              {totalPending}
            </div>
            <div className="text-xs text-slate-500 mt-1">در انتظار پاسخ</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <div id="report-replied" className="text-2xl font-bold text-emerald-600 tabular-nums">
              {totalReplied}
            </div>
            <div className="text-xs text-slate-500 mt-1">پاسخ داده شده</div>
          </div>
        </div>
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h2 className="flex items-center gap-2 text-base font-bold text-[#445D84] mb-4">
          <BarChart3 className="w-5 h-5 text-[#445D84]" aria-hidden="true" />
          <span>روند روزانه گزارش‌ها</span>
        </h2>
        <div id="reportsChart">
          {loading ? (
            <div className="h-[260px] rounded-xl bg-slate-100 animate-pulse" />
          ) : (
            <DailyReportsAreaChart data={reports} />
          )}
        </div>
      </div>
    </div>
  );
};
