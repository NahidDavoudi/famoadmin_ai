import React from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, parse, isValid } from 'date-fns-jalali';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  value?: string | null; // ISO 8601 Gregorian string (YYYY-MM-DD)
  onChange: (isoString: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ (۱۴۰۵/۰۸/۲۷)',
  className = '',
  disabled = false,
  id,
  required = false,
}) => {
  // Convert ISO / Gregorian string to Gregorian Date object for react-datepicker
  const parseValueToDate = (val?: string | null): Date | null => {
    if (!val) return null;
    const clean = val.split('T')[0].split(' ')[0];
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return isValid(d) ? d : null;
    }
    const parsed = new Date(val);
    return isValid(parsed) ? parsed : null;
  };

  const selectedDate = parseValueToDate(value);

  // Handle change from react-datepicker (returns Gregorian Date)
  const handleChange = (date: Date | null) => {
    if (!date || !isValid(date)) {
      onChange('');
      return;
    }
    // Convert selected Gregorian Date to ISO 8601 (Gregorian) string format (YYYY-MM-DD)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const isoString = `${year}-${month}-${day}`;
    onChange(isoString);
  };

  return (
    <div className={`relative inline-block w-full ${className}`} dir="rtl">
      <div className="relative flex items-center">
        <span className="absolute right-3.5 text-slate-400 pointer-events-none z-10">
          <Calendar className="w-4 h-4 text-[#445D84]" />
        </span>
        <ReactDatePicker
          id={id}
          disabled={disabled}
          selected={selectedDate}
          onChange={handleChange}
          dateFormat="yyyy/MM/dd"
          placeholderText={placeholder}
          className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#445D84]/20 focus:border-[#445D84] transition-all shadow-xs disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer tabular-nums"
          calendarClassName="famo-jalali-datepicker-calendar font-sans shadow-xl border border-slate-200 rounded-2xl p-3 bg-white"
          wrapperClassName="w-full"
          showYearDropdown
          scrollableYearDropdown
          yearDropdownItemNumber={30}
          customInput={
            <input
              aria-label={placeholder}
              required={required}
              className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#445D84]/20 focus:border-[#445D84] transition-all shadow-xs disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer tabular-nums"
            />
          }
        />
      </div>
    </div>
  );
};
