import React, { useEffect, useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Pencil, Star } from 'lucide-react';
import API from '../lib/api';
import {
  TESTIMONIAL_AUTHOR_ROLES,
  extractApiFieldErrors,
  validateTestimonialForm,
} from '../lib/admissions-testimonials';
import { toPersianDigits } from '../lib/jalali';
import type {
  Course,
  Instructor,
  TestimonialAuthorRole,
  TestimonialRecord,
  TestimonialStatus,
  ToastType,
} from '../types';
import { Modal } from './Modal';
import { ActionButton, FieldError, getFieldClass } from './FormControls';

const TESTIMONIAL_FIELD_ALIASES: Record<string, string> = {
  name: 'author_name',
  role: 'author_role',
  author_meta: 'author_subtitle',
  role_description: 'author_subtitle',
  subtitle: 'author_subtitle',
  body: 'content',
  text: 'content',
};

interface TestimonialFormModalProps {
  isOpen: boolean;
  editingItem: TestimonialRecord | null;
  courses: Course[];
  instructors: Instructor[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
}

export const TestimonialFormModal: React.FC<TestimonialFormModalProps> = ({
  isOpen,
  editingItem,
  courses,
  instructors,
  onClose,
  onSaved,
  showToast,
}) => {
  const isEdit = Boolean(editingItem);

  const [authorName, setAuthorName] = useState('');
  const [authorRole, setAuthorRole] = useState<TestimonialAuthorRole>('student');
  const [authorSubtitle, setAuthorSubtitle] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<TestimonialStatus>('approved');
  const [courseId, setCourseId] = useState('');
  const [instructorId, setInstructorId] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    if (editingItem) {
      setAuthorName(editingItem.author_name || '');
      setAuthorRole(editingItem.author_role || 'student');
      setAuthorSubtitle(editingItem.author_subtitle || '');
      setRating(editingItem.rating || 5);
      setContent(editingItem.content || '');
      setStatus(editingItem.status || 'pending');
      setCourseId(editingItem.course_id ? String(editingItem.course_id) : '');
      setInstructorId(editingItem.instructor_id ? String(editingItem.instructor_id) : '');
    } else {
      setAuthorName('');
      setAuthorRole('student');
      setAuthorSubtitle('');
      setRating(5);
      setContent('');
      setStatus('approved');
      setCourseId('');
      setInstructorId('');
    }
  }, [isOpen, editingItem]);

  const clearFieldError = (key: string) => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateTestimonialForm({
      author_name: authorName,
      author_role: authorRole,
      author_subtitle: authorSubtitle,
      rating,
      content,
      status,
      course_id: courseId,
      instructor_id: instructorId,
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const parsedCourseId = courseId ? Number(courseId) : null;
      const parsedInstructorId = instructorId ? Number(instructorId) : null;

      if (editingItem) {
        await API.updateTestimonial(editingItem.id, {
          author_name: authorName.trim(),
          author_role: authorRole,
          author_subtitle: authorSubtitle.trim() || null,
          rating,
          content: content.trim(),
          course_id: parsedCourseId,
          instructor_id: parsedInstructorId,
        });
        showToast('نظر با موفقیت ویرایش شد', 'success');
      } else {
        await API.createTestimonial({
          author_name: authorName.trim(),
          author_role: authorRole,
          author_subtitle: authorSubtitle.trim() || null,
          rating,
          content: content.trim(),
          status,
          source: 'admin',
          course_id: parsedCourseId,
          instructor_id: parsedInstructorId,
        });
        showToast('نظر جدید با موفقیت ثبت شد', 'success');
      }

      await onSaved();
      onClose();
    } catch (err) {
      const parsed = extractApiFieldErrors(err, TESTIMONIAL_FIELD_ALIASES);
      if (Object.keys(parsed.fieldErrors).length > 0) {
        setErrors(parsed.fieldErrors);
      }
      showToast(parsed.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={isEdit ? 'ویرایش نظر' : 'افزودن نظر جدید (ثبت مستقیم ادمین)'}
      subtitle={
        isEdit
          ? 'می‌توانید متن، مشخصات نویسنده، امتیاز و اتصال به دوره یا استاد را اصلاح کنید'
          : 'مناسب انتقال نظرات اینستاگرام و تلگرام (پیش‌فرض: تأییدشده و منبع ادمین)'
      }
      icon={isEdit ? <Pencil className="w-5 h-5" /> : <MessageSquarePlus className="w-5 h-5" />}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2.5"
          >
            انصراف
          </ActionButton>
          <ActionButton
            type="submit"
            form="testimonial-upsert-form"
            loading={submitting}
            loadingText="در حال ذخیره..."
            icon={<CheckCircle2 className="w-4 h-4" />}
            className="px-5 py-2.5"
          >
            {isEdit ? 'ذخیره تغییرات' : 'ثبت نظر'}
          </ActionButton>
        </div>
      }
    >
      <form id="testimonial-upsert-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Author Name */}
          <div>
            <label
              htmlFor="testimonialAuthorName"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              نام نویسنده <span className="text-red-500">*</span>
            </label>
            <input
              id="testimonialAuthorName"
              type="text"
              value={authorName}
              onChange={(e) => {
                setAuthorName(e.target.value);
                clearFieldError('author_name');
              }}
              placeholder="مثلاً: علی رضایی یا مادر سارا"
              className={getFieldClass(Boolean(errors.author_name))}
            />
            <FieldError message={errors.author_name} />
          </div>

          {/* Author Role */}
          <div>
            <label
              htmlFor="testimonialAuthorRole"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              نقش <span className="text-red-500">*</span>
            </label>
            <select
              id="testimonialAuthorRole"
              value={authorRole}
              onChange={(e) => {
                setAuthorRole(e.target.value);
                clearFieldError('author_role');
              }}
              className={getFieldClass(Boolean(errors.author_role))}
            >
              {TESTIMONIAL_AUTHOR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <FieldError message={errors.author_role} />
          </div>

          {/* Author Subtitle / Role description */}
          <div className="sm:col-span-2">
            <label
              htmlFor="testimonialSubtitle"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              توضیح نقش (اختیاری)
            </label>
            <input
              id="testimonialSubtitle"
              type="text"
              value={authorSubtitle}
              onChange={(e) => {
                setAuthorSubtitle(e.target.value);
                clearFieldError('author_subtitle');
              }}
              placeholder="مثلاً: دانش‌آموز پایه دوازدهم تجربی یا رتبه ۱۴۰ کنکور ۱۴۰۴"
              className={getFieldClass(Boolean(errors.author_subtitle))}
            />
            <FieldError message={errors.author_subtitle} />
          </div>

          {/* Rating */}
          <div>
            <span className="block text-xs font-bold text-slate-700 mb-1.5">
              امتیاز <span className="text-red-500">*</span>
            </span>
            <div
              className="inline-flex items-center gap-1 p-1.5 rounded-xl border-2 border-slate-200 bg-white"
              role="radiogroup"
              aria-label="انتخاب امتیاز از ۱ تا ۵ ستاره"
            >
              {[1, 2, 3, 4, 5].map((starVal) => {
                const active = starVal <= rating;
                return (
                  <button
                    key={starVal}
                    type="button"
                    role="radio"
                    aria-checked={starVal === rating}
                    aria-label={`${toPersianDigits(starVal)} ستاره`}
                    onClick={() => {
                      setRating(starVal);
                      clearFieldError('rating');
                    }}
                    className={`w-9 h-9 rounded-lg inline-flex items-center justify-center transition-colors cursor-pointer ${
                      active
                        ? 'text-amber-500 bg-amber-50'
                        : 'text-slate-300 hover:text-amber-400 hover:bg-slate-50'
                    }`}
                  >
                    <Star
                      className={`w-5 h-5 ${active ? 'fill-amber-400 text-amber-500' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
              <span className="px-2 text-xs font-bold text-slate-600 tabular-nums">
                {toPersianDigits(rating)} از ۵
              </span>
            </div>
            <FieldError message={errors.rating} />
          </div>

          {/* Initial status (create mode only; moderation handles status changes on existing items) */}
          {!isEdit && (
            <div>
              <label
                htmlFor="testimonialInitialStatus"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                وضعیت اولیه
              </label>
              <select
                id="testimonialInitialStatus"
                value={status}
                onChange={(e) => setStatus(e.target.value as TestimonialStatus)}
                className={getFieldClass(Boolean(errors.status))}
              >
                <option value="approved">تأییدشده (انتشار فوری)</option>
                <option value="pending">در انتظار تأیید</option>
              </select>
              <FieldError message={errors.status} />
            </div>
          )}

          {/* Optional Course Link */}
          <div>
            <label
              htmlFor="testimonialCourseSelect"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              اتصال به دوره (اختیاری)
            </label>
            <select
              id="testimonialCourseSelect"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                clearFieldError('course_id');
              }}
              className={getFieldClass(Boolean(errors.course_id))}
            >
              <option value="">— بدون اتصال به دوره —</option>
              {courses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.course_id} />
          </div>

          {/* Optional Instructor Link */}
          <div>
            <label
              htmlFor="testimonialInstructorSelect"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              اتصال به استاد (اختیاری)
            </label>
            <select
              id="testimonialInstructorSelect"
              value={instructorId}
              onChange={(e) => {
                setInstructorId(e.target.value);
                clearFieldError('instructor_id');
              }}
              className={getFieldClass(Boolean(errors.instructor_id))}
            >
              <option value="">— بدون اتصال به استاد —</option>
              {instructors.map((ins) => (
                <option key={ins.id} value={String(ins.id)}>
                  {ins.name}
                  {ins.title ? ` (${ins.title})` : ''}
                </option>
              ))}
            </select>
            <FieldError message={errors.instructor_id} />
          </div>
        </div>

        {/* Full Content */}
        <div>
          <label
            htmlFor="testimonialContent"
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            متن نظر <span className="text-red-500">*</span>
          </label>
          <textarea
            id="testimonialContent"
            rows={5}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              clearFieldError('content');
            }}
            placeholder="متن کامل دیدگاه دانش‌آموز یا والدین را وارد کنید..."
            className={getFieldClass(Boolean(errors.content), 'leading-relaxed resize-y')}
          />
          <FieldError message={errors.content} />
        </div>
      </form>
    </Modal>
  );
};
