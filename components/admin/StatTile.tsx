/**
 * StatTile - admin dashboard summary tile with count-up numeral.
 * Display-only: receives the value, never computes it.
 */

import React from 'react';
import { useCountUp } from '@/utils/use-count-up';

interface StatTileProps {
  label: string;
  value: number;
}

export default function StatTile({ label, value }: StatTileProps) {
  const display = useCountUp(value);

  return (
    <div className="bg-paper-raised rounded-card shadow-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-ink mt-1">{display}</p>
    </div>
  );
}
