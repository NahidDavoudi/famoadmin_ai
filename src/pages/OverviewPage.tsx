import React, { useEffect, useState } from 'react';
import { Users, ClipboardList, UserX, BarChart3 } from 'lucide-react';
import API from '../lib/api';
import type { DashboardStats, ToastType } from '../types';
import { AvgByFieldBarChart } from '../components/Charts';

interface OverviewPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ showToast }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    API.getDashboardStats()
      .then((res) => {
        if (mounted) setStats(res.data);
      })
      .catch(() => {
        if (mounted) showToast('خطا در بارگذاری آمار داشبورد', 'error');
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
    </div>
  );
};
