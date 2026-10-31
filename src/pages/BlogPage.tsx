import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Newspaper,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Save,
  X,
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  RemoveFormatting,
} from 'lucide-react';
import API from '../lib/api';
import { formatGregorianToJalali } from '../lib/jalali';
import type { BlogPost, ToastType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface BlogPageProps {
  showToast: (message: string, type?: ToastType) => void;
}

const CATEGORIES = [
  'دانش‌آموزی',
  'روش مطالعه',
  'مشاوره تحصیلی',
  'اخبار',
  'داستان موفقیت',
];

export const BlogPage: React.FC<BlogPageProps> = ({ showToast }) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingView, setIsEditingView] = useState(false);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);

  const [formState, setFormState] = useState({
    title: '',
    slug: '',
    category: '',
    cover_image: '',
    excerpt: '',
    content: '',
    meta_description: '',
    is_published: true,
  });

  const editorRef = useRef<HTMLDivElement | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.getBlogPosts();
      setPosts(res.data?.posts || []);
    } catch {
      showToast('خطا در بارگذاری پست‌های وبلاگ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const openEditor = async (post?: BlogPost) => {
    if (post) {
      setEditingPostId(post.id);
      setFormState({
        title: post.title,
        slug: post.slug,
        category: post.category,
        cover_image: post.cover_image || '',
        excerpt: post.excerpt || '',
        content: post.content || '',
        meta_description: post.meta_description || '',
        is_published: Boolean(post.is_published),
      });
      setIsEditingView(true);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = post.content || '';
        }
      }, 30);
    } else {
      setEditingPostId(null);
      setFormState({
        title: '',
        slug: '',
        category: '',
        cover_image: '',
        excerpt: '',
        content: '',
        meta_description: '',
        is_published: true,
      });
      setIsEditingView(true);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
      }, 30);
    }
  };

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (value) {
      document.execCommand('formatBlock', false, `<${value}>`);
    } else {
      document.execCommand(command, false, undefined);
    }
    setFormState((prev) => ({
      ...prev,
      content: editorRef.current?.innerHTML || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentHtml = editorRef.current?.innerHTML.trim() || formState.content.trim();
    if (!formState.title.trim() || !formState.slug.trim() || !formState.category) {
      showToast('عنوان، اسلاگ و دسته‌بندی الزامی هستند', 'error');
      return;
    }
    if (!currentHtml) {
      showToast('محتوای پست الزامی است', 'error');
      return;
    }

    try {
      await API.saveBlogPost(
        {
          title: formState.title.trim(),
          slug: formState.slug.trim(),
          category: formState.category,
          cover_image: formState.cover_image.trim() || null,
          excerpt: formState.excerpt.trim(),
          content: currentHtml,
          meta_description: formState.meta_description.trim(),
          is_published: formState.is_published ? 1 : 0,
        },
        editingPostId
      );
      setIsEditingView(false);
      loadPosts();
      showToast(editingPostId ? 'پست به‌روزرسانی شد' : 'پست جدید منتشر شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره پست', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await API.deleteBlogPost(deleteTarget.id);
    setDeleteTarget(null);
    loadPosts();
    showToast('پست وبلاگ حذف شد', 'success');
  };

  if (isEditingView) {
    return (
      <div id="page-blog-editor" className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <Newspaper className="w-6 h-6" aria-hidden="true" />
            <span>{editingPostId ? 'ویرایش پست وبلاگ' : 'افزودن پست جدید'}</span>
          </h1>
          <button
            type="button"
            onClick={() => setIsEditingView(false)}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 text-sm font-medium cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به لیست</span>
          </button>
        </div>

        <form
          id="blogPostForm"
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                عنوان پست <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                اسلاگ (URL) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="my-blog-post"
                dir="ltr"
                value={formState.slug}
                onChange={(e) => setFormState({ ...formState, slug: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formState.category}
                onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#445D84]"
              >
                <option value="">انتخاب کنید</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تصویر کاور (URL اختیاری)
              </label>
              <input
                type="url"
                dir="ltr"
                placeholder="https://example.com/cover.jpg"
                value={formState.cover_image}
                onChange={(e) => setFormState({ ...formState, cover_image: e.target.value })}
                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:border-[#445D84]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">خلاصه پست</label>
            <textarea
              rows={2}
              placeholder="خلاصه کوتاه برای پیش‌نمایش کارت..."
              value={formState.excerpt}
              onChange={(e) => setFormState({ ...formState, excerpt: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#445D84]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              محتوای کامل <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-[#445D84]">
              <div
                className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border-b border-slate-200"
                role="toolbar"
                aria-label="ابزارهای ویرایش متن"
              >
                <button
                  type="button"
                  onClick={() => applyCommand('bold')}
                  title="ضخیم"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('italic')}
                  title="مورب"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('underline')}
                  title="زیرخط"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <span className="w-px h-5 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={() => applyCommand('formatBlock', 'h2')}
                  title="تیتر ۲"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Heading2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('formatBlock', 'h3')}
                  title="تیتر ۳"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Heading3 className="w-4 h-4" />
                </button>
                <span className="w-px h-5 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={() => applyCommand('insertUnorderedList')}
                  title="لیست نقطه‌ای"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('insertOrderedList')}
                  title="لیست شماره‌دار"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('formatBlock', 'blockquote')}
                  title="نقل‌قول"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Quote className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('formatBlock', 'pre')}
                  title="کد"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <Code className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('removeFormat')}
                  title="پاک‌کردن قالب"
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <RemoveFormatting className="w-4 h-4" />
                </button>
              </div>
              <div
                ref={editorRef}
                id="blogEditorContent"
                contentEditable
                dir="rtl"
                role="textbox"
                aria-multiline="true"
                data-placeholder="متن کامل پست را اینجا بنویسید..."
                onInput={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    content: (e.target as HTMLDivElement).innerHTML,
                  }))
                }
                className="rte-content min-h-[260px] p-4 text-sm leading-relaxed focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              توضیحات متا (SEO)
            </label>
            <input
              type="text"
              maxLength={300}
              placeholder="توضیحات برای موتورهای جستجو (حداکثر ۳۰۰ کاراکتر)"
              value={formState.meta_description}
              onChange={(e) => setFormState({ ...formState, meta_description: e.target.value })}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#445D84]"
            />
          </div>

          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formState.is_published}
                onChange={(e) => setFormState({ ...formState, is_published: e.target.checked })}
                className="w-4 h-4 rounded text-[#445D84]"
              />
              <span className="text-sm font-medium text-slate-700">انتشار عمومی پست در وبلاگ</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-[#445D84] hover:bg-[#374a6b] text-white px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>ذخیره پست</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingView(false)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>انصراف</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div id="page-blog" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <Newspaper className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت وبلاگ</span>
        </h1>
        <button
          type="button"
          onClick={() => openEditor()}
          className="w-full sm:w-auto bg-[#445D84] text-white px-4 py-2.5 rounded-xl hover:bg-[#5a779e] transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن پست</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Newspaper className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">هیچ پست وبلاگی ثبت نشده</h3>
          <p className="text-sm text-slate-500 mb-6">اولین مقاله آموزشی را در وبلاگ منتشر کنید.</p>
          <button
            type="button"
            onClick={() => openEditor()}
            className="inline-flex items-center gap-2 bg-[#445D84] text-white px-5 py-2.5 rounded-xl hover:bg-[#5a779e] text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن پست</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#344868] text-white text-xs">
                <tr>
                  <th className="px-5 py-3.5 text-right font-semibold">عنوان</th>
                  <th className="px-5 py-3.5 text-right font-semibold">دسته‌بندی</th>
                  <th className="px-5 py-3.5 text-right font-semibold">اسلاگ</th>
                  <th className="px-5 py-3.5 text-right font-semibold">وضعیت</th>
                  <th className="px-5 py-3.5 text-center font-semibold">بازدیدها</th>
                  <th className="px-5 py-3.5 text-center font-semibold">تاریخ انتشار</th>
                  <th className="px-5 py-3.5 text-right font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800 max-w-xs truncate">
                        {p.title}
                      </div>
                      {p.excerpt && (
                        <div className="text-xs text-slate-500 max-w-xs truncate mt-0.5">
                          {p.excerpt}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-medium">{p.category}</td>
                    <td className="px-5 py-4" dir="ltr">
                      <code className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        {p.slug}
                      </code>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs font-semibold ${
                          p.is_published ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {p.is_published ? 'منتشر شده' : 'پیش‌نویس'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center tabular-nums font-medium text-slate-600">
                      {p.views || 0}
                    </td>
                    <td className="px-5 py-4 text-center tabular-nums text-slate-500 text-xs">
                      {formatGregorianToJalali(p.published_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(p)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="ویرایش"
                          aria-label={`ویرایش پست ${p.title}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف"
                          aria-label={`حذف پست ${p.title}`}
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
        title="حذف پست وبلاگ"
        message={`آیا از حذف پست «${deleteTarget?.title || ''}» اطمینان دارید؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
