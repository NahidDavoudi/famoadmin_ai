import React from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import type { ToastItem } from '../types';

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 items-end pointer-events-none"
      dir="rtl"
    >
      {toasts.map((toast) => {
        const styles = {
          success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          error: 'bg-red-50 border-red-200 text-red-800',
          warning: 'bg-amber-50 border-amber-200 text-amber-800',
          info: 'bg-slate-100 border-slate-200 text-slate-800',
        }[toast.type];

        const IconComponent = {
          success: Check,
          error: X,
          warning: AlertTriangle,
          info: Info,
        }[toast.type];

        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-xl border shadow-lg text-sm font-medium transition-all duration-200 ${styles}`}
          >
            <IconComponent className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="بستن اعلان"
              className="mr-2 p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
