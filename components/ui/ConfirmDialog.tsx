/**
 * ConfirmDialog - in-app replacement for window.confirm
 * Controlled component: the parent owns the `open` state.
 */

import React from 'react';
import Button from '@/components/ui/Button';

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
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div className="relative bg-paper-raised rounded-card shadow-overlay p-5 w-full max-w-sm">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {message && <p className="text-sm text-ink-soft mt-1.5">{message}</p>}
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
