import React from 'react';
import type { FieldAvgStat, ReportDayStat } from '../types';

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
            const pct = Math.max(0, Math.min(100, Number(item.avg_percentage) || 0));
            const color = BAR_COLORS[idx % BAR_COLORS.length];
            return (
              <div
                key={item.field}
                className="relative z-10 flex flex-col items-center justify-end h-full flex-1 max-w-[110px] group px-2"
              >
                <span className="text-xs font-bold text-slate-700 tabular-nums mb-1.5 transition-transform group-hover:-translate-y-0.5">
                  {pct.toFixed(1)}%
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500 shadow-xs group-hover:opacity-90"
                  style={{
                    height: `${Math.max(pct, 4)}%`,
                    backgroundColor: color,
                  }}
                  title={`میانگین ${item.field}: ${pct.toFixed(1)}%`}
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
  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));
  const isPositive = clamped >= 50;
  const color = isPositive ? '#10b981' : '#ef4444';
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

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
          {clamped.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};
