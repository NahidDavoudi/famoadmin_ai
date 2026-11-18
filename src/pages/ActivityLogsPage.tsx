import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Search,
  RefreshCw,
  UserCheck,
  Activity,
  X,
  ShieldCheck,
  Users,
  GraduationCap,
  Calendar,
  Eye,
  ChevronRight,
  ChevronLeft,
  Layers,
  Award,
} from 'lucide-react';
import API from '../lib/api';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import {
  CATEGORY_LABELS,
  ACTION_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  filterActivityLogs,
  computeActivityLogStatsFromItems,
  normalizeRoleKey,
  type ActivityLogItem,
  type ActivityLogCategory,
  type ActivityActionType,
  type ActivityLogsStats,
  type ActiveActorStat,
} from '../lib/activity-log';
import { formatGregorianToJalali } from '../lib/jalali';
import type { ToastType } from '../types';
import { ActionButton } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';

interface ActivityLogsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

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
    case 'start_session':
      return {
        bg: 'bg-teal-50 border-teal-200',
        text: 'text-teal-700',
        label: ACTION_TYPE_LABELS.start_session,
      };
    case 'end_session':
      return {
        bg: 'bg-indigo-50 border-indigo-200',
        text: 'text-indigo-700',
        label: ACTION_TYPE_LABELS.end_session,
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
    case 'login':
    case 'verify_2fa':
    case 'auth':
      return {
        bg: 'bg-slate-100 border-slate-200',
        text: 'text-slate-700',
        label: ACTION_TYPE_LABELS[actionType] || ACTION_TYPE_LABELS.auth,
      };
    default:
      return {
        bg: 'bg-slate-50 border-slate-200',
        text: 'text-slate-600',
        label: ACTION_TYPE_LABELS.other,
      };
  }
}

export function getRoleBadgeStyle(rawRole: string): {
  bg: string;
  text: string;
  label: string;
} {
  const key = normalizeRoleKey(rawRole);
  if (key === 'admin') {
    return {
      bg: 'bg-[#445D84]/10 border-[#445D84]/25',
      text: 'text-[#445D84]',
      label: STAFF_ROLE_LABELS.admin,
    };
  }
  if (key === 'supporter') {
    return {
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-700',
      label: STAFF_ROLE_LABELS.supporter,
    };
  }
  if (key === 'teacher') {
    return {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      label: STAFF_ROLE_LABELS.teacher,
    };
  }
  return {
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-600',
    label: STAFF_ROLE_LABELS[rawRole] || rawRole || 'کاربر',
  };
}

export const ActivityLogsPage: React.FC<ActivityLogsPageProps> = ({ showToast }) => {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [stats, setStats] = useState<ActivityLogsStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Server & client filter states matching GET /api/v1/admin/activity-logs
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [actorUserIdFilter, setActorUserIdFilter] = useState('');
  const [actorLinkedIdFilter, setActorLinkedIdFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 1,
  });

  // Details modal for inspecting a specific staff_activity_logs record
  const [selectedLog, setSelectedLog] = useState<ActivityLogItem | null>(null);

  const loadLogsAndStats = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await API.getAdminActivityLogs({
        role: roleFilter || undefined,
        actor_user_id: actorUserIdFilter || undefined,
        actor_linked_id: actorLinkedIdFilter || undefined,
        module: categoryFilter || undefined,
        action: actionFilter || undefined,
        q: search || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        per_page: perPage,
      });

      setLogs(listRes.items);
      setPagination(listRes.pagination);

      const statsRes = await API.getAdminActivityLogsStats(
        {
          role: roleFilter || undefined,
          module: categoryFilter || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
        },
        listRes.items
      );
      setStats(statsRes);
    } catch {
      showToast('خطا در بارگذاری لاگ فعالیت‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    roleFilter,
    actorUserIdFilter,
    actorLinkedIdFilter,
    categoryFilter,
    actionFilter,
    search,
    fromDate,
    toDate,
    page,
    perPage,
    showToast,
  ]);

  useEffect(() => {
    loadLogsAndStats();
  }, [loadLogsAndStats]);

  const effectiveStats = useMemo<ActivityLogsStats>(() => {
    if (stats) return stats;
    return computeActivityLogStatsFromItems(logs);
  }, [stats, logs]);

  const filteredLogs = useMemo(
    () =>
      filterActivityLogs(logs, {
        search,
        role: roleFilter,
        category: categoryFilter,
        actionType: actionFilter,
        actor: actorFilter,
        actorUserId: actorUserIdFilter,
        actorLinkedId: actorLinkedIdFilter,
        from: fromDate,
        to: toDate,
      }),
    [
      logs,
      search,
      roleFilter,
      categoryFilter,
      actionFilter,
      actorFilter,
      actorUserIdFilter,
      actorLinkedIdFilter,
      fromDate,
      toDate,
    ]
  );

  const hasFilters = Boolean(
    search ||
      roleFilter ||
      categoryFilter ||
      actionFilter ||
      actorFilter ||
      actorUserIdFilter ||
      actorLinkedIdFilter ||
      fromDate ||
      toDate
  );

  const handleResetFilters = () => {
    setSearch('');
    setRoleFilter('');
    setCategoryFilter('');
    setActionFilter('');
    setActorFilter('');
    setActorUserIdFilter('');
    setActorLinkedIdFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleSelectActiveActor = (actor: ActiveActorStat) => {
    setPage(1);
    if (actor.actor_user_id != null) {
      setActorUserIdFilter(String(actor.actor_user_id));
      setActorLinkedIdFilter('');
      setActorFilter('');
    } else if (actor.actor_linked_id != null) {
      setActorLinkedIdFilter(String(actor.actor_linked_id));
      setActorUserIdFilter('');
      setActorFilter('');
    } else {
      setActorFilter(actor.actor_name);
      setActorUserIdFilter('');
      setActorLinkedIdFilter('');
    }
  };

  return (
    <div id="page-activity-logs" className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <History className="w-6 h-6 shrink-0" aria-hidden="true" />
            <span>سامانه رصد جامع فعالیت‌های ادمین‌ها، پشتیبان‌ها و اساتید</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            رصد لحظه‌ای تمامی عملیات‌های تغییر وضعیت، ورود، جلسات رفع اشکال، آزمون‌ها و نوبت‌دهی به تفکیک نقش، بخش و فرد اقدام‌کننده
          </p>
        </div>

        <ActionButton
          type="button"
          variant="secondary"
          loading={loading}
          loadingText="در حال بروزرسانی..."
          onClick={loadLogsAndStats}
          icon={<RefreshCw className="w-4 h-4" />}
          className="px-4 py-2 text-xs"
        >
          <span>بروزرسانی لیست و آمار</span>
        </ActionButton>
      </div>

      {/* Summary KPI Strip (from GET /api/v1/admin/activity-logs/stats) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setRoleFilter('');
            setPage(1);
          }}
          className={`text-start bg-white rounded-2xl p-4 border transition cursor-pointer flex items-center gap-3 ${
            roleFilter === ''
              ? 'border-[#445D84] ring-2 ring-[#445D84]/15'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-[#445D84] text-white flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-bold text-[#445D84] tabular-nums">
                {effectiveStats.total_logs}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                امروز: {effectiveStats.today_logs}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">کل فعالیت‌های ثبت‌شده</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter((prev) => (prev === 'admin' ? '' : 'admin'));
            setPage(1);
          }}
          className={`text-start bg-white rounded-2xl p-4 border transition cursor-pointer flex items-center gap-3 ${
            roleFilter === 'admin'
              ? 'border-[#445D84] ring-2 ring-[#445D84]/15'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-blue-600 tabular-nums">
              {effectiveStats.by_role.admin}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">فعالیت ادمین‌ها (مدیران)</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter((prev) => (prev === 'supporter' ? '' : 'supporter'));
            setPage(1);
          }}
          className={`text-start bg-white rounded-2xl p-4 border transition cursor-pointer flex items-center gap-3 ${
            roleFilter === 'supporter'
              ? 'border-emerald-600 ring-2 ring-emerald-600/15'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-emerald-600 tabular-nums">
              {effectiveStats.by_role.supporter}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">فعالیت پشتیبان‌ها</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setRoleFilter((prev) => (prev === 'teacher' ? '' : 'teacher'));
            setPage(1);
          }}
          className={`text-start bg-white rounded-2xl p-4 border transition cursor-pointer flex items-center gap-3 ${
            roleFilter === 'teacher'
              ? 'border-amber-600 ring-2 ring-amber-600/15'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-amber-600 tabular-nums">
              {effectiveStats.by_role.teacher}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">فعالیت اساتید و مدرسین</div>
          </div>
        </button>
      </div>

      {/* Active Actors & By Module Breakdown */}
      {(effectiveStats.active_actors.length > 0 || effectiveStats.by_module.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Active Actors */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#445D84] flex items-center gap-1.5">
                <Award className="w-4 h-4 shrink-0" />
                <span>فهرست فعال‌ترین افراد (رصد عملکرد فردی)</span>
              </h2>
              <span className="text-[11px] text-slate-400">
                برای فیلتر فعالیت‌های هر فرد روی نام او کلیک کنید
              </span>
            </div>

            {effectiveStats.active_actors.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                هنوز آماری برای فعال‌ترین افراد ثبت نشده است.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {effectiveStats.active_actors.slice(0, 6).map((actor, idx) => {
                  const roleStyle = getRoleBadgeStyle(actor.role);
                  const isSelected =
                    (actor.actor_user_id != null &&
                      actorUserIdFilter === String(actor.actor_user_id)) ||
                    (actor.actor_linked_id != null &&
                      actorLinkedIdFilter === String(actor.actor_linked_id)) ||
                    (actorFilter && actorFilter === actor.actor_name);

                  return (
                    <button
                      key={`${actor.actor_user_id ?? 'u'}-${actor.actor_linked_id ?? 'l'}-${actor.actor_name}-${idx}`}
                      type="button"
                      onClick={() => handleSelectActiveActor(actor)}
                      className={`text-start p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-[#445D84]/5 border-[#445D84] ring-1 ring-[#445D84]/30'
                          : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                            {actor.actor_name}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${roleStyle.bg} ${roleStyle.text}`}
                          >
                            {roleStyle.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap tabular-nums">
                          <span>آخرین فعالیت: {actor.last_activity_jalali || '-'}</span>
                          {actor.actor_user_id != null && (
                            <span className="text-slate-400">UID: #{actor.actor_user_id}</span>
                          )}
                          {actor.actor_linked_id != null && (
                            <span className="text-slate-400">PID: #{actor.actor_linked_id}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-center px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                        <div className="text-sm font-extrabold text-[#445D84] tabular-nums">
                          {actor.total_actions}
                        </div>
                        <div className="text-[10px] text-slate-400">اقدام</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* By Module Breakdown */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#445D84] flex items-center gap-1.5">
                <Layers className="w-4 h-4 shrink-0" />
                <span>تفکیک فعالیت‌ها بر اساس بخش (Module)</span>
              </h2>
              {categoryFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('');
                    setPage(1);
                  }}
                  className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                >
                  نمایش همه بخش‌ها
                </button>
              )}
            </div>

            {effectiveStats.by_module.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                اطلاعات تفکیک بخش‌ها موجود نیست.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {effectiveStats.by_module.map((mod) => {
                  const active = categoryFilter === mod.module;
                  return (
                    <button
                      key={mod.module}
                      type="button"
                      onClick={() => {
                        setCategoryFilter((prev) => (prev === mod.module ? '' : mod.module));
                        setPage(1);
                      }}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                        active
                          ? 'bg-[#445D84] text-white border-[#445D84]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{mod.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                          active ? 'bg-white/20 text-white' : 'bg-white text-[#445D84] border border-slate-200'
                        }`}
                      >
                        {mod.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comprehensive Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* q: Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو در شرح عملیات، نام فرد یا اندپوینت..."
              aria-label="جستجو در لاگ فعالیت‌ها"
              className="w-full ps-10 pe-3.5 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
            />
          </div>

          {/* role: admin | supporter | teacher */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="فیلتر نقش کاربر"
            className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه نقش‌ها (ادمین، پشتیبان، استاد)</option>
            <option value="admin">ادمین (admin)</option>
            <option value="supporter">پشتیبان (supporter)</option>
            <option value="teacher">استاد / مدرس (teacher)</option>
          </select>

          {/* module */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            aria-label="فیلتر بخش"
            className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه بخش‌ها (Module)</option>
            {(Object.keys(CATEGORY_LABELS) as ActivityLogCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>

          {/* action */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="فیلتر نوع عملیات"
            className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:border-[#445D84]"
          >
            <option value="">همه نوع عملیات (Action)</option>
            {(Object.keys(ACTION_TYPE_LABELS) as ActivityActionType[]).map((key) => (
              <option key={key} value={key}>
                {ACTION_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {/* Second row: Date range (from / to) & specific person ID filters (actor_user_id / actor_linked_id) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <label className="text-xs text-slate-600 shrink-0">از تاریخ:</label>
            <div className="flex-1">
              <JalaliDatePicker
                value={fromDate}
                onChange={(val) => {
                  setFromDate(val);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <label className="text-xs text-slate-600 shrink-0">تا تاریخ:</label>
            <div className="flex-1">
              <JalaliDatePicker
                value={toDate}
                onChange={(val) => {
                  setToDate(val);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <input
            type="number"
            min={1}
            value={actorUserIdFilter}
            onChange={(e) => {
              setActorUserIdFilter(e.target.value);
              setPage(1);
            }}
            placeholder="شناسه کاربر (actor_user_id)"
            aria-label="شناسه کاربر (actor_user_id)"
            className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84] tabular-nums"
          />

          <input
            type="number"
            min={1}
            value={actorLinkedIdFilter}
            onChange={(e) => {
              setActorLinkedIdFilter(e.target.value);
              setPage(1);
            }}
            placeholder="شناسه پروفایل (actor_linked_id)"
            aria-label="شناسه پروفایل (actor_linked_id)"
            className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84] tabular-nums"
          />

          <div className="flex items-center justify-end gap-2">
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value) || 25);
                setPage(1);
              }}
              aria-label="تعداد در هر صفحه"
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#445D84] tabular-nums"
            >
              <option value={25}>۲۵ رکورد در صفحه</option>
              <option value={50}>۵۰ رکورد در صفحه</option>
              <option value={100}>۱۰۰ رکورد در صفحه</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="پاک کردن تمام فیلترها"
                className="px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>حذف فیلترها</span>
              </button>
            )}
          </div>
        </div>

        {(fromDate || toDate || actorFilter) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1">
            {fromDate && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium">
                از: {formatGregorianToJalali(fromDate)} ({fromDate})
              </span>
            )}
            {toDate && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-medium">
                تا: {formatGregorianToJalali(toDate)} ({toDate})
              </span>
            )}
            {actorFilter && (
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold flex items-center gap-1">
                <span>فرد انتخاب‌شده: {actorFilter}</span>
                <button
                  type="button"
                  onClick={() => setActorFilter('')}
                  className="hover:text-blue-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Activity Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <History className="w-8 h-8" aria-hidden="true" />
            </div>
            <h3 className="font-bold text-slate-700 text-base mb-1">
              هیچ فعالیتی مطابق با فیلتر فعلی یافت نشد
            </h3>
            <p className="text-xs text-slate-500">
              تمامی عملیات‌های تغییر وضعیت توسط ادمین، پشتیبان و استاد به صورت خودکار در این بخش ثبت و نمایش داده می‌شوند.
            </p>
          </div>
        ) : (
          <>
            <DataTable<ActivityLogItem>
              onRowClick={(item) => setSelectedLog(item)}
              columns={
                [
                  {
                    key: 'actor',
                    header: 'اقدام‌کننده (نام و نقش)',
                    priority: 'secondary',
                    mobileLabel: 'کاربر',
                    headerClassName: 'w-28 lg:w-44 xl:w-52',
                    cellClassName: 'w-28 lg:w-44 xl:w-52 whitespace-normal break-words',
                    cell: (item) => {
                      const roleStyle = getRoleBadgeStyle(item.actor_role);
                      return (
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="hidden lg:flex w-7 h-7 rounded-lg bg-[#445D84]/10 text-[#445D84] items-center justify-center shrink-0 mt-0.5">
                            <UserCheck className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-xs sm:text-sm whitespace-normal break-words">
                              {item.actor_name}
                            </div>
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${roleStyle.bg} ${roleStyle.text}`}
                              >
                                {roleStyle.label}
                              </span>
                              {item.actor_linked_id != null && (
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  #{item.actor_linked_id}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'category',
                    header: 'بخش',
                    priority: 'desktop-only',
                    headerClassName: 'w-20 lg:w-28 xl:w-32',
                    cellClassName: 'w-20 lg:w-28 xl:w-32',
                    cell: (item) => (
                      <div className="space-y-1">
                        <span className="inline-block text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md whitespace-normal break-words">
                          {item.category_label}
                        </span>
                        {item.target_id != null && (
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            هدف: #{item.target_id}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'action_type',
                    header: 'نوع عملیات',
                    priority: 'secondary',
                    mobileLabel: 'نوع عملیات',
                    headerClassName: 'w-20 lg:w-32 xl:w-36',
                    cellClassName: 'w-20 lg:w-32 xl:w-36',
                    cell: (item) => {
                      const badge = getActionBadgeStyle(item.action_type);
                      return (
                        <span
                          className={`inline-block text-xs font-bold px-2 py-0.5 rounded-md border whitespace-normal break-words ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'title',
                    header: 'شرح فارسی اقدام (Summary)',
                    priority: 'primary',
                    cellClassName: 'min-w-0',
                    cell: (item) => (
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-xs sm:text-sm whitespace-normal break-words line-clamp-2 max-w-prose">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs font-normal text-slate-500 mt-0.5 whitespace-normal break-words line-clamp-2 max-w-prose">
                            {item.description}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'datetime',
                    header: 'زمان ثبت و جزئیات',
                    priority: 'secondary',
                    mobileLabel: 'زمان ثبت',
                    headerClassName: 'w-28 lg:w-36 xl:w-40',
                    cellClassName: 'w-28 lg:w-36 xl:w-40 tabular-nums text-xs text-slate-600 font-medium whitespace-normal break-words',
                    cell: (item) => (
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="tabular-nums">{item.jalali_datetime}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(item);
                          }}
                          title="مشاهده جزئیات درخواست"
                          className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-[#445D84] transition cursor-pointer shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ),
                  },
                ] satisfies Column<ActivityLogItem>[]
              }
              data={filteredLogs}
              rowKey={(item) => item.id}
              ariaLabel="جدول لاگ فعالیت‌ها"
            />

            {/* Pagination Footer */}
            {pagination.total_pages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <div className="tabular-nums">
                  صفحه <span className="font-bold text-slate-800">{pagination.page}</span> از{' '}
                  <span className="font-bold text-slate-800">{pagination.total_pages}</span> (کل رکوردها:{' '}
                  <span className="font-bold text-slate-800">{pagination.total}</span>)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>صفحه قبل</span>
                  </button>
                  <button
                    type="button"
                    disabled={page >= pagination.total_pages || loading}
                    onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
                  >
                    <span>صفحه بعد</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Activity Details Modal */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="جزئیات کامل فعالیت ثبت‌شده"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <div className="text-slate-400 text-[11px]">نام اقدام‌کننده:</div>
                <div className="font-bold text-slate-800 mt-0.5">{selectedLog.actor_name}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">نقش (Role):</div>
                <div className="font-bold text-slate-800 mt-0.5">
                  {getRoleBadgeStyle(selectedLog.actor_role).label} ({selectedLog.actor_role})
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">شناسه کاربری / پروفایل:</div>
                <div className="font-semibold text-slate-700 mt-0.5 tabular-nums">
                  UID: {selectedLog.actor_user_id ?? '-'} | Linked ID:{' '}
                  {selectedLog.actor_linked_id ?? '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">زمان ثبت:</div>
                <div className="font-semibold text-slate-700 mt-0.5 tabular-nums">
                  {selectedLog.jalali_datetime}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">بخش (Module) و رکورد هدف:</div>
                <div className="font-semibold text-slate-700 mt-0.5">
                  {selectedLog.category_label} ({selectedLog.raw_module || selectedLog.category})
                  {selectedLog.target_id != null ? ` — رکورد #${selectedLog.target_id}` : ''}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">نوع عملیات (Action):</div>
                <div className="font-semibold text-slate-700 mt-0.5">
                  {getActionBadgeStyle(selectedLog.action_type).label} (
                  {selectedLog.raw_action || selectedLog.action_type})
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-700">شرح فارسی اقدام (Summary):</div>
              <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-semibold whitespace-normal break-words">
                {selectedLog.title}
              </div>
            </div>

            {(selectedLog.method || selectedLog.endpoint) && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-700">مسیر درخواست (Endpoint):</div>
                <div
                  dir="ltr"
                  className="p-2.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs break-all"
                >
                  {selectedLog.method ? `${selectedLog.method} ` : ''}
                  {selectedLog.endpoint || ''}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-700">
                جزئیات درخواست (با ماسک خودکار اطلاعات حساس):
              </div>
              {selectedLog.details_json ? (
                <pre
                  dir="ltr"
                  className="p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs overflow-y-auto max-h-60 whitespace-pre-wrap break-words"
                >
                  {JSON.stringify(selectedLog.details_json, null, 2)}
                </pre>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 whitespace-normal break-words">
                  {selectedLog.description || 'جزئیات اضافی برای این عملیات ثبت نشده است.'}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
