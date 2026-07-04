/**
 * SectionDisclosure - full-width collapsible section header.
 * Stateless: open state and toggle handler live in the parent.
 */

import React from 'react';

interface SectionDisclosureProps {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accentDot?: boolean;
}

export default function SectionDisclosure({
  title,
  subtitle,
  open,
  onToggle,
  children,
  accentDot = false,
}: SectionDisclosureProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full bg-paper-raised rounded-card border border-line p-4 shadow-card hover:bg-paper-inset transition flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {accentDot && <span className="h-1.5 w-1.5 rounded-full bg-purple-500 flex-shrink-0" />}
          <span className="text-sm font-semibold tracking-tight text-ink">{title}</span>
          <span className="text-xs text-ink-muted">{subtitle}</span>
        </div>
        <svg
          className={`w-5 h-5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
