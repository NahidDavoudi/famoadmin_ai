import React, { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import API from '../lib/api';
import { formatGregorianToJalali } from '../lib/jalali';
import type { ExamFile, Student, ToastType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

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
    if (!selectedFile) {
      showToast('لطفاً یک فایل برای آپلود انتخاب کنید', 'error');
      return;
    }

    setUploading(true);
    try {
      await API.uploadFile({
        file: selectedFile,
        student_id: studentId ? Number(studentId) : null,
        exam_date: examDate,
        description: description.trim() || selectedFile.name,
      });
      setStudentId('');
      setDescription('');
      setSelectedFile(null);
      loadData();
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
      loadData();
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

        <form id="uploadForm" onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">
                دانش‌آموز (اختیاری)
              </label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">عمومی / همه دانش‌آموزان</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} - پایه {s.grade} {s.field}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-medium text-slate-600">تاریخ آزمون</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
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
              <label className="block mb-1.5 text-xs font-medium text-slate-600">فایل</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white file:ml-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              type="submit"
              disabled={uploading}
              className="w-full sm:w-auto bg-[#445D84] hover:bg-[#374a6b] text-white px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? 'در حال آپلود...' : 'آپلود فایل'}</span>
            </button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-5 py-3.5 text-right font-semibold">نام فایل</th>
                  <th className="px-5 py-3.5 text-right font-semibold">دانش‌آموز</th>
                  <th className="px-5 py-3.5 text-right font-semibold">تاریخ آزمون</th>
                  <th className="px-5 py-3.5 text-right font-semibold">حجم</th>
                  <th className="px-5 py-3.5 text-right font-semibold">تاریخ آپلود</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-red-500 shrink-0" />
                        <span>{f.description || f.file_path}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {f.student_name || <span className="text-slate-400">عمومی</span>}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">
                      {formatGregorianToJalali(f.exam_date)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate-600" dir="ltr">
                      {f.file_size ? `${Math.round(f.file_size / 1024)} KB` : '-'}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate-500">
                      {formatGregorianToJalali(f.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <a
                          href={API.getFileDownloadUrl(f.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="دانلود"
                          aria-label={`دانلود ${f.description}`}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف"
                          aria-label={`حذف ${f.description}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
