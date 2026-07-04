/**
 * EmptyState - icon + title + subtitle pattern for empty lists/sections.
 */

import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-3 bg-paper-inset rounded-full flex items-center justify-center text-ink-faint">
        {icon}
      </div>
      <p className="text-ink font-medium text-sm">{title}</p>
      {subtitle && <p className="text-xs text-ink-muted mt-1">{subtitle}</p>}
    </div>
  );
}
