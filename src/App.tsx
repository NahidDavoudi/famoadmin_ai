import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ClipboardList, Search } from 'lucide-react';
import API from './lib/api';
import type { PageId, ToastItem, ToastType } from './types';
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
import { BlogPage } from './pages/BlogPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('overview');
  const [username, setUsername] = useState<string>('مدیر سیستم (فامو)');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const studentSearchRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    API.getMe().then((u) => {
      if (u?.username) setUsername(u.username);
    });
  }, []);

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
          setCurrentPage('students');
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
  }, [currentPage]);

  const handleLogout = async () => {
    await API.logout();
    showToast('از حساب کاربری خارج شدید', 'info');
  };

  return (
    <div id="mainPanel" className="min-h-screen flex bg-[#F8FAFC]" dir="rtl">
      <Sidebar
        currentPage={currentPage}
        username={username}
        isOpenMobile={isMobileSidebarOpen}
        onNavigate={(page) => setCurrentPage(page)}
        onToggleMobile={() => setIsMobileSidebarOpen((v) => !v)}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-w-0 md:mr-72 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {currentPage === 'overview' && <OverviewPage showToast={showToast} />}
          {currentPage === 'students' && (
            <StudentsPage showToast={showToast} searchInputRef={studentSearchRef} />
          )}
          {currentPage === 'courses' && <CoursesPage showToast={showToast} />}
          {currentPage === 'instructors' && <InstructorsPage showToast={showToast} />}
          {currentPage === 'exams' && (
            <ExamsPage showToast={showToast} onNavigate={(page) => setCurrentPage(page)} />
          )}
          {currentPage === 'exam_entry' && <ExamEntryPage showToast={showToast} />}
          {currentPage === 'files' && <FilesPage showToast={showToast} />}
          {currentPage === 'supporters' && <SupportersPage showToast={showToast} />}
          {(currentPage === 'blog' || currentPage === 'blog-editor') && (
            <BlogPage showToast={showToast} />
          )}
          {currentPage === 'reports' && <ReportsPage showToast={showToast} />}
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
