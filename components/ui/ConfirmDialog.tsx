/**
 * ConfirmDialog - in-app replacement for window.confirm
 * Controlled component: the parent owns the `open` state.
 */

import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-lg p-5 w-full max-w-sm">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {message && <p className="text-sm text-gray-600 mt-1.5">{message}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 min-h-[44px] px-4 rounded-lg text-sm font-medium text-white transition-all ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : 'bg-black hover:bg-gray-800 active:bg-gray-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
