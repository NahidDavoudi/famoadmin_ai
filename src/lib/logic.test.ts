import test from 'node:test';
import assert from 'node:assert/strict';
import { toJalali, toGregorian, formatGregorianToJalali, jalaliMonthDays } from './jalali';
import {
  calculateSubjectMetrics,
  isValidIranianPhone,
  isValidNationalId,
  filterStudentsList,
} from './exam-math';
import type { Student } from '../types';

test('Jalali to Gregorian round-trip conversion works accurately', () => {
  const [jy, jm, jd] = toJalali(2025, 2, 6);
  assert.equal(jy, 1403);
  assert.equal(jm, 11);
  assert.equal(jd, 18);

  const [gy, gm, gd] = toGregorian(jy, jm, jd);
  assert.equal(gy, 2025);
  assert.equal(gm, 2);
  assert.equal(gd, 6);

  assert.equal(formatGregorianToJalali('2025-02-06'), '1403/11/18');
  assert.equal(jalaliMonthDays(1, 1403), 31);
  assert.equal(jalaliMonthDays(7, 1403), 30);
});

test('calculateSubjectMetrics computes Konkur negative marking percentage and skipped count', () => {
  // 30 questions, 20 correct, 3 wrong => skipped = 7, score = ((20 - 1) / 30) * 100 = 63.3%
  const res = calculateSubjectMetrics(30, 20, 3);
  assert.equal(res.isValid, true);
  assert.equal(res.skipped, 7);
  assert.equal(res.percentage, 63.3);

  // Invalid when correct + wrong > total
  const invalid = calculateSubjectMetrics(20, 15, 10);
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.skipped, -5);
  assert.equal(invalid.percentage, null);
});

test('Phone and National ID validation enforces Iranian formats', () => {
  assert.equal(isValidIranianPhone('09123456789'), true);
  assert.equal(isValidIranianPhone('9123456789'), false);
  assert.equal(isValidNationalId('0012345678'), true);
  assert.equal(isValidNationalId('12345'), false);
});

test('filterStudentsList filters by search, field, grade, and status', () => {
  const sample: Student[] = [
    { id: 1, name: 'علی رضایی', phone: '09121112233', national_id: '0011223344', grade: 12, field: 'ریاضی', is_active: 1, user_id: 10 },
    { id: 2, name: 'سارا محمدی', phone: '09124445566', national_id: '0055667788', grade: 11, field: 'تجربی', is_active: 0, user_id: null },
  ];

  assert.equal(filterStudentsList(sample, { search: 'سارا' }).length, 1);
  assert.equal(filterStudentsList(sample, { field: 'ریاضی' }).length, 1);
  assert.equal(filterStudentsList(sample, { grade: 11 }).length, 1);
  assert.equal(filterStudentsList(sample, { status: 'active' }).length, 1);
  assert.equal(filterStudentsList(sample, { status: 'inactive' }).length, 1);
});
