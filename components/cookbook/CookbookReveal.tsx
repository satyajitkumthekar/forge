/**
 * CookbookReveal - the personal "your coach built something for you" moment.
 * Shown once per cookbook, ever (revealed_at is DB-backed, so it never
 * replays across devices). Presentational; the parent owns visibility and
 * calls markRevealed on either action.
 */

import React from 'react';
import Button from '@/components/ui/Button';
import type { AnchorCookbook } from '@/types';

interface CookbookRevealProps {
  cookbook: AnchorCookbook | null;
  onOpen: () => void;
  onLater: () => void;
}

export default function CookbookReveal({ cookbook, onOpen, onLater }: CookbookRevealProps) {
  if (!cookbook) return null;

  const mealCount = cookbook.content.meals.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onLater} />
      <div className="relative bg-paper-raised rounded-card shadow-overlay p-6 w-full max-w-sm text-center animate-toast-in">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-muted mb-5">
          Superhuman Lab
        </div>

        <div className="w-14 h-14 mx-auto mb-4 bg-accent-50 rounded-full flex items-center justify-center">
          <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold tracking-tight text-ink mb-1.5">
          Your coach built something for you
        </h2>
        <p className="text-sm font-medium text-ink-soft mb-1">{cookbook.content.shortTitle}</p>
        <p className="text-sm text-ink-soft leading-relaxed mb-6">
          {mealCount} anchor meal{mealCount === 1 ? '' : 's'}, crafted around your targets.
          Read it, then log any of them in one tap.
        </p>

        <div className="space-y-2">
          <Button fullWidth onClick={onOpen}>
            Open it
          </Button>
          <Button variant="ghost" fullWidth onClick={onLater}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
