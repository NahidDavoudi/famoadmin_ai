import type { AppointmentSmsPreviewItem, AppointmentStatus } from '../types';
import { formatGregorianToJalali, toPersianDigits, JALALI_WEEKDAYS } from './jalali';
import { safeTrim } from './exam-math';

/**
 * Maximum 5 visual statuses for appointment cards:
 * 1. pending   -> در انتظار (زرد)
 * 2. confirmed -> تأیید شده (آبی)
 * 3. completed -> انجام شد (سبز)
 * 4. absent    -> غایب (قرمز)
 * 5. cancelled -> لغو / بدون نوبت (خاکستری)
 */
export type CardAppointmentVisualKey =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'absent'
  | 'cancelled';

export interface CardAppointmentVisualMeta {
  key: CardAppointmentVisualKey;
  label: string;
  barColorClass: string;
  chipClass: string;
}

export function resolveCardAppointmentStatus(
  item: Pick<
    AppointmentSmsPreviewItem,
    'appointment_id' | 'appointment_status' | 'status' | 'arrival_time'
  >
): CardAppointmentVisualMeta {
  if (!item.appointment_id || item.status === 'no_appointment') {
    return {
      key: 'cancelled',
      label: 'بدون نوبت',
      barColorClass: 'bg-slate-300',
      chipClass: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  }

  const raw: AppointmentStatus = item.appointment_status || 'confirmed';

  if (raw !== 'cancelled' && raw !== 'canceled' && raw !== 'absent' && safeTrim(item.arrival_time)) {
    return {
      key: 'completed',
      label: 'انجام شد',
      barColorClass: 'bg-emerald-500',
      chipClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }

  switch (raw) {
    case 'pending':
      return {
        key: 'pending',
        label: 'در انتظار',
        barColorClass: 'bg-amber-400',
        chipClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'completed':
    case 'done':
      return {
        key: 'completed',
        label: 'انجام شد',
        barColorClass: 'bg-emerald-500',
        chipClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'absent':
      return {
        key: 'absent',
        label: 'غایب',
        barColorClass: 'bg-rose-500',
        chipClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'cancelled':
    case 'canceled':
      return {
        key: 'cancelled',
        label: 'لغو',
        barColorClass: 'bg-slate-400',
        chipClass: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    case 'confirmed':
    case 'scheduled':
    default:
      return {
        key: 'confirmed',
        label: 'تأیید شده',
        barColorClass: 'bg-blue-500',
        chipClass: 'bg-blue-50 text-blue-800 border-blue-200',
      };
  }
}

export function formatCardDateLabel(item: AppointmentSmsPreviewItem): string {
  if (item.day_and_date_fa) return toPersianDigits(item.day_and_date_fa);
  if (item.weekday && item.appointment_jalali) {
    return `${item.weekday} ${toPersianDigits(item.appointment_jalali)}`;
  }
  if (item.appointment_jalali) return toPersianDigits(item.appointment_jalali);
  if (item.appointment_date) {
    const jalali = formatGregorianToJalali(item.appointment_date);
    const d = new Date(item.appointment_date);
    const dayIdx = (d.getDay() + 1) % 7;
    const dayName = JALALI_WEEKDAYS[dayIdx] || '';
    return `${dayName} ${toPersianDigits(jalali)}`.trim();
  }
  return '';
}

export function formatCardStartTime(item: AppointmentSmsPreviewItem): string {
  const raw = safeTrim(item.time_fa || item.start_time).slice(0, 5);
  return raw ? toPersianDigits(raw) : '';
}

export function normalizePhoneKey(raw: string): string {
  const trimmed = safeTrim(raw).replace(/\s|-/g, '');
  if (trimmed.startsWith('+98')) return '0' + trimmed.slice(3);
  if (trimmed.startsWith('98') && trimmed.length === 12) return '0' + trimmed.slice(2);
  return trimmed;
}

export interface MergedSmsRecipientGroup {
  phoneKey: string;
  displayPhone: string;
  parentName: string;
  students: AppointmentSmsPreviewItem[];
  isAlreadySentAll: boolean;
  isChangedAny: boolean;
  isFailedAny: boolean;
  defaultChecked: boolean;
}

export interface BulkSmsCategorization {
  /** Eligible recipient groups (deduplicated/merged by parent phone number) */
  recipientGroups: MergedSmsRecipientGroup[];
  /** Selected students who lack a valid parent phone number */
  noPhoneItems: AppointmentSmsPreviewItem[];
  /** Selected students who have no active appointment in the week */
  noAppointmentItems: AppointmentSmsPreviewItem[];
  /** Default checked student IDs (excludes already_sent, no_phone, no_appointment) */
  defaultCheckedStudentIds: number[];
  /** Count of merged duplicate phone numbers */
  mergedDuplicatesCount: number;
}

export function categorizeBulkSmsSelection(
  selectedItems: AppointmentSmsPreviewItem[]
): BulkSmsCategorization {
  const noPhoneItems: AppointmentSmsPreviewItem[] = [];
  const noAppointmentItems: AppointmentSmsPreviewItem[] = [];
  const phoneMap = new Map<string, AppointmentSmsPreviewItem[]>();
  let mergedDuplicatesCount = 0;

  for (const item of selectedItems) {
    if (!item.appointment_id || !item.appointment_date || !item.start_time || item.status === 'no_appointment') {
      noAppointmentItems.push(item);
      continue;
    }

    const rawPhone = normalizePhoneKey(item.mobile || item.mobile_mask || '');
    if (!rawPhone || item.status === 'no_phone' || item.has_valid_phone === false) {
      noPhoneItems.push(item);
      continue;
    }

    const existing = phoneMap.get(rawPhone);
    if (existing) {
      existing.push(item);
      mergedDuplicatesCount += 1;
    } else {
      phoneMap.set(rawPhone, [item]);
    }
  }

  const recipientGroups: MergedSmsRecipientGroup[] = [];
  const defaultCheckedStudentIds: number[] = [];

  for (const [phoneKey, groupStudents] of phoneMap.entries()) {
    const first = groupStudents[0];
    const displayPhone = safeTrim(first.mobile_mask || first.mobile) || phoneKey;
    const parentName = safeTrim(first.parent_name) || 'ولی دانش‌آموز';
    const isAlreadySentAll = groupStudents.every((s) => s.status === 'already_sent');
    const isChangedAny = groupStudents.some((s) => s.status === 'changed_since_sent');
    const isFailedAny = groupStudents.some((s) => s.status === 'failed');

    // Students who already received SMS this week are unchecked by default, but admin can check them
    const defaultChecked = !isAlreadySentAll;

    if (defaultChecked) {
      for (const s of groupStudents) {
        if (s.status !== 'already_sent') {
          defaultCheckedStudentIds.push(s.student_id);
        }
      }
    }

    recipientGroups.push({
      phoneKey,
      displayPhone,
      parentName,
      students: groupStudents,
      isAlreadySentAll,
      isChangedAny,
      isFailedAny,
      defaultChecked,
    });
  }

  return {
    recipientGroups,
    noPhoneItems,
    noAppointmentItems,
    defaultCheckedStudentIds,
    mergedDuplicatesCount,
  };
}

export function buildSmsMessagePreview(
  sampleItem?: AppointmentSmsPreviewItem | null
): string {
  const studentName = sampleItem?.student_name || 'نام دانش‌آموز';
  const dateLabel = sampleItem ? formatCardDateLabel(sampleItem) || 'شنبه ۱۴۰۴/۰۲/۲۰' : 'شنبه ۱۴۰۴/۰۲/۲۰';
  const timeLabel = sampleItem ? formatCardStartTime(sampleItem) || '۱۰:۳۰' : '۱۰:۳۰';

  return `ولی گرامی دانش‌آموز «${studentName}»\nنوبت جلسه مشاوره و آزمون هفتگی در تاریخ ${dateLabel} ساعت ${timeLabel} در آموزشگاه فامو ثبت شده است.`;
}
