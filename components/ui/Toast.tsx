/**
 * Toast Host - renders active toasts; mount once in app/_layout.tsx
 */

import React from 'react';
import { useToastStore, ToastType } from '@/lib/toast';

const iconColor: Record<ToastType, string> = {
  success: 'text-accent-600',
  error: 'text-danger',
  info: 'text-ink-muted',
};

const iconPath: Record<ToastType, string> = {
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  error: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[70] w-11/12 max-w-md space-y-2"
      style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-paper-raised rounded-ctrl p-3 shadow-overlay flex items-center gap-2 animate-toast-in"
          role="status"
        >
          <svg className={`w-4 h-4 flex-shrink-0 ${iconColor[t.type]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath[t.type]} />
          </svg>
          <span className="text-ink text-sm flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="p-2 -m-1 text-ink-faint hover:text-ink-muted active:text-ink-soft"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
