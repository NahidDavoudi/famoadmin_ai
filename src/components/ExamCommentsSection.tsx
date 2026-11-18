import React, { useEffect, useState } from 'react';
import { MessageSquare, Save, Sparkles, Pencil, UserCheck, Clock } from 'lucide-react';
import API from '../lib/api';
import { formatActivityJalaliDateTime } from '../lib/activity-log';
import {
  buildCombinedExamCommentBody,
  getAuthorRoleLabel,
  normalizeExamComment,
  safeTrim,
  validateExamCommentBody,
  type TeacherFeedbackRow,
} from '../lib/exam-math';
import type { ExamComment, ToastType } from '../types';
import { ActionButton, FieldError } from './FormControls';

export interface ExamCommentsSectionProps {
  studentId: number;
  examDate: string;
  comments: ExamComment[];
  teacherFeedbacks: TeacherFeedbackRow[];
  counselorNote: string;
  onCommentsUpdated: (nextComments: ExamComment[], latestBody: string) => void;
  showToast: (message: string, type?: ToastType) => void;
}

export const ExamCommentsSection: React.FC<ExamCommentsSectionProps> = ({
  studentId,
  examDate,
  comments,
  teacherFeedbacks,
  counselorNote,
  onCommentsUpdated,
  showToast,
}) => {
  const [commentBody, setCommentBody] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);

  const normalizedComments = (comments || []).map((c) => normalizeExamComment(c));

  useEffect(() => {
    if (normalizedComments.length > 0) {
      setCommentBody(normalizedComments[0].body);
    } else {
      setCommentBody('');
    }
    setCommentError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, examDate]);

  const handleImportFromFeedbackBoxes = () => {
    const combined = buildCombinedExamCommentBody(teacherFeedbacks, counselorNote);
    if (!combined) {
      showToast(
        'ابتدا در باکس‌های نظرات دروس یا جمع‌بندی مشاور متنی بنویسید تا اینجا درج شود',
        'info'
      );
      return;
    }
    setCommentBody(combined);
    setCommentError(null);
    showToast('متن نظرات دروس و جمع‌بندی مشاور در کادر نظر رسمی کارنامه درج شد', 'info');
  };

  const handleSaveComment = async () => {
    if (savingComment) return;
    const validationErr = validateExamCommentBody(commentBody);
    if (validationErr) {
      setCommentError(validationErr);
      showToast(validationErr, 'error');
      return;
    }

    setCommentError(null);
    setSavingComment(true);
    try {
      const res = await API.upsertExamComment({
        student_id: Number(studentId),
        exam_date: examDate,
        body: safeTrim(commentBody),
      });

      const returnedComments = Array.isArray(res.data?.comments)
        ? res.data.comments.map((c) => normalizeExamComment(c))
        : res.data?.comment
          ? [normalizeExamComment(res.data.comment)]
          : [
              normalizeExamComment({
                id: Date.now(),
                student_id: Number(studentId),
                exam_date: examDate,
                teacher_user_id: 1,
                author_name: API.currentActorName,
                author_role: (API.currentActorRole as 'admin' | 'supporter' | 'teacher') || 'admin',
                body: safeTrim(commentBody),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }),
            ];

      onCommentsUpdated(returnedComments, safeTrim(commentBody));
      showToast('نظر آموزشی با موفقیت در کارنامه ثبت و ذخیره شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره نظر روی کارنامه', 'error');
    } finally {
      setSavingComment(false);
    }
  };

  const getRoleBadgeClass = (role?: string) => {
    switch (role) {
      case 'teacher':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'supporter':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'admin':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="rounded-2xl border-2 border-[#445D84]/25 bg-slate-50/60 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-sm sm:text-base text-[#344868] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#445D84]" aria-hidden="true" />
            <span>۵. ثبت و ذخیره نظر رسمی استاد / مشاور در کارنامه آنلاین والدین:</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            نظری که در این بخش ذخیره می‌کنید در سرور ثبت شده و در لینک ۱۴ روزه والدین و نسخه چاپی کارنامه نمایش داده می‌شود.
          </p>
        </div>

        <ActionButton
          type="button"
          variant="secondary"
          onClick={handleImportFromFeedbackBoxes}
          icon={<Sparkles className="w-3.5 h-3.5 text-[#445D84]" />}
          className="px-3 py-1.5 text-xs"
        >
          <span>درج خودکار از نظرات دروس و جمع‌بندی بالا</span>
        </ActionButton>
      </div>

      {/* Saved Server Comments List */}
      {normalizedComments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-600">
            نظرات ثبت‌شده در کارنامه ({normalizedComments.length}):
          </div>
          <div className="space-y-2">
            {normalizedComments.map((item) => (
              <div
                key={item.id || `${item.teacher_user_id}-${item.created_at}`}
                className="rounded-xl bg-white border border-slate-200/90 p-3 space-y-1.5 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#445D84]" />
                    <span className="font-bold text-xs text-slate-800">
                      {item.author_name || getAuthorRoleLabel(item.author_role)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getRoleBadgeClass(
                        item.author_role
                      )}`}
                    >
                      {getAuthorRoleLabel(item.author_role)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(item.updated_at || item.created_at) && (
                      <span className="text-[11px] text-slate-400 tabular-nums flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span dir="ltr">
                          {formatActivityJalaliDateTime(item.updated_at || item.created_at)}
                        </span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCommentBody(item.body);
                        setCommentError(null);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>ویرایش این متن</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="exam-server-comment-input"
            className="text-xs font-bold text-slate-700"
          >
            متن نظر استاد یا مشاور برای ثبت در کارنامه:
          </label>
          <span
            dir="ltr"
            className={`text-[11px] tabular-nums font-medium ${
              commentBody.length > 2000 ? 'text-rose-600 font-bold' : 'text-slate-400'
            }`}
          >
            {commentBody.length} / 2000
          </span>
        </div>

        <textarea
          id="exam-server-comment-input"
          rows={3}
          maxLength={2000}
          value={commentBody}
          onChange={(e) => {
            setCommentBody(e.target.value);
            if (commentError) setCommentError(null);
          }}
          placeholder="ارزیابی جامع عملکرد دانش‌آموز در این آزمون، نقاط قوت، مباحث نیازمند مرور و توصیه به دانش‌آموز و اولیا..."
          aria-label="متن نظر استاد یا مشاور روی کارنامه"
          className={`w-full text-xs sm:text-sm text-slate-800 bg-white border-2 rounded-xl p-3 focus:outline-none resize-y ${
            commentError
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 focus:border-[#445D84]'
          }`}
        />
        <FieldError message={commentError || undefined} />

        <div className="flex justify-end pt-1">
          <ActionButton
            type="button"
            onClick={handleSaveComment}
            loading={savingComment}
            loadingText="در حال ذخیره نظر..."
            icon={<Save className="w-4 h-4" />}
            className="px-4 py-2 text-xs sm:text-sm"
          >
            <span>ذخیره نظر در کارنامه</span>
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
