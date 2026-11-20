import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  Users,
  BarChart3,
  Filter,
  RefreshCw,
  Search,
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import API from '../lib/api';
import { toPersianDigits } from '../lib/jalali';
import type { AcademicField, ToastType } from '../types';

interface AnalyticsPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

interface StudentExamProgress {
  examName: string;
  score: number;
  rank: number;
  averageClassScore: number;
}

interface RankDistributionItem {
  range: string;
  count: number;
  color: string;
}

interface FieldComparisonItem {
  field: string;
  avgScore: number;
  topScore: number;
  studentCount: number;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ showToast }) => {
  const [selectedField, setSelectedField] = useState<string>('همه');
  const [selectedGrade, setSelectedGrade] = useState<string>('همه');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Mock comprehensive analytics dataset adhering to real Konkur / Famo Academy exam standards
  const progressData: StudentExamProgress[] = useMemo(
    () => [
      { examName: 'آزمون شماره ۱ (مهر)', score: 48, rank: 320, averageClassScore: 42 },
      { examName: 'آزمون شماره ۲ (آبان)', score: 55, rank: 245, averageClassScore: 44 },
      { examName: 'آزمون شماره ۳ (آذر)', score: 62, rank: 180, averageClassScore: 48 },
      { examName: 'آزمون شماره ۴ (دی)', score: 68, rank: 110, averageClassScore: 50 },
      { examName: 'آزمون شماره ۵ (بهمن)', score: 74, rank: 85, averageClassScore: 52 },
      { examName: 'آزمون شماره ۶ (اسفند)', score: 81, rank: 42, averageClassScore: 55 },
    ],
    []
  );

  const rankDistributionData: RankDistributionItem[] = useMemo(
    () => [
      { range: 'رتبه زیر ۱۰۰', count: 48, color: '#10B981' },
      { range: 'رتبه ۱۰۰ تا ۵۰۰', count: 142, color: '#3B82F6' },
      { range: 'رتبه ۵۰۰ تا ۲۰۰۰', count: 310, color: '#F59E0B' },
      { range: 'رتبه بالای ۲۰۰۰', count: 195, color: '#EF4444' },
    ],
    []
  );

  const fieldComparisonData: FieldComparisonItem[] = useMemo(
    () => [
      { field: 'ریاضی فیزیک', avgScore: 64.5, topScore: 92.0, studentCount: 180 },
      { field: 'علوم تجربی', avgScore: 68.2, topScore: 96.5, studentCount: 340 },
      { field: 'علوم انسانی', avgScore: 59.8, topScore: 89.0, studentCount: 210 },
      { field: 'زبان خارجه', avgScore: 72.1, topScore: 98.0, studentCount: 95 },
      { field: 'هنر', avgScore: 58.4, topScore: 88.5, studentCount: 65 },
    ],
    []
  );

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      showToast('اطلاعات تحلیل آزمون‌ها به‌روزرسانی شد', 'success');
    }, 600);
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Top Header Banner adhering to UI/UX Pro Max principles */}
      <div className="bg-gradient-to-l from-[#344868] to-[#445D84] text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute left-0 bottom-0 opacity-10 translate-x-8 translate-y-8">
          <TrendingUp className="w-64 h-64" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>ماژول هوش تحلیلی و نمودارهای پیشرفته کنکور</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              تحلیل پیشرفته آزمون‌های فامو
            </h1>
            <p className="text-white/80 text-sm mt-1 max-w-2xl leading-relaxed">
              بررسی روند پیشرفت تحصیلی دانش‌آموزان، توزیع رتبه‌های کنکوری و مقایسه میانگین نمرات و تراز رشته‌های مختلف تحصیلی با ابزارهای بصری پیشرفته.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all border border-white/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>بارگذاری مجدد داده‌ها</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#445D84]" />
            <span className="text-xs font-bold text-slate-700">فیلتر رشته تحصیلی:</span>
          </div>
          {['همه', 'ریاضی فیزیک', 'علوم تجربی', 'علوم انسانی', 'زبان خارجه'].map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => setSelectedField(field)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedField === field
                  ? 'bg-[#445D84] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {field}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <span className="absolute right-3.5 top-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی دانش‌آموز یا آزمون..."
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#445D84]/20 focus:border-[#445D84]"
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-[#445D84]" />
          <div>
            <p className="text-xs font-semibold text-slate-500">میانگین کل تراز آموزشگاه</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
              {toPersianDigits('۶,۸۴۰')}
            </h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <span>+۳.۴٪</span> نسبت به آزمون قبل
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#445D84]/10 text-[#445D84] flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
          <div>
            <p className="text-xs font-semibold text-slate-500">بالاترین تراز ثبت‌شده</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
              {toPersianDigits('۹,۳۵۰')}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">رشته تجربی (دوازدهم)</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-amber-500" />
          <div>
            <p className="text-xs font-semibold text-slate-500">کل شرکت‌کنندگان فعال</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
              {toPersianDigits('۷۹۵')} نفر
            </h3>
            <p className="text-[11px] text-amber-600 font-bold mt-1">نرخ حضور ۹۶٪</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-indigo-500" />
          <div>
            <p className="text-xs font-semibold text-slate-500">ضریب رشد تحصیلی</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
              {toPersianDigits('۱.۸+')} پله
            </h3>
            <p className="text-[11px] text-indigo-600 font-bold mt-1">میانگین صعود رتبه</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Student Progress Trend */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-800">
                روند پیشرفت تراز و نمره آزمون‌ها
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مقایسه میانگین نمره دانش‌آموز با میانگین کل کلاس در ۶ آزمون اخیر
              </p>
            </div>
            <span className="px-3 py-1 bg-blue-50 text-[#445D84] text-xs font-bold rounded-xl">
              روند صعودی
            </span>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="examName"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[30, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [toPersianDigits(String(value)), '']}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                  formatter={(value) => (value === 'score' ? 'نمره دانش‌آموز' : 'میانگین کلاس')}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#445D84"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#445D84' }}
                  activeDot={{ r: 8 }}
                  name="score"
                />
                <Line
                  type="monotone"
                  dataKey="averageClassScore"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4, fill: '#10B981' }}
                  name="averageClassScore"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Rank Distribution */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-800">توزیع رتبه‌های کنکوری دانش‌آموزان</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فراوانی رتبه‌های کسب شده در آخرین آزمون سراسری آزمایشی
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl">
              ۷۹۵ شرکت‌کننده
            </span>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [toPersianDigits(String(value)) + ' نفر', 'تعداد']}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {rankDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full Width Section: Field Average Score Comparison */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-800">
              مقایسه میانگین نمرات و بالاترین تراز رشته‌های تحصیلی
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تحلیل تطبیقی عملکرد رشته‌های ریاضی، تجربی، انسانی، زبان و هنر در آزمون جامع فامو
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
            <Layers className="w-4 h-4 text-[#445D84]" />
            <span>آمار تفکیکی ۵ رشته اصلی</span>
          </div>
        </div>

        <div className="h-80 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fieldComparisonData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="field" stroke="#64748b" fontSize={12} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                }}
                formatter={(value: any, name: string) => [
                  toPersianDigits(String(value)),
                  name === 'avgScore' ? 'میانگین نمره' : 'بالاترین نمره',
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                formatter={(value) => (value === 'avgScore' ? 'میانگین نمره رشته' : 'بالاترین نمره رشته')}
              />
              <Bar dataKey="avgScore" fill="#445D84" radius={[6, 6, 0, 0]} name="avgScore" />
              <Bar dataKey="topScore" fill="#3B82F6" radius={[6, 6, 0, 0]} name="topScore" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
