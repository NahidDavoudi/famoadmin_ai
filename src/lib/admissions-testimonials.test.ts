import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_REQUIRED_MESSAGE,
  buildAdmissionFormData,
  canAccessAdminOnlySections,
  chunkBulkRejectIds,
  extractApiFieldErrors,
  normalizeAdmission,
  normalizeTestimonial,
  shouldWarnConsentUnpublish,
  validateAdmissionForm,
  validateTestimonialForm,
} from './admissions-testimonials';
import { normalizeIntegerInput, parseStrictInteger, toEnglishDigits } from './jalali';

test('canAccessAdminOnlySections permits only admin role', () => {
  assert.equal(canAccessAdminOnlySections('admin'), true);
  assert.equal(canAccessAdminOnlySections('ADMIN'), true);
  assert.equal(canAccessAdminOnlySections('supporter'), false);
  assert.equal(canAccessAdminOnlySections('teacher'), false);
  assert.equal(canAccessAdminOnlySections('student'), false);
  assert.equal(canAccessAdminOnlySections(null), false);
});

test('validateAdmissionForm blocks publishing without consent and validates Jalali year', () => {
  const errors = validateAdmissionForm({
    student_name: 'سارا محمدی',
    year: '۱۴۰۴',
    exam_type: 'konkur',
    field: 'تجربی',
    admission_title: 'پزشکی دانشگاه تهران',
    rank: '۱۲۵',
    display_order: '1',
    status: 'published',
    consent_obtained: false,
  });

  assert.equal(errors.year, undefined);
  assert.equal(errors.consent_obtained, CONSENT_REQUIRED_MESSAGE);
  assert.equal(errors.status, CONSENT_REQUIRED_MESSAGE);

  const validErrors = validateAdmissionForm({
    student_name: 'سارا محمدی',
    year: '۱۴۰۴',
    exam_type: 'konkur',
    field: 'تجربی',
    admission_title: 'پزشکی دانشگاه تهران',
    rank: '۱۲۵',
    display_order: '0',
    status: 'published',
    consent_obtained: true,
  });
  assert.deepEqual(validErrors, {});
});

test('shouldWarnConsentUnpublish triggers only when unchecking consent on a published record', () => {
  assert.equal(
    shouldWarnConsentUnpublish({ status: 'published', consent_obtained: true }, false),
    true
  );
  assert.equal(
    shouldWarnConsentUnpublish({ status: 'published', consent_obtained: true }, true),
    false
  );
  assert.equal(
    shouldWarnConsentUnpublish({ status: 'draft', consent_obtained: false }, false),
    false
  );
  assert.equal(shouldWarnConsentUnpublish(null, false), false);
});

test('buildAdmissionFormData forces draft when consent is false, sends exact OpenAPI fields, and includes remove_image flag', () => {
  const fd = buildAdmissionFormData({
    student_name: '  آرش کریمی  ',
    year: '۱۴۰۴' as unknown as number,
    exam_type: 'konkur',
    field: 'ریاضی',
    admission_title: 'مهندسی کامپیوتر شریف',
    rank: '۴۲',
    display_order: 2,
    status: 'published',
    consent_obtained: false,
    remove_photo: true,
  });

  assert.equal(fd.get('student_name'), 'آرش کریمی');
  assert.equal(fd.get('jalali_year'), '1404');
  assert.equal(fd.get('exam_type'), 'konkur');
  assert.equal(fd.get('field'), 'ریاضی');
  assert.equal(fd.get('result_title'), 'مهندسی کامپیوتر شریف');
  assert.equal(fd.get('rank_value'), '42');
  assert.equal(fd.get('display_order'), '2');
  assert.equal(fd.get('status'), 'draft');
  assert.equal(fd.get('consent_confirmed'), '0');
  assert.equal(fd.get('remove_image'), '1');
});

test('digit normalization converts English, Persian, Arabic-Indic, and full-width digits cleanly', () => {
  assert.equal(toEnglishDigits('\u200f۱۴۰۴\u200e'), '1404');
  assert.equal(toEnglishDigits('١٤٠٤'), '1404');
  assert.equal(toEnglishDigits('１４０４'), '1404');
  assert.equal(normalizeIntegerInput(' ۱۴۰۴ سال ', 4), '1404');
  assert.equal(normalizeIntegerInput('140499', 4), '1404');
  assert.equal(parseStrictInteger('1404'), 1404);
  assert.equal(parseStrictInteger('۱۴۰۴'), 1404);
  assert.equal(parseStrictInteger('١٤٠٤'), 1404);
  assert.equal(parseStrictInteger('1404.5'), null);
  assert.equal(parseStrictInteger('1404a'), null);

  const enYearErrors = validateAdmissionForm({
    student_name: 'رضا کریمی',
    year: '1404',
    exam_type: 'konkur',
    field: 'ریاضی',
    admission_title: 'مهندسی برق شریف',
    rank: '15',
    display_order: '۳',
    status: 'draft',
    consent_obtained: false,
  });
  assert.deepEqual(enYearErrors, {});
});

test('extractApiFieldErrors parses 422 details and maps CONSENT_REQUIRED clearly', () => {
  const consentRes = extractApiFieldErrors({
    status: 422,
    code: 'CONSENT_REQUIRED',
    message: 'بدون ثبت رضایت امکان انتشار وجود ندارد',
  });
  assert.equal(consentRes.isConsentRequired, true);
  assert.equal(consentRes.fieldErrors.consent_obtained, 'بدون ثبت رضایت امکان انتشار وجود ندارد');

  const fieldRes = extractApiFieldErrors(
    {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'خطای اعتبارسنجی',
      details: {
        result_title: ['عنوان قبولی (رشته/دانشگاه) الزامی است'],
        jalali_year: 'سال شمسی نامعتبر است',
      },
    },
    { result_title: 'admission_title', jalali_year: 'year' }
  );
  assert.equal(fieldRes.isConsentRequired, false);
  assert.equal(fieldRes.fieldErrors.admission_title, 'عنوان قبولی (رشته/دانشگاه) الزامی است');
  assert.equal(fieldRes.fieldErrors.year, 'سال شمسی نامعتبر است');
});

test('normalizeAdmission and normalizeTestimonial handle live OpenAPI fields and legacy aliases safely', () => {
  const adm = normalizeAdmission({
    id: 7,
    student_name: 'مریم رضایی',
    jalali_year: 1403,
    exam_type: 'tizhooshan',
    field: 'تجربی',
    result_title: 'فرزانگان ۱ تهران',
    rank_value: '14',
    display_order: 3,
    image_url: '/uploads/admissions/7.jpg',
    status: 'published',
    consent_confirmed: true,
  });
  assert.equal(adm.student_name, 'مریم رضایی');
  assert.equal(adm.year, 1403);
  assert.equal(adm.admission_title, 'فرزانگان ۱ تهران');
  assert.equal(adm.rank, '14');
  assert.equal(adm.photo_url, '/uploads/admissions/7.jpg');
  assert.equal(adm.consent_obtained, true);
  assert.equal(adm.status, 'published');

  const tm = normalizeTestimonial({
    id: 19,
    author_name: 'مادر آرش',
    author_role: 'parent',
    author_meta: 'ولی پایه دوازدهم تجربی',
    rating: 5,
    content: '<script>alert(1)</script> خیلی عالی بود',
    status: 'pending',
    source: 'public_form',
    course_id: 4,
    course_name: 'دوره نکته و تست',
    instructor_id: 8,
    instructor_name: 'استاد کریمی',
  });
  assert.equal(tm.author_name, 'مادر آرش');
  assert.equal(tm.author_subtitle, 'ولی پایه دوازدهم تجربی');
  assert.equal(tm.source, 'public_form');
  assert.equal(tm.course_id, 4);
  assert.equal(tm.course_name, 'دوره نکته و تست');
  assert.equal(tm.instructor_id, 8);
  assert.equal(tm.instructor_name, 'استاد کریمی');
});

test('chunkBulkRejectIds deduplicates, filters invalid IDs, and caps each batch at 100', () => {
  const ids = Array.from({ length: 235 }, (_, i) => i + 1);
  ids.push(5, 10, -1, 0, NaN);
  const chunks = chunkBulkRejectIds(ids, 100);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 100);
  assert.equal(chunks[2].length, 35);
  assert.equal(chunks[0][0], 1);
  assert.equal(chunks[2][34], 235);
});

test('validateTestimonialForm validates rating bounds and 10-character minimum content', () => {
  const bad = validateTestimonialForm({
    author_name: 'ا',
    author_role: 'student',
    author_subtitle: '',
    rating: 6,
    content: 'کوتاه',
    status: 'approved',
    course_id: '',
    instructor_id: '',
  });
  assert.ok(bad.author_name);
  assert.ok(bad.rating);
  assert.ok(bad.content);

  const valid = validateTestimonialForm({
    author_name: 'علی رضایی',
    author_role: 'graduate',
    author_subtitle: 'رتبه ۳۰۰',
    rating: 5,
    content: 'کیفیت کلاس‌ها و پیگیری پشتیبان‌ها واقعاً عالی بود.',
    status: 'approved',
    course_id: '2',
    instructor_id: '',
  });
  assert.deepEqual(valid, {});
});
