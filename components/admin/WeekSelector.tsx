/**
 * WeekSelector - prev/next week stepper with a "Current Week" shortcut.
 * Stateless: navigation handlers and the current-week flag live in the parent.
 */

import React from 'react';
import Button from '@/components/ui/Button';

interface WeekSelectorProps {
  label: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToCurrent: () => void;
}

export default function WeekSelector({
  label,
  isCurrentWeek,
  onPrev,
  onNext,
  onGoToCurrent,
}: WeekSelectorProps) {
  return (
    <div className="flex flex-col items-center">
      <div className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-inset p-1">
        <button
          onClick={onPrev}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-paper-deep transition ease-spring active:scale-[0.97]"
          title="Previous week"
        >
          <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="px-3 text-sm font-semibold tracking-tight tabular-nums text-ink">{label}</span>

        <button
          onClick={onNext}
          disabled={isCurrentWeek}
          className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-paper-deep transition ease-spring active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next week"
        >
          <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {!isCurrentWeek && (
        <Button variant="ghost" size="sm" onClick={onGoToCurrent} className="mt-1 rounded-full">
          Current Week
        </Button>
      )}
    </div>
  );
}
