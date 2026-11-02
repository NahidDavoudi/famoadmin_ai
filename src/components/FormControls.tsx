import React, { useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'emerald' | 'ghost';

export interface ActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  loading?: boolean;
  loadingText?: string;
  cooldownMs?: number;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown | Promise<unknown>;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#445D84] text-white hover:bg-[#374a6b] active:bg-[#2d3d59]',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  loading = false,
  loadingText,
  cooldownMs = 450,
  variant = 'primary',
  icon,
  onClick,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [cooldownLocked, setCooldownLocked] = useState(false);
  const lockRef = useRef(false);

  const isBusy = loading || internalLoading;
  const isDisabled = Boolean(disabled || isBusy || cooldownLocked);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled || lockRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // For submit buttons without an explicit onClick, guard against rapid double-click within 450ms
    if (type === 'submit' && !onClick) {
      lockRef.current = true;
      setTimeout(() => {
        lockRef.current = false;
      }, cooldownMs);
      return;
    }

    if (!onClick) return;

    lockRef.current = true;
    setCooldownLocked(true);

    try {
      const result = onClick(e);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setInternalLoading(true);
        await result;
      }
    } finally {
      setInternalLoading(false);
      setTimeout(() => {
        lockRef.current = false;
        setCooldownLocked(false);
      }, cooldownMs);
    }
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isBusy}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all duration-150 cursor-pointer select-none disabled:opacity-55 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {isBusy ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0 inline-flex items-center">{icon}</span>
      )}
      {isBusy && loadingText ? <span>{loadingText}</span> : children}
    </button>
  );
};

export const FieldError: React.FC<{ message?: string; id?: string }> = ({ message, id }) => {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1 leading-snug"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
};

export function getFieldClass(hasError?: boolean, extra = ''): string {
  const base =
    'w-full px-3.5 py-2.5 border-2 rounded-xl text-sm transition-colors focus:outline-none';
  const stateClass = hasError
    ? 'border-red-500 bg-red-50/40 text-slate-900 placeholder:text-red-300 focus:border-red-600 ring-2 ring-red-500/10 input-error-shake'
    : 'border-slate-200 bg-white text-slate-800 focus:border-[#445D84]';
  return `${base} ${stateClass} ${extra}`.trim();
}
