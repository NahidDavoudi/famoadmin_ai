import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ClipboardList, Search } from 'lucide-react';
import API from './lib/api';
import type { PageId, ToastItem, ToastType, UserRole } from './types';
import { Sidebar } from './components/Sidebar';
import { ToastStack } from './components/ToastStack';
import { Modal } from './components/Modal';
import { OverviewPage } from './pages/OverviewPage';
import { StudentsPage } from './pages/StudentsPage';
import { CoursesPage } from './pages/CoursesPage';
import { InstructorsPage } from './pages/InstructorsPage';
import { ExamsPage } from './pages/ExamsPage';
import { ExamEntryPage } from './pages/ExamEntryPage';
import { FilesPage } from './pages/FilesPage';
import { SupportersPage } from './pages/SupportersPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { BlogPage } from './pages/BlogPage';
import { ReportsPage } from './pages/ReportsPage';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AdmissionsPage } from './pages/AdmissionsPage';
import { TestimonialsPage } from './pages/TestimonialsPage';
import { canAccessAdminOnlySections } from './lib/admissions-testimonials';

const VALID_PAGE_IDS: readonly PageId[] = [
  'overview',
  'students',
  'courses',
  'instructors',
  'exams',
  'exam_entry',
  'files',
  'supporters',
  'appointments',
  'admissions',
  'testimonials',
  'blog',
  'blog-editor',
  'reports',
  'activity_logs',
  'analytics',
];

function getInitialPageFromUrl(): PageId {
  if (typeof window === 'undefined') return 'overview';
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab && (VALID_PAGE_IDS as readonly string[]).includes(tab)) {
    return tab as PageId;
  }
  return 'overview';
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPageFromUrl);
  const [username, setUsername] = useState<string>('مدیر سیستم (فامو)');
  const [userRole, setUserRole] = useState<UserRole>(
    ((API.currentActorRole || 'admin') as UserRole)
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingTestimonialsCount, setPendingTestimonialsCount] = useState<number>(0);

  const studentSearchRef = useRef<HTMLInputElement | null>(null);

  const navigateToPage = useCallback((nextPage: PageId) => {
    setCurrentPage((prev) => {
      if (typeof window !== 'undefined' && prev !== nextPage) {
        const params = new URLSearchParams(window.location.search);
        params.set('tab', nextPage);
        params.delete('sort');
        params.delete('order');
        params.delete('page');
        params.delete('view');
        params.delete('subtab');
        params.delete('exam_date');
        const qs = params.toString();
        const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
      return nextPage;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const fromUrl = getInitialPageFromUrl();
      setCurrentPage(fromUrl);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => {
      const filtered = prev.filter((t) => t.message !== message);
      return [...filtered.slice(-2), { id, message, type }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    API.getMe()
      .then((u) => {
        if (u?.role) {
          setUserRole(u.role.toLowerCase() as UserRole);
        }
        if (u?.username) {
          setUsername(u.full_name || u.username);
        } else if (
          typeof window !== 'undefined' &&
          window.location.hostname.endsWith('famoacademy.ir')
        ) {
          window.location.href = API.getLoginRedirectUrl();
        }
      })
      .catch(() => {
        if (
          typeof window !== 'undefined' &&
          window.location.hostname.endsWith('famoacademy.ir')
        ) {
          window.location.href = API.getLoginRedirectUrl();
        }
      });
  }, []);

  // Keep Sidebar pending testimonials badge synchronized for admin users
  useEffect(() => {
    if (!canAccessAdminOnlySections(userRole)) {
      setPendingTestimonialsCount(0);
      return;
    }
    let cancelled = false;
    API.getTestimonialsPendingCount()
      .then((count) => {
        if (!cancelled) setPendingTestimonialsCount(count);
      })
      .catch(() => {
        // Ignore silent badge-fetch failures (handled explicitly on TestimonialsPage)
      });
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  // Global keyboard shortcuts ('/' to focus search, '?' to open shortcuts modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isInput =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable);

      if (isInput) return;

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (currentPage !== 'students') {
          navigateToPage('students');
          setTimeout(() => studentSearchRef.current?.focus(), 80);
        } else {
          studentSearchRef.current?.focus();
        }
      } else if ((e.key === '?' || e.key === '؟') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsShortcutsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, navigateToPage]);

  const handleLogout = async () => {
    await API.logout();
    showToast('از حساب کاربری خارج شدید', 'info');
    window.location.href = API.getLoginRedirectUrl();
  };

  return (
    <div id="mainPanel" className="min-h-screen flex bg-[#F8FAFC]" dir="rtl">
      <Sidebar
        currentPage={currentPage}
        username={username}
        userRole={userRole}
        pendingTestimonialsCount={pendingTestimonialsCount}
        isOpenMobile={isMobileSidebarOpen}
        onNavigate={navigateToPage}
        onToggleMobile={() => setIsMobileSidebarOpen((v) => !v)}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 md:mr-72 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {currentPage === 'overview' && (
            <OverviewPage showToast={showToast} onNavigate={navigateToPage} />
          )}
          {currentPage === 'students' && (
            <StudentsPage showToast={showToast} searchInputRef={studentSearchRef} />
          )}
          {currentPage === 'appointments' && <AppointmentsPage showToast={showToast} />}
          {currentPage === 'courses' && <CoursesPage showToast={showToast} />}
          {currentPage === 'instructors' && <InstructorsPage showToast={showToast} />}
          {currentPage === 'exams' && (
            <ExamsPage
              showToast={showToast}
              onNavigate={navigateToPage}
              userRole={userRole}
            />
          )}
          {currentPage === 'exam_entry' && <ExamEntryPage showToast={showToast} />}
          {currentPage === 'files' && <FilesPage showToast={showToast} />}
          {currentPage === 'supporters' && <SupportersPage showToast={showToast} />}
          {currentPage === 'admissions' && (
            <AdmissionsPage showToast={showToast} userRole={userRole} />
          )}
          {currentPage === 'testimonials' && (
            <TestimonialsPage
              showToast={showToast}
              userRole={userRole}
              onPendingCountChange={setPendingTestimonialsCount}
            />
          )}
          {(currentPage === 'blog' || currentPage === 'blog-editor') && (
            <BlogPage showToast={showToast} />
          )}
          {currentPage === 'reports' && <ReportsPage showToast={showToast} />}
          {currentPage === 'analytics' && <AnalyticsPage showToast={showToast} />}
          {currentPage === 'activity_logs' && <ActivityLogsPage showToast={showToast} />}
        </div>
      </main>

      {/* Keyboard Shortcuts Modal */}
      <Modal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        title="کلیدهای میانبر"
        subtitle="راهنمای دکمه‌های سریع پنل مدیریت"
        icon={<Keyboard className="w-5 h-5" />}
        footer={
          <button
            type="button"
            onClick={() => setIsShortcutsOpen(false)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
          >
            بستن
          </button>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-[#445D84]" />
              <span>کلیدهای عمومی</span>
            </h4>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-600">بستن هر پنجره مودال</dt>
                <dd className="font-mono text-[#445D84] font-semibold">Esc</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">نمایش این راهنما</dt>
                <dd className="font-mono text-[#445D84] font-semibold">?</dd>
              </div>
            </dl>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#445D84]" />
              <span>ثبت نتایج آزمون</span>
            </h4>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-600">ذخیره سریع نتایج</dt>
                <dd className="font-mono text-[#445D84] font-semibold">Ctrl + S</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">افزودن ردیف درس جدید</dt>
                <dd className="font-mono text-[#445D84] font-semibold">Enter</dd>
              </div>
            </dl>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-[#445D84]" />
              <span>جستجو و فیلتر</span>
            </h4>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-600">فوکوس بر جستجوی دانش‌آموز</dt>
                <dd className="font-mono text-[#445D84] font-semibold">/</dd>
              </div>
            </dl>
          </div>
        </div>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
