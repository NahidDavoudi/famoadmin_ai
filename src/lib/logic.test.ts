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
    { name: '', phone: '', grade: '12', field: '', password: '12' },
    false
  );
  assert.ok(suppErrors.name);
  assert.ok(suppErrors.phone);
  assert.ok(suppErrors.field);
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
      phone: '09123456789',
      grade: 12,
      field: 'تجربی',
      chat_id: 123456789,
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

test('Appointments card status resolution and bulk SMS categorization handle 5 statuses, phone merging, and already_sent defaults', async () => {
  const {
    resolveCardAppointmentStatus,
    categorizeBulkSmsSelection,
    buildSmsMessagePreview,
    formatCardStartTime,
  } = await import('./appointments-logic');
  type Item = import('../types').AppointmentSmsPreviewItem;

  const makeItem = (overrides: Partial<Item>): Item => ({
    student_id: 1,
    student_name: 'علی رضایی',
    grade: 12,
    field: 'ریاضی',
    parent_name: 'حسن رضایی',
    recipient_type: 'parent',
    mobile: '09121112233',
    mobile_mask: '0912***2233',
    has_valid_phone: true,
    appointment_id: 101,
    appointment_date: '2026-02-22',
    appointment_jalali: '1404/12/03',
    weekday: 'شنبه',
    start_time: '15:30:00',
    end_time: null,
    appointment_at: '2026-02-22 15:30:00',
    active_appointments_count: 1,
    multiple_appointments: false,
    last_error: null,
    last_sent_at: null,
    attempts: 0,
    appointment_status: 'scheduled',
    status: 'will_send',
    arrival_time: null,
    exam_start_time: null,
    exam_end_time: null,
    ...overrides,
  });

  // 1. 5 statuses mapping
  assert.equal(resolveCardAppointmentStatus(makeItem({ appointment_status: 'pending' })).key, 'pending');
  assert.equal(resolveCardAppointmentStatus(makeItem({ appointment_status: 'scheduled' })).key, 'confirmed');
  assert.equal(resolveCardAppointmentStatus(makeItem({ appointment_status: 'completed' })).key, 'completed');
  assert.equal(
    resolveCardAppointmentStatus(makeItem({ appointment_status: 'scheduled', arrival_time: '15:25' })).key,
    'completed'
  );
  assert.equal(resolveCardAppointmentStatus(makeItem({ appointment_status: 'absent' })).key, 'absent');
  assert.equal(resolveCardAppointmentStatus(makeItem({ appointment_status: 'cancelled' })).key, 'cancelled');
  assert.equal(
    resolveCardAppointmentStatus(makeItem({ appointment_id: null, appointment_status: undefined })).key,
    'cancelled'
  );
  assert.equal(
    resolveCardAppointmentStatus(makeItem({ appointment_id: null, appointment_status: undefined })).label,
    'بدون نوبت'
  );

  // 2. Time formatting
  assert.equal(formatCardStartTime(makeItem({ start_time: '16:45:00' })), '۱۶:۴۵');
  assert.equal(formatCardStartTime(makeItem({ appointment_id: null, start_time: null })), '');

  // 3. Bulk SMS categorization: separates no_phone, merges duplicate parent phone, unchecks already_sent by default
  const items: Item[] = [
    makeItem({
      student_id: 1,
      student_name: 'علی رضایی',
      mobile: '09121112233',
      status: 'will_send',
    }),
    makeItem({
      student_id: 2,
      student_name: 'زهرا رضایی', // sibling with same parent phone
      mobile: '+989121112233',
      status: 'changed_since_sent',
    }),
    makeItem({
      student_id: 3,
      student_name: 'سارا محمدی',
      mobile: '09123334455',
      status: 'already_sent',
    }),
    makeItem({
      student_id: 4,
      student_name: 'امیر حسینی',
      mobile: '',
      mobile_mask: '',
      has_valid_phone: false,
      status: 'no_phone',
    }),
  ];

  const summary = categorizeBulkSmsSelection(items);
  assert.equal(summary.noPhoneItems.length, 1);
  assert.equal(summary.noPhoneItems[0].student_id, 4);
  assert.equal(summary.mergedDuplicatesCount, 1);
  assert.equal(summary.recipientGroups.length, 2);
  assert.equal(summary.recipientGroups.filter((g) => g.isAlreadySentAll).length, 1);
  // Students 1 & 2 checked by default; Student 3 (already_sent) unchecked by default
  assert.deepEqual(summary.defaultCheckedStudentIds, [1, 2]);

  const msg = buildSmsMessagePreview(items[0]);
  assert.ok(msg.includes('علی رضایی'));
  assert.ok(msg.includes('۱۵:۳۰'));
});

test('Spreadsheet appointment time normalization and sync plan compute create, update, delete, and invalid rows', async () => {
  const {
    normalizeTimeInput,
    isValidAppointmentTimeHm,
    computeSpreadsheetSyncPlan,
  } = await import('./appointments-logic');

  assert.equal(normalizeTimeInput('9'), '09:00');
  assert.equal(normalizeTimeInput('14'), '14:00');
  assert.equal(normalizeTimeInput('930'), '09:30');
  assert.equal(normalizeTimeInput('1445'), '14:45');
  assert.equal(normalizeTimeInput('۱۶:۱۵'), '16:15');
  assert.equal(isValidAppointmentTimeHm('14:30'), true);
  assert.equal(isValidAppointmentTimeHm('930'), true);
  assert.equal(isValidAppointmentTimeHm('25:00'), false);

  const students = [
    { student_id: 1, student_name: 'علی رضایی' },
    { student_id: 2, student_name: 'سارا محمدی' },
    { student_id: 3, student_name: 'زهرا کریمی' },
    { student_id: 4, student_name: 'امیر حسینی' },
  ];

  const existing = {
    2: {
      appointment_id: 201,
      student_id: 2,
      appointment_date: '2026-11-05',
      start_time: '10:00',
    },
    3: {
      appointment_id: 202,
      student_id: 3,
      appointment_date: '2026-11-05',
      start_time: '12:00',
    },
  };

  const draft = {
    1: '1430', // create -> 14:30
    2: '11:15', // update -> 11:15
    3: '', // delete -> cleared
    4: '99:99', // invalid
  };

  const plan = computeSpreadsheetSyncPlan(students, existing, draft);
  assert.equal(plan.toCreate.length, 1);
  assert.deepEqual(plan.toCreate[0], {
    student_id: 1,
    student_name: 'علی رضایی',
    start_time: '14:30',
  });
  assert.equal(plan.toUpdate.length, 1);
  assert.deepEqual(plan.toUpdate[0], {
    appointment_id: 201,
    student_id: 2,
    student_name: 'سارا محمدی',
    old_time: '10:00',
    start_time: '11:15',
  });
  assert.equal(plan.toDelete.length, 1);
  assert.equal(plan.toDelete[0].appointment_id, 202);
  assert.equal(plan.invalidRows.length, 1);
  assert.equal(plan.invalidRows[0].student_id, 4);
  assert.deepEqual(plan.activeStudentIdsWithTime, [1, 2]);
});

test('normalizeExamSubject and normalizeExamDetails recompute Konkur negative marking and preserve negative percentages', async () => {
  const { normalizeExamSubject, normalizeExamDetails } = await import('./exam-math');

  // Case 1: 0 correct, 5 wrong out of 15 -> backend returns 0.0%, Konkur formula is -11.1%
  const negZeroCorrect = normalizeExamSubject({
    subject: 'شیمی',
    chapter: 'فصل ۱',
    total_q: 15,
    correct: 0,
    wrong: 5,
    skipped: 10,
    percentage: 0, // backend simple ratio (0 / 15 * 100)
  });
  assert.equal(negZeroCorrect.skipped, 10);
  assert.equal(negZeroCorrect.percentage, -11.1);

  // Case 2: 2 correct, 10 wrong out of 20 -> backend returns 10.0%, Konkur formula is ((6 - 10)/60)*100 = -6.7%
  const negWithCorrect = normalizeExamSubject({
    subject: 'فیزیک',
    chapter: null,
    total_q: 20,
    correct: 2,
    wrong: 10,
    skipped: 8,
    percentage: 10, // backend simple ratio (2 / 20 * 100)
  });
  assert.equal(negWithCorrect.skipped, 8);
  assert.equal(negWithCorrect.percentage, -6.7);

  // Case 3: 10 correct, 6 wrong out of 20 -> backend returns 50.0%, Konkur formula is ((30 - 6)/60)*100 = 40.0%
  const posWithPenalty = normalizeExamSubject({
    subject: 'زیست‌شناسی',
    chapter: 'فصل ۲',
    total_q: 20,
    correct: 10,
    wrong: 6,
    skipped: 4,
    percentage: 50, // backend simple ratio (10 / 20 * 100)
  });
  assert.equal(posWithPenalty.skipped, 4);
  assert.equal(posWithPenalty.percentage, 40);

  // Report card details average should be (-11.1 + -6.7 + 40) / 3 = 22.2 / 3 = 7.4%
  const reportCard = normalizeExamDetails({
    student: { id: 7, name: 'سارا محمدی', grade: 12, field: 'تجربی' },
    exam_date: '2026-02-20',
    avg_percentage: 20, // backend average of [0, 10, 50]
    subjects: [
      { subject: 'شیمی', chapter: 'فصل ۱', total_q: 15, correct: 0, wrong: 5, skipped: 10, percentage: 0 },
      { subject: 'فیزیک', chapter: null, total_q: 20, correct: 2, wrong: 10, skipped: 8, percentage: 10 },
      { subject: 'زیست‌شناسی', chapter: 'فصل ۲', total_q: 20, correct: 10, wrong: 6, skipped: 4, percentage: 50 },
    ],
  });
  assert.equal(reportCard.subjects[0].percentage, -11.1);
  assert.equal(reportCard.subjects[1].percentage, -6.7);
  assert.equal(reportCard.subjects[2].percentage, 40);
  assert.equal(reportCard.avg_percentage, 7.4);

  const { createInitialTeacherFeedbacks } = await import('./exam-math');
  const feedbacks = createInitialTeacherFeedbacks(reportCard);
  assert.equal(feedbacks.length, 3);
  assert.equal(feedbacks[0].subject, 'شیمی');
  assert.equal(feedbacks[0].percentage, -11.1);
  assert.equal(feedbacks[1].subject, 'فیزیک');
  assert.equal(feedbacks[1].percentage, -6.7);
  assert.equal(feedbacks[2].subject, 'زیست‌شناسی');
  assert.equal(feedbacks[2].percentage, 40);

  // Test buildStudentExamTrend: groups by exam_date, sorts chronologically, caps at last 5 exams, computes Konkur % and deltas
  const { buildStudentExamTrend } = await import('./exam-math');
  const historyRows = [
    { exam_date: '2026-01-01', subject: 'ریاضی', total_q: 20, correct: 5, wrong: 3 }, // (15-3)/60 = 20%
    { exam_date: '2026-01-08', subject: 'ریاضی', total_q: 20, correct: 8, wrong: 6 }, // (24-6)/60 = 30%
    { exam_date: '2026-01-15', subject: 'ریاضی', total_q: 15, correct: 0, wrong: 5 }, // -11.1%
    { exam_date: '2026-01-22', subject: 'ریاضی', total_q: 20, correct: 10, wrong: 0 }, // 50%
    { exam_date: '2026-01-29', subject: 'ریاضی', total_q: 20, correct: 12, wrong: 0 }, // 60%
    { exam_date: '2026-02-05', subject: 'ریاضی', total_q: 20, correct: 15, wrong: 3 }, // (45-3)/60 = 70%
    { exam_date: '2026-02-05', subject: 'فیزیک', total_q: 20, correct: 10, wrong: 0 }, // 50% -> avg on 2026-02-05 is (70+50)/2 = 60%
  ];

  const trend = buildStudentExamTrend(historyRows, {
    currentExamDate: '2026-02-05',
    limit: 5,
  });

  // Should only keep the last 5 distinct exam dates (2026-01-08 through 2026-02-05)
  assert.equal(trend.length, 5);
  assert.equal(trend[0].exam_date, '2026-01-08');
  assert.equal(trend[0].avg_percentage, 30);
  assert.equal(trend[0].delta, null);

  assert.equal(trend[1].exam_date, '2026-01-15');
  assert.equal(trend[1].avg_percentage, -11.1);
  assert.equal(trend[1].delta, -41.1);

  assert.equal(trend[2].exam_date, '2026-01-22');
  assert.equal(trend[2].avg_percentage, 50);
  assert.equal(trend[2].delta, 61.1);

  assert.equal(trend[3].exam_date, '2026-01-29');
  assert.equal(trend[3].avg_percentage, 60);
  assert.equal(trend[3].delta, 10);

  assert.equal(trend[4].exam_date, '2026-02-05');
  assert.equal(trend[4].subject_count, 2);
  assert.equal(trend[4].avg_percentage, 60);
  assert.equal(trend[4].delta, 0);
  assert.equal(trend[4].is_current, true);
});

test('Activity log describes API mutations, normalizes server logs, merges logs, and filters by actor/category/action', async () => {
  const {
    describeApiMutation,
    normalizeServerActivityLog,
    mergeActivityLogs,
    filterActivityLogs,
  } = await import('./activity-log');

  const studentCreate = describeApiMutation('POST', '/students', {
    name: 'امیرمحمد رضایی',
    grade: 12,
    field: 'تجربی',
  });
  assert.ok(studentCreate);
  assert.equal(studentCreate.category, 'students');
  assert.equal(studentCreate.action_type, 'create');
  assert.ok(studentCreate.description.includes('امیرمحمد رضایی'));

  const examBatch = describeApiMutation('POST', '/exams/batch', {
    student_id: 14,
    exam_date: '2026-02-20',
    subjects: [{ subject: 'ریاضی' }, { subject: 'فیزیک' }],
  });
  assert.ok(examBatch);
  assert.equal(examBatch.category, 'exams');
  assert.equal(examBatch.action_type, 'create');
  assert.ok(examBatch.description.includes('2 درس'));

  const smsSend = describeApiMutation('POST', '/appointments/sms/send', {
    student_ids: [1, 2, 3],
    week_start: '2026-02-21',
  });
  assert.ok(smsSend);
  assert.equal(smsSend.category, 'appointments');
  assert.equal(smsSend.action_type, 'send_sms');

  // GET requests should never be logged as mutations
  assert.equal(describeApiMutation('GET', '/students'), null);

  const serverRow = normalizeServerActivityLog({
    id: 99,
    actor_name: 'سارا کریمی',
    actor_role: 'پشتیبان',
    action_type: 'update',
    category: 'appointments',
    title: 'ویرایش نوبت هفتگی',
    description: 'علی رضایی - ساعت 16:30',
    created_at: '2026-02-22T12:30:00.000Z',
  });
  assert.ok(serverRow);
  assert.equal(serverRow.actor_name, 'سارا کریمی');
  assert.equal(serverRow.category, 'appointments');
  assert.equal(serverRow.source, 'server');

  const merged = mergeActivityLogs(
    [serverRow],
    [],
    [
      {
        id: 'local-2',
        actor_name: 'مدیر سیستم',
        actor_role: 'مدیر کل',
        action_type: 'delete',
        category: 'students',
        category_label: 'دانش‌آموزان',
        title: 'حذف دانش‌آموز',
        description: 'دانش‌آموز شناسه 18 حذف شد',
        created_at: '2026-02-22T14:00:00.000Z',
        jalali_datetime: '1404/12/03 - 14:00',
        source: 'client',
      },
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'local-2'); // newer first

  assert.equal(filterActivityLogs(merged, { category: 'students' }).length, 1);
  assert.equal(filterActivityLogs(merged, { actionType: 'update' }).length, 1);
  assert.equal(filterActivityLogs(merged, { search: 'سارا کریمی' }).length, 1);

  // Test staff_activity_logs backend record normalization & stats endpoint normalization
  const { normalizeActivityLogsStats } = await import('./activity-log');
  const staffLog = normalizeServerActivityLog({
    id: 501,
    actor_user_id: 12,
    actor_linked_id: 4,
    actor_name: 'مهندس حسینی',
    role: 'teacher',
    module: 'tutoring',
    action: 'start_session',
    target_id: 88,
    summary: 'شروع جلسه رفع اشکال فیزیک برای دانش‌آموز علی رضایی',
    details: JSON.stringify({ student_id: 101, classroom_id: 3, password: '***' }),
    created_at: '2026-03-10 16:45:00',
  });
  assert.equal(staffLog.actor_user_id, 12);
  assert.equal(staffLog.actor_linked_id, 4);
  assert.equal(staffLog.actor_role, 'teacher');
  assert.equal(staffLog.category, 'tutoring');
  assert.equal(staffLog.action_type, 'start_session');
  assert.equal(staffLog.target_id, 88);
  assert.equal(staffLog.title, 'شروع جلسه رفع اشکال فیزیک برای دانش‌آموز علی رضایی');
  assert.ok(staffLog.details_json);
  assert.equal(staffLog.details_json?.student_id, 101);

  const filteredByRoleAndIds = filterActivityLogs([serverRow, staffLog], {
    role: 'teacher',
    actorUserId: 12,
    actorLinkedId: 4,
    from: '2026-03-01',
    to: '2026-03-15',
  });
  assert.equal(filteredByRoleAndIds.length, 1);
  assert.equal(filteredByRoleAndIds[0].id, 'srv-501');

  const statsNormalized = normalizeActivityLogsStats(
    {
      total_logs: 145,
      today_logs: 18,
      by_role: { admin: 60, supporter: 55, teacher: 30 },
      by_module: [
        { module: 'appointments', count: 50 },
        { module: 'tutoring', count: 40 },
        { module: 'exams', count: 35 },
      ],
      active_actors: [
        {
          actor_user_id: 12,
          actor_linked_id: 4,
          actor_name: 'مهندس حسینی',
          role: 'teacher',
          total_actions: 30,
          last_activity_at: '2026-03-10 16:45:00',
        },
      ],
    },
    [staffLog]
  );
  assert.equal(statsNormalized.total_logs, 145);
  assert.equal(statsNormalized.today_logs, 18);
  assert.equal(statsNormalized.by_role.admin, 60);
  assert.equal(statsNormalized.by_role.supporter, 55);
  assert.equal(statsNormalized.by_role.teacher, 30);
  assert.equal(statsNormalized.by_module[0].module, 'appointments');
  assert.equal(statsNormalized.by_module[0].count, 50);
  assert.equal(statsNormalized.active_actors.length, 1);
  assert.equal(statsNormalized.active_actors[0].actor_name, 'مهندس حسینی');
  assert.equal(statsNormalized.active_actors[0].total_actions, 30);
});

test('DataTable resolveVisibleColumns hides columns with hideWhenEmpty when all rows are "-" or empty', async () => {
  const {
    isValueEffectivelyEmpty,
    resolveVisibleColumns,
    isRowColumnEmpty,
  } = await import('../components/DataTable');

  assert.equal(isValueEffectivelyEmpty(''), true);
  assert.equal(isValueEffectivelyEmpty('-'), true);
  assert.equal(isValueEffectivelyEmpty('—'), true);
  assert.equal(isValueEffectivelyEmpty(null), true);
  assert.equal(isValueEffectivelyEmpty('فصل اول: مثلثات'), false);

  interface MockSubRow {
    subject: string;
    chapter: string | null;
  }

  const columns = [
    {
      key: 'subject',
      header: 'نام درس',
      priority: 'primary' as const,
      cell: (r: MockSubRow) => r.subject,
    },
    {
      key: 'chapter',
      header: 'مبحث',
      priority: 'secondary' as const,
      hideWhenEmpty: true,
      value: (r: MockSubRow) => r.chapter,
      cell: (r: MockSubRow) => r.chapter || '-',
    },
  ];

  const rowsWithEmptyChapter: MockSubRow[] = [
    { subject: 'ریاضی', chapter: '-' },
    { subject: 'فیزیک', chapter: null },
    { subject: 'شیمی', chapter: '   ' },
  ];

  const visibleWhenEmpty = resolveVisibleColumns(columns, rowsWithEmptyChapter);
  assert.equal(visibleWhenEmpty.length, 1);
  assert.equal(visibleWhenEmpty[0].key, 'subject');

  const rowsWithRealChapter: MockSubRow[] = [
    { subject: 'ریاضی', chapter: '-' },
    { subject: 'فیزیک', chapter: 'دینامیک' },
  ];

  const visibleWhenPresent = resolveVisibleColumns(columns, rowsWithRealChapter);
  assert.equal(visibleWhenPresent.length, 2);
  assert.equal(isRowColumnEmpty(columns[1], rowsWithRealChapter[0]), true);
  assert.equal(isRowColumnEmpty(columns[1], rowsWithRealChapter[1]), false);
});

test('resolveEntityImageUrl resolves data URLs, full HTTP URLs, and relative API paths', async () => {
  const { resolveEntityImageUrl } = await import('./image-upload');

  assert.equal(resolveEntityImageUrl(null), null);
  assert.equal(resolveEntityImageUrl('   '), null);
  assert.equal(
    resolveEntityImageUrl('data:image/jpeg;base64,abc123'),
    'data:image/jpeg;base64,abc123'
  );
  assert.equal(
    resolveEntityImageUrl('https://cdn.famoacademy.ir/avatars/1.jpg'),
    'https://cdn.famoacademy.ir/avatars/1.jpg'
  );
  assert.equal(
    resolveEntityImageUrl('/uploads/instructors/1.png'),
    'https://api.famoacademy.ir/uploads/instructors/1.png'
  );
  assert.equal(
    resolveEntityImageUrl('uploads/supporters/2.png'),
    'https://api.famoacademy.ir/uploads/supporters/2.png'
  );
  assert.equal(
    resolveEntityImageUrl('supporters/2/6ae0fd38b645b3.96909346.webp'),
    'https://api.famoacademy.ir/supporters/2/6ae0fd38b645b3.96909346.webp'
  );
});

test('Supporter avatar and description persistence helpers save, retrieve, and remove locally cached data', async () => {
  const {
    saveLocalSupporterAvatar,
    getAllLocalSupporterAvatars,
    removeLocalSupporterAvatar,
    saveLocalSupporterDescription,
    getAllLocalSupporterDescriptions,
    removeLocalSupporterDescription,
  } = await import('./image-upload');

  // Test when localStorage is mocked or available in environment
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  (globalThis as unknown as { localStorage: typeof mockStorage }).localStorage = mockStorage;

  saveLocalSupporterAvatar(2, 'data:image/jpeg;base64,supporter2avatar');
  assert.equal(getAllLocalSupporterAvatars()['2'], 'data:image/jpeg;base64,supporter2avatar');

  saveLocalSupporterDescription(2, 'مشاور تحصیلی ارشد کنکور تجربی');
  assert.equal(
    getAllLocalSupporterDescriptions()['2'],
    'مشاور تحصیلی ارشد کنکور تجربی'
  );

  removeLocalSupporterAvatar(2);
  assert.equal(getAllLocalSupporterAvatars()['2'], undefined);

  removeLocalSupporterDescription(2);
  assert.equal(getAllLocalSupporterDescriptions()['2'], undefined);
});

test('Exam comments and 14-day share link helpers validate, compose, normalize, and filter accurately', async () => {
  const {
    validateExamCommentBody,
    buildCombinedExamCommentBody,
    getAuthorRoleLabel,
    normalizeExamComment,
    normalizeExamShareLinkItem,
    filterExamShareLinks,
  } = await import('./exam-math');
  const { describeApiMutation } = await import('./activity-log');

  assert.equal(validateExamCommentBody('   '), 'متن نظر استاد یا مشاور نمی‌تواند خالی باشد');
  assert.equal(validateExamCommentBody('تحلیل عالی آزمون'), null);
  assert.equal(
    validateExamCommentBody('الف'.repeat(2001)),
    'متن نظر نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد'
  );

  const combined = buildCombinedExamCommentBody(
    [
      {
        id: '1',
        subject: 'فیزیک',
        chapter: 'دینامیک',
        percentage: 72.5,
        instructorName: 'حسینی',
        comment: 'تسلط خوب روی تست‌های زمان‌دار.',
      },
      {
        id: '2',
        subject: 'شیمی',
        chapter: '',
        percentage: 45,
        instructorName: '',
        comment: 'نیاز به مرور استوکیومتری.',
      },
    ],
    'ساعت مطالعه هفتگی ۱۰ درصد افزایش یابد.'
  );

  assert.ok(combined.includes('• فیزیک (استاد حسینی): تسلط خوب روی تست‌های زمان‌دار.'));
  assert.ok(combined.includes('• شیمی: نیاز به مرور استوکیومتری.'));
  assert.ok(combined.includes('جمع‌بندی مشاور: ساعت مطالعه هفتگی ۱۰ درصد افزایش یابد.'));

  assert.equal(getAuthorRoleLabel('teacher'), 'استاد');
  assert.equal(getAuthorRoleLabel('supporter'), 'پشتیبان');
  assert.equal(getAuthorRoleLabel('admin'), 'مدیر آموزشگاه');
  assert.equal(getAuthorRoleLabel(null), 'کادر آموزشی');

  const normalizedComment = normalizeExamComment({
    id: 7,
    student_id: 101,
    exam_date: '2026-05-08',
    teacher_user_id: 3,
    author_role: 'teacher',
    body: '  پیشرفت عالی در درس فیزیک  ',
    created_at: '2026-05-08T11:00:00Z',
  });
  assert.equal(normalizedComment.author_name, 'استاد');
  assert.equal(normalizedComment.body, 'پیشرفت عالی در درس فیزیک');

  const nowMs = Date.parse('2026-05-10T10:00:00Z');
  const activeLink = normalizeExamShareLinkItem(
    {
      id: 11,
      student_id: 101,
      student_name: 'سارا محمدی',
      exam_date: '2026-05-08',
      expires_at: '2026-05-22T10:00:00Z',
      sms_sent_at: '2026-05-08T12:30:00Z',
    },
    nowMs
  );
  assert.equal(activeLink.status, 'active');

  const expiredLink = normalizeExamShareLinkItem(
    {
      id: 12,
      student_id: 102,
      student_name: 'امیر رضایی',
      exam_date: '2026-04-15',
      expires_at: '2026-04-29T10:00:00Z',
    },
    nowMs
  );
  assert.equal(expiredLink.status, 'expired');

  const revokedLink = normalizeExamShareLinkItem(
    {
      id: 13,
      student_id: 103,
      student_name: 'مریم کریمی',
      exam_date: '2026-05-08',
      expires_at: '2026-05-22T10:00:00Z',
      revoked_at: '2026-05-09T08:00:00Z',
    },
    nowMs
  );
  assert.equal(revokedLink.status, 'revoked');

  const allLinks = [activeLink, expiredLink, revokedLink];
  assert.equal(filterExamShareLinks(allLinks, { status: 'active' }).length, 1);
  assert.equal(filterExamShareLinks(allLinks, { status: 'revoked' }).length, 1);
  assert.equal(filterExamShareLinks(allLinks, { search: 'سارا' }).length, 1);

  const shareSmsLog = describeApiMutation('POST', '/exams/share-links/send-sms', {
    student_id: 101,
    exam_date: '2026-05-08',
  });
  assert.equal(shareSmsLog?.action_type, 'send_sms');
  assert.equal(shareSmsLog?.category, 'exams');

  const revokeLog = describeApiMutation('DELETE', '/exams/share-links/11');
  assert.equal(revokeLog?.action_type, 'delete');
  assert.equal(revokeLog?.title, 'ابطال لینک اشتراک کارنامه');
});

test('Course subscriptions helpers normalize statuses, validate forms, compute stats, filter, and log mutations', async () => {
  const {
    normalizeSubscriptionStatus,
    normalizeSubscription,
    validateSubscriptionForm,
    computeSubscriptionStats,
    filterSubscriptions,
    getSubscriptionStatusLabel,
  } = await import('./subscriptions');
  const { describeApiMutation } = await import('./activity-log');

  assert.equal(normalizeSubscriptionStatus('active'), 'active');
  assert.equal(normalizeSubscriptionStatus('canceled'), 'cancelled');
  assert.equal(normalizeSubscriptionStatus('suspended'), 'pending');
  assert.equal(getSubscriptionStatusLabel('pending'), 'در انتظار تأیید (معلق)');
  assert.equal(getSubscriptionStatusLabel('active', 0), 'معلق (غیرفعال)');

  const sub1 = normalizeSubscription({
    id: 1,
    course_id: 10,
    student_id: 101,
    status: 'active',
    is_active: 1,
    note: 'پرداخت نقدی',
    started_at: '2026-11-01T00:00:00Z',
    end_at: '2027-03-01T00:00:00Z',
    course: { id: 10, name: 'دوره جامع کنکور تجربی', price: 4500000 },
    student: { id: 101, name: 'علی رضایی', phone: '09121112233', grade: 12, field: 'تجربی' },
  });
  assert.equal(sub1.status, 'active');
  assert.equal(sub1.is_active, 1);
  assert.equal(sub1.course.name, 'دوره جامع کنکور تجربی');
  assert.equal(sub1.student.name, 'علی رضایی');

  const sub2 = normalizeSubscription({
    id: 2,
    course_id: 11,
    student_id: 102,
    status: 'pending',
    is_active: 0,
    course_name: 'همایش جمع‌بندی فیزیک',
    student_name: 'سارا محمدی',
    student_phone: '09123334455',
  });
  assert.equal(sub2.status, 'pending');
  assert.equal(sub2.is_active, 0);
  assert.equal(sub2.course.name, 'همایش جمع‌بندی فیزیک');
  assert.equal(sub2.student.name, 'سارا محمدی');

  const sub3 = normalizeSubscription({
    id: 3,
    course_id: 10,
    student_id: 103,
    status: 'canceled',
    is_active: 0,
    course: { id: 10, name: 'دوره جامع کنکور تجربی' },
    student: { id: 103, name: 'امیر کریمی' },
  });
  assert.equal(sub3.status, 'cancelled');

  // Form validation checks
  const invalidEmpty = validateSubscriptionForm({ student_id: '', course_id: '' });
  assert.ok(invalidEmpty.student_id);
  assert.ok(invalidEmpty.course_id);

  const invalidDates = validateSubscriptionForm({
    student_id: 101,
    course_id: 10,
    started_at: '2026-12-10',
    end_at: '2026-11-01',
  });
  assert.ok(invalidDates.end_at);

  const validForm = validateSubscriptionForm({
    student_id: 101,
    course_id: 10,
    started_at: '2026-11-01',
    end_at: '2026-12-10',
    note: 'ثبت‌نام ترم پاییز',
  });
  assert.equal(Object.keys(validForm).length, 0);

  // Stats & filtering
  const list = [sub1, sub2, sub3];
  const stats = computeSubscriptionStats(list);
  assert.equal(stats.total, 3);
  assert.equal(stats.active, 1);
  assert.equal(stats.pending, 1);
  assert.equal(stats.cancelled, 1);

  assert.equal(filterSubscriptions(list, { course_id: 10 }).length, 2);
  assert.equal(filterSubscriptions(list, { status: 'pending' }).length, 1);
  assert.equal(filterSubscriptions(list, { search: 'سارا' }).length, 1);
  assert.equal(filterSubscriptions(list, { is_active: 1 }).length, 1);

  // Activity log mutation descriptions
  const createSubLog = describeApiMutation('POST', '/subscriptions', {
    student_id: 101,
    course_id: 10,
  });
  assert.equal(createSubLog?.action_type, 'create');
  assert.equal(createSubLog?.category, 'courses');

  const patchStatusLog = describeApiMutation('PATCH', '/subscriptions/1/status', {
    status: 'cancelled',
  });
  assert.equal(patchStatusLog?.action_type, 'status_change');
  assert.equal(patchStatusLog?.category, 'courses');
});

test('Student-to-Supporter assignments helpers normalize rows, history, initial-fill report, categorize supporters, filter, and log mutations', async () => {
  const {
    normalizeAssignmentStudentRow,
    normalizeAssignmentHistoryEntry,
    normalizeInitialFillReport,
    categorizeSupportersForStudent,
    computeAssignmentStats,
    filterAssignmentStudents,
  } = await import('./assignments');
  const { describeApiMutation } = await import('./activity-log');

  const assignedStudent = normalizeAssignmentStudentRow({
    id: 101,
    name: 'علی رضایی',
    phone: '09121112233',
    national_id: '0012345678',
    grade: 12,
    field: 'تجربی',
    status: 1,
    assignment: {
      assignment_id: 55,
      student_id: 101,
      supporter_id: 5,
      supporter_name: 'سارا کریمی',
      supporter_grade: 12,
      supporter_field: 'تجربی',
      assigned_at: '2026-05-01 10:00:00',
      is_active: 1,
      note: 'تخصیص اولیه',
    },
  });

  assert.equal(assignedStudent.student_id, 101);
  assert.equal(assignedStudent.supporter_id, 5);
  assert.equal(assignedStudent.supporter_name, 'سارا کریمی');

  const unassignedStudent = normalizeAssignmentStudentRow({
    id: 102,
    name: 'مریم محمدی',
    phone: '09129998877',
    grade: 11,
    field: 'ریاضی',
    status: 1,
    assignment: null,
  });
  assert.equal(unassignedStudent.supporter_id, null);

  const stats = computeAssignmentStats([assignedStudent, unassignedStudent]);
  assert.equal(stats.total, 2);
  assert.equal(stats.assigned, 1);
  assert.equal(stats.unassigned, 1);

  assert.equal(
    filterAssignmentStudents([assignedStudent, unassignedStudent], { status: 'assigned' }).length,
    1
  );
  assert.equal(
    filterAssignmentStudents([assignedStudent, unassignedStudent], { status: 'unassigned' }).length,
    1
  );
  assert.equal(
    filterAssignmentStudents([assignedStudent, unassignedStudent], { supporter_id: 5 }).length,
    1
  );
  assert.equal(
    filterAssignmentStudents([assignedStudent, unassignedStudent], { search: 'مریم' }).length,
    1
  );

  // Categorize supporters for a grade 12 تجربی student
  const mockSupporters = [
    { id: 1, name: 'سارا کریمی', grade: 12, field: 'تجربی' as const, is_active: 1 },
    { id: 2, name: 'امیر حسینی', grade: 11, field: 'تجربی' as const, is_active: 1 },
    { id: 3, name: 'زهرا علوی', grade: 12, field: 'ریاضی' as const, is_active: 1 },
    { id: 4, name: 'پشتیبان غیرفعال', grade: 12, field: 'تجربی' as const, is_active: 0 },
  ];
  const categorized = categorizeSupportersForStudent(
    {
      grade: 12,
      field: 'تجربی',
    },
    mockSupporters
  );
  assert.equal(categorized.exactMatches.length, 1);
  assert.equal(categorized.exactMatches[0].id, 1);
  assert.equal(categorized.fieldMatches.length, 1);
  assert.equal(categorized.fieldMatches[0].id, 2);
  assert.equal(categorized.otherSupporters.length, 1);
  assert.equal(categorized.otherSupporters[0].id, 3);

  const historyEntry = normalizeAssignmentHistoryEntry({
    id: 10,
    student_id: 101,
    supporter_id: 5,
    supporter_name: 'سارا کریمی',
    assigned_by_name: 'مدیر سیستم',
    assigned_at: '2026-05-01 10:00:00',
    unassigned_at: null,
    is_active: 1,
    note: 'تخصیص اول',
  });
  assert.equal(historyEntry.is_active, true);
  assert.equal(historyEntry.supporter_name, 'سارا کریمی');

  const fillReport = normalizeInitialFillReport({
    dry_run: true,
    total_candidates: 12,
    assigned_count: 8,
    no_match_count: 3,
    ambiguous_count: 1,
    skipped_count: 0,
    items: [
      {
        student_id: 101,
        student_name: 'علی رضایی',
        grade: 12,
        field: 'تجربی',
        supporter_id: 5,
        supporter_name: 'سارا کریمی',
        action: 'would_assign',
      },
    ],
  });
  assert.equal(fillReport.dry_run, true);
  assert.equal(fillReport.assigned_count, 8);
  assert.equal(fillReport.no_match_count, 3);
  assert.equal(fillReport.items.length, 1);
  assert.equal(fillReport.items[0].outcome, 'would_assign');

  // Activity log mutation descriptions
  const assignLog = describeApiMutation('POST', '/assignments', {
    student_id: 101,
    supporter_id: 5,
  });
  assert.equal(assignLog?.category, 'assignments');
  assert.equal(assignLog?.action_type, 'create');

  const unassignLog = describeApiMutation('DELETE', '/assignments/101');
  assert.equal(unassignLog?.category, 'assignments');
  assert.equal(unassignLog?.action_type, 'delete');

  const initialFillLog = describeApiMutation('POST', '/assignments/initial-fill', {
    dry_run: false,
  });
  assert.equal(initialFillLog?.category, 'assignments');
  assert.equal(initialFillLog?.title, 'اجرای تخصیص خودکار اولیه پشتیبان بر اساس پایه و رشته');
});




