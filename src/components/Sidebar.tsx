import React, { useState } from 'react';
import {
  BarChart3,
  Users,
  BookOpen,
  School,
  ClipboardList,
  Pencil,
  Upload,
  Headset,
  Newspaper,
  LineChart,
  LogOut,
  Loader2,
  Menu,
  Keyboard,
} from 'lucide-react';
import type { PageId } from '../types';

interface SidebarProps {
  currentPage: PageId;
  username: string;
  isOpenMobile: boolean;
  onNavigate: (page: PageId) => void;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  onOpenShortcuts: () => void;
  onLogout: () => void | Promise<void>;
}

const NAV_ITEMS: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'داشبورد', icon: BarChart3 },
  { id: 'students', label: 'دانش‌آموزان', icon: Users },
  { id: 'courses', label: 'دوره‌ها', icon: BookOpen },
  { id: 'instructors', label: 'اساتید', icon: School },
  { id: 'exams', label: 'نتایج آزمون', icon: ClipboardList },
  { id: 'exam_entry', label: 'ثبت نتایج', icon: Pencil },
  { id: 'files', label: 'فایل‌های آزمون', icon: Upload },
  { id: 'supporters', label: 'پشتیبان‌ها', icon: Headset },
  { id: 'blog', label: 'وبلاگ', icon: Newspaper },
  { id: 'reports', label: 'گزارش‌ها', icon: LineChart },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  username,
  isOpenMobile,
  onNavigate,
  onToggleMobile,
  onCloseMobile,
  onOpenShortcuts,
  onLogout,
}) => {
  const [loggingOut, setLoggingOut] = useState(false);
  const activeNavId = currentPage === 'blog-editor' ? 'blog' : currentPage;

  const handleLogoutClick = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      {/* Mobile Header */}
      <header
        id="mobileHeader"
        className="md:hidden fixed top-0 right-0 left-0 h-14 z-40 bg-[#344868] text-white flex items-center justify-between px-4 shadow-md border-b border-white/10"
      >
        <button
          id="mobileMenuBtn"
          type="button"
          onClick={onToggleMobile}
          aria-label="منو"
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <span className="font-bold text-base">پنل مدیریت فامو</span>
        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="کلیدهای میانبر"
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
        >
          <Keyboard className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>

      {/* Mobile Overlay */}
      {isOpenMobile && (
        <div
          id="sidebarOverlay"
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-40"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`fixed top-0 right-0 bottom-0 z-50 w-64 md:w-72 bg-[#344868] text-slate-100 flex flex-col transition-transform duration-300 ease-out shadow-xl md:shadow-none ${
          isOpenMobile ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-white/95 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md">
                <span className="text-2xl font-bold text-[#445D84]">ف</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base text-white truncate">پنل مدیریت فامو</h2>
                <p id="desktopUsername" className="text-xs text-white/70 truncate mt-0.5">
                  {username}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenShortcuts}
              title="کلیدهای میانبر (؟)"
              aria-label="کلیدهای میانبر"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Keyboard className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav className="p-3 flex-1 overflow-y-auto space-y-1" aria-label="منوی اصلی پنل مدیریت">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-page={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors cursor-pointer relative ${
                  isActive
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white font-medium'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute right-0 top-2 bottom-2 w-1 bg-white rounded-l-full"
                    aria-hidden="true"
                  />
                )}
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            id="logoutBtn"
            type="button"
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={handleLogoutClick}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/20 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loggingOut ? (
              <Loader2 className="w-5 h-5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
            )}
            <span>{loggingOut ? 'در حال خروج...' : 'خروج از حساب'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
