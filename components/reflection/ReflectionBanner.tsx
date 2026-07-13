/**
 * ReflectionBanner - the persistent "your practice is ready" strip on Track.
 * Shows whenever a live reflection exists and the modal is dismissed; only
 * completing the practice makes it go away. Tapping re-opens the modal.
 */

import React from 'react';

interface ReflectionBannerProps {
  /** An in_progress reflection resumes mid-flow */
  resuming: boolean;
  onOpen: () => void;
}

export default function ReflectionBanner({ resuming, onOpen }: ReflectionBannerProps) {
  return (
    <button onClick={onOpen} className="w-full text-left animate-fade-in" aria-label="Open morning practice">
      <div className="bg-ink text-white rounded-card shadow-card px-4 py-3 flex items-center justify-between gap-3 transition duration-150 ease-spring hover:bg-ink-soft active:scale-[0.99]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Your morning practice is ready</div>
            <div className="text-xs text-white/60 truncate">
              {resuming ? 'Two minutes. Pick up where you left off' : 'Two minutes, about yesterday'}
            </div>
          </div>
        </div>
        <svg className="w-4 h-4 text-white/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
