import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'تأیید عملیات',
  message,
  confirmText = 'تأیید',
  cancelText = 'انصراف',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      icon={<AlertTriangle className="w-5 h-5" />}
      iconColorClass={variant === 'danger' ? 'bg-red-600 text-white' : 'bg-[#445D84] text-white'}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm text-white transition-colors cursor-pointer ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#445D84] hover:bg-[#374a6b]'
            }`}
          >
            {confirmText}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-600 leading-relaxed text-center py-2">{message}</p>
    </Modal>
  );
};
