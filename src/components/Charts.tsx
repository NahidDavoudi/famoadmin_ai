import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { FieldAvgStat, ReportDayStat } from '../types';
import type { StudentExamTrendPoint } from '../lib/exam-math';

const BAR_COLORS = ['#445D84', '#5a779e', '#6D8B9E', '#8B786D'];

export const AvgByFieldBarChart: React.FC<{ data: FieldAvgStat[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
        داده‌ای برای نمایش نمودار وجود ندارد
      </div>
    );
  }

  const yTicks = [100, 80, 60, 40, 20, 0];

  return (
    <div className="w-full pt-4 pb-2" dir="rtl">
      <div className="flex items-stretch h-[240px] gap-4">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between text-xs text-slate-400 tabular-nums py-1 pl-2 select-none">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative flex-1 flex items-end justify-around border-b border-slate-200 pb-0 px-4">
          {/* Horizontal grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-1">
            {yTicks.map((tick) => (
              <div
                key={tick}
                className="w-full border-t border-dashed border-slate-100"
              />
            ))}
          </div>

          {data.map((item, idx) => {
            const rawPct = Number(item.avg_percentage);
            const displayPct = Number.isFinite(rawPct) ? Math.max(-100, Math.min(100, rawPct)) : 0;
            const barPct = Math.max(0, Math.min(100, displayPct));
            const color = BAR_COLORS[idx % BAR_COLORS.length];
            return (
              <div
                key={item.field}
                className="relative z-10 flex flex-col items-center justify-end h-full flex-1 max-w-[110px] group px-2"
              >
                <span
                  dir="ltr"
                  className="text-xs font-bold text-slate-700 tabular-nums mb-1.5 transition-transform group-hover:-translate-y-0.5"
                >
                  {displayPct.toFixed(1)}%
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500 shadow-xs group-hover:opacity-90"
                  style={{
                    height: `${Math.max(barPct, 4)}%`,
                    backgroundColor: color,
                  }}
                  title={`میانگین ${item.field}: ${displayPct.toFixed(1)}%`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis categories */}
      <div className="flex items-start pr-10 pl-4 mt-3 justify-around">
        {data.map((item) => (
          <div key={item.field} className="flex-1 max-w-[110px] text-center">
            <div className="text-xs font-semibold text-slate-700">{item.field}</div>
            <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
              {item.student_count} نفر
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const DailyReportsAreaChart: React.FC<{ data: ReportDayStat[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
        داده‌ای برای نمایش نمودار وجود ندارد
      </div>
    );
  }

  const maxVal = Math.max(
    10,
    ...data.map((d) => Math.max(d.replied, d.pending))
  );
  const yMax = Math.ceil(maxVal / 10) * 10;
  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const getX = (index: number) =>
    data.length === 1 ? width / 2 : padX + (index / (data.length - 1)) * innerW;
  const getY = (val: number) => padY + innerH - (val / yMax) * innerH;

  const repliedPoints = data.map((d, i) => `${getX(i)},${getY(d.replied)}`).join(' ');
  const pendingPoints = data.map((d, i) => `${getX(i)},${getY(d.pending)}`).join(' ');

  const repliedArea = `${getX(0)},${padY + innerH} ${repliedPoints} ${getX(data.length - 1)},${padY + innerH}`;
  const pendingArea = `${getX(0)},${padY + innerH} ${pendingPoints} ${getX(data.length - 1)},${padY + innerH}`;

  return (
    <div className="w-full">
      <div className="flex items-center gap-6 mb-4 text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
          <span>پاسخ داده شده</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
          <span>در انتظار پاسخ</span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height + 30}`}
          className="w-full h-[260px] overflow-visible"
          role="img"
          aria-label="نمودار روند روزانه گزارش‌ها"
        >
          <defs>
            <linearGradient id="repliedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padY + innerH * (1 - ratio);
            const val = Math.round(yMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text
                  x={width - 6}
                  y={y + 4}
                  fontSize="11"
                  fill="#94a3b8"
                  textAnchor="end"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area fills */}
          <polygon points={repliedArea} fill="url(#repliedGrad)" />
          <polygon points={pendingArea} fill="url(#pendingGrad)" />

          {/* Polylines */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            points={repliedPoints}
          />
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            points={pendingPoints}
          />

          {/* Data points & X labels */}
          {data.map((d, i) => {
            const x = getX(i);
            const yRep = getY(d.replied);
            const yPen = getY(d.pending);
            return (
              <g key={d.date}>
                <circle cx={x} cy={yRep} r="4" fill="#10b981" stroke="#fff" strokeWidth="1.5">
                  <title>{`${d.date} - پاسخ داده: ${d.replied}`}</title>
                </circle>
                <circle cx={x} cy={yPen} r="4" fill="#f59e0b" stroke="#fff" strokeWidth="1.5">
                  <title>{`${d.date} - در انتظار: ${d.pending}`}</title>
                </circle>
                <text
                  x={x}
                  y={height + 16}
                  fontSize="11"
                  fill="#64748b"
                  textAnchor="middle"
                >
                  {d.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const RadialGauge: React.FC<{ percentage: number }> = ({ percentage }) => {
  const rawPct = Number(percentage);
  const displayPct = Number.isFinite(rawPct) ? Math.max(-100, Math.min(100, rawPct)) : 0;
  const arcPct = Math.max(0, Math.min(100, displayPct));
  const isPositive = displayPct >= 50;
  const color = isPositive ? '#10b981' : '#ef4444';
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (arcPct / 100) * circumference;

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth="7"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span
          className={`absolute text-xs font-bold tabular-nums ${
            isPositive ? 'text-emerald-600' : 'text-red-600'
          }`}
          dir="ltr"
        >
          {displayPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: StudentExamTrendPoint }>;
}

const CustomTrendTooltip: React.FC<TrendTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const isPositive = item.avg_percentage >= 50;

  return (
    <div
      dir="rtl"
      className="bg-white border border-slate-200 rounded-xl shadow-md px-3.5 py-2.5 text-xs space-y-1.5 min-w-[165px]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
        <span className="text-slate-500 font-medium">تاریخ آزمون:</span>
        <span className="font-bold text-slate-800 tabular-nums">{item.jalali_date}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 font-medium">میانگین درصد:</span>
        <span
          dir="ltr"
          className={`font-extrabold tabular-nums ${
            isPositive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {item.avg_percentage.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 font-medium">تعداد دروس:</span>
        <span className="font-semibold text-slate-700 tabular-nums">{item.subject_count} درس</span>
      </div>
      {item.delta !== null && (
        <div className="flex items-center justify-between gap-3 pt-0.5 border-t border-slate-100">
          <span className="text-slate-500 font-medium">تغییر نسبت به قبل:</span>
          <span
            dir="ltr"
            className={`font-bold tabular-nums ${
              item.delta > 0
                ? 'text-emerald-600'
                : item.delta < 0
                  ? 'text-red-600'
                  : 'text-slate-500'
            }`}
          >
            {item.delta > 0 ? `+${item.delta.toFixed(1)}%` : `${item.delta.toFixed(1)}%`}
          </span>
        </div>
      )}
    </div>
  );
};

export const StudentExamTrendChart: React.FC<{
  data: StudentExamTrendPoint[];
  loading?: boolean;
}> = ({ data, loading = false }) => {
  if (loading) {
    return (
      <div className="h-[230px] rounded-xl bg-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-400">
        در حال بارگذاری نمودار روند ۵ آزمون اخیر...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[180px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-xs">
        سابقه‌ای برای نمایش نمودار روند درصد وجود ندارد
      </div>
    );
  }

  const minVal = Math.min(0, ...data.map((d) => d.avg_percentage));
  const yMin = minVal < 0 ? Math.max(-40, Math.floor((minVal - 5) / 10) * 10) : 0;
  const latestPoint = data[data.length - 1];
  const bestPct = Math.max(...data.map((d) => d.avg_percentage));

  return (
    <div className="w-full space-y-3" dir="rtl">
      {/* Compact KPI summary strip above the trend line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium tabular-nums">
            تعداد آزمون‌های بررسی‌شده: <strong>{data.length}</strong> آزمون اخیر
          </span>
          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium tabular-nums">
            بالاترین درصد اخیر:{' '}
            <strong dir="ltr" className="inline-block text-[#344868]">
              {bestPct.toFixed(1)}%
            </strong>
          </span>
        </div>

        {latestPoint && latestPoint.delta !== null && (
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <span className="text-slate-500">تغییر در آخرین آزمون:</span>
            <span
              dir="ltr"
              className={`font-extrabold tabular-nums ${
                latestPoint.delta > 0
                  ? 'text-emerald-600'
                  : latestPoint.delta < 0
                    ? 'text-red-600'
                    : 'text-slate-600'
              }`}
            >
              {latestPoint.delta > 0
                ? `+${latestPoint.delta.toFixed(1)}%`
                : `${latestPoint.delta.toFixed(1)}%`}
            </span>
          </div>
        )}
      </div>

      {/* Interactive Recharts LineChart on screen (hidden in print so ResizeObserver fixed px width never clips A4 print) */}
      <div className="w-full h-[230px] overflow-hidden print:hidden" dir="ltr">
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 24, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="jalali_date"
              tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              dy={6}
            />
            <YAxis
              domain={[yMin, 100]}
              tickFormatter={(val: number) => `${val}%`}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<CustomTrendTooltip />} />
            {yMin < 0 && (
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />
            )}
            <ReferenceLine
              y={50}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
            />
            <Line
              type="monotone"
              dataKey="avg_percentage"
              name="میانگین درصد"
              stroke="#445D84"
              strokeWidth={3}
              activeDot={{ r: 7, fill: '#344868', stroke: '#ffffff', strokeWidth: 2 }}
              dot={(props: {
                cx?: number;
                cy?: number;
                payload?: StudentExamTrendPoint;
                index?: number;
              }) => {
                const { cx, cy, payload, index } = props;
                if (typeof cx !== 'number' || typeof cy !== 'number') return <g key={index} />;
                const isCurrent = Boolean(payload?.is_current);
                const pct = Number(payload?.avg_percentage ?? 0);
                const fill = pct >= 50 ? '#10b981' : '#ef4444';
                return (
                  <g key={`dot-${payload?.exam_date || index}`}>
                    {isCurrent && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={9}
                        fill={fill}
                        fillOpacity={0.2}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isCurrent ? 6 : 4.5}
                      fill={fill}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Print-safe native viewBox SVG chart (scales to 100% of A4 width without clipping) */}
      <div className="hidden print:block w-full" dir="ltr">
        {(() => {
          const svgW = 620;
          const svgH = 120;
          const padL = 38;
          const padR = 24;
          const padT = 16;
          const padB = 24;
          const plotW = svgW - padL - padR;
          const plotH = svgH - padT - padB;
          const range = 100 - yMin || 100;
          const getX = (i: number) =>
            data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
          const getY = (val: number) => padT + plotH - ((val - yMin) / range) * plotH;
          const polyPoints = data.map((d, i) => `${getX(i)},${getY(d.avg_percentage)}`).join(' ');

          return (
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-[115px] overflow-visible">
              {[yMin, 0, 50, 100]
                .filter((v, idx, arr) => v >= yMin && arr.indexOf(v) === idx)
                .map((tick) => {
                  const y = getY(tick);
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={svgW - padR}
                        y2={y}
                        stroke={tick === 0 ? '#94a3b8' : '#e2e8f0'}
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        fontSize="9"
                        fill="#64748b"
                        textAnchor="end"
                      >
                        {tick}%
                      </text>
                    </g>
                  );
                })}
              <polyline
                fill="none"
                stroke="#344868"
                strokeWidth="2.2"
                points={polyPoints}
              />
              {data.map((d, i) => {
                const x = getX(i);
                const y = getY(d.avg_percentage);
                const fill = d.avg_percentage >= 50 ? '#10b981' : '#ef4444';
                return (
                  <g key={d.exam_date}>
                    <circle cx={x} cy={y} r={d.is_current ? 4.5 : 3.5} fill={fill} stroke="#fff" strokeWidth="1" />
                    <text
                      x={x}
                      y={y - 6}
                      fontSize="9"
                      fontWeight="bold"
                      fill="#1e293b"
                      textAnchor="middle"
                    >
                      {d.avg_percentage.toFixed(1)}%
                    </text>
                    <text
                      x={x}
                      y={svgH - 6}
                      fontSize="9"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      {d.jalali_date}
                    </text>
                  </g>
                );
              })}
            </svg>
          );
        })()}
      </div>
    </div>
  );
};

