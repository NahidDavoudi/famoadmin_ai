import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconColorClass?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconColorClass = 'bg-[#445D84] text-white',
  size = 'md',
  children,
  footer,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${sizeClass} max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {icon && (
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconColorClass}`}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-[#344868] truncate">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
