import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Search,
  RefreshCw,
  UserCheck,
  PlusCircle,
  Pencil,
  Trash2,
  MessageSquare,
  Activity,
  X,
} from 'lucide-react';
import API from '../lib/api';
import {
  CATEGORY_LABELS,
  ACTION_TYPE_LABELS,
  filterActivityLogs,
  type ActivityLogItem,
  type ActivityLogCategory,
  type ActivityActionType,
} from '../lib/activity-log';
import type { ToastType } from '../types';
import { ActionButton } from '../components/FormControls';

interface ActivityLogsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدیر سیستم',
  supporter: 'پشتیبان آموزشی',
  teacher: 'استاد',
  student: 'دانش‌آموز',
};

export function getActionBadgeStyle(actionType: ActivityActionType): {
  bg: string;
  text: string;
  label: string;
} {
  switch (actionType) {
    case 'create':
      return {
        bg: 'bg-emerald-50 border-emerald-200',
        text: 'text-emerald-700',
        label: ACTION_TYPE_LABELS.create,
      };
    case 'update':
      return {
        bg: 'bg-blue-50 border-blue-200',
        text: 'text-blue-700',
        label: ACTION_TYPE_LABELS.update,
      };
    case 'delete':
      return {
        bg: 'bg-red-50 border-red-200',
        text: 'text-red-700',
        label: ACTION_TYPE_LABELS.delete,
      };
    case 'send_sms':
      return {
        bg: 'bg-purple-50 border-purple-200',
        text: 'text-purple-700',
        label: ACTION_TYPE_LABELS.send_sms,
      };
    case 'status_change':
      return {
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-700',
        label: ACTION_TYPE_LABELS.status_change,
      };
    case 'auth':
      return {
        bg: 'bg-slate-100 border-slate-200',
        text: 'text-slate-700',
        label: ACTION_TYPE_LABELS.auth,
      };
    default:
      return {
        bg: 'bg-slate-50 border-slate-200',
        text: 'text-slate-600',
        label: ACTION_TYPE_LABELS.other,
      };
  }
}

export const ActivityLogsPage: React.FC<ActivityLogsPageProps> = ({ showToast }) => {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const items = await API.getActivityLogs();
      setLogs(items);
    } catch {
      showToast('خطا در بارگذاری لاگ فعالیت‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const distinctActors = useMemo(() => {
    const set = new Set<string>();
    for (const item of logs) {
      if (item.actor_name) set.add(item.actor_name);
    }
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(
    () =>
      filterActivityLogs(logs, {
        search,
        category: categoryFilter,
        actionType: actionFilter,
        actor: actorFilter,
      }),
    [logs, search, categoryFilter, actionFilter, actorFilter]
  );

  const counts = useMemo(() => {
    let creates = 0;
    let updates = 0;
    let deletes = 0;
    let sms = 0;
    for (const item of logs) {
      if (item.action_type === 'create') creates++;
      else if (item.action_type === 'update' || item.action_type === 'status_change') updates++;
      else if (item.action_type === 'delete') deletes++;
      else if (item.action_type === 'send_sms') sms++;
    }
    return { total: logs.length, creates, updates, deletes, sms };
  }, [logs]);

  const hasFilters = Boolean(search || categoryFilter || actionFilter || actorFilter);

  return (
    <div id="page-activity-logs" className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <History className="w-6 h-6 shrink-0" aria-hidden="true" />
            <span>لاگ فعالیت‌ها و تاریخچه عملیات</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            مشاهده ریز اقدامات انجام‌شده در پنل مدیریت (کی، در چه بخشی و چه کاری انجام داده است)
          </p>
        </div>

        <ActionButton
          type="button"
          variant="secondary"
          loading={loading}
          loadingText="در حال بروزرسانی..."
          onClick={loadLogs}
          icon={<RefreshCw className="w-4 h-4" />}
          className="px-4 py-2 text-xs"
        >
          <span>بروزرسانی لیست</span>
        </ActionButton>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#445D84] text-white flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-[#445D84] tabular-nums">{counts.total}</div>
            <div className="text-xs text-slate-500">کل فعالیت‌های ثبت‌شده</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-600 tabular-nums">{counts.creates}</div>
            <div className="text-xs text-slate-500">ثبت و ایجاد جدید</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-blue-600 tabular-nums">{counts.updates}</div>
            <div className="text-xs text-slate-500">ویرایش و تغییر وضعیت</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-purple-600 tabular-nums">
              {counts.sms + counts.deletes}
            </div>
            <div className="text-xs text-slate-500">پیامک‌ها و حذف‌ها</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
          <div className="relative lg:col-span-2">
            <Search
              className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در شرح عملیات، نام دانش‌آموز یا نام کاربر..."
              aria-label="جستجو در لاگ فعالیت‌ها"
              className="w-full pr-10 pl-3.5 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="فیلتر بخش"
            className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه بخش‌ها</option>
            {(Object.keys(CATEGORY_LABELS) as ActivityLogCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="فیلتر نوع عملیات"
            className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه نوع عملیات</option>
            {(Object.keys(ACTION_TYPE_LABELS) as ActivityActionType[]).map((key) => (
              <option key={key} value={key}>
                {ACTION_TYPE_LABELS[key]}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              aria-label="فیلتر اقدام‌کننده"
              className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
            >
              <option value="">همه کاربران (کی؟)</option>
              {distinctActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategoryFilter('');
                  setActionFilter('');
                  setActorFilter('');
                }}
                title="پاک کردن فیلترها"
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-7 h-7 hidden" />
              <History className="w-8 h-8" aria-hidden="true" />
            </div>
            <h3 className="font-bold text-slate-700 text-base mb-1">
              هیچ فعالیتی مطابق با فیلتر فعلی یافت نشد
            </h3>
            <p className="text-xs text-slate-500">
              به محض ثبت، ویرایش یا حذف اطلاعات در هر بخش از پنل، جزئیات کامل آن در این صفحه ثبت و نمایش داده می‌شود.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-4 py-3.5 text-right font-semibold">کی انجام داد؟ (کاربر)</th>
                  <th className="px-4 py-3.5 text-right font-semibold">بخش</th>
                  <th className="px-4 py-3.5 text-right font-semibold">نوع عملیات</th>
                  <th className="px-4 py-3.5 text-right font-semibold">چیکار کرد؟ (شرح عملیات)</th>
                  <th className="px-4 py-3.5 text-right font-semibold">زمان ثبت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((item) => {
                  const badge = getActionBadgeStyle(item.action_type);
                  const roleLabel = ROLE_LABELS[item.actor_role] || item.actor_role;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </span>
                          <div>
                            <div className="font-bold text-slate-800 text-xs sm:text-sm">
                              {item.actor_name}
                            </div>
                            <div className="text-[11px] text-slate-400">{roleLabel}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                          {item.category_label}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-md border ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-800 text-xs sm:text-sm">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap tabular-nums text-xs text-slate-600 font-medium">
                        {item.jalali_datetime}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
