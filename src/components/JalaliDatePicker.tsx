import React, { useEffect, useState } from 'react';
import {
  getTodayJalali,
  getJalaliMonths,
  jalaliMonthDays,
  toJalali,
  jalaliToGregorianIso,
  toPersianDigits,
} from '../lib/jalali';
import { Calendar } from 'lucide-react';

interface JalaliDatePickerProps {
  value?: string | null; // Gregorian YYYY-MM-DD
  onChange: (gregorianIso: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({
  value,
  onChange,
  className = '',
  id,
  disabled = false,
}) => {
  const [todayJy, todayJm, todayJd] = getTodayJalali();

  const parseGregorianToJalali = (gIso?: string | null): [number, number, number] => {
    if (!gIso) return [todayJy, todayJm, todayJd];
    const clean = gIso.split(' ')[0].split('T')[0];
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return toJalali(parts[0], parts[1], parts[2]);
    }
    return [todayJy, todayJm, todayJd];
  };

  const [initialJy, initialJm, initialJd] = parseGregorianToJalali(value);
  const [jy, setJy] = useState<number>(initialJy);
  const [jm, setJm] = useState<number>(initialJm);
  const [jd, setJd] = useState<number>(initialJd);

  useEffect(() => {
    if (value) {
      const [newJy, newJm, newJd] = parseGregorianToJalali(value);
      setJy(newJy);
      setJm(newJm);
      setJd(newJd);
    }
  }, [value]);

  const months = getJalaliMonths();
  const maxDays = jalaliMonthDays(jm, jy);

  useEffect(() => {
    if (jd > maxDays) {
      setJd(maxDays);
    }
  }, [jm, jy, maxDays, jd]);

  const handleDateChange = (newJy: number, newJm: number, newJd: number) => {
    setJy(newJy);
    setJm(newJm);
    setJd(newJd);
    const gIso = jalaliToGregorianIso(newJy, newJm, newJd);
    onChange(gIso);
  };

  const yearOptions = [
    todayJy - 3,
    todayJy - 2,
    todayJy - 1,
    todayJy,
    todayJy + 1,
    todayJy + 2,
    todayJy + 3,
  ];

  const dayOptions = Array.from({ length: maxDays }, (_, i) => i + 1);

  return (
    <div id={id} className={`flex flex-wrap items-center gap-2 w-full min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {/* Year Select */}
        <select
          aria-label="سال شمسی"
          disabled={disabled}
          value={jy}
          onChange={(e) => handleDateChange(Number(e.target.value), jm, jd)}
          className="px-2 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#445D84] disabled:opacity-50 tabular-nums cursor-pointer min-w-0"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {toPersianDigits(y)}
            </option>
          ))}
        </select>

        {/* Month Select */}
        <select
          aria-label="ماه شمسی"
          disabled={disabled}
          value={jm}
          onChange={(e) => handleDateChange(jy, Number(e.target.value), jd)}
          className="px-2 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#445D84] disabled:opacity-50 cursor-pointer min-w-0"
        >
          {months.map((mName, idx) => {
            const mNum = idx + 1;
            return (
              <option key={mNum} value={mNum}>
                {mName}
              </option>
            );
          })}
        </select>

        {/* Day Select */}
        <select
          aria-label="روز شمسی"
          disabled={disabled}
          value={jd}
          onChange={(e) => handleDateChange(jy, jm, Number(e.target.value))}
          className="px-2 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-semibold focus:outline-none focus:border-[#445D84] disabled:opacity-50 tabular-nums cursor-pointer min-w-0"
        >
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {toPersianDigits(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-medium tabular-nums shrink-0 border border-slate-200/80">
        <Calendar className="w-3.5 h-3.5 text-[#445D84]" />
        <span>{toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)}</span>
      </div>
    </div>
  );
};
