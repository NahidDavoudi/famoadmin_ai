import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { ActionButton } from './FormControls';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'تأیید عملیات',
  message,
  confirmText = 'تأیید',
  cancelText = 'انصراف',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const isBusy = loading || submitting;

  const handleConfirm = async () => {
    if (isBusy) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onCancel();
      }}
      title={title}
      size="sm"
      icon={<AlertTriangle className="w-5 h-5" />}
      iconColorClass={variant === 'danger' ? 'bg-red-600 text-white' : 'bg-[#445D84] text-white'}
      footer={
        <div className="flex items-center gap-3">
          <ActionButton
            type="button"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            loading={isBusy}
            loadingText="در حال انجام..."
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4"
          >
            {confirmText}
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            disabled={isBusy}
            onClick={onCancel}
            className="flex-1 py-2.5 px-4"
          >
            {cancelText}
          </ActionButton>
        </div>
      }
    >
      <p className="text-sm text-slate-600 leading-relaxed text-center py-2">{message}</p>
    </Modal>
  );
};
