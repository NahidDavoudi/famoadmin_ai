import React, { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import API from '../lib/api';
import { formatGregorianToJalali } from '../lib/jalali';
import { validateFileUploadForm, type FieldErrors } from '../lib/form-validation';
import type { ExamFile, Student, ToastType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

interface FilesPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

export const FilesPage: React.FC<FilesPageProps> = ({ showToast }) => {
  const [files, setFiles] = useState<ExamFile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamFile | null>(null);

  const [studentId, setStudentId] = useState<string>('');
  const [examDate, setExamDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'studentId' | 'examDate' | 'file'>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, studentsRes] = await Promise.all([
        API.getFiles(),
        API.getStudentsList(),
      ]);
      setFiles(filesRes.data || []);
      setStudents(studentsRes.data || []);
    } catch {
      showToast('خطا در بارگذاری فایل‌ها', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;

    const validationErrors = validateFileUploadForm({
      studentId,
      examDate,
      hasFile: Boolean(selectedFile),
    });
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !selectedFile) {
      showToast('لطفاً فیلدهای الزامی آپلود فایل را تکمیل کنید', 'error');
      return;
    }

    setUploading(true);
    try {
      await API.uploadFile({
        file: selectedFile,
        student_id: Number(studentId),
        description: description.trim() || selectedFile.name,
      });
      setStudentId('');
      setDescription('');
      setSelectedFile(null);
      setErrors({});
      await loadData();
      showToast('فایل با موفقیت آپلود شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در آپلود فایل', 'error');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteFile(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      showToast('فایل حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف فایل', 'error');
    }
  };

  return (
    <div id="page-files" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <h1 className="text-xl md:text-2xl font-bold text-[#445D84]">فایل‌های آزمون</h1>
      </div>

      {/* Upload Form */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2 text-[#445D84]">
          <Upload className="w-5 h-5" aria-hidden="true" />
          <span>آپلود فایل آزمون</span>
        </h2>

        <form id="uploadForm" noValidate onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">
                دانش‌آموز <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="انتخاب دانش‌آموز"
                aria-invalid={Boolean(errors.studentId)}
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  if (errors.studentId) setErrors((prev) => ({ ...prev, studentId: undefined }));
                }}
                className={getFieldClass(Boolean(errors.studentId))}
              >
                <option value="">انتخاب دانش‌آموز...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - پایه {s.grade} {s.field}
                  </option>
                ))}
              </select>
              <FieldError message={errors.studentId} />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">
                تاریخ آزمون <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                aria-invalid={Boolean(errors.examDate)}
                value={examDate}
                onChange={(e) => {
                  setExamDate(e.target.value);
                  if (errors.examDate) setErrors((prev) => ({ ...prev, examDate: undefined }));
                }}
                className={getFieldClass(Boolean(errors.examDate))}
              />
              <FieldError message={errors.examDate} />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">توضیحات</label>
              <input
                type="text"
                placeholder="مثال: آزمون جامع ریاضی"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">
                فایل <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                aria-invalid={Boolean(errors.file)}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                  if (file && errors.file) setErrors((prev) => ({ ...prev, file: undefined }));
                }}
                className={getFieldClass(
                  Boolean(errors.file),
                  'px-3 py-2 text-xs file:ms-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold'
                )}
              />
              <FieldError message={errors.file} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <ActionButton
              type="submit"
              loading={uploading}
              loadingText="در حال آپلود..."
              icon={<Upload className="w-4 h-4" />}
              className="w-full sm:w-auto px-6 py-2.5"
            >
              <span>آپلود فایل</span>
            </ActionButton>
            <span className="text-slate-400 text-xs">
              فرمت‌های مجاز: PDF, JPG, PNG, DOC | حداکثر حجم: ۱۰ مگابایت
            </span>
          </div>
        </form>
      </div>

      {/* Files Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-14 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <FileText className="w-10 h-10" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ فایلی آپلود نشده</h3>
          <p className="text-sm text-slate-500">
            از فرم بالا برای آپلود اولین فایل آزمون یا پاسخنامه استفاده کنید.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <DataTable<ExamFile>
            columns={[
              {
                key: 'file_name',
                header: 'نام فایل',
                priority: 'primary',
                headerClassName: 'min-w-[200px]',
                cellClassName: 'font-semibold text-slate-800',
                cell: (f) => {
                  const fileTitle =
                    f.description || f.original_name || f.file_path || `فایل #${f.id}`;
                  return (
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="break-words">{fileTitle}</span>
                    </div>
                  );
                },
              },
              {
                key: 'student',
                header: 'دانش‌آموز',
                priority: 'secondary',
                mobileLabel: 'دانش‌آموز',
                cellClassName: 'text-slate-600',
                cell: (f) => {
                  const studentObj = students.find((s) => s.id === Number(f.student_id));
                  return (
                    f.student_name ||
                    studentObj?.name || (
                      <span className="text-slate-400">#{f.student_id || 'عمومی'}</span>
                    )
                  );
                },
              },
              {
                key: 'size',
                header: 'حجم',
                priority: 'desktop-only',
                cellClassName: 'tabular-nums text-slate-600',
                cell: (f) => {
                  const fileSize = f.size ?? f.file_size;
                  return (
                    <span dir="ltr">
                      {fileSize ? `${Math.round(fileSize / 1024)} KB` : '-'}
                    </span>
                  );
                },
              },
              {
                key: 'uploaded_at',
                header: 'تاریخ آپلود',
                priority: 'secondary',
                mobileLabel: 'تاریخ آپلود',
                cellClassName: 'tabular-nums text-slate-500',
                value: (f) => {
                  const uploadedDate = f.uploaded_at || f.created_at || f.exam_date;
                  return formatGregorianToJalali(uploadedDate);
                },
                cell: (f) => {
                  const uploadedDate = f.uploaded_at || f.created_at || f.exam_date;
                  return formatGregorianToJalali(uploadedDate);
                },
              },
            ]}
            data={files}
            rowKey={(f) => f.id}
            ariaLabel="جدول فایل‌های آزمون"
            actionsHeader="عملیات"
            renderActions={(f) => {
              const fileTitle =
                f.description || f.original_name || f.file_path || `فایل #${f.id}`;
              return (
                <div className="flex items-center gap-1">
                  <a
                    href={API.getFileDownloadUrl(f)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                    title="دانلود"
                    aria-label={`دانلود ${fileTitle}`}
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => setDeleteTarget(f)}
                    className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                    title="حذف"
                    aria-label={`حذف ${fileTitle}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </ActionButton>
                </div>
              );
            }}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="حذف فایل"
        message={`آیا از حذف فایل «${deleteTarget?.description || ''}» اطمینان دارید؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
