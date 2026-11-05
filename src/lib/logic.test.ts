import test from 'node:test';
import assert from 'node:assert/strict';
import { toJalali, toGregorian, formatGregorianToJalali, jalaliMonthDays } from './jalali';
import {
  calculateSubjectMetrics,
  isValidIranianPhone,
  isValidNationalId,
  filterStudentsList,
} from './exam-math';
import {
  validateStudentForm,
  validateCourseForm,
  validateInstructorForm,
  validateSupporterForm,
  validateFileUploadForm,
  validateBlogPostForm,
  validateExamEntryForm,
  validateReportDateFilter,
} from './form-validation';
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
  const res = calculateSubjectMetrics(30, 20, 3);
  assert.equal(res.isValid, true);
  assert.equal(res.skipped, 7);
  assert.equal(res.percentage, 63.3);

  const invalid = calculateSubjectMetrics(20, 15, 10);
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.skipped, -5);
  assert.equal(invalid.percentage, null);
});

test('Phone and National ID validation enforces Iranian formats', () => {
  assert.equal(isValidIranianPhone('09123456789'), true);
  assert.equal(isValidIranianPhone('+989123456789'), true);
  assert.equal(isValidIranianPhone('08123456789'), false);
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

test('Custom form validators return field-specific Persian error messages for empty and invalid inputs', () => {
  const studentEmpty = validateStudentForm({
    name: '',
    phone: '',
    national_id: '',
    grade: '12',
    field: '',
  });
  assert.ok(studentEmpty.name);
  assert.ok(studentEmpty.phone);
  assert.ok(studentEmpty.national_id);
  assert.ok(studentEmpty.field);
  assert.equal(studentEmpty.grade, undefined);

  const studentValid = validateStudentForm({
    name: 'محمد حسینی',
    phone: '09123456789',
    national_id: '0012345678',
    grade: '12',
    field: 'تجربی',
  });
  assert.equal(Object.keys(studentValid).length, 0);

  const courseErrors = validateCourseForm({ name: '   ', display_order: '-1' });
  assert.ok(courseErrors.name);
  assert.ok(courseErrors.display_order);

  const instErrors = validateInstructorForm({ name: '', title: '' });
  assert.ok(instErrors.name);
  assert.ok(instErrors.title);

  const suppErrors = validateSupporterForm(
    { name: '', phone: '', grade: '12', field: '', username: '', password: '12' },
    false
  );
  assert.ok(suppErrors.name);
  assert.ok(suppErrors.phone);
  assert.ok(suppErrors.field);
  assert.ok(suppErrors.username);
  assert.ok(suppErrors.password);

  const fileErrors = validateFileUploadForm({ studentId: '', examDate: '', hasFile: false });
  assert.ok(fileErrors.studentId);
  assert.ok(fileErrors.examDate);
  assert.ok(fileErrors.file);

  const blogErrors = validateBlogPostForm({
    title: '',
    slug: '',
    category: '',
    content: '<p>   </p>',
    cover_image: 'invalid-url',
  });
  assert.ok(blogErrors.title);
  assert.ok(blogErrors.slug);
  assert.ok(blogErrors.category);
  assert.ok(blogErrors.content);
  assert.ok(blogErrors.cover_image);

  const examInvalid = validateExamEntryForm({
    hasStudent: false,
    studentQuery: '',
    rows: [{ id: 'r1', subject: '', chapter: '', total_q: '', correct: '', wrong: '' }],
  });
  assert.equal(examInvalid.isValid, false);
  assert.ok(examInvalid.studentError);
  assert.ok(examInvalid.rowErrors.r1?.subject);
  assert.ok(examInvalid.rowErrors.r1?.total_q);

  const reportErrors = validateReportDateFilter({
    dateFrom: '2026-05-10',
    dateTo: '2026-05-01',
  });
  assert.ok(reportErrors.dateTo);
});

test('API client targets https://api.famoacademy.ir/api/v1 and parses error envelopes', async () => {
  const { API, extractErrorMessage } = await import('./api');
  assert.equal(API.base, 'https://api.famoacademy.ir/api/v1');
  assert.equal(API.mainSiteUrl, 'https://famoacademy.ir');
  assert.equal(
    extractErrorMessage({ code: 'UNAUTHORIZED', message: 'توکن ارسال نشده است' }),
    'توکن ارسال نشده است'
  );
  assert.equal(extractErrorMessage('خطای مستقیم'), 'خطای مستقیم');
  assert.equal(extractErrorMessage(null, 'خطای پیش‌فرض'), 'خطای پیش‌فرض');
});

test('Regression: numeric chat_id, phone, and national_id never throw .trim is not a function', async () => {
  const { safeTrim, safeNumber, formatFixed } = await import('./exam-math');
  assert.equal(safeTrim(123456789), '123456789');
  assert.equal(safeTrim(null), '');
  assert.equal(safeTrim(undefined), '');
  assert.equal(safeTrim('  987654321  '), '987654321');

  assert.equal(safeNumber('64.25'), 64.25);
  assert.equal(safeNumber(78.5), 78.5);
  assert.equal(safeNumber(null), 0);
  assert.equal(safeNumber(undefined), 0);
  assert.equal(formatFixed('64.25', 1), '64.3');
  assert.equal(formatFixed(null, 1), '0.0');
  assert.equal(formatFixed(undefined, 1), '0.0');

  const suppEditErrors = validateSupporterForm(
    {
      name: 'سارا کریمی',
      phone: 9123456789,
      grade: 12,
      field: 'تجربی',
      chat_id: 123456789,
      username: 'sara',
      password: '',
    },
    true
  );
  assert.equal(Object.keys(suppEditErrors).length, 0);

  const studentNumericErrors = validateStudentForm({
    name: 'امیرحسین رضایی',
    phone: '09123456789',
    national_id: 1020304050,
    grade: 11,
    field: 'ریاضی',
  });
  assert.equal(Object.keys(studentNumericErrors).length, 0);

  const {
    validateAppointmentForm,
    validateParentContactForm,
    validateWeekSessionForm,
    validateRemedialClassForm,
  } = await import('./form-validation');

  const invalidAppt = validateAppointmentForm({
    appointment_date: '',
    start_time: '25:99',
  });
  assert.ok(invalidAppt.appointment_date);
  assert.ok(invalidAppt.start_time);

  const emptyTimeAppt = validateAppointmentForm({
    appointment_date: '2026-02-22',
    start_time: '',
  });
  assert.ok(emptyTimeAppt.start_time);

  const validAppt = validateAppointmentForm({
    appointment_date: '2026-02-22',
    start_time: '10:30',
  });
  assert.equal(Object.keys(validAppt).length, 0);

  const invalidContact = validateParentContactForm({
    parent_name: 'ا',
    phone: '0812345',
  });
  assert.ok(invalidContact.parent_name);
  assert.ok(invalidContact.phone);

  const validContact = validateParentContactForm({
    parent_name: 'حسین محمدی',
    phone: '09123456789',
  });
  assert.equal(Object.keys(validContact).length, 0);

  const invalidWeek = validateWeekSessionForm({
    title: '',
    start_date_jalali: '',
    end_date_jalali: '',
  });
  assert.ok(invalidWeek.title);
  assert.ok(invalidWeek.start_date_jalali);
  assert.ok(invalidWeek.end_date_jalali);

  const invalidClass = validateRemedialClassForm({ class_name: '   ' });
  assert.ok(invalidClass.class_name);
});

