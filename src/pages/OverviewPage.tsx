import React, { useEffect, useState } from 'react';
import { Users, ClipboardList, UserX, BarChart3, History, UserCheck, ChevronLeft } from 'lucide-react';
import API from '../lib/api';
import type { DashboardStats, PageId, ToastType } from '../types';
import type { ActivityLogItem } from '../lib/activity-log';
import { getActionBadgeStyle } from './ActivityLogsPage';
import { AvgByFieldBarChart } from '../components/Charts';

interface OverviewPageProps {
  showToast: (message: string, type?: ToastType) => void;
  onNavigate?: (page: PageId) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ showToast, onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.allSettled([API.getDashboardStats(), API.getActivityLogs()])
      .then(([statsRes, logsRes]) => {
        if (!mounted) return;
        if (statsRes.status === 'fulfilled') {
          setStats(statsRes.value.data);
        } else {
          showToast('خطا در بارگذاری آمار داشبورد', 'error');
        }
        if (logsRes.status === 'fulfilled') {
          setRecentLogs(logsRes.value.slice(0, 6));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const cards = [
    {
      id: 'stat-students',
      label: 'دانش‌آموزان',
      value: stats?.students_count ?? '-',
      icon: Users,
      iconBg: 'bg-[#445D84]',
      valueColor: 'text-[#445D84]',
    },
    {
      id: 'stat-exams',
      label: 'آزمون این هفته',
      value: stats?.exams_this_week ?? '-',
      icon: ClipboardList,
      iconBg: 'bg-[#8B786D]',
      valueColor: 'text-[#8B786D]',
    },
    {
      id: 'stat-noexam',
      label: 'بدون آزمون',
      value: stats?.students_no_exam ?? '-',
      icon: UserX,
      iconBg: 'bg-red-600',
      valueColor: 'text-red-600',
    },
    {
      id: 'stat-pending',
      label: 'گزارش در انتظار',
      value: stats?.pending_reports ?? '-',
      icon: BarChart3,
      iconBg: 'bg-amber-500',
      valueColor: 'text-amber-600',
    },
  ];

  return (
    <div id="page-overview" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[#445D84]">داشبورد مدیریتی</h1>
        <span className="text-xs text-slate-500">نمای کلی وضعیت آموزشی فامو</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center gap-4 transition-transform hover:-translate-y-0.5"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${card.iconBg}`}
              >
                <Icon className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  id={card.id}
                  className={`text-2xl font-bold tabular-nums leading-tight ${card.valueColor}`}
                >
                  {loading ? '...' : card.value}
                </div>
                <div className="text-xs text-slate-500 mt-1">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Average Percentage by Field Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <h2 className="flex items-center gap-2 text-base font-bold text-[#445D84] mb-4">
          <BarChart3 className="w-5 h-5 text-[#445D84]" aria-hidden="true" />
          <span>میانگین درصد به تفکیک رشته</span>
        </h2>
        <div id="avgChart">
          {loading ? (
            <div className="h-[280px] rounded-xl bg-slate-100 animate-pulse" />
          ) : (
            <AvgByFieldBarChart data={stats?.avg_by_field || []} />
          )}
        </div>
      </div>

      {/* Recent Activities Log Widget */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#445D84]">
            <History className="w-5 h-5 text-[#445D84]" aria-hidden="true" />
            <span>فعالیت‌های اخیر سیستم (کی چیکار کرد؟)</span>
          </h2>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('activity_logs')}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#445D84] hover:text-[#344868] cursor-pointer"
            >
              <span>مشاهده همه لاگ‌ها</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            هنوز فعالیتی در این نشست ثبت نشده است.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentLogs.map((item) => {
              const badge = getActionBadgeStyle(item.action_type);
              return (
                <div
                  key={item.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-[#445D84]/10 text-[#445D84] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <UserCheck className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs sm:text-sm">
                          {item.actor_name}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">{item.title}</span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap self-end sm:self-center">
                    {item.jalali_datetime}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

