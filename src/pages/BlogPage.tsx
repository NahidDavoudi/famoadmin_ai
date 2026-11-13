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
import {
  stripHtmlToText,
  validateBlogPostForm,
  type FieldErrors,
} from '../lib/form-validation';
import type { BlogPost, ToastType } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ActionButton, FieldError, getFieldClass } from '../components/FormControls';
import { DataTable, type Column } from '../components/DataTable';

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

type BlogFieldKey = 'title' | 'slug' | 'category' | 'content' | 'cover_image';

export const BlogPage: React.FC<BlogPageProps> = ({ showToast }) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const [errors, setErrors] = useState<FieldErrors<BlogFieldKey>>({});

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
    setErrors({});
    if (post) {
      try {
        const res = await API.getBlogPost(post.id);
        const fullPost = res.data?.post || post;
        setEditingPostId(fullPost.id);
        setFormState({
          title: String(fullPost.title ?? ''),
          slug: String(fullPost.slug ?? ''),
          category: String(fullPost.category ?? ''),
          cover_image: String(fullPost.cover_image ?? ''),
          excerpt: String(fullPost.excerpt ?? ''),
          content: String(fullPost.content ?? ''),
          meta_description: String(fullPost.meta_description ?? ''),
          is_published: Boolean(fullPost.published ?? fullPost.is_published),
        });
        setIsEditingView(true);
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = String(fullPost.content ?? '');
          }
        }, 30);
      } catch (err) {
        showToast((err as Error).message || 'خطا در دریافت اطلاعات پست', 'error');
      }
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
    const html = editorRef.current?.innerHTML || '';
    setFormState((prev) => ({
      ...prev,
      content: html,
    }));
    if (errors.content && stripHtmlToText(html)) {
      setErrors((prev) => ({ ...prev, content: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const currentHtml =
      editorRef.current?.innerHTML.trim() || String(formState.content ?? '').trim();
    const validationErrors = validateBlogPostForm({
      title: formState.title,
      slug: formState.slug,
      category: formState.category,
      content: currentHtml,
      cover_image: formState.cover_image,
    });
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      showToast('لطفاً فیلدهای الزامی مقاله را تکمیل کنید', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await API.saveBlogPost(
        {
          title: String(formState.title ?? '').trim(),
          slug: String(formState.slug ?? '').trim(),
          category: String(formState.category ?? '').trim() || undefined,
          cover_image: String(formState.cover_image ?? '').trim() || null,
          excerpt: String(formState.excerpt ?? '').trim(),
          content: currentHtml,
          meta_description: String(formState.meta_description ?? '').trim(),
          published: formState.is_published,
        },
        editingPostId
      );
      setIsEditingView(false);
      setErrors({});
      await loadPosts();
      showToast(editingPostId ? 'پست به‌روزرسانی شد' : 'پست جدید منتشر شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در ذخیره پست', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteBlogPost(deleteTarget.id);
      setDeleteTarget(null);
      await loadPosts();
      showToast('پست وبلاگ حذف شد', 'success');
    } catch (err) {
      showToast((err as Error).message || 'خطا در حذف پست وبلاگ', 'error');
    }
  };

  if (isEditingView) {
    return (
      <div id="page-blog-editor" className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
            <Newspaper className="w-6 h-6" aria-hidden="true" />
            <span>{editingPostId ? 'ویرایش پست وبلاگ' : 'افزودن پست جدید'}</span>
          </h1>
          <ActionButton
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setIsEditingView(false);
              setErrors({});
            }}
            icon={<ArrowRight className="w-4 h-4" />}
            className="px-4 py-2.5"
          >
            <span>بازگشت به لیست</span>
          </ActionButton>
        </div>

        <form
          id="blogPostForm"
          noValidate
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
                placeholder="عنوان مقاله آموزشی..."
                aria-invalid={Boolean(errors.title)}
                value={formState.title}
                onChange={(e) => {
                  setFormState({ ...formState, title: e.target.value });
                  if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                }}
                className={getFieldClass(Boolean(errors.title))}
              />
              <FieldError message={errors.title} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                اسلاگ (URL) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="my-blog-post"
                dir="ltr"
                aria-invalid={Boolean(errors.slug)}
                value={formState.slug}
                onChange={(e) => {
                  setFormState({ ...formState, slug: e.target.value });
                  if (errors.slug) setErrors((prev) => ({ ...prev, slug: undefined }));
                }}
                className={getFieldClass(Boolean(errors.slug), 'text-start')}
              />
              <FieldError message={errors.slug} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                دسته‌بندی <span className="text-red-500">*</span>
              </label>
              <select
                aria-invalid={Boolean(errors.category)}
                value={formState.category}
                onChange={(e) => {
                  setFormState({ ...formState, category: e.target.value });
                  if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
                }}
                className={getFieldClass(Boolean(errors.category))}
              >
                <option value="">انتخاب کنید</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <FieldError message={errors.category} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تصویر کاور (URL اختیاری)
              </label>
              <input
                type="url"
                dir="ltr"
                placeholder="https://example.com/cover.jpg"
                aria-invalid={Boolean(errors.cover_image)}
                value={formState.cover_image}
                onChange={(e) => {
                  setFormState({ ...formState, cover_image: e.target.value });
                  if (errors.cover_image)
                    setErrors((prev) => ({ ...prev, cover_image: undefined }));
                }}
                className={getFieldClass(Boolean(errors.cover_image), 'text-start')}
              />
              <FieldError message={errors.cover_image} />
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
            <div
              className={`border-2 rounded-xl overflow-hidden transition-colors ${
                errors.content
                  ? 'border-red-500 bg-red-50/30 ring-2 ring-red-500/10 input-error-shake'
                  : 'border-slate-200 focus-within:border-[#445D84]'
              }`}
            >
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
                aria-invalid={Boolean(errors.content)}
                data-placeholder="متن کامل پست را اینجا بنویسید..."
                onInput={(e) => {
                  const html = (e.target as HTMLDivElement).innerHTML;
                  setFormState((prev) => ({
                    ...prev,
                    content: html,
                  }));
                  if (errors.content && stripHtmlToText(html)) {
                    setErrors((prev) => ({ ...prev, content: undefined }));
                  }
                }}
                className="rte-content min-h-[260px] p-4 text-sm leading-relaxed focus:outline-none bg-white"
              />
            </div>
            <FieldError message={errors.content} />
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
            <ActionButton
              type="submit"
              loading={submitting}
              loadingText="در حال ذخیره پست..."
              icon={<Save className="w-4 h-4" />}
              className="px-6 py-2.5"
            >
              <span>ذخیره پست</span>
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setIsEditingView(false);
                setErrors({});
              }}
              icon={<X className="w-4 h-4" />}
              className="px-5 py-2.5"
            >
              <span>انصراف</span>
            </ActionButton>
          </div>
        </form>
      </div>
    );
  }

  const blogColumns: Column<BlogPost>[] = [
    {
      key: 'title',
      header: 'عنوان',
      priority: 'primary',
      cellClassName: 'min-w-0',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-semibold text-slate-800 whitespace-normal break-words line-clamp-2 max-w-prose">
            {p.title}
          </div>
          {p.excerpt && (
            <div className="text-xs font-normal text-slate-500 whitespace-normal break-words line-clamp-2 max-w-prose mt-0.5">
              {p.excerpt}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'دسته‌بندی',
      priority: 'secondary',
      mobileLabel: 'دسته‌بندی',
      headerClassName: 'w-24 xl:w-32',
      cellClassName: 'w-24 xl:w-32 text-slate-600 font-medium whitespace-normal break-words',
      value: (p) => p.category,
      cell: (p) => p.category || '-',
    },
    {
      key: 'slug',
      header: 'اسلاگ',
      priority: 'desktop-only',
      headerClassName: 'w-28 xl:w-36',
      cellClassName: 'w-28 xl:w-36 min-w-0',
      cell: (p) => (
        <div dir="ltr" className="min-w-0">
          <code className="block text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded truncate">
            {p.slug}
          </code>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      priority: 'secondary',
      mobileLabel: 'وضعیت',
      headerClassName: 'w-20 xl:w-24',
      cellClassName: 'w-20 xl:w-24',
      cell: (p) => (
        <span
          className={`text-xs font-semibold ${
            (p.published ?? p.is_published) ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          {(p.published ?? p.is_published) ? 'منتشر شده' : 'پیش‌نویس'}
        </span>
      ),
    },
    {
      key: 'views',
      header: 'بازدیدها',
      priority: 'desktop-only',
      headerClassName: 'w-16 xl:w-20 text-center',
      cellClassName: 'w-16 xl:w-20 text-center tabular-nums font-medium text-slate-600',
      cell: (p) => p.views || 0,
    },
    {
      key: 'published_at',
      header: 'تاریخ انتشار',
      priority: 'secondary',
      mobileLabel: 'تاریخ انتشار',
      headerClassName: 'w-24 xl:w-28 text-center',
      cellClassName: 'w-24 xl:w-28 text-center tabular-nums text-slate-500 text-xs',
      value: (p) => formatGregorianToJalali(p.published_at),
      cell: (p) => formatGregorianToJalali(p.published_at),
    },
  ];

  return (
    <div id="page-blog" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-[#445D84] flex items-center gap-2">
          <Newspaper className="w-6 h-6" aria-hidden="true" />
          <span>مدیریت وبلاگ</span>
        </h1>
        <ActionButton
          type="button"
          onClick={() => openEditor()}
          icon={<Plus className="w-4 h-4" />}
          className="w-full sm:w-auto px-4 py-2.5"
        >
          <span>افزودن پست</span>
        </ActionButton>
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
          <ActionButton
            type="button"
            onClick={() => openEditor()}
            icon={<Plus className="w-4 h-4" />}
            className="px-5 py-2.5"
          >
            <span>افزودن پست</span>
          </ActionButton>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <DataTable
            columns={blogColumns}
            data={posts}
            rowKey={(p) => p.id}
            ariaLabel="جدول مقالات وبلاگ"
            actionsHeader="عملیات"
            actionsHeaderClassName="w-28"
            actionsCellClassName="w-28 shrink-0"
            renderActions={(p) => (
              <div className="flex items-center gap-1 shrink-0">
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => openEditor(p)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-blue-600 hover:bg-blue-50"
                  title="ویرایش"
                  aria-label={`ویرایش پست ${p.title}`}
                >
                  <Pencil className="w-4 h-4" />
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteTarget(p)}
                  className="min-w-11 min-h-11 p-2.5 rounded-xl text-red-600 hover:bg-red-50"
                  title="حذف"
                  aria-label={`حذف پست ${p.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </ActionButton>
              </div>
            )}
          />
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
