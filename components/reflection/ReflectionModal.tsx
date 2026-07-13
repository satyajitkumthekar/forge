/**
 * ReflectionModal - the morning practice overlay.
 * Same skeleton as FeatureAnnouncement/CookbookReveal (z-[80], ink scrim,
 * raised card). Dismissing collapses to the Track banner — progress is
 * already in the DB, so nothing is lost. Only finishing the flow clears it.
 *
 * The 2:00 countdown is a pacing floor, not a lock: "sit with this for two
 * minutes." Nothing is forced at zero — the digits simply fade out.
 */

import React, { useEffect, useState } from 'react';
import ReflectionStep from './ReflectionStep';
import type { ReflectionCtx, Step } from './flow';

const PRACTICE_SECONDS = 120;

interface ReflectionModalProps {
  open: boolean;
  step: Step | null;
  ctx: ReflectionCtx | null;
  answers: Record<string, string>;
  saving: boolean;
  onAnswer: (step: Step, answer: string) => void;
  onFinish: (step: Step) => void;
  onDismiss: () => void;
}

export default function ReflectionModal({
  open,
  step,
  ctx,
  answers,
  saving,
  onAnswer,
  onFinish,
  onDismiss,
}: ReflectionModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(PRACTICE_SECONDS);

  // Restart the pacing countdown each time the practice opens
  useEffect(() => {
    if (!open) return;
    setSecondsLeft(PRACTICE_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open || !step || !ctx) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Morning practice"
    >
      <div className="absolute inset-0 bg-ink/40" onClick={onDismiss} />
      <div className="relative bg-paper-raised rounded-card shadow-overlay p-6 w-full max-w-md animate-toast-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Morning practice
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs tabular-nums text-ink-faint transition-opacity duration-500 ${
                secondsLeft === 0 ? 'opacity-0' : ''
              }`}
              aria-hidden="true"
            >
              {minutes}:{seconds}
            </span>
            <button
              onClick={onDismiss}
              aria-label="Close for now"
              className="min-w-[32px] min-h-[32px] flex items-center justify-center text-ink-faint hover:text-ink-muted rounded-ctrl transition duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* key remounts the step so each question gets a fresh draft */}
        <ReflectionStep
          key={step.id}
          step={step}
          ctx={ctx}
          answers={answers}
          saving={saving}
          onAnswer={onAnswer}
          onFinish={onFinish}
        />
      </div>
    </div>
  );
}
