/**
 * DayTimeline - one day column of a user's food log, rendered as a
 * vertical timeline with per-entry timestamps and meal-gap markers.
 * Display-only: entries arrive pre-sorted; totals/colors are pure derivations.
 */

import React from 'react';
import { format } from 'date-fns';
import type { FoodEntry } from '@/types';
import {
  formatLogTime,
  formatLogGap,
  getCaloriesColor,
  getProteinColor,
} from '@/components/admin/helpers';

interface DayTimelineProps {
  dayName: string;
  date: Date;
  entries: FoodEntry[];
  viewMode: 'table' | 'log';
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories: number;
}

export default function DayTimeline({
  dayName,
  date,
  entries,
  viewMode,
  targetCalories,
  targetProtein,
  maintenanceCalories,
}: DayTimelineProps) {
  // Calculate totals for this day
  const totalCal = entries.reduce((sum, e) => sum + e.calories, 0);
  const totalPro = entries.reduce((sum, e) => sum + e.protein, 0);

  const calColor = getCaloriesColor(totalCal, targetCalories, maintenanceCalories);
  const proColor = getProteinColor(totalPro, targetProtein);

  return (
    <div className="w-52 flex-shrink-0">
      {/* Day Header with totals */}
      <div className="mb-2">
        <div className="text-xs font-semibold tracking-tight text-ink">{dayName} {format(date, 'M/d')}</div>
        {totalCal === 0 ? (
          <div className="text-xs text-ink-faint mt-1">-</div>
        ) : (
          <div className="flex gap-2 mt-1">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${calColor}`}>
              {totalCal}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${proColor}`}>
              {totalPro.toFixed(0)}g
            </span>
          </div>
        )}
      </div>

      {/* Vertical timeline of entries */}
      <div className="relative pl-5 max-h-48 overflow-y-auto">
        {entries.length > 0 && (
          <span className="absolute left-[3px] top-1 bottom-1 w-px bg-line" />
        )}
        {entries.map((entry, entryIdx) => {
          const gap = entryIdx > 0 ? formatLogGap(entries[entryIdx - 1].created_at, entry.created_at) : null;
          return (
            <React.Fragment key={entry.id}>
              {gap && (
                <div className="relative py-0.5">
                  <span className="relative z-10 -ml-5 bg-paper-raised px-1 text-[10px] text-ink-faint tabular-nums">
                    ↓ {gap}
                  </span>
                </div>
              )}
              <div className="relative py-1 animate-entry-in">
                <span className="absolute -left-[17px] top-[7px] h-[7px] w-[7px] rounded-full border border-line-strong bg-paper-raised" />
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-medium text-ink truncate">
                    {viewMode === 'log' ? (entry.description || entry.name) : entry.name}
                  </div>
                  <div className="text-[10px] text-ink-faint tabular-nums shrink-0">
                    {formatLogTime(entry.created_at)}
                  </div>
                </div>
                <div className="text-[11px] text-ink-muted tabular-nums">
                  {entry.calories}c · {entry.protein.toFixed(0)}p
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
