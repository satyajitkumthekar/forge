/**
 * MealPhotoViewer - full-screen look at a meal's photo.
 * The client gets Replace / Remove; staff views pass no handlers and get a
 * read-only viewer. Photos are display only (never sent to the AI).
 */

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { MEAL_PHOTO_KEEP_DAYS } from '@/lib/database';
import type { MealPhoto } from '@/types';

interface MealPhotoViewerProps {
  photo: MealPhoto | null;
  /** "Meal 2" */
  title: string;
  onClose: () => void;
  onReplace?: (file: File) => void;
  onRemove?: () => void;
}

const daysLeft = (createdAt: string): number => {
  const age = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.ceil(MEAL_PHOTO_KEEP_DAYS - age / (24 * 60 * 60 * 1000)));
};

export default function MealPhotoViewer({ photo, title, onClose, onReplace, onRemove }: MealPhotoViewerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!photo || typeof document === 'undefined') return null;

  const left = daysLeft(photo.created_at);
  const editable = Boolean(onReplace || onRemove);

  // Portaled to <body>: inside a screen it sits under the tab bar, which
  // covered the Replace / Remove buttons
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col" role="dialog" aria-modal="true" aria-label={`${title} photo`}>
      <div className="absolute inset-0 bg-ink/90 animate-fade-in" onClick={onClose} />

      {/* Top bar */}
      <div
        className="relative flex items-center justify-between px-3 text-white"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-1 py-3">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="text-xs text-white/60">
            Deleted automatically in {left} {left === 1 ? 'day' : 'days'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close photo"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-ctrl hover:bg-white/10 active:bg-white/20 transition duration-150"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Photo */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 pointer-events-none">
        <img
          src={photo.url}
          alt={`${title} photo`}
          className="max-w-full max-h-full object-contain rounded-card animate-fade-in pointer-events-auto"
        />
      </div>

      {/* Owner actions */}
      {editable && (
        <div
          className="relative flex gap-2 px-4 pt-3 max-w-md w-full mx-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          {onReplace && (
            <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
              Replace photo
            </Button>
          )}
          {onRemove && (
            <Button variant="destructive" className="flex-1" onClick={() => setConfirmRemove(true)}>
              Remove photo
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onReplace?.(file);
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this photo?"
        message="Your coach will no longer see it. Your food items stay as they are."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove?.();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>,
    document.body
  );
}
